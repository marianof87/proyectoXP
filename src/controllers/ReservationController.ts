import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { ReservationService } from '../services/ReservationService';
import { bookRoomSchema } from '../validation/schemas';
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

      const reservation = await this.reservationService.bookRoom({
        userId,
        roomId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });

      res.status(201).json(reservation);
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
