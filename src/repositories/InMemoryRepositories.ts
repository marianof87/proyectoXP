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
  IIdempotencyKeyRepository,
  IReservationRepository,
  IRevokedTokenRepository,
  IRoomRepository,
  IUnitOfWork,
  IUserRepository,
} from './interfaces';

import {
  ConflictError,
  IdempotencyKeyConflictError,
  NotFoundError,
} from '../models/errors';

/** Estados que ocupan la sala (espejo de la restricción de exclusión SQL). */
const LIVE_STATUSES: ReservationStatus[] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'];

const roundCents = (value: number): number => Math.round(value * 100) / 100;

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
      balance: roundCents(user.balance + amount),
      updatedAt: new Date(),
    };
    this.users.set(id, updated);
    return { ...updated };
  }

  /** Sin `await` entre leer y escribir: atómico en el bucle de eventos. */
  async debitIfSufficient(id: number, amount: number): Promise<User | null> {
    const user = this.users.get(id);
    if (!user || user.balance < amount) return null;

    const updated: User = {
      ...user,
      balance: roundCents(user.balance - amount),
      updatedAt: new Date(),
    };
    this.users.set(id, updated);
    return { ...updated };
  }

  snapshot(): () => void {
    const users = new Map(this.users);
    const nextId = this.nextId;
    return () => {
      this.users.clear();
      users.forEach((u, k) => this.users.set(k, u));
      this.nextId = nextId;
    };
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
          LIVE_STATUSES.includes(r.status) &&
          r.startDate.getTime() < endDate.getTime() &&
          r.endDate.getTime() > startDate.getTime()
      )
      .map((r) => ({ ...r }));
  }

  async create(data: CreateReservationData): Promise<Reservation> {
    // Espejo de la restricción de exclusión de PostgreSQL: choque -> 409.
    if (
      LIVE_STATUSES.includes(data.status) &&
      (await this.findOverlapping(data.roomId, data.startDate, data.endDate))
        .length > 0
    ) {
      throw new ConflictError('Room not available for selected time');
    }

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

  async updateStatusIf(
    id: number,
    from: ReservationStatus,
    to: ReservationStatus
  ): Promise<Reservation | null> {
    const reservation = this.reservations.get(id);
    if (!reservation || reservation.status !== from) return null;

    const updated: Reservation = { ...reservation, status: to, updatedAt: new Date() };
    this.reservations.set(id, updated);
    return { ...updated };
  }

  snapshot(): () => void {
    const reservations = new Map(this.reservations);
    const nextId = this.nextId;
    return () => {
      this.reservations.clear();
      reservations.forEach((r, k) => this.reservations.set(k, r));
      this.nextId = nextId;
    };
  }

  async deleteAll(): Promise<void> {
    this.reservations.clear();
    this.nextId = 1;
  }
}

export class InMemoryIdempotencyKeyRepository
  implements IIdempotencyKeyRepository
{
  private readonly keys = new Map<string, number>();

  async findByKey(key: string): Promise<{ reservationId: number } | null> {
    const reservationId = this.keys.get(key);
    return reservationId === undefined ? null : { reservationId };
  }

  async save(key: string, reservationId: number): Promise<void> {
    if (this.keys.has(key)) throw new IdempotencyKeyConflictError();
    this.keys.set(key, reservationId);
  }

  snapshot(): () => void {
    const keys = new Map(this.keys);
    return () => {
      this.keys.clear();
      keys.forEach((v, k) => this.keys.set(k, v));
    };
  }

  async deleteAll(): Promise<void> {
    this.keys.clear();
  }
}

export class InMemoryRevokedTokenRepository implements IRevokedTokenRepository {
  private readonly revoked = new Map<string, Date>();

  async isRevoked(jti: string): Promise<boolean> {
    return this.revoked.has(jti);
  }

  async revoke(jti: string, expiresAt: Date): Promise<void> {
    this.revoked.set(jti, expiresAt);
  }

  async deleteAll(): Promise<void> {
    this.revoked.clear();
  }
}

export class InMemoryUnitOfWork implements IUnitOfWork {
  readonly users = new InMemoryUserRepository();
  readonly rooms = new InMemoryRoomRepository();
  readonly reservations = new InMemoryReservationRepository();
  readonly idempotencyKeys = new InMemoryIdempotencyKeyRepository();
  readonly revokedTokens = new InMemoryRevokedTokenRepository();

  /** Cola que serializa las transacciones (equivale a aislamiento serializable). */
  private tail: Promise<unknown> = Promise.resolve();

  /**
   * Transacción simulada: las transacciones se ejecutan de una en una y, si
   * `work` falla, se restaura el estado previo (rollback). Así los servicios
   * se prueban con la misma semántica "todo o nada" que tiene PostgreSQL.
   */
  async transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const restore = [
        this.users.snapshot(),
        this.reservations.snapshot(),
        this.idempotencyKeys.snapshot(),
      ];
      try {
        return await work(this);
      } catch (error) {
        restore.forEach((undo) => undo());
        throw error;
      }
    };
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** Deja el almacén limpio entre escenarios de Cucumber. */
  async reset(): Promise<void> {
    await this.users.deleteAll();
    await this.rooms.deleteAll();
    await this.reservations.deleteAll();
    await this.idempotencyKeys.deleteAll();
    await this.revokedTokens.deleteAll();
  }
}
