/**
 * Pruebas unitarias de los errores de dominio nuevos (HU-09).
 *
 * Los demás (NotFoundError, ConflictError...) ya quedan cubiertos por los
 * tests de los servicios que los lanzan; ForbiddenError solo lo lanza el
 * middleware de autorización (fuera de la cobertura de Jest), así que se
 * verifica aquí de forma directa.
 */

import { ForbiddenError } from '../../src/models/errors';

describe('ForbiddenError', () => {
  it('expone el status 403 y el mensaje recibido', () => {
    const error = new ForbiddenError('Insufficient permissions');

    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Insufficient permissions');
    expect(error.name).toBe('ForbiddenError');
    expect(error).toBeInstanceOf(Error);
  });
});
