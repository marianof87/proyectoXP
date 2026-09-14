/**
 * Modelos de dominio (src/models/ - progXP.pdf sección 4).
 *
 * Tipos puros, sin dependencia de Prisma ni de Express. Son el contrato que
 * comparten repositorios, servicios y controladores.
 */

export type Role = 'USER' | 'ADMIN';

export type ReservationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'COMPLETED';

export interface User {
  id: number;
  email: string;
  name: string;
  /** Hash bcrypt. Nunca la contraseña en texto plano (HU-08). */
  password: string;
  role: Role;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Room {
  id: number;
  name: string;
  description: string | null;
  capacity: number;
  hourlyRate: number;
  available: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reservation {
  id: number;
  userId: number;
  roomId: number;
  startDate: Date;
  endDate: Date;
  status: ReservationStatus;
  totalCost: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Vista pública de un usuario: nunca expone el hash de la contraseña. */
export interface UserResponse {
  id: number;
  email: string;
  name: string;
  role: Role;
  balance: number;
}

export interface RoomResponse {
  id: number;
  name: string;
  description: string | null;
  capacity: number;
  hourlyRate: number;
  available: boolean;
}

export interface ReservationResponse {
  id: number;
  userId: number;
  roomId: number;
  startDate: Date;
  endDate: Date;
  status: ReservationStatus;
  totalCost: number;
}

export const toUserResponse = (user: User): UserResponse => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  balance: user.balance,
});

export const toRoomResponse = (room: Room): RoomResponse => ({
  id: room.id,
  name: room.name,
  description: room.description,
  capacity: room.capacity,
  hourlyRate: room.hourlyRate,
  available: room.available,
});

export const toReservationResponse = (
  reservation: Reservation
): ReservationResponse => ({
  id: reservation.id,
  userId: reservation.userId,
  roomId: reservation.roomId,
  startDate: reservation.startDate,
  endDate: reservation.endDate,
  status: reservation.status,
  totalCost: reservation.totalCost,
});
