import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { ReservationService } from '../services/ReservationService';
import {
  advanceReservationStatusSchema,
  bookRoomSchema,
} from '../validation/schemas';
import { parseId } from './UserController';

export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  bookRoom = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { userId, roomId, startDate, endDate } = req.body as z.infer<
        typeof bookRoomSchema
      >;

      // HU-11 (Actividad B): opcional, para no romper a los clientes que
      // todavía no la envían (ver README).
      const idempotencyKeyHeader = req.headers['x-idempotency-key'];
      const idempotencyKey =
        typeof idempotencyKeyHeader === 'string' ? idempotencyKeyHeader : undefined;

      const reservation = await this.reservationService.bookRoom(
        {
          userId,
          roomId,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
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
      const { status } = req.body as z.infer<
        typeof advanceReservationStatusSchema
      >;

      const reservation = await this.reservationService.advanceStatus(
        reservationId,
        status
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
