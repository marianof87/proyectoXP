/**
 * Construccion de la aplicacion Express, separada del arranque del servidor.
 *
 * Asi las pruebas pueden crear una app contra repositorios en memoria sin
 * abrir un puerto ni conectar con PostgreSQL.
 */

import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import path from 'path';

import { Services } from './container';
import { HttpMetrics } from './metrics/runtime';
import { MonitorService } from './monitor/MonitorService';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createRouter, RouterOptions } from './routes';

export interface AppOptions extends RouterOptions {
  /**
   * HU-13: métricas de ejecución y monitor de recursos (/monitor/). Van fuera
   * de /api para que el rate limit no corte al monitor justo cuando hay más
   * presión.
   */
  metrics?: {
    http: HttpMetrics;
    monitor: MonitorService;
    /** Demo de paralelismo: cambiar el tamaño del pool de hilos en caliente. */
    threads?: {
      current: () => number;
      resize: (threads: number) => void;
    };
  };
  /** Usar X-Forwarded-For como IP del cliente (solo detrás de un proxy de confianza). */
  trustProxy?: boolean;
  /**
   * URL del servidor de control de coworking-traffic-sim (p. ej. http://sim:4000).
   * Con ella el monitor puede arrancar y detener escenarios de carga.
   */
  simulatorControlUrl?: string;
}

/** Tope del pool desde el monitor: más hilos que núcleos lógicos solo agrega cambios de contexto. */
const MAX_POOL_THREADS = 64;

export const createApp = (
  services: Services,
  options: AppOptions = {}
): Express => {
  const app: Express = express();
  if (options.trustProxy) app.set('trust proxy', true);

  app.use(cors());
  if (options.metrics) {
    // Antes que todo lo demás: así cuenta también las peticiones rechazadas (429).
    app.use(options.metrics.http.middleware);
    const { monitor } = options.metrics;
    app.get('/metrics/runtime', async (_req: Request, res: Response) => {
      res.json(await monitor.collect());
    });
    app.get('/monitor/events', monitor.stream);
    app.get('/monitor/history', monitor.snapshotJson);

    const { threads } = options.metrics;
    app.post('/monitor/hilos', express.json(), async (req: Request, res: Response) => {
      if (!threads) {
        res.status(404).json({ error: 'Disponible solo en modo demostración (ENABLE_SIMULATOR=true, build compilado)' });
        return;
      }
      const pedido = (req.body as { hilos?: unknown } | undefined)?.hilos;
      if (typeof pedido !== 'number' || !Number.isInteger(pedido) || pedido < 0 || pedido > MAX_POOL_THREADS) {
        res.status(400).json({ error: `"hilos" debe ser un entero entre 0 y ${MAX_POOL_THREADS}` });
        return;
      }
      threads.resize(pedido);
      res.json({ hilos: threads.current() });
    });

    mountScenarioProxy(app, options.simulatorControlUrl);
  }
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  app.use('/api', createRouter(services, options));

  // Interfaz web de prueba/demostración (sin build): public/.
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // El orden importa: 404 primero, manejador de errores al final.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

/**
 * Botones de carga del monitor: reenvía /monitor/escenarios/* al servidor de
 * control del simulador (otro contenedor). Si no está configurado o no
 * responde, se informa en vez de fallar en silencio.
 */
const mountScenarioProxy = (app: Express, controlUrl: string | undefined): void => {
  const forward = async (res: Response, path: string, method: 'GET' | 'POST'): Promise<void> => {
    if (!controlUrl) {
      res.status(404).json({ error: 'Simulador no configurado (SIM_CONTROL_URL)' });
      return;
    }
    try {
      const upstream = await fetch(`${controlUrl}${path}`, { method, signal: AbortSignal.timeout(20_000) });
      res.status(upstream.status).json(await upstream.json());
    } catch {
      res.status(502).json({ error: `El simulador no responde en ${controlUrl}` });
    }
  };

  app.get('/monitor/escenarios', async (_req: Request, res: Response) => {
    if (!controlUrl) {
      res.json({ disponible: false, error: 'Simulador no configurado (SIM_CONTROL_URL)' });
      return;
    }
    try {
      const [lista, estado] = await Promise.all(
        ['/escenarios', '/estado'].map(async (p) =>
          (await fetch(`${controlUrl}${p}`, { signal: AbortSignal.timeout(3_000) })).json()
        )
      );
      res.json({ disponible: true, escenarios: lista, estado });
    } catch {
      res.json({ disponible: false, error: `El simulador no responde en ${controlUrl}` });
    }
  });
  app.post('/monitor/escenarios/detener', (_req: Request, res: Response) =>
    forward(res, '/detener', 'POST')
  );
  app.post('/monitor/escenarios/:nombre', (req: Request, res: Response) => {
    const nombre = String(req.params.nombre);
    if (!/^[a-z-]+$/.test(nombre)) {
      res.status(400).json({ error: 'Nombre de escenario inválido' });
      return;
    }
    const tasa = typeof req.query.tasa === 'string' ? `?tasa=${encodeURIComponent(req.query.tasa)}` : '';
    return forward(res, `/escenarios/${nombre}${tasa}`, 'POST');
  });
};
