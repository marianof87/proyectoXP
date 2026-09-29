/**
 * Pruebas unitarias de TokenService (HU-09).
 */

import jwt from 'jsonwebtoken';

import { UnauthorizedError } from '../../src/models/errors';
import { TokenService } from '../../src/services/TokenService';

describe('TokenService', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    tokenService = new TokenService();
  });

  it('genera un token que se puede verificar y devuelve el mismo payload', () => {
    const token = tokenService.generateToken({ userId: 42, role: 'ADMIN' });

    expect(tokenService.verifyToken(token)).toEqual({
      userId: 42,
      role: 'ADMIN',
    });
  });

  it('rechaza un token manipulado', () => {
    const token = tokenService.generateToken({ userId: 1, role: 'USER' });
    const manipulado = `${token}manipulado`;

    expect(() => tokenService.verifyToken(manipulado)).toThrow(
      UnauthorizedError
    );
  });

  it('rechaza un token expirado', () => {
    const secret = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
    const expirado = jwt.sign({ userId: 1, role: 'USER' }, secret, {
      expiresIn: -1,
    });

    expect(() => tokenService.verifyToken(expirado)).toThrow(
      UnauthorizedError
    );
  });

  it('rechaza un token firmado con otra clave', () => {
    const firmadoConOtraClave = jwt.sign(
      { userId: 1, role: 'USER' },
      'otra-clave-distinta'
    );

    expect(() => tokenService.verifyToken(firmadoConOtraClave)).toThrow(
      UnauthorizedError
    );
  });

  it('rechaza un token que no es un JWT', () => {
    expect(() => tokenService.verifyToken('no-es-un-token')).toThrow(
      UnauthorizedError
    );
  });
});
