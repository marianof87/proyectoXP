import {
  parseCpuList,
  readContainerStats,
  readCpuTopology,
  readOsThreads,
} from '../../src/metrics/runtime';
import { PasswordHasher } from '../../src/services/PasswordHasher';
import { UserService } from '../../src/services/UserService';
import { InMemoryUnitOfWork } from '../../src/repositories/InMemoryRepositories';
import { resolveThreadCount } from '../../src/workers/passwordPool';

/** /sys falso de un i5-1335U: cpu0-1 y cpu2-3 son núcleos P con hyperthreading; cpu4 es un núcleo E. */
const sysfsHibrido: Record<string, string> = {
  '/sys/devices/system/cpu/cpu0/topology/physical_package_id': '0\n',
  '/sys/devices/system/cpu/cpu0/topology/thread_siblings_list': '0-1\n',
  '/sys/devices/system/cpu/cpu1/topology/physical_package_id': '0\n',
  '/sys/devices/system/cpu/cpu1/topology/thread_siblings_list': '0-1\n',
  '/sys/devices/system/cpu/cpu2/topology/physical_package_id': '0\n',
  '/sys/devices/system/cpu/cpu2/topology/thread_siblings_list': '2-3\n',
  '/sys/devices/system/cpu/cpu3/topology/physical_package_id': '0\n',
  '/sys/devices/system/cpu/cpu3/topology/thread_siblings_list': '2-3\n',
  '/sys/devices/system/cpu/cpu4/topology/physical_package_id': '0\n',
  '/sys/devices/system/cpu/cpu4/topology/thread_siblings_list': '4\n',
};

const leerDe = (archivos: Record<string, string>) => (file: string): string => {
  const contenido = archivos[file];
  if (contenido === undefined) throw new Error(`ENOENT: ${file}`);
  return contenido;
};

describe('Métricas de ejecución (HU-13)', () => {
  describe('parseCpuList', () => {
    it.each([
      ['0-1', [0, 1]],
      ['2,6', [2, 6]],
      ['4', [4]],
      ['0-2,8', [0, 1, 2, 8]],
      ['', []],
    ])('"%s" se interpreta como %j', (lista, esperado) => {
      expect(parseCpuList(lista)).toEqual(esperado);
    });
  });

  describe('readCpuTopology', () => {
    describe('en un procesador híbrido con hyperthreading solo en los núcleos P', () => {
      it('agrupa los hilos hermanos en el mismo núcleo físico y deja solo al núcleo E', () => {
        const topologia = readCpuTopology(5, leerDe(sysfsHibrido));

        const nucleosFisicos = new Map<string, number[]>();
        topologia.forEach((c) =>
          nucleosFisicos.set(c.physicalId, [...(nucleosFisicos.get(c.physicalId) ?? []), c.cpu])
        );
        expect([...nucleosFisicos.values()]).toEqual([[0, 1], [2, 3], [4]]);
      });
    });

    describe('cuando /sys no se puede leer (macOS, Windows)', () => {
      it('devuelve una topología vacía en lugar de fallar', () => {
        expect(readCpuTopology(4, leerDe({}))).toEqual([]);
      });
    });
  });

  describe('resolveThreadCount (WORKER_THREADS)', () => {
    it.each([
      [undefined, 0],
      ['', 0],
      ['0', 0],
      ['auto', 12],
      ['AUTO', 12],
      ['6', 6],
      ['muchos', 0],
    ])('con %j y 12 núcleos lógicos usa %i hilos', (valor, esperado) => {
      expect(resolveThreadCount(valor, 12)).toBe(esperado);
    });
  });

  describe('UserService con un PasswordHasher inyectado', () => {
    it('registra y valida el login delegando el hash en él (p. ej. el pool de hilos)', async () => {
      // Arrange: un stub que deja rastro de qué se le pidió
      const pedidos: string[] = [];
      const hasherDePrueba: PasswordHasher = {
        hash: async (password) => {
          pedidos.push('hash');
          return `hashed:${password}`;
        },
        compare: async (password, hash) => {
          pedidos.push('compare');
          return hash === `hashed:${password}`;
        },
      };
      const service = new UserService(new InMemoryUnitOfWork().users, { warn: () => undefined }, hasherDePrueba);

      // Act
      await service.registerUser({ email: 'delfina.ruiz@example.com', name: 'Delfina Ruiz', password: 'Cowork2026!' });
      const user = await service.login({ email: 'delfina.ruiz@example.com', password: 'Cowork2026!' });

      // Assert
      expect(user.email).toBe('delfina.ruiz@example.com');
      expect(pedidos).toEqual(['hash', 'compare']);
    });
  });

  describe('readOsThreads', () => {
    it('lee los hilos del sistema operativo de /proc/self/status', () => {
      const status = 'Name:\tnode\nState:\tS (sleeping)\nThreads:\t36\nVmRSS:\t250000 kB\n';

      expect(readOsThreads(leerDe({ '/proc/self/status': status }))).toBe(36);
    });

    it('fuera de Linux devuelve null', () => {
      expect(readOsThreads(leerDe({}))).toBeNull();
    });
  });

  describe('readContainerStats (cgroup v2)', () => {
    describe('dentro de un contenedor sin límites', () => {
      it('lee CPU acumulada, memoria y tareas, y marca los límites como ausentes', () => {
        const archivos = {
          '/proc/self/cgroup': '0::/\n',
          '/sys/fs/cgroup/cpu.stat': 'usage_usec 12646862\nuser_usec 10299143\nsystem_usec 2347719\n',
          '/sys/fs/cgroup/memory.current': '252301312\n',
          '/sys/fs/cgroup/memory.max': 'max\n',
          '/sys/fs/cgroup/cpu.max': 'max 100000\n',
          '/sys/fs/cgroup/pids.current': '39\n',
        };

        expect(readContainerStats(leerDe(archivos))).toEqual({
          cpuUsageUsec: 12646862,
          memoryBytes: 252301312,
          memoryLimitBytes: null,
          cpuLimitCores: null,
          tasks: 39,
        });
      });
    });

    describe('con límites de 2 CPU y 512 MB en un cgroup propio', () => {
      it('los informa en núcleos y bytes, leyendo la ruta de /proc/self/cgroup', () => {
        const dir = '/sys/fs/cgroup/system.slice/api.scope';
        const archivos = {
          '/proc/self/cgroup': '0::/system.slice/api.scope\n',
          [`${dir}/cpu.stat`]: 'usage_usec 5000\n',
          [`${dir}/memory.current`]: '1048576\n',
          [`${dir}/memory.max`]: '536870912\n',
          [`${dir}/cpu.max`]: '200000 100000\n',
        };

        expect(readContainerStats(leerDe(archivos))).toMatchObject({
          memoryLimitBytes: 536870912,
          cpuLimitCores: 2,
          tasks: null,
        });
      });
    });

    describe('sin cgroup v2', () => {
      it('devuelve null', () => {
        expect(readContainerStats(leerDe({}))).toBeNull();
      });
    });
  });
});
