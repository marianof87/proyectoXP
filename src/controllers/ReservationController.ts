import { Request, Response, NextFunction } from 'express';
import { ReservationService, BookRoomInput } from '../services/ReservationService';

const reservationService = new ReservationService();

export class ReservationController {
  async bookRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: BookRoomInput = req.body;

      if (!input.userId || !input.roomId || !input.startDate || !input.endDate) {
        res.status(400).json({
          error: 'Missing required fields: userId, roomId, startDate, endDate',
        });
        return;
      }

      const reservation = await reservationService.bookRoom({
        userId: input.userId,
        roomId: input.roomId,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
      });

      res.status(201).json(reservation);
    } catch (error) {
      next(error);
    }
  }

  async getUserReservations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const parsedUserId = parseInt(String(userId), 10);

      if (isNaN(parsedUserId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const reservations = await reservationService.getUserReservations(parsedUserId);
      res.json(reservations);
    } catch (error) {
      next(error);
    }
  }

  async cancelReservation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const reservationId = parseInt(String(id), 10);

      if (isNaN(reservationId)) {
        res.status(400).json({ error: 'Invalid reservation ID' });
        return;
      }

      const reservation = await reservationService.cancelReservation(reservationId);
      res.json(reservation);
    } catch (error) {
      next(error);
    }
  }
}
