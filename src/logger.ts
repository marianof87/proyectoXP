/**
 * HU-10: logger centralizado con redacción de campos sensibles.
 *
 * Antes de esto, un error inesperado se registraba con `console.error`,
 * volcando `req.body`/`req.headers` tal cual: si el fallo ocurría en login o
 * en una ruta protegida, la contraseña o el token quedaban en texto plano en
 * los logs. Pino censura esos campos automáticamente (04.Sanitizacion_
 * Validacion_Logs, sección 3).
 *
 * `createLogger` recibe el destino para que las pruebas puedan capturar la
 * salida en un stream propio en vez de escribir a stdout.
 */

import pino, { DestinationStream, Logger } from 'pino';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.body.password',
  'req.body.token',
];

export const createLogger = (destination?: DestinationStream): Logger =>
  pino(
    { redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } },
    destination
  );

export const logger = createLogger();
