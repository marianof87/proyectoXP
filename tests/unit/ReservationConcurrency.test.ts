/**
 * HU-12 (Fase 1): peticiones simultaneas sobre ReservationService.
 *
 * Los repositorios en memoria ceden el turno entre `await`s, asi que
 * `Promise.all` intercala las operaciones y expone cualquier check-then-act.
 * La garantia final la da PostgreSQL (Fase 2); aqui se fija el contrato.
 */

import { ConflictError } from '../../src/models/errors';
import { InMemoryUnitOfWork } from '../../src/repositories/InMemoryRepositories';
import { ReservationService } from '../../src/services/ReservationService';

const at = (hour: number): Date =>
  new Date(`2026-10-20T${String(hour).padStart(2, '0')}:00:00.000Z`);

const NOW = new Date('2026-10-01T00:00:00.000Z');

const fulfilled = (results: PromiseSettledResult<unknown>[]): number =>
  results.filter((r) => r.status === 'fulfilled').length;

describe('ReservationService - concurrencia (HU-12)', () => {
  let uow: InMemoryUnitOfWork;
  let service: ReservationService;
  let userId: number;
  let roomId: number;

  beforeEach(async () => {
    uow = new InMemoryUnitOfWork();
    service = new ReservationService(uow, () => NOW);
    userId = (
      await uow.users.create({
        email: 'juan@example.com',
        name: 'Juan',
        password: 'hash',
        role: 'USER',
        balance: 1000,
      })
    ).id;
    roomId = (
      await uow.rooms.create({
        name: 'Sala A',
        description: null,
        capacity: 4,
        hourlyRate: 100,
      })
    ).id;
  });

  const book = (from: number, to: number) =>
    service.bookRoom({ userId, roomId, startDate: at(from), endDate: at(to) });

  const balance = async (): Promise<number | undefined> =>
    (await uow.users.findById(userId))?.balance;

  it('solo una de varias reservas simultaneas de la misma franja gana', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => book(9, 11))
    );

    expect(fulfilled(results)).toBe(1);
    results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .forEach((r) => expect(r.reason).toBeInstanceOf(ConflictError));
    expect(await balance()).toBe(800);
  });

  it('solo gana una entre franjas parcialmente solapadas', async () => {
    const results = await Promise.allSettled([book(9, 11), book(10, 12), book(8, 10)]);

    expect(fulfilled(results)).toBe(1);
  });

  it('con saldo para una sola reserva, solo una de las paralelas se cobra', async () => {
    await uow.users.incrementBalance(userId, -800); // quedan 200

    const results = await Promise.allSettled([
      book(9, 11),
      book(12, 14),
      book(15, 17),
    ]);

    expect(fulfilled(results)).toBe(1);
    expect(await balance()).toBe(0);
  });

  it('el saldo nunca queda negativo con reservas paralelas', async () => {
    // 1000 de saldo y 200 por reserva: caben exactamente 5 de 8.
    const slots = [8, 10, 12, 14, 16, 18, 20, 22];
    const results = await Promise.allSettled(slots.map((h) => book(h, h + 2)));

    expect(fulfilled(results)).toBe(5);
    expect(await balance()).toBe(0);
  });

  it('dos cancelaciones simultaneas reembolsan una sola vez', async () => {
    const reservation = await book(9, 11); // saldo 800

    const results = await Promise.allSettled([
      service.cancelReservation(reservation.id),
      service.cancelReservation(reservation.id),
    ]);

    expect(fulfilled(results)).toBe(1);
    expect(await balance()).toBe(1000);
  });

  it('dos avances de estado simultaneos: solo uno se aplica', async () => {
    const reservation = await book(9, 11);

    const results = await Promise.allSettled([
      service.advanceStatus(reservation.id, 'IN_PROGRESS'),
      service.advanceStatus(reservation.id, 'IN_PROGRESS'),
    ]);

    expect(fulfilled(results)).toBe(1);
  });

  it('la misma X-Idempotency-Key en paralelo: una reserva, un cobro, mismas respuestas', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.bookRoom(
          { userId, roomId, startDate: at(9), endDate: at(11) },
          'key-1'
        )
      )
    );

    expect(fulfilled(results)).toBe(5);
    const ids = new Set(
      results.map((r) => (r as PromiseFulfilledResult<{ id: number }>).value.id)
    );
    expect(ids.size).toBe(1);
    expect(await balance()).toBe(800);
  });

  it('una reserva IN_PROGRESS sigue bloqueando la sala', async () => {
    const reservation = await book(9, 11);
    await service.advanceStatus(reservation.id, 'IN_PROGRESS');

    await expect(book(10, 12)).rejects.toThrow(ConflictError);
  });

  it('se puede volver a reservar una franja cancelada', async () => {
    const reservation = await book(9, 11);
    await service.cancelReservation(reservation.id);

    await expect(book(9, 11)).resolves.toMatchObject({ status: 'CONFIRMED' });
  });

  it('un fallo aislado no afecta a las demas operaciones', async () => {
    const results = await Promise.allSettled([
      book(9, 11),
      service.bookRoom({ userId, roomId: 999, startDate: at(9), endDate: at(11) }),
      book(12, 14),
    ]);

    expect(results.map((r) => r.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
    ]);
    expect(await balance()).toBe(600);
  });
});
