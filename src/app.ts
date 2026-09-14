/**
 * Construccion de la aplicacion Express, separada del arranque del servidor.
 *
 * Asi las pruebas pueden crear una app contra repositorios en memoria sin
 * abrir un puerto ni conectar con PostgreSQL.
 */

import cors from 'cors';
import express, { Express, Request, Response } from 'express';

import { Services } from './container';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createRouter } from './routes';

export const createApp = (services: Services): Express => {
  const app: Express = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  app.use('/api', createRouter(services));

  // El orden importa: 404 primero, manejador de errores al final.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
