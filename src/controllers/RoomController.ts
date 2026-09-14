import { Request, Response, NextFunction } from 'express';
import { RoomService, CreateRoomInput } from '../services/RoomService';

const roomService = new RoomService();

export class RoomController {
  async createRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: CreateRoomInput = req.body;

      if (!input.name || !input.capacity || input.hourlyRate === undefined) {
        res.status(400).json({
          error: 'Missing required fields: name, capacity, hourlyRate',
        });
        return;
      }

      const room = await roomService.createRoom(input);
      res.status(201).json(room);
    } catch (error) {
      next(error);
    }
  }

  async getAllRooms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rooms = await roomService.getAllRooms();
      res.json(rooms);
    } catch (error) {
      next(error);
    }
  }

  async getRoomById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const roomId = parseInt(String(id), 10);

      if (isNaN(roomId)) {
        res.status(400).json({ error: 'Invalid room ID' });
        return;
      }

      const room = await roomService.getRoomById(roomId);
      if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      res.json(room);
    } catch (error) {
      next(error);
    }
  }

  async checkAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.body;
      const roomId = parseInt(String(id), 10);

      if (isNaN(roomId) || !startDate || !endDate) {
        res.status(400).json({ error: 'Invalid parameters' });
        return;
      }

      const isAvailable = await roomService.checkRoomAvailability(
        roomId,
        new Date(startDate),
        new Date(endDate)
      );

      res.json({ roomId, isAvailable });
    } catch (error) {
      next(error);
    }
  }
}
