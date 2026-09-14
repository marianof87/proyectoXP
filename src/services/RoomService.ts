/** HU-05 Gestión de salas. */

import { RoomResponse, toRoomResponse } from '../models';
import { ConflictError, ValidationError } from '../models/errors';
import {
  IReservationRepository,
  IRoomRepository,
} from '../repositories/interfaces';

export interface CreateRoomInput {
  name: string;
  description?: string | null;
  capacity: number;
  hourlyRate: number;
}

export class RoomService {
  constructor(
    private readonly rooms: IRoomRepository,
    private readonly reservations: IReservationRepository
  ) {}

  async createRoom(input: CreateRoomInput): Promise<RoomResponse> {
    this.validate(input);

    const existingRoom = await this.rooms.findByName(input.name);
    if (existingRoom) {
      throw new ConflictError('Room name already exists');
    }

    const room = await this.rooms.create({
      name: input.name,
      description: input.description ?? null,
      capacity: input.capacity,
      hourlyRate: input.hourlyRate,
    });

    return toRoomResponse(room);
  }

  async getAllRooms(): Promise<RoomResponse[]> {
    const rooms = await this.rooms.findAll();
    return rooms.map(toRoomResponse);
  }

  async getRoomById(id: number): Promise<RoomResponse | null> {
    const room = await this.rooms.findById(id);
    return room ? toRoomResponse(room) : null;
  }

  /** Una sala está libre si no tiene reservas vivas solapadas en el rango. */
  async checkRoomAvailability(
    roomId: number,
    startDate: Date,
    endDate: Date
  ): Promise<boolean> {
    const overlapping = await this.reservations.findOverlapping(
      roomId,
      startDate,
      endDate
    );
    return overlapping.length === 0;
  }

  private validate(input: CreateRoomInput): void {
    if (input.name.trim().length === 0) {
      throw new ValidationError('Room name is required');
    }
    if (!Number.isInteger(input.capacity) || input.capacity <= 0) {
      throw new ValidationError('Capacity must be a positive integer');
    }
    if (!Number.isFinite(input.hourlyRate) || input.hourlyRate < 0) {
      throw new ValidationError('Hourly rate cannot be negative');
    }
  }
}
