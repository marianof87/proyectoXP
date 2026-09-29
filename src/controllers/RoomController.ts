import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { RoomService } from '../services/RoomService';
import { checkAvailabilitySchema, createRoomSchema } from '../validation/schemas';
import { parseId } from './UserController';

export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  createRoom = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { name, description, capacity, hourlyRate } = req.body as z.infer<
        typeof createRoomSchema
      >;

      const room = await this.roomService.createRoom({
        name,
        description: description ?? null,
        capacity,
        hourlyRate,
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
      const { startDate, endDate } = req.body as z.infer<
        typeof checkAvailabilitySchema
      >;

      const isAvailable = await this.roomService.checkRoomAvailability(
        roomId,
        new Date(startDate),
        new Date(endDate)
      );

      res.json({ roomId, isAvailable });
    } catch (error) {
      next(error);
    }
  };
}
