import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { UnauthorizedError, ValidationError } from '../models/errors';
import { TokenService } from '../services/TokenService';
import { UserService } from '../services/UserService';
import {
  addBalanceSchema,
  loginSchema,
  registerSchema,
} from '../validation/schemas';

export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly tokenService: TokenService
  ) {}

  /** El body ya llegó validado y saneado por validateRequest(registerSchema). */
  register = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { email, name, password } = req.body as z.infer<
        typeof registerSchema
      >;

      const user = await this.userService.registerUser({
        email,
        name,
        password,
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
      const { email, password } = req.body as z.infer<typeof loginSchema>;

      const user = await this.userService.login({ email, password });

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
      const { amount } = req.body as z.infer<typeof addBalanceSchema>;

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
