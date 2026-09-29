/**
 * HU-10: middleware genérico de validación (adapta el patrón de
 * 04.Sanitizacion_Validacion_Logs, sección 1, a este sistema).
 *
 * Sustituye el body por el resultado de `schema.parse`, así que la petición
 * que llega al controlador ya está saneada (trim, coerción de números) y
 * tipada: los controladores dejan de repetir comprobaciones de "campo
 * obligatorio" a mano.
 */

import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';

import { ValidationError } from '../models/errors';

export const validateRequest = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(new ValidationError(formatZodError(result.error)));
      return;
    }

    req.body = result.data;
    next();
  };
};

/** Un solo mensaje por error, igual que el resto de ValidationError del sistema. */
const formatZodError = (error: ZodError): string => {
  const [firstIssue] = error.issues;
  const field = firstIssue.path.join('.') || 'body';
  return `${field}: ${firstIssue.message}`;
};
