/**
 * Repositorios respaldados por Prisma/PostgreSQL: la persistencia real que
 * usa la API al arrancar (`npm run dev`).
 *
 * Implementan exactamente las mismas interfaces que los repositorios en
 * memoria, de modo que los servicios no distinguen uno de otro.
 */

import { Prisma, PrismaClient } from '@prisma/client';

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

/** Cliente completo o cliente transaccional: ambos sirven a los repositorios. */
type PrismaLike = PrismaClient | Prisma.TransactionClient;

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly db: PrismaLike) {}

  async findById(id: number): Promise<User | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { email } });
  }

  async create(data: CreateUserData): Promise<User> {
    return this.db.user.create({ data });
  }

  async incrementBalance(id: number, amount: number): Promise<User> {
    return this.db.user.update({
      where: { id },
      data: { balance: { increment: amount } },
    });
  }

  async deleteAll(): Promise<void> {
    await this.db.user.deleteMany({});
  }
}

export class PrismaRoomRepository implements IRoomRepository {
  constructor(private readonly db: PrismaLike) {}

  async findById(id: number): Promise<Room | null> {
    return this.db.room.findUnique({ where: { id } });
  }

  async findByName(name: string): Promise<Room | null> {
    return this.db.room.findUnique({ where: { name } });
  }

  async findAll(): Promise<Room[]> {
    return this.db.room.findMany();
  }

  async create(data: CreateRoomData): Promise<Room> {
    return this.db.room.create({ data });
  }

  async updateHourlyRate(id: number, hourlyRate: number): Promise<Room> {
    return this.db.room.update({ where: { id }, data: { hourlyRate } });
  }

  async deleteAll(): Promise<void> {
    await this.db.room.deleteMany({});
  }
}

export class PrismaReservationRepository implements IReservationRepository {
  constructor(private readonly db: PrismaLike) {}

  async findById(id: number): Promise<Reservation | null> {
    return this.db.reservation.findUnique({ where: { id } });
  }

  async findByUserId(userId: number): Promise<Reservation[]> {
    return this.db.reservation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOverlapping(
    roomId: number,
    startDate: Date,
    endDate: Date
  ): Promise<Reservation[]> {
    return this.db.reservation.findMany({
      where: {
        roomId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        AND: [{ startDate: { lt: endDate } }, { endDate: { gt: startDate } }],
      },
    });
  }

  async create(data: CreateReservationData): Promise<Reservation> {
    return this.db.reservation.create({ data });
  }

  async updateStatus(
    id: number,
    status: ReservationStatus
  ): Promise<Reservation> {
    return this.db.reservation.update({ where: { id }, data: { status } });
  }

  async deleteAll(): Promise<void> {
    await this.db.reservation.deleteMany({});
  }
}

export class PrismaUnitOfWork implements IUnitOfWork {
  readonly users: IUserRepository;
  readonly rooms: IRoomRepository;
  readonly reservations: IReservationRepository;

  constructor(private readonly client: PrismaClient) {
    this.users = new PrismaUserRepository(client);
    this.rooms = new PrismaRoomRepository(client);
    this.reservations = new PrismaReservationRepository(client);
  }

  /**
   * Envuelve `work` en una transacción real. Reservar implica crear la reserva
   * y descontar el saldo: si algo falla a mitad, se revierte todo.
   */
  async transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T> {
    return this.client.$transaction((tx) => work(new TransactionalUnitOfWork(tx)));
  }
}

/** Unidad de trabajo ya dentro de una transacción: no puede anidar otra. */
class TransactionalUnitOfWork implements IUnitOfWork {
  readonly users: IUserRepository;
  readonly rooms: IRoomRepository;
  readonly reservations: IReservationRepository;

  constructor(tx: Prisma.TransactionClient) {
    this.users = new PrismaUserRepository(tx);
    this.rooms = new PrismaRoomRepository(tx);
    this.reservations = new PrismaReservationRepository(tx);
  }

  async transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T> {
    return work(this);
  }
}
