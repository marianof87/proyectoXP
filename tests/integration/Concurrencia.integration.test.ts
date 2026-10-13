/**
 * HU-12 (Fase 2): garantías de concurrencia contra PostgreSQL REAL.
 *
 * Los repositorios en memoria no pueden demostrar carreras de verdad: aquí el
 * árbitro es la base de datos (restricción de exclusión, débito condicional,
 * compare-and-set). Cada prueba crea sus propios usuarios y salas con nombres
 * únicos, así que pueden convivir con otros datos y no hace falta limpiar.
 *
 * Requiere DATABASE_URL (con las migraciones aplicadas); sin ella se omite.
 */

import { createServices, Services } from '../../src/container';
import { disconnectPrisma, getPrismaClient } from '../../src/db';
import { PrismaUnitOfWork } from '../../src/repositories/PrismaRepositories';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const HOUR = 3_600_000;
// Un año distinto por prueba evita que choquen entre sí y con la demo.
let nextYear = 2040;
const slot = (year: number, hour: number, hours = 1) => ({
  startDate: new Date(Date.UTC(year, 5, 1, hour)),
  endDate: new Date(Date.UTC(year, 5, 1, hour) + hours * HOUR),
});

const count = <T>(results: PromiseSettledResult<T>[], status: string): number =>
  results.filter((r) => r.status === status).length;

describeDb('Concurrencia sobre PostgreSQL (HU-12)', () => {
  let services: Services;
  let seq = 0;

  beforeAll(() => {
    services = createServices(new PrismaUnitOfWork(getPrismaClient()), {
      warn: () => undefined,
    });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  const makeUser = async (balance: number) => {
    const { uow } = services;
    return uow.users.create({
      email: `it-${Date.now()}-${++seq}@integration.test`,
      name: 'IT',
      password: 'hash',
      role: 'USER',
      balance,
    });
  };
  const makeRoom = (hourlyRate = 10) =>
    services.uow.rooms.create({
      name: `IT sala ${Date.now()}-${++seq}`,
      description: null,
      capacity: 4,
      hourlyRate,
    });
  const balanceOf = async (id: number) =>
    (await services.uow.users.findById(id))!.balance;

  it('N reservas de la misma franja: exactamente 1 éxito, el resto conflicto', async () => {
    const [user, room, year] = [await makeUser(10_000), await makeRoom(), nextYear++];
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        services.reservationService.bookRoom({
          userId: user.id,
          roomId: room.id,
          ...slot(year, 9, 2),
        })
      )
    );
    expect(count(results, 'fulfilled')).toBe(1);
    expect(count(results, 'rejected')).toBe(19);
    // Solo se cobró una vez: 2 h × 10.
    expect(await balanceOf(user.id)).toBe(10_000 - 20);
  });

  it('reservas parcialmente solapadas: solo gana una', async () => {
    const [user, room, year] = [await makeUser(10_000), await makeRoom(), nextYear++];
    const results = await Promise.allSettled(
      [9, 10, 11].map((h) =>
        services.reservationService.bookRoom({
          userId: user.id,
          roomId: room.id,
          ...slot(year, h, 2), // 9-11, 10-12, 11-13
        })
      )
    );
    // 9-11 y 11-13 son compatibles entre sí; 10-12 choca con ambas.
    const ok = count(results, 'fulfilled');
    expect([1, 2]).toContain(ok);
    const live = await services.uow.reservations.findOverlapping(
      room.id,
      new Date(Date.UTC(year, 5, 1, 0)),
      new Date(Date.UTC(year, 5, 2, 0))
    );
    expect(live).toHaveLength(ok);
  });

  it('saldo justo para 1 reserva y 5 intentos: 1 éxito y saldo >= 0', async () => {
    const [room, year] = [await makeRoom(10), nextYear++];
    const user = await makeUser(10); // alcanza para 1 hora
    const results = await Promise.allSettled(
      [8, 10, 12, 14, 16].map((h) =>
        services.reservationService.bookRoom({
          userId: user.id,
          roomId: room.id,
          ...slot(year, h),
        })
      )
    );
    expect(count(results, 'fulfilled')).toBe(1);
    expect(await balanceOf(user.id)).toBe(0);
  });

  it('dos cancelaciones simultáneas: un solo reembolso', async () => {
    const [user, room, year] = [await makeUser(100), await makeRoom(10), nextYear++];
    const created = await services.reservationService.bookRoom({
      userId: user.id,
      roomId: room.id,
      ...slot(year, 9, 2),
    });
    expect(await balanceOf(user.id)).toBe(80);

    const results = await Promise.allSettled([
      services.reservationService.cancelReservation(created.id),
      services.reservationService.cancelReservation(created.id),
    ]);
    expect(count(results, 'fulfilled')).toBe(1);
    expect(await balanceOf(user.id)).toBe(100); // y no 120
  });

  it('misma X-Idempotency-Key x10 en paralelo: una reserva y respuestas iguales', async () => {
    const [user, room, year] = [await makeUser(1_000), await makeRoom(10), nextYear++];
    const key = `it-key-${Date.now()}`;
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        services.reservationService.bookRoom(
          { userId: user.id, roomId: room.id, ...slot(year, 9) },
          key
        )
      )
    );
    expect(count(results, 'fulfilled')).toBe(10);
    const ids = new Set(
      results.map((r) => (r as PromiseFulfilledResult<{ id: number }>).value.id)
    );
    expect(ids.size).toBe(1);
    expect(await balanceOf(user.id)).toBe(990); // cobrado una sola vez
  });

  it('un fallo no contamina a las demás operaciones (aislamiento)', async () => {
    const [user, room, year] = [await makeUser(1_000), await makeRoom(10), nextYear++];
    const results = await Promise.allSettled([
      services.reservationService.bookRoom({
        userId: user.id,
        roomId: 999_999_999, // sala inexistente: falla
        ...slot(year, 9),
      }),
      services.reservationService.bookRoom({
        userId: user.id,
        roomId: room.id,
        ...slot(year, 10),
      }),
      services.reservationService.bookRoom({
        userId: user.id,
        roomId: room.id,
        ...slot(year, 12),
      }),
    ]);
    expect(count(results, 'rejected')).toBe(1);
    expect(count(results, 'fulfilled')).toBe(2);
    expect(await balanceOf(user.id)).toBe(980);
  });

  it('avances de estado simultáneos: solo uno se aplica', async () => {
    const [user, room, year] = [await makeUser(100), await makeRoom(10), nextYear++];
    const created = await services.reservationService.bookRoom({
      userId: user.id,
      roomId: room.id,
      ...slot(year, 9),
    });
    const results = await Promise.allSettled([
      services.reservationService.advanceStatus(created.id, 'IN_PROGRESS'),
      services.reservationService.advanceStatus(created.id, 'IN_PROGRESS'),
      services.reservationService.advanceStatus(created.id, 'IN_PROGRESS'),
    ]);
    expect(count(results, 'fulfilled')).toBe(1);
  });
});
