import { NextFunction, Request, Response } from 'express';

import { ReservationStatus } from '../models';
import { ValidationError } from '../models/errors';
import { ReservationService } from '../services/ReservationService';
import { parseId } from './UserController';

/** HU-11 (Actividad B): estados a los que se puede avanzar por esta ruta. */
const ADVANCEABLE_STATUSES: ReservationStatus[] = ['IN_PROGRESS', 'COMPLETED'];

export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  bookRoom = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { userId, roomId, startDate, endDate } = req.body ?? {};

      if (!userId || !roomId || !startDate || !endDate) {
        throw new ValidationError(
          'Missing required fields: userId, roomId, startDate, endDate'
        );
      }

      // HU-11 (Actividad B): opcional, para no romper a los clientes que
      // todavía no la envían (ver README).
      const idempotencyKeyHeader = req.headers['x-idempotency-key'];
      const idempotencyKey =
        typeof idempotencyKeyHeader === 'string' ? idempotencyKeyHeader : undefined;

      const reservation = await this.reservationService.bookRoom(
        {
          userId: Number(userId),
          roomId: Number(roomId),
          startDate: new Date(String(startDate)),
          endDate: new Date(String(endDate)),
        },
        idempotencyKey
      );

      res.status(201).json(reservation);
    } catch (error) {
      next(error);
    }
  };

  /** HU-11 (Actividad A): avanza el estado de una reserva (máquina de estados). */
  advanceStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const reservationId = parseId(req.params.id, 'reservation ID');
      const { status } = req.body ?? {};

      if (!ADVANCEABLE_STATUSES.includes(status)) {
        throw new ValidationError(
          `status must be one of: ${ADVANCEABLE_STATUSES.join(', ')}`
        );
      }

      const reservation = await this.reservationService.advanceStatus(
        reservationId,
        status as 'IN_PROGRESS' | 'COMPLETED'
      );

      res.json(reservation);
    } catch (error) {
      next(error);
    }
  };

  getUserReservations = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const reservations = await this.reservationService.getUserReservations(
        parseId(req.params.userId, 'user ID')
      );
      res.json(reservations);
    } catch (error) {
      next(error);
    }
  };

  cancelReservation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const reservation = await this.reservationService.cancelReservation(
        parseId(req.params.id, 'reservation ID')
      );
      res.json(reservation);
    } catch (error) {
      next(error);
    }
  };
}
