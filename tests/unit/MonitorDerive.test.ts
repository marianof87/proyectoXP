import fc from 'fast-check';

import { CpuTimes, DbStats, RuntimeSnapshot } from '../../src/metrics/runtime';
import {
  busyPct,
  coreUtilization,
  derive,
  groupPhysicalCores,
  hostInfo,
  perSecond,
} from '../../src/monitor/derive';

const tiempos = (user: number, idle: number, sys = 0): CpuTimes => ({ user, nice: 0, sys, idle, irq: 0 });

const dbBase: DbStats = {
  commits: 0,
  rollbacks: 0,
  blocksHit: 0,
  blocksRead: 0,
  rowsFetched: 0,
  rowsWritten: 0,
  deadlocks: 0,
  connections: { active: 1, idle: 4, idleInTransaction: 0, waitingLock: 0 },
  maxConnections: 100,
  sizeBytes: 9 * 1048576,
};

/** Foto mínima válida; cada test pisa solo lo que le interesa. */
const foto = (over: {
  t: number;
  cpuTimes?: CpuTimes[];
  cpuUs?: number;
  total?: number;
  rateLimited?: number;
  pid?: number;
  threads?: Array<{ threadId: number; idle: number; active: number }>;
  db?: Partial<DbStats> | null;
  cgroupUs?: number;
}): RuntimeSnapshot => ({
  timestamp: over.t,
  host: {
    hostname: 'api',
    cpuModel: '13th Gen Intel(R) Core(TM) i5-1335U',
    logicalCpus: over.cpuTimes?.length ?? 2,
    availableParallelism: over.cpuTimes?.length ?? 2,
    topology: [],
    cpuTimes: over.cpuTimes ?? [tiempos(0, 0), tiempos(0, 0)],
    loadavg: [0, 0, 0],
    totalMemory: 16 * 1024 ** 3,
    freeMemory: 8 * 1024 ** 3,
  },
  process: {
    pid: over.pid ?? 1,
    nodeVersion: 'v22.23.3',
    uptimeSec: 10,
    cpuUsage: { user: over.cpuUs ?? 0, system: 0 },
    memory: { rss: 80 * 1048576, heapUsed: 30 * 1048576, heapTotal: 40 * 1048576, external: 0 },
    osThreads: 36,
    uvThreadpoolSize: 4,
    activeResources: 3,
    eventLoop: { utilization: { idle: 0, active: 0 }, delayMs: { p50: 10, p99: 12, max: 15 } },
  },
  container:
    over.cgroupUs === undefined
      ? null
      : { cpuUsageUsec: over.cgroupUs, memoryBytes: 250 * 1048576, memoryLimitBytes: null, cpuLimitCores: null, tasks: 39 },
  workerPool: {
    enabled: true,
    purpose: 'bcrypt (registro y login)',
    maxThreads: 2,
    queueSize: 0,
    completed: 0,
    threads: over.threads ?? [],
  },
  http: {
    inFlight: 0,
    total: over.total ?? 0,
    byClass: { '2xx': 0, '3xx': 0, '4xx': over.rateLimited ?? 0, '5xx': 0 },
    rateLimited: over.rateLimited ?? 0,
  },
  db: over.db === undefined ? undefined : over.db === null ? null : { ...dbBase, ...over.db },
});

describe('Monitor de recursos: cálculos (HU-13)', () => {
  describe('coreUtilization', () => {
    it('cuando el núcleo estuvo ocupado 3 de cada 4 ms informa 75 %', () => {
      expect(coreUtilization(tiempos(1000, 1000), tiempos(1600, 1250, 150))).toBe(75);
    });

    it('con cualquier par de lecturas siempre da un porcentaje entre 0 y 100', () => {
      const lectura = fc.record({
        user: fc.nat(1e9), nice: fc.nat(1e9), sys: fc.nat(1e9), idle: fc.nat(1e9), irq: fc.nat(1e9),
      });
      fc.assert(
        fc.property(lectura, lectura, (a, b) => {
          const pct = coreUtilization(a, b);
          expect(pct).toBeGreaterThanOrEqual(0);
          expect(pct).toBeLessThanOrEqual(100);
        })
      );
    });
  });

  describe('busyPct', () => {
    it('cuando un worker thread trabajó 900 ms de 1000 lo muestra 90 % ocupado', () => {
      expect(busyPct({ idle: 500, active: 200 }, { idle: 600, active: 1100 })).toBe(90);
    });
  });

  describe('perSecond', () => {
    it('cuando la API se reinicia y el contador vuelve a cero no informa una tasa negativa', () => {
      expect(perSecond(5000, 12, 1000)).toBe(0);
    });

    it('nunca es negativa ni explota con intervalos de 0 ms', () => {
      fc.assert(
        fc.property(fc.nat(), fc.nat(), fc.integer({ min: -10, max: 10_000 }), (a, b, ms) => {
          const tasa = perSecond(a, b, ms);
          expect(Number.isFinite(tasa)).toBe(true);
          expect(tasa).toBeGreaterThanOrEqual(0);
        })
      );
    });
  });

  describe('groupPhysicalCores', () => {
    it('en un i5-1335U agrupa los hermanos de hyperthreading y deja a cada núcleo E solo', () => {
      // Arrange: así lo publica /metrics/runtime (physicalId = paquete:hermanos)
      const topologia = Array.from({ length: 12 }, (_, cpu) => {
        const siblings = cpu < 4 ? [cpu - (cpu % 2), cpu - (cpu % 2) + 1] : [cpu];
        return { cpu, physicalId: `0:${siblings.join(',')}`, siblings };
      });

      // Act
      const nucleos = groupPhysicalCores(topologia, 12);

      // Assert
      expect(nucleos).toEqual([[0, 1], [2, 3], [4], [5], [6], [7], [8], [9], [10], [11]]);
    });

    it('cuando no hay topología muestra cada núcleo lógico por separado', () => {
      expect(groupPhysicalCores([], 3)).toEqual([[0], [1], [2]]);
    });
  });

  describe('derive', () => {
    it('cuando en 2 s llegaron 100 peticiones y 30 fueron rechazadas informa 35 admitidas/s y 15 rechazadas/s', () => {
      const muestra = derive(foto({ t: 0 }), foto({ t: 2000, total: 100, rateLimited: 30 }));

      expect(muestra).toMatchObject({ admittedPerSec: 35, rateLimitedPerSec: 15 });
    });

    it('cuando el proceso consumió 3 s de CPU en 1 s en una máquina de 12 núcleos cuenta 3 núcleos (25 %)', () => {
      const doce = Array.from({ length: 12 }, () => tiempos(0, 0));

      const muestra = derive(foto({ t: 0, cpuTimes: doce }), foto({ t: 1000, cpuTimes: doce, cpuUs: 3_000_000 }));

      expect(muestra).toMatchObject({ processCores: 3, processCpuPct: 25 });
    });

    it('cuando aparece un worker thread nuevo lo muestra con 0 % hasta tener dos lecturas suyas', () => {
      const antes = foto({ t: 0, threads: [{ threadId: 1, idle: 0, active: 0 }] });
      const despues = foto({
        t: 1000,
        threads: [{ threadId: 1, idle: 500, active: 500 }, { threadId: 2, idle: 10, active: 10 }],
      });

      expect(derive(antes, despues).pool.threads).toEqual([
        { threadId: 1, pct: 50 },
        { threadId: 2, pct: 0 },
      ]);
    });

    describe('con PostgreSQL', () => {
      it('informa transacciones confirmadas y revertidas por segundo y el % de aciertos de caché', () => {
        // Arrange: en 2 s, 80 commits, 6 rollbacks (carreras perdidas), 95 de 100 bloques desde caché
        const antes = foto({ t: 0, db: { commits: 1000, rollbacks: 10, blocksHit: 500, blocksRead: 50 } });
        const despues = foto({ t: 2000, db: { commits: 1080, rollbacks: 16, blocksHit: 595, blocksRead: 55 } });

        // Act
        const { db } = derive(antes, despues);

        // Assert
        expect(db).toMatchObject({ commitsPerSec: 40, rollbacksPerSec: 3, cacheHitPct: 95, idle: 4, sizeMb: 9 });
      });

      it('sin lecturas de bloques en el intervalo no inventa un % de caché', () => {
        expect(derive(foto({ t: 0, db: {} }), foto({ t: 1000, db: {} })).db?.cacheHitPct).toBeNull();
      });
    });

    it('sin base de datos (repositorios en memoria) no informa sección de base', () => {
      expect(derive(foto({ t: 0 }), foto({ t: 1000 })).db).toBeNull();
    });

    it('en un contenedor calcula los núcleos que usó el cgroup', () => {
      const muestra = derive(foto({ t: 0, cgroupUs: 0 }), foto({ t: 1000, cgroupUs: 1_500_000 }));

      expect(muestra.container).toEqual({ cpuCores: 1.5, memoryMb: 250, memoryLimitMb: null, tasks: 39 });
    });
  });

  describe('hostInfo', () => {
    it('sin topología no cuenta ningún núcleo como hyperthreading ni asume contenedor', () => {
      expect(hostInfo(foto({ t: 0 }))).toMatchObject({
        logicalCpus: 2,
        hyperthreadedCores: 0,
        inContainer: false,
        database: false,
      });
    });
  });
});
