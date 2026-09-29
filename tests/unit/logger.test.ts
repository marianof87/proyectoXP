/**
 * Pruebas unitarias del logger (HU-10).
 *
 * `createLogger` acepta un destino para poder capturar la salida en un
 * stream propio en vez de escribir a stdout, y así comprobar que la
 * redacción realmente censura los campos sensibles.
 */

import { Writable } from 'stream';

import { createLogger } from '../../src/logger';

const capturarSalida = (): { stream: Writable; lineas: string[] } => {
  const lineas: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lineas.push(chunk.toString());
      callback();
    },
  });
  return { stream, lineas };
};

describe('logger', () => {
  it('censura el token de autorización y la contraseña del body', () => {
    const { stream, lineas } = capturarSalida();
    const logger = createLogger(stream);

    logger.error(
      {
        req: {
          headers: { authorization: 'Bearer secreto-de-produccion' },
          body: { email: 'ana@example.com', password: 'MiClaveSecreta1!' },
        },
      },
      'Unexpected error'
    );

    const salida = lineas.join('');
    expect(salida).not.toContain('secreto-de-produccion');
    expect(salida).not.toContain('MiClaveSecreta1!');
    expect(salida).toContain('[REDACTED]');
    // Lo que no es sensible se sigue registrando tal cual, para poder depurar.
    expect(salida).toContain('ana@example.com');
  });

  it('censura el campo token del body cuando el login falla por otra razón', () => {
    const { stream, lineas } = capturarSalida();
    const logger = createLogger(stream);

    logger.error({ req: { body: { token: 'jwt-valido-filtrado' } } }, 'boom');

    const salida = lineas.join('');
    expect(salida).not.toContain('jwt-valido-filtrado');
    expect(salida).toContain('[REDACTED]');
  });
});
