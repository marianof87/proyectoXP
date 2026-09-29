/**
 * Pruebas unitarias de validateRequest (HU-10), con un req/res/next falsos:
 * no hace falta levantar Express para probar el middleware de validación.
 */

import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { validateRequest } from '../../src/middleware/validateRequest';
import { ValidationError } from '../../src/models/errors';

const schema = z
  .object({
    nombre: z.string().trim().min(1),
    edad: z.coerce.number(),
  })
  .strict();

const crearRequestFalso = (body: unknown): Request =>
  ({ body }) as Request;

describe('validateRequest', () => {
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
  });

  it('deja pasar un body válido y lo reemplaza por el resultado saneado', () => {
    const req = crearRequestFalso({ nombre: '  Ana  ', edad: '30' });

    validateRequest(schema)(req, {} as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ nombre: 'Ana', edad: 30 });
  });

  it('rechaza un campo faltante con ValidationError', () => {
    const req = crearRequestFalso({ nombre: 'Ana' });

    validateRequest(schema)(req, {} as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it('rechaza un campo no declarado en el esquema', () => {
    const req = crearRequestFalso({ nombre: 'Ana', edad: 30, rol: 'ADMIN' });

    validateRequest(schema)(req, {} as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });
});
