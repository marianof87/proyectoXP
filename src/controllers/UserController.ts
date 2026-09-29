import { NextFunction, Request, Response } from 'express';

import { UnauthorizedError, ValidationError } from '../models/errors';
import { SessionService } from '../services/SessionService';
import { TokenService } from '../services/TokenService';
import { UserService } from '../services/UserService';

export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService
  ) {}

  register = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { email, name, password } = req.body ?? {};

      if (!email || !name || !password) {
        throw new ValidationError(
          'Missing required fields: email, name, password'
        );
      }

      const user = await this.userService.registerUser({
        email: String(email),
        name: String(name),
        password: String(password),
      });

      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  };

  login = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { email, password } = req.body ?? {};

      if (!email || !password) {
        throw new ValidationError('Missing required fields: email, password');
      }

      const user = await this.userService.login({
        email: String(email),
        password: String(password),
      });

      const token = this.tokenService.generateToken({
        userId: user.id,
        role: user.role,
      });

      res.json({ user, token });
    } catch (error) {
      next(error);
    }
  };

  /** HU-09: perfil del usuario autenticado, resuelto a partir del token. */
  me = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('No token provided');
      }

      const user = await this.userService.getUserById(req.user.userId);
      if (!user) {
        throw new UnauthorizedError('No token provided');
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  };

  /**
   * HU-11 (Actividad C): revoca el token actual. Un JWT firmado no se puede
   * "borrar", así que se guarda su jti en la lista negra hasta que expire
   * solo (ver SessionService); a partir de ahí, authenticate lo rechaza
   * aunque la firma siga siendo válida.
   */
  logout = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('No token provided');
      }

      await this.sessionService.revoke(
        req.user.jti,
        new Date(req.user.exp * 1000)
      );

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  getUserById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = parseId(req.params.id, 'user ID');

      const user = await this.userService.getUserById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  };

  addBalance = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = parseId(req.params.id, 'user ID');
      const { amount } = req.body ?? {};

      if (typeof amount !== 'number') {
        throw new ValidationError('Amount must be a number');
      }

      res.json(await this.userService.addBalance(userId, amount));
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Compartido por los controladores: valida un id numérico de la ruta.
 *
 * Express tipa los parámetros como `string | string[]` (una ruta puede
 * repetir un nombre), así que solo se acepta la forma simple.
 */
export const parseId = (
  raw: string | string[] | undefined,
  label: string
): number => {
  if (typeof raw !== 'string') {
    throw new ValidationError(`Invalid ${label}`);
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || String(parsed) !== raw.trim()) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return parsed;
};
