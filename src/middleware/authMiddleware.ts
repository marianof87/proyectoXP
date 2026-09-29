/**
 * HU-09: Middlewares de autenticación y autorización (src/middleware/).
 *
 * Adaptan el patrón verificarToken/requerirRol del material de la unidad al
 * resto del sistema: reciben el TokenService por parámetro (igual que los
 * controladores reciben sus servicios) y traducen los fallos a los mismos
 * errores de dominio que ya entiende errorHandler.ts.
 */

import { NextFunction, Request, Response } from 'express';

import { Role } from '../models';
import { ForbiddenError, UnauthorizedError } from '../models/errors';
import { parseId } from '../controllers/UserController';
import { TokenPayload, TokenService } from '../services/TokenService';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Presente solo tras pasar por `authenticate`. */
      user?: TokenPayload;
    }
  }
}

/** Exige un Bearer token válido y expone su payload como `req.user`. */
export const authenticate = (tokenService: TokenService) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (!token) {
      next(new UnauthorizedError('No token provided'));
      return;
    }

    try {
      req.user = tokenService.verifyToken(token);
      next();
    } catch (error) {
      next(error);
    }
  };
};

/** Exige que `authenticate` ya haya corrido y que el rol esté permitido. */
export const requireRole = (allowedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }
    next();
  };
};

/**
 * Exige que el usuario autenticado sea el dueño del recurso (su id coincide
 * con `req.params[paramName]`) o tenga rol ADMIN. Cubre HU-02/HU-04: un
 * usuario ve o modifica su propio balance/reservas, un ADMIN ve cualquiera.
 */
export const requireOwnerOrAdmin = (paramName: string) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('No token provided'));
      return;
    }

    const resourceOwnerId = parseId(req.params[paramName], paramName);

    if (req.user.role !== 'ADMIN' && req.user.userId !== resourceOwnerId) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }
    next();
  };
};
