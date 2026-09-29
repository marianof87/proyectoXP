/**
 * HU-09: Emisión y verificación de JWT.
 *
 * Sin dependencia de Express ni de un repositorio, igual que el resto de
 * src/services/: el controlador decide cuándo emitir el token, este servicio
 * solo sabe firmar y verificar el payload que le pasan.
 */

import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

import { Role } from '../models';
import { UnauthorizedError } from '../models/errors';

export interface TokenPayload {
  userId: number;
  role: Role;
}

/**
 * Payload ya verificado (HU-11): además de userId/role, trae `jti` (id único
 * del token) y `exp` (expiración en segundos, formato JWT), que logout
 * necesita para revocar exactamente este token hasta su vencimiento natural.
 */
export interface VerifiedTokenPayload extends TokenPayload {
  jti: string;
  exp: number;
}

const TOKEN_EXPIRES_IN = '1h';

export class TokenService {
  generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret(), {
      expiresIn: TOKEN_EXPIRES_IN,
      jwtid: randomUUID(),
    });
  }

  /** Lanza UnauthorizedError si el token falta, expiró o fue alterado. */
  verifyToken(token: string): VerifiedTokenPayload {
    try {
      const decoded = jwt.verify(token, this.secret());
      if (typeof decoded === 'string' || !decoded.jti || !decoded.exp) {
        throw new UnauthorizedError('Invalid or expired token');
      }
      return {
        userId: Number(decoded.userId),
        role: decoded.role as Role,
        jti: decoded.jti,
        exp: decoded.exp,
      };
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
