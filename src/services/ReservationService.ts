import { prisma } from '../db';
import { RoomService } from './RoomService';

const roomService = new RoomService();

export interface BookRoomInput {
  userId: number;
  roomId: number;
  startDate: Date;
  endDate: Date;
}

export interface ReservationResponse {
  id: number;
  userId: number;
  roomId: number;
  startDate: Date;
  endDate: Date;
  status: string;
  totalCost: number;
}

export class ReservationService {
  async bookRoom(input: BookRoomInput): Promise<ReservationResponse> {
    // Check if room is available
    const isAvailable = await roomService.checkRoomAvailability(
      input.roomId,
      input.startDate,
      input.endDate
    );

    if (!isAvailable) {
      throw new Error('Room not available for selected time');
    }

    // Get room details
    const room = await prisma.room.findUnique({
      where: { id: input.roomId },
    });

    if (!room) {
      throw new Error('Room not found');
    }

    // Calculate cost
    const hours =
      (input.endDate.getTime() - input.startDate.getTime()) / (1000 * 60 * 60);
    const totalCost = hours * room.hourlyRate;

    // Check user balance
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.balance < totalCost) {
      throw new Error('Insufficient balance');
    }

    // Create reservation and deduct balance
    const reservation = await prisma.$transaction(async (tx: any) => {
      // Create reservation
      const res = await tx.reservation.create({
        data: {
          userId: input.userId,
          roomId: input.roomId,
          startDate: input.startDate,
          endDate: input.endDate,
          status: 'CONFIRMED',
          totalCost,
        },
      });

      // Deduct balance
      await tx.user.update({
        where: { id: input.userId },
        data: {
          balance: {
            decrement: totalCost,
          },
        },
      });

      return res;
    });

    return this.mapToReservationResponse(reservation);
  }

  async getUserReservations(userId: number): Promise<ReservationResponse[]> {
    const reservations = await prisma.reservation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return reservations.map((r: any) => this.mapToReservationResponse(r));
  }

  async cancelReservation(reservationId: number): Promise<ReservationResponse> {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new Error('Reservation not found');
    }

    if (reservation.status !== 'CONFIRMED') {
      throw new Error('Only confirmed reservations can be cancelled');
    }

    // Cancel and refund
    const updated = await prisma.$transaction(async (tx: any) => {
      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'CANCELLED' },
      });

      // Refund balance
      await tx.user.update({
        where: { id: reservation.userId },
        data: {
          balance: {
            increment: reservation.totalCost,
          },
        },
      });

      return updated;
    });

    return this.mapToReservationResponse(updated);
  }

  private mapToReservationResponse(reservation: any): ReservationResponse {
    return {
      id: reservation.id,
      userId: reservation.userId,
      roomId: reservation.roomId,
      startDate: reservation.startDate,
      endDate: reservation.endDate,
      status: reservation.status,
      totalCost: reservation.totalCost,
    };
  }
}
