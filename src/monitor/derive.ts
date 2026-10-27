/**
 * HU-13: cálculos del monitor. De dos fotos acumuladas (RuntimeSnapshot) a
 * una muestra con porcentajes y tasas por segundo.
 *
 * Funciones puras (sin reloj, red ni disco): son las que se prueban.
 */

import { CpuTimes, LogicalCpu, RuntimeSnapshot } from '../metrics/runtime';

export interface Sample {
  t: number;
  /** % de uso de cada núcleo lógico en el intervalo (toda la máquina). */
  cores: number[];
  hostCpuPct: number;
  /** CPU del proceso de la API (todos sus hilos) como % de la máquina entera. */
  processCpuPct: number;
  /** Lo mismo expresado en núcleos: 2.5 = dos núcleos y medio ocupados. */
  processCores: number;
  /** % del tiempo en que el hilo principal (event loop) estuvo ocupado. */
  eventLoopPct: number;
  loopDelayP99Ms: number;
  loopDelayMaxMs: number;
  /** Peticiones/s que pasaron el rate limit, las rechazadas (429) y los 5xx. */
  admittedPerSec: number;
  rateLimitedPerSec: number;
  serverErrorsPerSec: number;
  inFlight: number;
  pool: {
    queue: number;
    completedPerSec: number;
    /** % ocupado de cada worker thread en el intervalo. */
    threads: Array<{ threadId: number; pct: number }>;
    avgPct: number;
  };
  osThreads: number | null;
  rssMb: number;
  heapUsedMb: number;
  container: {
    cpuCores: number;
    memoryMb: number;
    memoryLimitMb: number | null;
    tasks: number | null;
  } | null;
  db: {
    commitsPerSec: number;
    rollbacksPerSec: number;
    /** % de bloques servidos desde la caché de PostgreSQL en el intervalo. */
    cacheHitPct: number | null;
    rowsReadPerSec: number;
    rowsWrittenPerSec: number;
    deadlocks: number;
    active: number;
    idle: number;
    idleInTransaction: number;
    waitingLock: number;
    maxConnections: number;
    sizeMb: number;
  } | null;
}

/** Datos que no cambian entre muestras (cabecera del tablero). */
export interface HostInfo {
  cpuModel: string;
  logicalCpus: number;
  /** Núcleos físicos, cada uno con sus núcleos lógicos (2 = hyperthreading). */
  physicalCores: number[][];
  hyperthreadedCores: number;
  uvThreadpoolSize: number;
  pool: { enabled: boolean; purpose: string; maxThreads: number };
  nodeVersion: string;
  pid: number;
  inContainer: boolean;
  database: boolean;
}

const MB = 1048576;
const clampPct = (n: number): number => Math.min(100, Math.max(0, n));
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** % de uso de un núcleo lógico entre dos lecturas de sus tiempos acumulados. */
export const coreUtilization = (prev: CpuTimes, cur: CpuTimes): number => {
  const total = (t: CpuTimes): number => t.user + t.nice + t.sys + t.idle + t.irq;
  const elapsed = total(cur) - total(prev);
  if (elapsed <= 0) return 0;
  return round1(clampPct(((elapsed - (cur.idle - prev.idle)) / elapsed) * 100));
};

/** % ocupado de un event loop (principal o de un worker) entre dos lecturas idle/active. */
export const busyPct = (
  prev: { idle: number; active: number },
  cur: { idle: number; active: number }
): number => {
  const active = cur.active - prev.active;
  const idle = cur.idle - prev.idle;
  if (active + idle <= 0) return 0;
  return round1(clampPct((active / (active + idle)) * 100));
};

/** Diferencia de un contador acumulado expresada por segundo (nunca negativa: reinicio = 0). */
export const perSecond = (prev: number, cur: number, elapsedMs: number): number =>
  elapsedMs > 0 && cur >= prev ? round1(((cur - prev) * 1000) / elapsedMs) : 0;

/** Agrupa núcleos lógicos por núcleo físico, en orden del primer lógico de cada uno. */
export const groupPhysicalCores = (topology: LogicalCpu[], logicalCpus: number): number[][] => {
  if (topology.length === 0) return Array.from({ length: logicalCpus }, (_, i) => [i]);
  const grupos = new Map<string, number[]>();
  for (const c of topology) grupos.set(c.physicalId, [...(grupos.get(c.physicalId) ?? []), c.cpu]);
  return [...grupos.values()].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
};

export const hostInfo = (s: RuntimeSnapshot): HostInfo => {
  const physicalCores = groupPhysicalCores(s.host.topology, s.host.logicalCpus);
  return {
    cpuModel: s.host.cpuModel,
    logicalCpus: s.host.logicalCpus,
    physicalCores,
    hyperthreadedCores: physicalCores.filter((c) => c.length > 1).length,
    uvThreadpoolSize: s.process.uvThreadpoolSize,
    pool: {
      enabled: s.workerPool.enabled,
      purpose: s.workerPool.purpose,
      maxThreads: s.workerPool.maxThreads ?? 0,
    },
    nodeVersion: s.process.nodeVersion,
    pid: s.process.pid,
    inContainer: s.container !== null,
    database: s.db !== undefined && s.db !== null,
  };
};

const deriveDb = (prev: RuntimeSnapshot, cur: RuntimeSnapshot, elapsedMs: number): Sample['db'] => {
  const a = prev.db;
  const b = cur.db;
  if (!a || !b) return null;
  const hit = b.blocksHit - a.blocksHit;
  const read = b.blocksRead - a.blocksRead;
  return {
    commitsPerSec: perSecond(a.commits, b.commits, elapsedMs),
    rollbacksPerSec: perSecond(a.rollbacks, b.rollbacks, elapsedMs),
    cacheHitPct: hit + read > 0 ? round1((hit / (hit + read)) * 100) : null,
    rowsReadPerSec: perSecond(a.rowsFetched, b.rowsFetched, elapsedMs),
    rowsWrittenPerSec: perSecond(a.rowsWritten, b.rowsWritten, elapsedMs),
    deadlocks: b.deadlocks,
    ...b.connections,
    maxConnections: b.maxConnections,
    sizeMb: Math.round(b.sizeBytes / MB),
  };
};

const deriveContainer = (
  prev: RuntimeSnapshot,
  cur: RuntimeSnapshot,
  elapsedMs: number
): Sample['container'] => {
  const a = prev.container;
  const b = cur.container;
  if (!a || !b) return null;
  return {
    cpuCores:
      elapsedMs > 0 ? Math.max(0, Math.round(((b.cpuUsageUsec - a.cpuUsageUsec) / 1000 / elapsedMs) * 100) / 100) : 0,
    memoryMb: Math.round(b.memoryBytes / MB),
    memoryLimitMb: b.memoryLimitBytes === null ? null : Math.round(b.memoryLimitBytes / MB),
    tasks: b.tasks,
  };
};

export const derive = (prev: RuntimeSnapshot, cur: RuntimeSnapshot): Sample => {
  const elapsedMs = cur.timestamp - prev.timestamp;
  const cores = cur.host.cpuTimes.map((t, i) => {
    const antes = prev.host.cpuTimes[i];
    return antes ? coreUtilization(antes, t) : 0;
  });
  const hostCpuPct = round1(cores.reduce((a, b) => a + b, 0) / Math.max(1, cores.length));

  // cpuUsage viene en microsegundos y suma todos los hilos del proceso.
  const cpuMs =
    (cur.process.cpuUsage.user + cur.process.cpuUsage.system -
      prev.process.cpuUsage.user - prev.process.cpuUsage.system) / 1000;
  const processCores = elapsedMs > 0 ? Math.max(0, cpuMs / elapsedMs) : 0;

  const hilosAntes = new Map(prev.workerPool.threads.map((w) => [w.threadId, w]));
  const threads = cur.workerPool.threads.map((w) => {
    const antes = hilosAntes.get(w.threadId);
    return { threadId: w.threadId, pct: antes ? busyPct(antes, w) : 0 };
  });

  const total429 = cur.http.rateLimited - prev.http.rateLimited;
  const totalPeticiones = cur.http.total - prev.http.total;

  return {
    t: cur.timestamp,
    cores,
    hostCpuPct,
    processCpuPct: round1(clampPct((processCores / Math.max(1, cur.host.logicalCpus)) * 100)),
    processCores: Math.round(processCores * 100) / 100,
    eventLoopPct: busyPct(prev.process.eventLoop.utilization, cur.process.eventLoop.utilization),
    loopDelayP99Ms: cur.process.eventLoop.delayMs.p99,
    loopDelayMaxMs: cur.process.eventLoop.delayMs.max,
    admittedPerSec: perSecond(0, Math.max(0, totalPeticiones - total429), elapsedMs),
    rateLimitedPerSec: perSecond(prev.http.rateLimited, cur.http.rateLimited, elapsedMs),
    serverErrorsPerSec: perSecond(prev.http.byClass['5xx'], cur.http.byClass['5xx'], elapsedMs),
    inFlight: cur.http.inFlight,
    pool: {
      queue: cur.workerPool.queueSize ?? 0,
      completedPerSec: perSecond(prev.workerPool.completed ?? 0, cur.workerPool.completed ?? 0, elapsedMs),
      threads,
      avgPct: round1(threads.reduce((a, w) => a + w.pct, 0) / Math.max(1, threads.length)),
    },
    osThreads: cur.process.osThreads,
    rssMb: Math.round(cur.process.memory.rss / MB),
    heapUsedMb: Math.round(cur.process.memory.heapUsed / MB),
    container: deriveContainer(prev, cur, elapsedMs),
    db: deriveDb(prev, cur, elapsedMs),
  };
};
