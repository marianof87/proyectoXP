import { prisma } from '../db';

export interface CreateRoomInput {
  name: string;
  description?: string;
  capacity: number;
  hourlyRate: number;
}

export interface RoomResponse {
  id: number;
  name: string;
  description?: string | null;
  capacity: number;
  hourlyRate: number;
  available: boolean;
}

export class RoomService {
  async createRoom(input: CreateRoomInput): Promise<RoomResponse> {
    // Check if room with same name exists
    const existingRoom = await prisma.room.findUnique({
      where: { name: input.name },
    });

    if (existingRoom) {
      throw new Error('Room name already exists');
    }

    const room = await prisma.room.create({
      data: {
        name: input.name,
        description: input.description,
        capacity: input.capacity,
        hourlyRate: input.hourlyRate,
        available: true,
      },
    });

    return this.mapToRoomResponse(room);
  }

  async getAllRooms(): Promise<RoomResponse[]> {
    const rooms = await prisma.room.findMany();
    return rooms.map((room: any) => this.mapToRoomResponse(room));
  }

  async getRoomById(id: number): Promise<RoomResponse | null> {
    const room = await prisma.room.findUnique({
      where: { id },
    });

    if (!room) return null;

    return this.mapToRoomResponse(room);
  }

  async checkRoomAvailability(
    roomId: number,
    startDate: Date,
    endDate: Date
  ): Promise<boolean> {
    const conflictingReservations = await prisma.reservation.findMany({
      where: {
        roomId,
        status: {
          in: ['CONFIRMED', 'PENDING'],
        },
        AND: [
          { startDate: { lt: endDate } },
          { endDate: { gt: startDate } },
        ],
      },
    });

    return conflictingReservations.length === 0;
  }

  private mapToRoomResponse(room: any): RoomResponse {
    return {
      id: room.id,
      name: room.name,
      description: room.description,
      capacity: room.capacity,
      hourlyRate: room.hourlyRate,
      available: room.available,
    };
  }
}
