/**
 * HU-13: monitor de recursos integrado en la API.
 *
 * Un único muestreador por proceso toma una foto por segundo (CPU por núcleo,
 * hilos, event loop, contenedor, PostgreSQL, HTTP), calcula la muestra y la
 * difunde por Server-Sent Events a todos los navegadores conectados. El costo
 * no crece con la cantidad de pestañas: hay una sola consulta por segundo.
 */

import { Request, Response } from 'express';

import { DbStats, RuntimeSnapshot } from '../metrics/runtime';
import { derive, hostInfo, HostInfo, Sample } from './derive';

/** 300 muestras × 1 s = los últimos 5 minutos. */
const HISTORY = 300;
const MAX_CLIENTS = 20;
const HEARTBEAT_MS = 15_000;

export interface MonitorOptions {
  runtime: () => RuntimeSnapshot;
  /** PostgreSQL; sin él (repositorios en memoria) el panel de base no se muestra. */
  db?: () => Promise<DbStats | null>;
  intervalMs?: number;
}

export class MonitorService {
  private previous: RuntimeSnapshot | null = null;
  private info: HostInfo | null = null;
  private readonly history: Sample[] = [];
  private readonly clients = new Set<Response>();
  private timer: NodeJS.Timeout | null = null;
  private collecting = false;
  private dbError: string | null = null;

  constructor(private readonly options: MonitorOptions) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs ?? 1000);
    // El muestreo no debe impedir que el proceso termine.
    this.timer.unref();
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const res of this.clients) res.end();
    this.clients.clear();
  }

  /** Una foto completa (la usa también GET /metrics/runtime). */
  async collect(): Promise<RuntimeSnapshot> {
    const snapshot = this.options.runtime();
    if (!this.options.db) return snapshot;
    try {
      snapshot.db = await this.options.db();
      this.dbError = null;
    } catch (err) {
      snapshot.db = null;
      this.dbError = err instanceof Error ? err.message : String(err);
    }
    return snapshot;
  }

  async tick(): Promise<void> {
    // Si la base tarda más de un intervalo, se salta el turno en vez de apilar consultas.
    if (this.collecting) return;
    this.collecting = true;
    try {
      const snapshot = await this.collect();
      if (!this.info || !this.previous) {
        this.info = hostInfo(snapshot);
        this.broadcast('info', this.info);
      }
      if (this.previous) {
        const sample = derive(this.previous, snapshot);
        this.history.push(sample);
        if (this.history.length > HISTORY) this.history.shift();
        this.broadcast('sample', sample);
      }
      this.previous = snapshot;
    } finally {
      this.collecting = false;
    }
  }

  get state(): { info: HostInfo | null; history: Sample[]; dbError: string | null } {
    return { info: this.info, history: [...this.history], dbError: this.dbError };
  }

  /** GET /monitor/events */
  stream = (req: Request, res: Response): void => {
    if (this.clients.size >= MAX_CLIENTS) {
      res.status(503).json({ error: 'Demasiadas conexiones al monitor' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    // Al conectarse recibe todo el contexto: cabecera e historial.
    res.write('retry: 3000\n');
    if (this.info) res.write(`event: info\ndata: ${JSON.stringify(this.info)}\n\n`);
    res.write(`event: history\ndata: ${JSON.stringify(this.history)}\n\n`);
    this.clients.add(res);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    req.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
    });
  };

  /** GET /monitor/history */
  snapshotJson = (_req: Request, res: Response): void => {
    res.json(this.state);
  };

  private broadcast(event: string, data: unknown): void {
    if (this.clients.size === 0) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) res.write(payload);
  }
}
