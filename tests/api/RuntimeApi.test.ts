import type { Server } from 'http';
import type { AddressInfo } from 'net';

import { AppOptions, createApp } from '../../src/app';
import { createInMemoryServices } from '../../src/container';
import { createHttpMetrics, createRuntimeMetrics } from '../../src/metrics/runtime';
import { MonitorService } from '../../src/monitor/MonitorService';

const start = async (options: AppOptions = {}) => {
  const { services } = createInMemoryServices();
  const server: Server = await new Promise((resolve) => {
    const s = createApp(services, options).listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { server, base };
};

/** Forma que el monitor lee de la foto (solo lo que estas pruebas miran). */
interface Foto {
  http: unknown;
  host: { logicalCpus: number; cpuTimes: Array<Record<string, number>> };
  process: { eventLoop: { delayMs: unknown } };
  workerPool: unknown;
}

const conMetricas = (): AppOptions['metrics'] => {
  const http = createHttpMetrics();
  return { http, monitor: new MonitorService({ runtime: createRuntimeMetrics({ http }) }) };
};

describe('GET /metrics/runtime (HU-13)', () => {
  let ctx: Awaited<ReturnType<typeof start>>;
  afterEach(async () => {
    ctx.server.closeAllConnections();
    await new Promise((r) => ctx.server.close(r));
  });

  describe('cuando las métricas no están habilitadas', () => {
    it('responde 404', async () => {
      ctx = await start();

      const res = await fetch(`${ctx.base}/metrics/runtime`);

      expect(res.status).toBe(404);
    });
  });

  describe('cuando el rate limit rechaza parte del tráfico', () => {
    it('cuenta admitidas y rechazadas (429), y el monitor no queda limitado', async () => {
      // Arrange: cupo de 2 peticiones por ventana
      ctx = await start({
        metrics: conMetricas(),
        rateLimit: {
          general: { windowMs: 60_000, max: 2 },
          auth: { windowMs: 60_000, max: 2 },
        },
      });

      // Act
      const estados = [];
      for (let i = 0; i < 5; i += 1) {
        estados.push((await fetch(`${ctx.base}/api/rooms`)).status);
      }
      const lecturas = await Promise.all([1, 2, 3].map(() => fetch(`${ctx.base}/metrics/runtime`)));
      const foto = (await lecturas[2]!.json()) as Foto;

      // Assert
      expect(estados).toEqual([200, 200, 429, 429, 429]);
      expect(lecturas.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(foto.http).toEqual({
        inFlight: 0,
        total: 5,
        byClass: { '2xx': 2, '3xx': 0, '4xx': 3, '5xx': 0 },
        rateLimited: 3,
      });
    });
  });

  describe('la foto de la máquina y del proceso', () => {
    it('trae un registro de tiempos de CPU por cada núcleo lógico y el pool deshabilitado', async () => {
      ctx = await start({ metrics: conMetricas() });

      const foto = (await (await fetch(`${ctx.base}/metrics/runtime`)).json()) as Foto;

      expect(foto.host.cpuTimes).toHaveLength(foto.host.logicalCpus);
      expect(foto.host.cpuTimes[0]).toEqual(
        expect.objectContaining({ user: expect.any(Number), idle: expect.any(Number) })
      );
      expect(foto.process.eventLoop.delayMs).toEqual(
        expect.objectContaining({ p50: expect.any(Number), p99: expect.any(Number) })
      );
      expect(foto.workerPool).toMatchObject({ enabled: false, threads: [] });
    });
  });

  describe('el monitor de recursos integrado', () => {
    it('sirve el tablero en /monitor/ y su historial crece con cada muestra', async () => {
      // Arrange
      const metricas = conMetricas()!;
      ctx = await start({ metrics: metricas });
      await metricas.monitor.tick();
      await metricas.monitor.tick();

      // Act
      const tablero = await fetch(`${ctx.base}/monitor/`);
      const estado = (await (await fetch(`${ctx.base}/monitor/history`)).json()) as {
        info: { logicalCpus: number; database: boolean };
        history: Array<{ cores: number[] }>;
      };

      // Assert
      expect(tablero.status).toBe(200);
      expect(await tablero.text()).toContain('Monitor de recursos');
      expect(estado.info).toMatchObject({ database: false });
      expect(estado.history).toHaveLength(1);
      expect(estado.history[0]!.cores).toHaveLength(estado.info.logicalCpus);
    });
  });
});
