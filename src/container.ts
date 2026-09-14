/**
 * Raíz de composición: el único sitio donde se decide qué implementación de
 * repositorio recibe cada servicio.
 *
 * `createServices` no sabe de dónde sale la unidad de trabajo, así que la API
 * la construye con Prisma y las pruebas con repositorios en memoria.
 */

import { IUnitOfWork } from './repositories/interfaces';
import { InMemoryUnitOfWork } from './repositories/InMemoryRepositories';
import { PrismaUnitOfWork } from './repositories/PrismaRepositories';
import { getPrismaClient } from './db';
import { ReservationService } from './services/ReservationService';
import { RoomService } from './services/RoomService';
import { UserService } from './services/UserService';

export interface Services {
  userService: UserService;
  roomService: RoomService;
  reservationService: ReservationService;
}

export const createServices = (uow: IUnitOfWork): Services => ({
  userService: new UserService(uow.users),
  roomService: new RoomService(uow.rooms, uow.reservations),
  reservationService: new ReservationService(uow),
});

/** Producción: PostgreSQL via Prisma. */
export const createPrismaServices = (): Services =>
  createServices(new PrismaUnitOfWork(getPrismaClient()));

/** Pruebas: almacén en memoria, sin base de datos. */
export const createInMemoryServices = (): {
  services: Services;
  uow: InMemoryUnitOfWork;
} => {
  const uow = new InMemoryUnitOfWork();
  return { services: createServices(uow), uow };
};
