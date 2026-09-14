/** HU-03 Reserva de salas, HU-04 Visualizacion, HU-06 Cancelacion. */

import { ReservationResponse, toReservationResponse } from '../models';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../models/errors';
import { IUnitOfWork } from '../repositories/interfaces';

export interface BookRoomInput {
  userId: number;
  roomId: number;
  startDate: Date;
  endDate: Date;
}

const MS_PER_HOUR = 1000 * 60 * 60;

export class ReservationService {
  constructor(
    private readonly uow: IUnitOfWork,
    /** Inyectado para poder fijar "ahora" en las pruebas. */
    private readonly now: () => Date = () => new Date()
  ) {}

  async bookRoom(input: BookRoomInput): Promise<ReservationResponse> {
    this.validateDateRange(input.startDate, input.endDate);

    const room = await this.uow.rooms.findById(input.roomId);
    if (!room) {
      throw new NotFoundError('Room not found');
    }

    const user = await this.uow.users.findById(input.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const overlapping = await this.uow.reservations.findOverlapping(
      input.roomId,
      input.startDate,
      input.endDate
    );
    if (overlapping.length > 0) {
      throw new ConflictError('Room not available for selected time');
    }

    const hours =
      (input.endDate.getTime() - input.startDate.getTime()) / MS_PER_HOUR;
    const totalCost = hours * room.hourlyRate;

    if (user.balance < totalCost) {
      throw new ValidationError('Insufficient balance');
    }

    // Crear la reserva y descontar el saldo deben ocurrir juntos o no ocurrir.
    const reservation = await this.uow.transaction(async (tx) => {
      const created = await tx.reservations.create({
        userId: input.userId,
        roomId: input.roomId,
        startDate: input.startDate,
        endDate: input.endDate,
        status: 'CONFIRMED',
        totalCost,
      });

      await tx.users.incrementBalance(input.userId, -totalCost);

      return created;
    });

    return toReservationResponse(reservation);
  }

  async getUserReservations(userId: number): Promise<ReservationResponse[]> {
    const reservations = await this.uow.reservations.findByUserId(userId);
    return reservations.map(toReservationResponse);
  }

  async cancelReservation(reservationId: number): Promise<ReservationResponse> {
    const reservation = await this.uow.reservations.findById(reservationId);
    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    if (reservation.status !== 'CONFIRMED') {
      throw new ValidationError(
        'Only confirmed reservations can be cancelled'
      );
    }

    // HU-06: "solo se pueden cancelar reservas que no hayan iniciado".
    if (reservation.startDate.getTime() <= this.now().getTime()) {
      throw new ValidationError('Cannot cancel a reservation already started');
    }

    // Cancelar y reembolsar también es una única operacion atómica.
    const updated = await this.uow.transaction(async (tx) => {
      const cancelled = await tx.reservations.updateStatus(
        reservationId,
        'CANCELLED'
      );

      await tx.users.incrementBalance(
        reservation.userId,
        reservation.totalCost
      );

      return cancelled;
    });

    return toReservationResponse(updated);
  }

  private validateDateRange(startDate: Date, endDate: Date): void {
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new ValidationError('Invalid date format');
    }
    if (endDate.getTime() <= startDate.getTime()) {
      throw new ValidationError('End date must be after start date');
    }
  }
}
