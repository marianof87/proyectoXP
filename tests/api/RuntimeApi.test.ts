import { createServer, type Server } from 'http';
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

  describe('POST /monitor/hilos (demo de paralelismo)', () => {
    it('sin el control habilitado responde 404', async () => {
      ctx = await start({ metrics: conMetricas() });

      const res = await fetch(`${ctx.base}/monitor/hilos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hilos: 4 }),
      });

      expect(res.status).toBe(404);
    });

    it.each([[-1], [65], [2.5], ['4']])('con hilos=%j responde 400 sin redimensionar', async (hilos) => {
      // Arrange
      const pedidos: number[] = [];
      ctx = await start({
        metrics: { ...conMetricas()!, threads: { current: () => 1, resize: async (n) => void pedidos.push(n) } },
      });

      // Act
      const res = await fetch(`${ctx.base}/monitor/hilos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hilos }),
      });

      // Assert
      expect(res.status).toBe(400);
      expect(pedidos).toEqual([]);
    });

    it('con un tamaño válido redimensiona y devuelve el tamaño vigente', async () => {
      // Arrange
      let actual = 1;
      ctx = await start({
        metrics: {
          ...conMetricas()!,
          threads: { current: () => actual, resize: async (n) => void (actual = n) },
        },
      });

      // Act
      const res = await fetch(`${ctx.base}/monitor/hilos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hilos: 12 }),
      });

      // Assert
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ hilos: 12 });
    });
  });

  describe('rate limit con TRUST_PROXY y una IP por usuario (X-Forwarded-For)', () => {
    it('limita a cada IP por separado: el que se excede recibe 429 y el otro sigue entrando', async () => {
      // Arrange: cupo de 2 por IP
      ctx = await start({
        trustProxy: true,
        rateLimit: { general: { windowMs: 60_000, max: 2 }, auth: { windowMs: 60_000, max: 2 } },
      });
      const desde = (ip: string) => fetch(`${ctx.base}/api/rooms`, { headers: { 'X-Forwarded-For': ip } });

      // Act
      const insistente = [];
      for (let i = 0; i < 3; i += 1) insistente.push((await desde('10.0.0.7')).status);
      const otro = (await desde('10.0.0.8')).status;

      // Assert
      expect(insistente).toEqual([200, 200, 429]);
      expect(otro).toBe(200);
    });

    it('sin TRUST_PROXY ignora X-Forwarded-For: todas las peticiones cuentan como una sola IP', async () => {
      ctx = await start({
        rateLimit: { general: { windowMs: 60_000, max: 2 }, auth: { windowMs: 60_000, max: 2 } },
      });
      const desde = (ip: string) => fetch(`${ctx.base}/api/rooms`, { headers: { 'X-Forwarded-For': ip } });

      const estados = [(await desde('10.0.0.1')).status, (await desde('10.0.0.2')).status, (await desde('10.0.0.3')).status];

      expect(estados).toEqual([200, 200, 429]);
    });
  });

  describe('botones de escenarios (/monitor/escenarios → simulador)', () => {
    let control: Server | undefined;
    afterEach(() => control?.close());

    /** Servidor de control falso: anota lo que le piden y responde como el real. */
    const controlFalso = async (pedidos: string[]): Promise<string> => {
      control = createServer((req, res) => {
        pedidos.push(`${req.method} ${req.url}`);
        res.writeHead(req.url?.startsWith('/escenarios/') ? 202 : 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(req.url === '/escenarios' ? [{ nombre: 'baja' }] : { corriendo: false }));
      });
      await new Promise<void>((r) => control!.listen(0, '127.0.0.1', r));
      return `http://127.0.0.1:${(control!.address() as AddressInfo).port}`;
    };

    it('sin simulador configurado lo informa como no disponible', async () => {
      ctx = await start({ metrics: conMetricas() });

      const body = await (await fetch(`${ctx.base}/monitor/escenarios`)).json();

      expect(body).toEqual({ disponible: false, error: 'Simulador no configurado (SIM_CONTROL_URL)' });
    });

    it('reenvía el arranque con su tasa y la detención al servidor de control', async () => {
      // Arrange
      const pedidos: string[] = [];
      ctx = await start({ metrics: conMetricas(), simulatorControlUrl: await controlFalso(pedidos) });

      // Act
      const estado = await (await fetch(`${ctx.base}/monitor/escenarios`)).json();
      const arranque = await fetch(`${ctx.base}/monitor/escenarios/saturacion?tasa=30`, { method: 'POST' });
      await fetch(`${ctx.base}/monitor/escenarios/detener`, { method: 'POST' });

      // Assert
      expect(estado).toEqual({ disponible: true, escenarios: [{ nombre: 'baja' }], estado: { corriendo: false } });
      expect(arranque.status).toBe(202);
      expect(pedidos).toEqual(
        expect.arrayContaining(['POST /escenarios/saturacion?tasa=30', 'POST /detener'])
      );
    });

    it('si el simulador no responde devuelve 502 con un mensaje claro', async () => {
      ctx = await start({ metrics: conMetricas(), simulatorControlUrl: 'http://127.0.0.1:9' });

      const res = await fetch(`${ctx.base}/monitor/escenarios/baja`, { method: 'POST' });

      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: 'El simulador no responde en http://127.0.0.1:9' });
    });
  });
});
