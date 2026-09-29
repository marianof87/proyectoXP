/**
 * Capa de repositorios (src/repositories/ - progXP.pdf sección 4).
 *
 * Abstraen el almacenamiento. Los servicios dependen SOLO de estas interfaces,
 * así que la misma lógica de negocio corre contra Prisma/PostgreSQL en
 * producción y contra repositorios en memoria en las pruebas BDD.
 */

import { Reservation, ReservationStatus, Role, Room, User } from '../models';

export interface CreateUserData {
  email: string;
  name: string;
  /** Ya hasheada por el servicio. El repositorio no conoce bcrypt. */
  password: string;
  role: Role;
  balance: number;
}

export interface IUserRepository {
  findById(id: number): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  /** Suma `amount` al balance (negativo para descontar). Devuelve el usuario. */
  incrementBalance(id: number, amount: number): Promise<User>;
  deleteAll(): Promise<void>;
}

export interface CreateRoomData {
  name: string;
  description: string | null;
  capacity: number;
  hourlyRate: number;
}

export interface IRoomRepository {
  findById(id: number): Promise<Room | null>;
  findByName(name: string): Promise<Room | null>;
  findAll(): Promise<Room[]>;
  create(data: CreateRoomData): Promise<Room>;
  updateHourlyRate(id: number, hourlyRate: number): Promise<Room>;
  deleteAll(): Promise<void>;
}

export interface CreateReservationData {
  userId: number;
  roomId: number;
  startDate: Date;
  endDate: Date;
  status: ReservationStatus;
  totalCost: number;
}

export interface IReservationRepository {
  findById(id: number): Promise<Reservation | null>;
  findByUserId(userId: number): Promise<Reservation[]>;
  /**
   * Reservas de `roomId` que se solapan con [startDate, endDate) y siguen
   * vivas (PENDING o CONFIRMED). Solapamiento = inicio < fin_pedido &&
   * fin > inicio_pedido, de modo que 09:00-11:00 y 11:00-13:00 NO chocan.
   */
  findOverlapping(
    roomId: number,
    startDate: Date,
    endDate: Date
  ): Promise<Reservation[]>;
  create(data: CreateReservationData): Promise<Reservation>;
  updateStatus(id: number, status: ReservationStatus): Promise<Reservation>;
  deleteAll(): Promise<void>;
}

/**
 * HU-11 (Unidad 5, Actividad B): una X-Idempotency-Key ya vista devuelve la
 * reserva original en vez de crear una nueva.
 */
export interface IIdempotencyKeyRepository {
  findByKey(key: string): Promise<{ reservationId: number } | null>;
  save(key: string, reservationId: number): Promise<void>;
  deleteAll(): Promise<void>;
}

/**
 * HU-11 (Unidad 5, Actividad C): lista negra de tokens revocados por logout.
 * Se indexa por `jti` (identificador del token), nunca por el JWT completo.
 */
export interface IRevokedTokenRepository {
  isRevoked(jti: string): Promise<boolean>;
  revoke(jti: string, expiresAt: Date): Promise<void>;
  deleteAll(): Promise<void>;
}

/**
 * Agrupa los repositorios y permite ejecutar una operacion que toca varios
 * de ellos de forma atómica (reservar = crear reserva + descontar saldo).
 * En Prisma se traduce a $transaction; en memoria es secuencial.
 */
export interface IUnitOfWork {
  readonly users: IUserRepository;
  readonly rooms: IRoomRepository;
  readonly reservations: IReservationRepository;
  readonly idempotencyKeys: IIdempotencyKeyRepository;
  readonly revokedTokens: IRevokedTokenRepository;
  transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T>;
}
