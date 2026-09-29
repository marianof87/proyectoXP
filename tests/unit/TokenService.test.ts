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

    expect(tokenService.verifyToken(token)).toMatchObject({
      userId: 42,
      role: 'ADMIN',
    });
  });

  it('incluye un jti único y la expiración (HU-11: los necesita el logout)', () => {
    const primero = tokenService.verifyToken(
      tokenService.generateToken({ userId: 1, role: 'USER' })
    );
    const segundo = tokenService.verifyToken(
      tokenService.generateToken({ userId: 1, role: 'USER' })
    );

    expect(typeof primero.jti).toBe('string');
    expect(primero.jti).not.toBe(segundo.jti);
    expect(typeof primero.exp).toBe('number');
  });

  it('rechaza un token sin jti (payload manipulado a mano)', () => {
    const secret = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
    const sinJti = jwt.sign({ userId: 1, role: 'USER' }, secret, {
      expiresIn: '1h',
    });

    expect(() => tokenService.verifyToken(sinJti)).toThrow(UnauthorizedError);
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
