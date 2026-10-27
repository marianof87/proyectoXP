/**
 * HU-13: pool de worker threads (piscina) para el hash de contraseñas.
 *
 * Node ejecuta JavaScript en un solo hilo; `worker_threads` agrega hilos
 * reales del sistema operativo, cada uno con su propio event loop. piscina los
 * administra como un pool: cola de tareas, hilos reutilizables y métricas
 * (utilización, cola, tiempos), que expone /metrics/runtime.
 *
 * Con `WORKER_THREADS=auto` el pool usa `os.availableParallelism()`: los
 * núcleos LÓGICOS, es decir, contando los hilos de hyperthreading. El sistema
 * operativo reparte esos hilos entre núcleos físicos; Node no elige núcleo.
 */

import os from 'os';
import path from 'path';

import { Piscina } from 'piscina';

import { PasswordHasher } from '../services/PasswordHasher';
import { PasswordTask } from './passwordTask';

/**
 * `WORKER_THREADS`: `auto` = núcleos lógicos, un número = ese tamaño,
 * `0`/vacío = sin pool (bcrypt sobre libuv, como antes de HU-13).
 */
export const resolveThreadCount = (
  value: string | undefined,
  available: number = os.availableParallelism()
): number => {
  if (value === undefined || value.trim() === '') return 0;
  if (value.trim().toLowerCase() === 'auto') return available;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const createPasswordPool = (threads: number): Piscina<PasswordTask, string | boolean> =>
  new Piscina({
    // Ruta al .js compilado: en dist/ ambos archivos quedan en workers/.
    filename: path.join(__dirname, 'passwordTask.js'),
    // Todos los hilos arrancados desde el inicio: así el monitor los ve aunque
    // todavía no haya carga, y la primera ráfaga no paga el arranque.
    minThreads: threads,
    maxThreads: threads,
    // Por defecto piscina deja los hilos libres bloqueados en Atomics.wait,
    // que cuenta como "ocupado" en eventLoopUtilization(): el monitor vería
    // todos los hilos al 100 % sin carga. Así esperan en su event loop.
    atomics: 'disabled',
  });

export const poolHasher = (
  pool: Piscina<PasswordTask, string | boolean>
): PasswordHasher => ({
  hash: async (password, rounds) =>
    (await pool.run({ op: 'hash', password, rounds })) as string,
  compare: async (password, hash) =>
    (await pool.run({ op: 'compare', password, hash })) as boolean,
});
