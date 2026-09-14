import { NextFunction, Request, Response } from 'express';

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
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (error instanceof DomainError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error('Unexpected error:', error);
  res.status(500).json({ error: 'Internal server error' });
};

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({ error: 'Not found' });
};
