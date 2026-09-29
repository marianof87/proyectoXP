/**
 * HU-11 (Unidad 5, Actividad C): revocación de tokens (logout stateless).
 *
 * JWT no se puede "borrar" del lado servidor: un token firmado sigue siendo
 * válido hasta que expira. La solución de la unidad es una lista negra: se
 * guarda el `jti` del token cerrado hasta su expiración natural, y
 * authenticate la consulta en cada petición.
 */

import { IRevokedTokenRepository } from '../repositories/interfaces';

export class SessionService {
  constructor(private readonly revokedTokens: IRevokedTokenRepository) {}

  async revoke(jti: string, expiresAt: Date): Promise<void> {
    await this.revokedTokens.revoke(jti, expiresAt);
  }

  async isRevoked(jti: string): Promise<boolean> {
    return this.revokedTokens.isRevoked(jti);
  }
}
