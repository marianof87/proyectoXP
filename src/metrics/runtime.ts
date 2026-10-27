/**
 * HU-13: métricas de ejecución para el monitor (tercer sistema).
 *
 * GET /metrics/runtime devuelve una foto del proceso y de la máquina. Los
 * contadores son ACUMULADOS (tiempos de CPU, peticiones, utilización del event
 * loop): el monitor toma dos fotos y calcula la diferencia, así varios
 * monitores pueden leer a la vez sin pisarse. La única excepción es la demora
 * del event loop, un histograma que se reinicia en cada lectura.
 */

import fs from 'fs';
import os from 'os';
import { monitorEventLoopDelay, performance } from 'perf_hooks';
import { Worker } from 'worker_threads';

import { NextFunction, Request, RequestHandler, Response } from 'express';

// ---------------------------------------------------------------------------
// Peticiones HTTP: en vuelo, por clase de status y rechazadas por rate limit.
// ---------------------------------------------------------------------------

export interface HttpCounters {
  inFlight: number;
  total: number;
  byClass: { '2xx': number; '3xx': number; '4xx': number; '5xx': number };
  /** Subconjunto de 4xx: no admitidas por el rate limit (429). */
  rateLimited: number;
}

export interface HttpMetrics {
  middleware: RequestHandler;
  snapshot(): HttpCounters;
}

/** Las lecturas del propio monitor (/metrics, /monitor) no cuentan como tráfico. */
export const createHttpMetrics = (
  ignorePrefixes: string[] = ['/metrics', '/monitor']
): HttpMetrics => {
  const counters: HttpCounters = {
    inFlight: 0,
    total: 0,
    byClass: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
    rateLimited: 0,
  };

  const middleware = (req: Request, res: Response, next: NextFunction): void => {
    if (ignorePrefixes.some((p) => req.path === p || req.path.startsWith(`${p}/`))) {
      next();
      return;
    }
    counters.inFlight += 1;
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      counters.inFlight -= 1;
      counters.total += 1;
      const cls = `${Math.floor(res.statusCode / 100)}xx` as keyof HttpCounters['byClass'];
      if (cls in counters.byClass) counters.byClass[cls] += 1;
      if (res.statusCode === 429) counters.rateLimited += 1;
    };
    // 'finish' = respuesta enviada; 'close' sin 'finish' = el cliente cortó.
    res.on('finish', finish);
    res.on('close', finish);
    next();
  };

  return {
    middleware,
    snapshot: () => ({ ...counters, byClass: { ...counters.byClass } }),
  };
};

// ---------------------------------------------------------------------------
// Topología de CPU: qué núcleos lógicos comparten núcleo físico (hyperthreading).
// ---------------------------------------------------------------------------

export interface LogicalCpu {
  cpu: number;
  /** Identifica el núcleo físico: dos lógicos con el mismo id son hermanos de HT. */
  physicalId: string;
  /** Núcleos lógicos que comparten el mismo núcleo físico (incluido éste). */
  siblings: number[];
}

/** "0-1" → [0, 1]; "2,6" → [2, 6]; "4" → [4]. Formato de /sys (cpulist). */
export const parseCpuList = (list: string): number[] =>
  list
    .trim()
    .split(',')
    .filter(Boolean)
    .flatMap((part) => {
      const [from, to] = part.split('-').map((n) => Number.parseInt(n, 10));
      if (from === undefined || Number.isNaN(from)) return [];
      if (to === undefined || Number.isNaN(to)) return [from];
      return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    });

/**
 * Lee /sys/devices/system/cpu/cpuN/topology (Linux; también dentro de un
 * contenedor). Si no se puede leer (macOS, Windows), devuelve [] y el monitor
 * muestra los núcleos lógicos sin agrupar.
 */
export const readCpuTopology = (
  cpuCount: number,
  readFile: (file: string) => string = (file) => fs.readFileSync(file, 'utf8')
): LogicalCpu[] => {
  try {
    return Array.from({ length: cpuCount }, (_, cpu) => {
      const dir = `/sys/devices/system/cpu/cpu${cpu}/topology`;
      const pkg = readFile(`${dir}/physical_package_id`).trim();
      const siblings = parseCpuList(readFile(`${dir}/thread_siblings_list`));
      // Se agrupa por la lista de hermanos y no por core_id: en los Intel
      // híbridos (núcleos P + E) core_id no es único entre clústeres.
      return { cpu, physicalId: `${pkg}:${siblings.join(',')}`, siblings };
    });
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// Recursos del sistema operativo: hilos del proceso y límites del contenedor.
// ---------------------------------------------------------------------------

type ReadFile = (file: string) => string;
const readUtf8: ReadFile = (file) => fs.readFileSync(file, 'utf8');

/**
 * Hilos REALES del sistema operativo que tiene el proceso: el principal, los
 * worker threads, los 4 de libuv, los de V8 (compilador, GC) y los del motor
 * de Prisma. Sale de /proc/self/status (solo Linux).
 */
export const readOsThreads = (readFile: ReadFile = readUtf8): number | null => {
  try {
    const match = /^Threads:\s+(\d+)/m.exec(readFile('/proc/self/status'));
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
};

export interface ContainerStats {
  /** CPU acumulada del cgroup (microsegundos): todo lo que corre en el contenedor. */
  cpuUsageUsec: number;
  memoryBytes: number;
  /** null = sin límite (`max`). */
  memoryLimitBytes: number | null;
  cpuLimitCores: number | null;
  /** Tareas (procesos + hilos) dentro del cgroup. */
  tasks: number | null;
}

/**
 * Lee el cgroup v2 del proceso (en un contenedor, el del contenedor). La ruta
 * sale de /proc/self/cgroup ("0::/ruta"); si no hay cgroup v2 devuelve null.
 */
export const readContainerStats = (readFile: ReadFile = readUtf8): ContainerStats | null => {
  try {
    const own = /^0::(.*)$/m.exec(readFile('/proc/self/cgroup'))?.[1]?.trim() ?? '/';
    const dir = `/sys/fs/cgroup${own === '/' ? '' : own}`;
    const optional = (name: string): string | null => {
      try {
        return readFile(`${dir}/${name}`).trim();
      } catch {
        return null;
      }
    };
    const usage = /^usage_usec (\d+)/m.exec(readFile(`${dir}/cpu.stat`))?.[1];
    if (usage === undefined) return null;
    const memMax = optional('memory.max');
    const [quota, period] = (optional('cpu.max') ?? 'max').split(/\s+/);
    const tasks = optional('pids.current');
    return {
      cpuUsageUsec: Number(usage),
      memoryBytes: Number(optional('memory.current') ?? 0),
      memoryLimitBytes: memMax && memMax !== 'max' ? Number(memMax) : null,
      cpuLimitCores:
        quota && quota !== 'max' && period ? Number(quota) / Number(period) : null,
      tasks: tasks === null ? null : Number(tasks),
    };
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Foto completa
// ---------------------------------------------------------------------------

/** Lo mínimo que el monitor necesita del pool de hilos (piscina lo cumple). */
export interface WorkerPoolView {
  threads: Worker[];
  maxThreads: number;
  queueSize: number;
  completed: number;
  utilization: number;
}

export interface RuntimeMetricsOptions {
  http: HttpMetrics;
  /** Función y no valor: el pool puede cambiar de tamaño en caliente. */
  pool?: () => WorkerPoolView | undefined;
  /** Para qué se usa el pool (se muestra en el monitor). */
  poolPurpose?: string;
}

export interface CpuTimes {
  user: number;
  nice: number;
  sys: number;
  idle: number;
  irq: number;
}

/** Estadísticas acumuladas de PostgreSQL (ver src/monitor/postgresStats.ts). */
export interface DbStats {
  commits: number;
  rollbacks: number;
  blocksHit: number;
  blocksRead: number;
  rowsFetched: number;
  rowsWritten: number;
  deadlocks: number;
  connections: { active: number; idle: number; idleInTransaction: number; waitingLock: number };
  maxConnections: number;
  sizeBytes: number;
}

export interface RuntimeSnapshot {
  timestamp: number;
  host: {
    hostname: string;
    cpuModel: string;
    logicalCpus: number;
    availableParallelism: number;
    topology: LogicalCpu[];
    /** Tiempos acumulados (ms) por núcleo lógico. */
    cpuTimes: CpuTimes[];
    loadavg: number[];
    totalMemory: number;
    freeMemory: number;
  };
  process: {
    pid: number;
    nodeVersion: string;
    uptimeSec: number;
    /** Microsegundos de CPU acumulados del proceso (todos sus hilos). */
    cpuUsage: { user: number; system: number };
    memory: { rss: number; heapUsed: number; heapTotal: number; external: number };
    osThreads: number | null;
    uvThreadpoolSize: number;
    activeResources: number;
    eventLoop: {
      /** idle/active acumulados en ms. */
      utilization: { idle: number; active: number };
      delayMs: { p50: number; p99: number; max: number };
    };
  };
  container: ContainerStats | null;
  workerPool: {
    enabled: boolean;
    purpose: string;
    maxThreads?: number;
    queueSize?: number;
    completed?: number;
    threads: Array<{ threadId: number; idle: number; active: number }>;
  };
  http: HttpCounters;
  /** La agrega el monitor cuando hay PostgreSQL; null con repositorios en memoria. */
  db?: DbStats | null;
}

export const createRuntimeMetrics = (
  options: RuntimeMetricsOptions
): (() => RuntimeSnapshot) => {
  const loopDelay = monitorEventLoopDelay({ resolution: 10 });
  loopDelay.enable();
  const cpuCount = os.cpus().length;
  // La topología no cambia en caliente: se lee una vez.
  const topology = readCpuTopology(cpuCount);
  const ms = (ns: number): number => Math.round((ns / 1e6) * 100) / 100;

  return (): RuntimeSnapshot => {
    const elu = performance.eventLoopUtilization();
    const delay = {
      p50: ms(loopDelay.percentile(50)),
      p99: ms(loopDelay.percentile(99)),
      max: ms(loopDelay.max),
    };
    loopDelay.reset();

    const pool = options.pool?.();
    const cpus = os.cpus();
    const mem = process.memoryUsage();
    return {
      timestamp: Date.now(),
      host: {
        hostname: os.hostname(),
        cpuModel: cpus[0]?.model ?? 'desconocido',
        logicalCpus: cpuCount,
        availableParallelism: os.availableParallelism(),
        topology,
        cpuTimes: cpus.map((c) => c.times),
        loadavg: os.loadavg(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
      },
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        uptimeSec: Math.round(process.uptime()),
        cpuUsage: process.cpuUsage(),
        memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external },
        osThreads: readOsThreads(),
        // Hilos del pool de libuv (fs, dns, bcrypt asíncrono): por defecto 4.
        uvThreadpoolSize: Number.parseInt(process.env.UV_THREADPOOL_SIZE ?? '4', 10),
        activeResources: process.getActiveResourcesInfo().length,
        eventLoop: {
          utilization: { idle: elu.idle, active: elu.active },
          delayMs: delay,
        },
      },
      container: readContainerStats(),
      workerPool: pool
        ? {
            enabled: true,
            purpose: options.poolPurpose ?? '',
            maxThreads: pool.maxThreads,
            queueSize: pool.queueSize,
            completed: pool.completed,
            threads: pool.threads.map((w) => {
              const u = w.performance.eventLoopUtilization();
              return { threadId: w.threadId, idle: u.idle, active: u.active };
            }),
          }
        : { enabled: false, purpose: 'bcrypt sobre el pool de libuv', threads: [] },
      http: options.http.snapshot(),
    };
  };
};
