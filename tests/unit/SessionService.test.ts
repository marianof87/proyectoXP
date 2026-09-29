/** Pruebas unitarias de SessionService (HU-11, Actividad C: revocación). */

import { InMemoryRevokedTokenRepository } from '../../src/repositories/InMemoryRepositories';
import { SessionService } from '../../src/services/SessionService';

describe('SessionService', () => {
  let sessionService: SessionService;

  beforeEach(() => {
    sessionService = new SessionService(new InMemoryRevokedTokenRepository());
  });

  it('un jti nunca revocado no está en la lista negra', async () => {
    await expect(sessionService.isRevoked('jti-nunca-visto')).resolves.toBe(
      false
    );
  });

  it('un jti revocado queda marcado como tal', async () => {
    await sessionService.revoke('jti-1', new Date('2027-01-01T00:00:00.000Z'));

    await expect(sessionService.isRevoked('jti-1')).resolves.toBe(true);
  });

  it('revocar un jti no afecta a otros', async () => {
    await sessionService.revoke('jti-1', new Date('2027-01-01T00:00:00.000Z'));

    await expect(sessionService.isRevoked('jti-2')).resolves.toBe(false);
  });
});
