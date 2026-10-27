import { Piscina } from 'piscina';

import { PasswordTask } from '../../src/workers/passwordTask';
import { PasswordPoolManager } from '../../src/workers/passwordPool';

type Pool = Piscina<PasswordTask, string | boolean>;

/**
 * Pool falso: cada tarea queda "corriendo" hasta que el test la libera, así se
 * puede armar un atraso real sin hilos ni bcrypt.
 */
const poolControlado = (maxThreads: number, registro: string[]) => {
  const corriendo: Array<() => void> = [];
  const pool = {
    maxThreads,
    threads: [],
    utilization: 0,
    run: (task: PasswordTask) =>
      new Promise<string | boolean>((resolve) => {
        registro.push(`run@${maxThreads}`);
        corriendo.push(() => resolve(task.op === 'hash' ? `hash@${maxThreads}` : true));
      }),
    close: async () => {
      registro.push(`close@${maxThreads}`);
    },
    destroy: async () => undefined,
  } as unknown as Pool;
  return { pool, liberarTodas: () => corriendo.splice(0).forEach((fin) => fin()) };
};

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('PasswordPoolManager (HU-13)', () => {
  describe('con 1 hilo y 5 logins a la vez', () => {
    it('entrega una sola tarea al pool y deja 4 en la cola propia', async () => {
      // Arrange
      const registro: string[] = [];
      const uno = poolControlado(1, registro);
      const manager = new PasswordPoolManager(1, () => uno.pool);

      // Act
      for (let i = 0; i < 5; i += 1) void manager.hasher.compare('Cowork2026!', 'hash');
      await tick();

      // Assert
      expect(registro).toEqual(['run@1']);
      expect(manager.view()).toMatchObject({ maxThreads: 1, queueSize: 4, completed: 0 });
    });
  });

  describe('cuando hay atraso y se pasa de 1 a 12 hilos en caliente', () => {
    it('el pool nuevo toma toda la cola al instante y el viejo recibe la orden de cerrar', async () => {
      // Arrange: 1 tarea corriendo en el pool de 1 hilo y 4 esperando
      const registro: string[] = [];
      const pools = new Map<number, ReturnType<typeof poolControlado>>();
      const manager = new PasswordPoolManager(1, (n) => {
        const p = poolControlado(n, registro);
        pools.set(n, p);
        return p.pool;
      });
      const pedidos = Array.from({ length: 5 }, () => manager.hasher.hash('Cowork2026!', 10));
      await tick();

      // Act
      manager.resize(12);
      await tick();
      pools.get(1)!.liberarTodas();
      pools.get(12)!.liberarTodas();
      const hashes = await Promise.all(pedidos);

      // Assert: al viejo se le pide cerrar en el acto (piscina espera sola a
      // su tarea en curso) y las 4 que esperaban van al pool de 12.
      expect(registro).toEqual(['run@1', 'close@1', 'run@12', 'run@12', 'run@12', 'run@12']);
      expect(hashes).toEqual(['hash@1', 'hash@12', 'hash@12', 'hash@12', 'hash@12']);
      expect(manager.view()).toMatchObject({ maxThreads: 12, queueSize: 0, completed: 5 });
    });
  });

  describe('cuando se pide el mismo tamaño que ya tiene', () => {
    it('no crea un pool nuevo', () => {
      let creados = 0;
      const manager = new PasswordPoolManager(4, (n) => {
        creados += 1;
        return poolControlado(n, []).pool;
      });

      manager.resize(4);

      expect(creados).toBe(1);
    });
  });

  describe('cuando se redimensiona a 0', () => {
    it('vuelve a bcrypt sobre libuv y el hash sigue siendo válido', async () => {
      // Arrange
      const registro: string[] = [];
      const manager = new PasswordPoolManager(2, (n) => poolControlado(n, registro).pool);

      // Act
      manager.resize(0);
      const hash = await manager.hasher.hash('Cowork2026!', 4);

      // Assert
      expect(manager.view()).toBeUndefined();
      expect(hash).toMatch(/^\$2[aby]\$04\$/);
      expect(await manager.hasher.compare('Cowork2026!', hash)).toBe(true);
      expect(registro).toEqual(['close@2']);
    });
  });
});
