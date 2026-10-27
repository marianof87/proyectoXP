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
  };
}

export const createApp = (
  services: Services,
  options: AppOptions = {}
): Express => {
  const app: Express = express();

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
