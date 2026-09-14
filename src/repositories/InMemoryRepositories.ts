/**
 * Repositorios en memoria (progXP.pdf sección 1: "... o repositorios en
 * memoria").
 *
 * Son la persistencia que usan Cucumber y Jest: sin PostgreSQL, sin
 * migraciones y con estado reiniciable entre escenarios, lo que mantiene la
 * suite determinista y rapida en CI.
 */

import { Reservation, ReservationStatus, Room, User } from '../models';
import {
  CreateReservationData,
  CreateRoomData,
  CreateUserData,
  IReservationRepository,
  IRoomRepository,
  IUnitOfWork,
  IUserRepository,
} from './interfaces';

import { NotFoundError } from '../models/errors';

export class InMemoryUserRepository implements IUserRepository {
  private readonly users = new Map<number, User>();
  private nextId = 1;

  async findById(id: number): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  async create(data: CreateUserData): Promise<User> {
    const now = new Date();
    const user: User = {
      id: this.nextId++,
      email: data.email,
      name: data.name,
      password: data.password,
      role: data.role,
      balance: data.balance,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return { ...user };
  }

  async incrementBalance(id: number, amount: number): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new NotFoundError('User not found');

    const updated: User = {
      ...user,
      balance: user.balance + amount,
      updatedAt: new Date(),
    };
    this.users.set(id, updated);
    return { ...updated };
  }

  async deleteAll(): Promise<void> {
    this.users.clear();
    this.nextId = 1;
  }
}

export class InMemoryRoomRepository implements IRoomRepository {
  private readonly rooms = new Map<number, Room>();
  private nextId = 1;

  async findById(id: number): Promise<Room | null> {
    return this.rooms.get(id) ?? null;
  }

  async findByName(name: string): Promise<Room | null> {
    for (const room of this.rooms.values()) {
      if (room.name === name) return room;
    }
    return null;
  }

  async findAll(): Promise<Room[]> {
    return Array.from(this.rooms.values()).map((room) => ({ ...room }));
  }

  async create(data: CreateRoomData): Promise<Room> {
    const now = new Date();
    const room: Room = {
      id: this.nextId++,
      name: data.name,
      description: data.description,
      capacity: data.capacity,
      hourlyRate: data.hourlyRate,
      available: true,
      createdAt: now,
      updatedAt: now,
    };
    this.rooms.set(room.id, room);
    return { ...room };
  }

  async updateHourlyRate(id: number, hourlyRate: number): Promise<Room> {
    const room = this.rooms.get(id);
    if (!room) throw new NotFoundError('Room not found');

    const updated: Room = { ...room, hourlyRate, updatedAt: new Date() };
    this.rooms.set(id, updated);
    return { ...updated };
  }

  async deleteAll(): Promise<void> {
    this.rooms.clear();
    this.nextId = 1;
  }
}

export class InMemoryReservationRepository implements IReservationRepository {
  private readonly reservations = new Map<number, Reservation>();
  private nextId = 1;

  async findById(id: number): Promise<Reservation | null> {
    return this.reservations.get(id) ?? null;
  }

  async findByUserId(userId: number): Promise<Reservation[]> {
    return Array.from(this.reservations.values())
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({ ...r }));
  }

  async findOverlapping(
    roomId: number,
    startDate: Date,
    endDate: Date
  ): Promise<Reservation[]> {
    return Array.from(this.reservations.values())
      .filter(
        (r) =>
          r.roomId === roomId &&
          (r.status === 'PENDING' || r.status === 'CONFIRMED') &&
          r.startDate.getTime() < endDate.getTime() &&
          r.endDate.getTime() > startDate.getTime()
      )
      .map((r) => ({ ...r }));
  }

  async create(data: CreateReservationData): Promise<Reservation> {
    const now = new Date();
    const reservation: Reservation = {
      id: this.nextId++,
      userId: data.userId,
      roomId: data.roomId,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status,
      totalCost: data.totalCost,
      createdAt: now,
      updatedAt: now,
    };
    this.reservations.set(reservation.id, reservation);
    return { ...reservation };
  }

  async updateStatus(
    id: number,
    status: ReservationStatus
  ): Promise<Reservation> {
    const reservation = this.reservations.get(id);
    if (!reservation) throw new NotFoundError('Reservation not found');

    const updated: Reservation = { ...reservation, status, updatedAt: new Date() };
    this.reservations.set(id, updated);
    return { ...updated };
  }

  async deleteAll(): Promise<void> {
    this.reservations.clear();
    this.nextId = 1;
  }
}

export class InMemoryUnitOfWork implements IUnitOfWork {
  readonly users = new InMemoryUserRepository();
  readonly rooms = new InMemoryRoomRepository();
  readonly reservations = new InMemoryReservationRepository();

  /**
   * No hay transacciones reales en memoria: se ejecuta el trabajo tal cual.
   * Basta para las pruebas, donde no hay concurrencia entre escenarios.
   */
  async transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T> {
    return work(this);
  }

  /** Deja el almacén limpio entre escenarios de Cucumber. */
  async reset(): Promise<void> {
    await this.users.deleteAll();
    await this.rooms.deleteAll();
    await this.reservations.deleteAll();
  }
}
