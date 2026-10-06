/** HU-03 Reserva de salas, HU-04 Visualizacion, HU-06 Cancelacion, HU-11 Estados/Idempotencia. */

import {
  Reservation,
  ReservationResponse,
  ReservationStatus,
  toReservationResponse,
} from '../models';
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

/** Dinero a 2 decimales (columnas DECIMAL(12,2) en la BD). */
const roundCents = (value: number): number => Math.round(value * 100) / 100;

/**
 * HU-11 (Actividad A): tabla de transiciones para `advanceStatus`. No incluye
 * CANCELLED a propósito: cancelar sigue siendo un camino aparte
 * (`cancelReservation`, con su propio reembolso y regla de "no iniciada
 * todavía"), ya cubierto y probado por HU-06. Esta tabla solo formaliza el
 * avance hacia adelante: confirmada -> en curso -> completada.
 */
const ALLOWED_ADVANCES: Partial<Record<ReservationStatus, ReservationStatus[]>> = {
  CONFIRMED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
};

export class ReservationService {
  constructor(
    private readonly uow: IUnitOfWork,
    /** Inyectado para poder fijar "ahora" en las pruebas. */
    private readonly now: () => Date = () => new Date()
  ) {}

  /**
   * `idempotencyKey` es opcional (HU-11, Actividad B): si se repite una
   * petición con la misma clave, se devuelve la reserva creada la primera
   * vez en lugar de procesar el pago de nuevo.
   *
   * HU-12: toda la lógica (comprobaciones + escritura) corre dentro de UNA
   * transacción. La garantía contra carreras no depende del código sino de
   * la base de datos: restricción de exclusión para el solape y débito
   * condicional atómico para el saldo. Si algo falla se revierte solo esta
   * operación y las demás peticiones siguen su curso.
   */
  async bookRoom(
    input: BookRoomInput,
    idempotencyKey?: string
  ): Promise<ReservationResponse> {
    this.validateDateRange(input.startDate, input.endDate);

    try {
      const reservation = await this.uow.transaction(async (tx) => {
        if (idempotencyKey) {
          const replay = await this.findByIdempotencyKey(tx, idempotencyKey);
          if (replay) return replay;
        }

        const room = await tx.rooms.findById(input.roomId);
        if (!room) {
          throw new NotFoundError('Room not found');
        }

        const user = await tx.users.findById(input.userId);
        if (!user) {
          throw new NotFoundError('User not found');
        }

        // Comprobación amistosa; el garante real es la restricción en BD.
        const overlapping = await tx.reservations.findOverlapping(
          input.roomId,
          input.startDate,
          input.endDate
        );
        if (overlapping.length > 0) {
          throw new ConflictError('Room not available for selected time');
        }

        const hours =
          (input.endDate.getTime() - input.startDate.getTime()) / MS_PER_HOUR;
        const totalCost = roundCents(hours * room.hourlyRate);

        // Débito atómico: 0 filas afectadas = saldo insuficiente.
        const debited = await tx.users.debitIfSufficient(input.userId, totalCost);
        if (!debited) {
          throw new ValidationError('Insufficient balance');
        }

        const created = await tx.reservations.create({
          userId: input.userId,
          roomId: input.roomId,
          startDate: input.startDate,
          endDate: input.endDate,
          status: 'CONFIRMED',
          totalCost,
        });

        if (idempotencyKey) {
          await tx.idempotencyKeys.save(idempotencyKey, created.id);
        }

        return created;
      });

      return toReservationResponse(reservation);
    } catch (error) {
      // Carrera con la misma clave: la petición ganadora ya confirmó; se
      // devuelve su reserva en lugar de un error.
      if (idempotencyKey && error instanceof ConflictError) {
        const replay = await this.findByIdempotencyKey(this.uow, idempotencyKey);
        if (replay) return toReservationResponse(replay);
      }
      throw error;
    }
  }

  /**
   * HU-11 (Actividad A): avanza la reserva hacia adelante (CONFIRMED ->
   * IN_PROGRESS -> COMPLETED), rechazando cualquier otra transición con un
   * error de negocio estructurado (ConflictError, 409).
   *
   * HU-12: el cambio es un compare-and-set sobre el estado leído, así dos
   * avances simultáneos no pueden aplicarse ambos.
   */
  async advanceStatus(
    reservationId: number,
    targetStatus: 'IN_PROGRESS' | 'COMPLETED'
  ): Promise<ReservationResponse> {
    const reservation = await this.uow.reservations.findById(reservationId);
    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    const allowedTargets = ALLOWED_ADVANCES[reservation.status] ?? [];
    if (!allowedTargets.includes(targetStatus)) {
      throw new ConflictError(
        `Cannot transition reservation from ${reservation.status} to ${targetStatus}`
      );
    }

    const updated = await this.uow.reservations.updateStatusIf(
      reservationId,
      reservation.status,
      targetStatus
    );
    if (!updated) {
      const current = await this.uow.reservations.findById(reservationId);
      throw new ConflictError(
        `Cannot transition reservation from ${current?.status} to ${targetStatus}`
      );
    }
    return toReservationResponse(updated);
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

    // Cancelar y reembolsar es una única operación atómica. El cambio de
    // estado es condicional (HU-12): si otra petición ya canceló, esta falla
    // y NO reembolsa por segunda vez.
    const updated = await this.uow.transaction(async (tx) => {
      const cancelled = await tx.reservations.updateStatusIf(
        reservationId,
        'CONFIRMED',
        'CANCELLED'
      );
      if (!cancelled) {
        throw new ValidationError(
          'Only confirmed reservations can be cancelled'
        );
      }

      await tx.users.incrementBalance(
        reservation.userId,
        reservation.totalCost
      );

      return cancelled;
    });

    return toReservationResponse(updated);
  }

  private async findByIdempotencyKey(
    repos: IUnitOfWork,
    key: string
  ): Promise<Reservation | null> {
    const existing = await repos.idempotencyKeys.findByKey(key);
    if (!existing) return null;
    return repos.reservations.findById(existing.reservationId);
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
