import { NextFunction, Request, Response } from 'express';

import { ValidationError } from '../models/errors';
import { RoomService } from '../services/RoomService';
import { parseId } from './UserController';

export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  createRoom = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { name, description, capacity, hourlyRate } = req.body ?? {};

      if (!name || capacity === undefined || hourlyRate === undefined) {
        throw new ValidationError(
          'Missing required fields: name, capacity, hourlyRate'
        );
      }

      const room = await this.roomService.createRoom({
        name: String(name),
        description: description === undefined ? null : String(description),
        capacity: Number(capacity),
        hourlyRate: Number(hourlyRate),
      });

      res.status(201).json(room);
    } catch (error) {
      next(error);
    }
  };

  getAllRooms = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      res.json(await this.roomService.getAllRooms());
    } catch (error) {
      next(error);
    }
  };

  getRoomById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const room = await this.roomService.getRoomById(
        parseId(req.params.id, 'room ID')
      );

      if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      res.json(room);
    } catch (error) {
      next(error);
    }
  };

  checkAvailability = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const roomId = parseId(req.params.id, 'room ID');
      const { startDate, endDate } = req.body ?? {};

      if (!startDate || !endDate) {
        throw new ValidationError('Missing required fields: startDate, endDate');
      }

      const isAvailable = await this.roomService.checkRoomAvailability(
        roomId,
        new Date(String(startDate)),
        new Date(String(endDate))
      );

      res.json({ roomId, isAvailable });
    } catch (error) {
      next(error);
    }
  };
}
