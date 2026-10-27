/**
 * HU-13: estadísticas REALES de PostgreSQL para el monitor.
 *
 * Una sola consulta por muestra sobre las vistas del sistema:
 * - pg_stat_database: contadores acumulados de transacciones (confirmadas y
 *   revertidas), bloques leídos de caché o de disco y filas leídas/escritas.
 *   Las reservas que pierden una carrera contra la restricción de exclusión
 *   aparecen como transacciones REVERTIDAS.
 * - pg_stat_activity: conexiones de esta base por estado y las que esperan un
 *   bloqueo (wait_event_type = 'Lock').
 *
 * La consulta del monitor también es una conexión activa: se resta.
 */

import { DbStats } from '../metrics/runtime';

/** Lo único que se necesita de Prisma: ejecutar SQL crudo. */
export interface RawQueryClient {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
}

const QUERY = `
  SELECT
    d.xact_commit AS commits,
    d.xact_rollback AS rollbacks,
    d.blks_hit AS blocks_hit,
    d.blks_read AS blocks_read,
    d.tup_fetched AS rows_fetched,
    d.tup_inserted + d.tup_updated + d.tup_deleted AS rows_written,
    d.deadlocks AS deadlocks,
    count(a.pid) FILTER (WHERE a.state = 'active') AS active,
    count(a.pid) FILTER (WHERE a.state = 'idle') AS idle,
    count(a.pid) FILTER (WHERE a.state LIKE 'idle in transaction%') AS idle_in_tx,
    count(a.pid) FILTER (WHERE a.wait_event_type = 'Lock') AS waiting_lock,
    current_setting('max_connections')::int AS max_connections,
    pg_database_size(current_database()) AS size_bytes
  FROM pg_stat_database d
  LEFT JOIN pg_stat_activity a ON a.datid = d.datid AND a.backend_type = 'client backend'
  WHERE d.datname = current_database()
  GROUP BY d.datid, d.xact_commit, d.xact_rollback, d.blks_hit, d.blks_read,
           d.tup_fetched, d.tup_inserted, d.tup_updated, d.tup_deleted, d.deadlocks`;

/** Prisma devuelve bigint para int8/count: se pasan a number. */
const num = (value: unknown): number => Number(value ?? 0);

export const createPostgresStats =
  (client: RawQueryClient) =>
  async (): Promise<DbStats | null> => {
    const [row] = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(QUERY);
    if (!row) return null;
    return {
      commits: num(row.commits),
      rollbacks: num(row.rollbacks),
      blocksHit: num(row.blocks_hit),
      blocksRead: num(row.blocks_read),
      rowsFetched: num(row.rows_fetched),
      rowsWritten: num(row.rows_written),
      deadlocks: num(row.deadlocks),
      connections: {
        // La propia consulta del monitor está activa mientras se ejecuta.
        active: Math.max(0, num(row.active) - 1),
        idle: num(row.idle),
        idleInTransaction: num(row.idle_in_tx),
        waitingLock: num(row.waiting_lock),
      },
      maxConnections: num(row.max_connections),
      sizeBytes: num(row.size_bytes),
    };
  };
