/**
 * HU-09: Emisión y verificación de JWT.
 *
 * Sin dependencia de Express ni de un repositorio, igual que el resto de
 * src/services/: el controlador decide cuándo emitir el token, este servicio
 * solo sabe firmar y verificar el payload que le pasan.
 */

import jwt from 'jsonwebtoken';

import { Role } from '../models';
import { UnauthorizedError } from '../models/errors';

export interface TokenPayload {
  userId: number;
  role: Role;
}

const TOKEN_EXPIRES_IN = '1h';

export class TokenService {
  generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret(), { expiresIn: TOKEN_EXPIRES_IN });
  }

  /** Lanza UnauthorizedError si el token falta, expiró o fue alterado. */
  verifyToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.secret());
      if (typeof decoded === 'string') {
        throw new UnauthorizedError('Invalid or expired token');
      }
      return { userId: Number(decoded.userId), role: decoded.role as Role };
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }

  /**
   * Igual que `bcryptRounds()` en UserService: se lee en cada llamada (no en
   * el constructor) para que las pruebas no necesiten cargar un .env, con el
   * mismo valor por defecto documentado en .env.example.
   */
  private secret(): string {
    return process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
  }
}
