/**
 * Repositorios respaldados por Prisma/PostgreSQL: la persistencia real que
 * usa la API al arrancar (`npm run dev`).
 *
 * Implementan exactamente las mismas interfaces que los repositorios en
 * memoria, de modo que los servicios no distinguen uno de otro.
 */

import { Prisma, PrismaClient } from '@prisma/client';

import { Reservation, ReservationStatus, Room, User } from '../models';
import { ConflictError, IdempotencyKeyConflictError } from '../models/errors';
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

/**
 * Las columnas de dinero son DECIMAL(12,2) en la BD (Prisma.Decimal); el
 * dominio trabaja con `number` redondeado a centavos, así que se convierte en
 * el borde del repositorio.
 */
type UserRow = Omit<User, 'balance'> & { balance: Prisma.Decimal };
type RoomRow = Omit<Room, 'hourlyRate'> & { hourlyRate: Prisma.Decimal };
type ReservationRow = Omit<Reservation, 'totalCost'> & {
  totalCost: Prisma.Decimal;
};

const toUser = (row: UserRow): User => ({ ...row, balance: row.balance.toNumber() });
const toRoom = (row: RoomRow): Room => ({
  ...row,
  hourlyRate: row.hourlyRate.toNumber(),
});
const toReservation = (row: ReservationRow): Reservation => ({
  ...row,
  totalCost: row.totalCost.toNumber(),
});

/** Prisma no tipa la violación de EXCLUDE: llega como error desconocido con SQLSTATE 23P01. */
const isExclusionViolation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes('23P01');

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/** Cliente completo o cliente transaccional: ambos sirven a los repositorios. */
type PrismaLike = PrismaClient | Prisma.TransactionClient;

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly db: PrismaLike) {}

  async findById(id: number): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { id } });
    return row && toUser(row);
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { email } });
    return row && toUser(row);
  }

  async create(data: CreateUserData): Promise<User> {
    return toUser(await this.db.user.create({ data }));
  }

  async incrementBalance(id: number, amount: number): Promise<User> {
    return toUser(
      await this.db.user.update({
        where: { id },
        data: { balance: { increment: amount } },
      })
    );
  }

  /**
   * UPDATE ... WHERE id = $1 AND balance >= $2: evalúa y descuenta en una sola
   * sentencia, con bloqueo de fila, así que dos débitos simultáneos no pueden
   * pasar ambos el chequeo.
   */
  async debitIfSufficient(id: number, amount: number): Promise<User | null> {
    const { count } = await this.db.user.updateMany({
      where: { id, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    return count === 0 ? null : this.findById(id);
  }

  async deleteAll(): Promise<void> {
    await this.db.user.deleteMany({});
  }
}

export class PrismaRoomRepository implements IRoomRepository {
  constructor(private readonly db: PrismaLike) {}

  async findById(id: number): Promise<Room | null> {
    const row = await this.db.room.findUnique({ where: { id } });
    return row && toRoom(row);
  }

  async findByName(name: string): Promise<Room | null> {
    const row = await this.db.room.findUnique({ where: { name } });
    return row && toRoom(row);
  }

  async findAll(): Promise<Room[]> {
    return (await this.db.room.findMany()).map(toRoom);
  }

  async create(data: CreateRoomData): Promise<Room> {
    return toRoom(await this.db.room.create({ data }));
  }

  async updateHourlyRate(id: number, hourlyRate: number): Promise<Room> {
    return toRoom(
      await this.db.room.update({ where: { id }, data: { hourlyRate } })
    );
  }

  async deleteAll(): Promise<void> {
    await this.db.room.deleteMany({});
  }
}

export class PrismaReservationRepository implements IReservationRepository {
  constructor(private readonly db: PrismaLike) {}

  async findById(id: number): Promise<Reservation | null> {
    const row = await this.db.reservation.findUnique({ where: { id } });
    return row && toReservation(row);
  }

  async findByUserId(userId: number): Promise<Reservation[]> {
    const rows = await this.db.reservation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toReservation);
  }

  async findOverlapping(
    roomId: number,
    startDate: Date,
    endDate: Date
  ): Promise<Reservation[]> {
    const rows = await this.db.reservation.findMany({
      where: {
        roomId,
        status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
        AND: [{ startDate: { lt: endDate } }, { endDate: { gt: startDate } }],
      },
    });
    return rows.map(toReservation);
  }

  async create(data: CreateReservationData): Promise<Reservation> {
    try {
      return toReservation(await this.db.reservation.create({ data }));
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictError('Room not available for selected time');
      }
      throw error;
    }
  }

  async updateStatus(
    id: number,
    status: ReservationStatus
  ): Promise<Reservation> {
    return toReservation(
      await this.db.reservation.update({ where: { id }, data: { status } })
    );
  }

  /** UPDATE ... WHERE id = $1 AND status = $2: compare-and-set atómico. */
  async updateStatusIf(
    id: number,
    from: ReservationStatus,
    to: ReservationStatus
  ): Promise<Reservation | null> {
    const { count } = await this.db.reservation.updateMany({
      where: { id, status: from },
      data: { status: to },
    });
    return count === 0 ? null : this.findById(id);
  }

  async deleteAll(): Promise<void> {
    await this.db.reservation.deleteMany({});
  }
}

export class PrismaIdempotencyKeyRepository
  implements IIdempotencyKeyRepository
{
  constructor(private readonly db: PrismaLike) {}

  async findByKey(key: string): Promise<{ reservationId: number } | null> {
    return this.db.idempotencyKey.findUnique({
      where: { key },
      select: { reservationId: true },
    });
  }

  async save(key: string, reservationId: number): Promise<void> {
    try {
      await this.db.idempotencyKey.create({ data: { key, reservationId } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new IdempotencyKeyConflictError();
      throw error;
    }
  }

  async deleteAll(): Promise<void> {
    await this.db.idempotencyKey.deleteMany({});
  }
}

export class PrismaRevokedTokenRepository implements IRevokedTokenRepository {
  constructor(private readonly db: PrismaLike) {}

  async isRevoked(jti: string): Promise<boolean> {
    const revoked = await this.db.revokedToken.findUnique({ where: { jti } });
    return revoked !== null;
  }

  async revoke(jti: string, expiresAt: Date): Promise<void> {
    await this.db.revokedToken.create({ data: { jti, expiresAt } });
  }

  async deleteAll(): Promise<void> {
    await this.db.revokedToken.deleteMany({});
  }
}

export class PrismaUnitOfWork implements IUnitOfWork {
  readonly users: IUserRepository;
  readonly rooms: IRoomRepository;
  readonly reservations: IReservationRepository;
  readonly idempotencyKeys: IIdempotencyKeyRepository;
  readonly revokedTokens: IRevokedTokenRepository;

  constructor(private readonly client: PrismaClient) {
    this.users = new PrismaUserRepository(client);
    this.rooms = new PrismaRoomRepository(client);
    this.reservations = new PrismaReservationRepository(client);
    this.idempotencyKeys = new PrismaIdempotencyKeyRepository(client);
    this.revokedTokens = new PrismaRevokedTokenRepository(client);
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
  readonly idempotencyKeys: IIdempotencyKeyRepository;
  readonly revokedTokens: IRevokedTokenRepository;

  constructor(tx: Prisma.TransactionClient) {
    this.users = new PrismaUserRepository(tx);
    this.rooms = new PrismaRoomRepository(tx);
    this.reservations = new PrismaReservationRepository(tx);
    this.idempotencyKeys = new PrismaIdempotencyKeyRepository(tx);
    this.revokedTokens = new PrismaRevokedTokenRepository(tx);
  }

  async transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T> {
    return work(this);
  }
}
