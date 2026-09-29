import { NextFunction, Request, Response } from 'express';

import { logger } from '../logger';
import { DomainError } from '../models/errors';

/**
 * Traduce errores de dominio a códigos HTTP.
 *
 * El status sale de `error.statusCode`, no de inspeccionar el texto del
 * mensaje: cambiar la redaccion de un error ya no altera la respuesta.
 *
 * Los cuatro parámetros son obligatorios para que Express lo reconozca como
 * middleware de error, aunque `next` no se use.
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (error instanceof DomainError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  // HU-10: se registra la petición completa para poder depurar el fallo,
  // pero `logger` censura authorization/password/token (ver src/logger.ts).
  logger.error(
    {
      req: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
      },
      err: error,
    },
    'Unexpected error'
  );
  res.status(500).json({ error: 'Internal server error' });
};

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({ error: 'Not found' });
};
