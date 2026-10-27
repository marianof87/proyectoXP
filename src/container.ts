/**
 * Raíz de composición: el único sitio donde se decide qué implementación de
 * repositorio recibe cada servicio.
 *
 * `createServices` no sabe de dónde sale la unidad de trabajo, así que la API
 * la construye con Prisma y las pruebas con repositorios en memoria.
 */

import { EventBus } from './events/EventBus';
import { IUnitOfWork } from './repositories/interfaces';
import { InMemoryUnitOfWork } from './repositories/InMemoryRepositories';
import { PrismaUnitOfWork } from './repositories/PrismaRepositories';
import { getPrismaClient } from './db';
import { ReservationService } from './services/ReservationService';
import { RoomService } from './services/RoomService';
import { PasswordHasher } from './services/PasswordHasher';
import { SecurityLogger, UserService } from './services/UserService';
import { SessionService } from './services/SessionService';
import { TokenService } from './services/TokenService';

export interface Services {
  userService: UserService;
  roomService: RoomService;
  reservationService: ReservationService;
  tokenService: TokenService;
  sessionService: SessionService;
  events: EventBus;
  /** Para el simulador (HU-12): acceso directo a los repositorios. */
  uow: IUnitOfWork;
}

export const createServices = (
  uow: IUnitOfWork,
  logger?: SecurityLogger,
  hasher?: PasswordHasher
): Services => {
  const events = new EventBus();
  return {
    userService: new UserService(uow.users, logger, hasher),
    roomService: new RoomService(uow.rooms, uow.reservations),
    reservationService: new ReservationService(uow, () => new Date(), events),
    tokenService: new TokenService(),
    sessionService: new SessionService(uow.revokedTokens),
    events,
    uow,
  };
};

/** Producción: PostgreSQL via Prisma (y, si se pasa, el pool de hilos de HU-13). */
export const createPrismaServices = (hasher?: PasswordHasher): Services =>
  createServices(new PrismaUnitOfWork(getPrismaClient()), undefined, hasher);

/** Pruebas: almacén en memoria, sin base de datos. */
export const createInMemoryServices = (): {
  services: Services;
  uow: InMemoryUnitOfWork;
} => {
  const uow = new InMemoryUnitOfWork();
  // Los avisos de login fallido se silencian: son el comportamiento esperado
  // en los escenarios de HU-08, no un fallo de la suite.
  const silentLogger: SecurityLogger = { warn: () => undefined };
  return { services: createServices(uow, silentLogger), uow };
};
