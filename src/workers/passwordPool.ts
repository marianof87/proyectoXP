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

import { WorkerPoolView } from '../metrics/runtime';
import { bcryptHasher, PasswordHasher } from '../services/PasswordHasher';
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

type Pool = Piscina<PasswordTask, string | boolean>;

interface Pendiente {
  task: PasswordTask;
  resolve: (value: string | boolean) => void;
  reject: (reason: unknown) => void;
}

/**
 * Pool redimensionable en caliente (demo de paralelismo: de 1 hilo a N).
 *
 * La cola de espera es PROPIA, no la de piscina: una tarea solo pasa al pool
 * cuando hay un hilo libre. Así, al redimensionar, el pool nuevo toma la cola
 * entera al instante (pasar de 1 a 12 hilos vacía el atraso) y el viejo solo
 * termina las pocas tareas que tenía en curso antes de cerrarse.
 * Con 0 hilos todo va a bcrypt sobre libuv.
 */
export class PasswordPoolManager {
  private pool: Pool | undefined;
  private readonly cola: Pendiente[] = [];
  /** Tareas entregadas al pool vigente y todavía sin terminar. */
  private enCurso = 0;
  private completadas = 0;

  constructor(
    threads: number,
    private readonly factory: (threads: number) => Pool = createPasswordPool
  ) {
    this.pool = threads > 0 ? factory(threads) : undefined;
  }

  get current(): Pool | undefined {
    return this.pool;
  }

  get threads(): number {
    return this.pool?.maxThreads ?? 0;
  }

  /** Lo que lee el monitor; `completed` no se reinicia al redimensionar. */
  view(): WorkerPoolView | undefined {
    const pool = this.pool;
    if (!pool) return undefined;
    return {
      threads: pool.threads,
      maxThreads: pool.maxThreads,
      queueSize: this.cola.length,
      completed: this.completadas,
      utilization: pool.utilization,
    };
  }

  readonly hasher: PasswordHasher = {
    hash: async (password, rounds) => (await this.run({ op: 'hash', password, rounds })) as string,
    compare: async (password, hash) => (await this.run({ op: 'compare', password, hash })) as boolean,
  };

  run(task: PasswordTask): Promise<string | boolean> {
    if (!this.pool && this.cola.length === 0) return this.enLibuv(task);
    return new Promise((resolve, reject) => {
      this.cola.push({ task, resolve, reject });
      this.despachar();
    });
  }

  /** Cambia el tamaño sin esperar al pool viejo: este cierra solo al terminar lo suyo. */
  resize(threads: number): void {
    if (threads === this.threads) return;
    const viejo = this.pool;
    this.pool = threads > 0 ? this.factory(threads) : undefined;
    this.enCurso = 0;
    void viejo?.close().catch(() => undefined);
    this.despachar();
  }

  async destroy(): Promise<void> {
    await this.pool?.destroy();
    this.pool = undefined;
  }

  private despachar(): void {
    while (this.cola.length > 0) {
      const pool = this.pool;
      if (pool && this.enCurso >= pool.maxThreads) return;
      const item = this.cola.shift() as Pendiente;
      if (!pool) {
        this.enLibuv(item.task).then(item.resolve, item.reject);
        continue;
      }
      this.enCurso += 1;
      pool
        .run(item.task)
        .then((r) => {
          this.completadas += 1;
          item.resolve(r);
        }, item.reject)
        .finally(() => {
          // Si mientras tanto se cambió de pool, el contador ya es del nuevo.
          if (pool === this.pool) this.enCurso -= 1;
          this.despachar();
        });
    }
  }

  private enLibuv(task: PasswordTask): Promise<string | boolean> {
    return task.op === 'hash'
      ? bcryptHasher.hash(task.password, task.rounds)
      : bcryptHasher.compare(task.password, task.hash);
  }
}
