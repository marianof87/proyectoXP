import { NextFunction, Request, Response } from 'express';

import { ValidationError } from '../models/errors';
import { ReservationService } from '../services/ReservationService';
import { parseId } from './UserController';

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

      const reservation = await this.reservationService.bookRoom({
        userId: Number(userId),
        roomId: Number(roomId),
        startDate: new Date(String(startDate)),
        endDate: new Date(String(endDate)),
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
