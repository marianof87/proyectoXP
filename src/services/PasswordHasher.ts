/**
 * HU-13: hash de contraseñas intercambiable.
 *
 * bcrypt es, con diferencia, el trabajo de CPU más caro de la API (decenas de
 * milisegundos por login o registro). UserService no sabe DÓNDE se calcula:
 *
 * - `bcryptHasher` (por defecto): bcrypt asíncrono, que corre en el pool de
 *   hilos de libuv (UV_THREADPOOL_SIZE, 4 por defecto) y comparte ese pool
 *   con fs y dns.
 * - `poolHasher` (src/workers/passwordPool.ts): un pool propio de worker
 *   threads dimensionado a los núcleos lógicos de la máquina.
 */

import bcrypt from 'bcrypt';

export interface PasswordHasher {
  hash(password: string, rounds: number): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
}

export const bcryptHasher: PasswordHasher = {
  hash: (password, rounds) => bcrypt.hash(password, rounds),
  compare: (password, hash) => bcrypt.compare(password, hash),
};
