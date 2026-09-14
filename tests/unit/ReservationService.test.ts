/** Pruebas unitarias de ReservationService (HU-03, HU-04, HU-06). */

import { InMemoryUnitOfWork } from '../../src/repositories/InMemoryRepositories';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../src/models/errors';
import { ReservationService } from '../../src/services/ReservationService';

const at = (hour: number, day = 20): Date =>
  new Date(
    `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`
  );

/** "Ahora" fijo y anterior a las reservas, para que sean cancelables. */
const NOW = new Date('2026-10-01T00:00:00.000Z');

describe('ReservationService', () => {
  let uow: InMemoryUnitOfWork;
  let service: ReservationService;
  let userId: number;
  let roomId: number;

  beforeEach(async () => {
    uow = new InMemoryUnitOfWork();
    service = new ReservationService(uow, () => NOW);

    const user = await uow.users.create({
      email: 'juan@example.com',
      name: 'Juan',
      password: 'hash',
      role: 'USER',
      balance: 1000,
    });
    userId = user.id;

    const room = await uow.rooms.create({
      name: 'Sala A',
      description: null,
      capacity: 4,
      hourlyRate: 100,
    });
    roomId = room.id;
  });

  const book = (from = 9, to = 11) =>
    service.bookRoom({ userId, roomId, startDate: at(from), endDate: at(to) });

  describe('bookRoom', () => {
    it('confirma la reserva y calcula el coste por horas', async () => {
      const reservation = await book(9, 11);

      expect(reservation).toMatchObject({ status: 'CONFIRMED', totalCost: 200 });
    });

    it('descuenta el coste del balance del usuario', async () => {
      await book(9, 11);

      expect((await uow.users.findById(userId))?.balance).toBe(800);
    });

    it('rechaza una franja solapada', async () => {
      await book(9, 11);

      await expect(book(10, 12)).rejects.toThrow(ConflictError);
      await expect(book(10, 12)).rejects.toThrow(
        'Room not available for selected time'
      );
    });

    it('permite una franja contigua', async () => {
      await book(9, 11);

      await expect(book(11, 13)).resolves.toMatchObject({ status: 'CONFIRMED' });
    });

    it('rechaza la reserva sin saldo suficiente', async () => {
      await uow.users.incrementBalance(userId, -950); // queda 50

      await expect(book(9, 11)).rejects.toThrow('Insufficient balance');
    });

    it('no descuenta saldo si la reserva falla', async () => {
      await uow.users.incrementBalance(userId, -950);

      await expect(book(9, 11)).rejects.toThrow();
      expect((await uow.users.findById(userId))?.balance).toBe(50);
    });

    it('falla si la sala no existe', async () => {
      await expect(
        service.bookRoom({
          userId,
          roomId: 999,
          startDate: at(9),
          endDate: at(11),
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('falla si el usuario no existe', async () => {
      await expect(
        service.bookRoom({
          userId: 999,
          roomId,
          startDate: at(9),
          endDate: at(11),
        })
      ).rejects.toThrow('User not found');
    });

    it('rechaza un rango donde el fin no es posterior al inicio', async () => {
      await expect(book(11, 9)).rejects.toThrow(
        'End date must be after start date'
      );
      await expect(book(9, 9)).rejects.toThrow(ValidationError);
    });

    it('rechaza fechas invalidas', async () => {
      await expect(
        service.bookRoom({
          userId,
          roomId,
          startDate: new Date('no-es-fecha'),
          endDate: at(11),
        })
      ).rejects.toThrow('Invalid date format');
    });
  });

  describe('getUserReservations', () => {
    it('devuelve las reservas del usuario', async () => {
      await book(9, 11);
      await book(12, 14);

      await expect(service.getUserReservations(userId)).resolves.toHaveLength(2);
    });

    it('devuelve lista vacia para un usuario sin reservas', async () => {
      await expect(service.getUserReservations(999)).resolves.toEqual([]);
    });
  });

  describe('cancelReservation', () => {
    it('cambia el estado a CANCELLED', async () => {
      const reservation = await book(9, 11);

      await expect(
        service.cancelReservation(reservation.id)
      ).resolves.toMatchObject({ status: 'CANCELLED' });
    });

    it('reembolsa el coste al usuario', async () => {
      const reservation = await book(9, 11);
      expect((await uow.users.findById(userId))?.balance).toBe(800);

      await service.cancelReservation(reservation.id);

      expect((await uow.users.findById(userId))?.balance).toBe(1000);
    });

    it('libera la franja horaria', async () => {
      const reservation = await book(9, 11);
      await service.cancelReservation(reservation.id);

      await expect(book(9, 11)).resolves.toMatchObject({ status: 'CONFIRMED' });
    });

    it('falla si la reserva no existe', async () => {
      await expect(service.cancelReservation(999)).rejects.toThrow(
        'Reservation not found'
      );
    });

    it('no permite cancelar dos veces', async () => {
      const reservation = await book(9, 11);
      await service.cancelReservation(reservation.id);

      await expect(service.cancelReservation(reservation.id)).rejects.toThrow(
        'Only confirmed reservations can be cancelled'
      );
    });

    it('no permite cancelar una reserva ya iniciada (HU-06)', async () => {
      const reservation = await book(9, 11);
      // Se avanza el reloj mas alla del inicio de la reserva.
      const lateService = new ReservationService(uow, () => at(10));

      await expect(lateService.cancelReservation(reservation.id)).rejects.toThrow(
        'Cannot cancel a reservation already started'
      );
    });
  });
});
