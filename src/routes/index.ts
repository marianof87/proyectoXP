import express, { Router } from 'express';

import { Services } from '../container';
import { ReservationController } from '../controllers/ReservationController';
import { RoomController } from '../controllers/RoomController';
import { UserController } from '../controllers/UserController';
import {
  authenticate,
  requireOwnerOrAdmin,
  requireRole,
} from '../middleware/authMiddleware';

/** Monta las rutas sobre los servicios recibidos (sin singletons globales). */
export const createRouter = (services: Services): Router => {
  const router: Router = express.Router();

  const users = new UserController(services.userService, services.tokenService);
  const rooms = new RoomController(services.roomService);
  const reservations = new ReservationController(services.reservationService);

  const auth = authenticate(services.tokenService);

  // Usuarios - públicas
  router.post('/users/register', users.register);
  router.post('/users/login', users.login);

  // Usuarios - protegidas (HU-09). "/users/me" va antes de "/users/:id":
  // Express resuelve las rutas en orden de registro, así que si "/:id" fuera
  // primero capturaría "/users/me" con id = "me".
  router.get('/users/me', auth, users.me);
  router.get('/users/:id', users.getUserById);
  router.post(
    '/users/:id/balance',
    auth,
    requireOwnerOrAdmin('id'),
    users.addBalance
  );

  // Salas - la creación es solo para ADMIN (HU-05 + HU-09)
  router.post('/rooms', auth, requireRole(['ADMIN']), rooms.createRoom);
  router.get('/rooms', rooms.getAllRooms);
  router.get('/rooms/:id', rooms.getRoomById);
  router.post('/rooms/:id/check-availability', rooms.checkAvailability);

  // Reservas - requieren estar autenticado; el historial es solo del dueño o un ADMIN
  router.post('/reservations', auth, reservations.bookRoom);
  router.get(
    '/users/:userId/reservations',
    auth,
    requireOwnerOrAdmin('userId'),
    reservations.getUserReservations
  );
  router.delete('/reservations/:id', auth, reservations.cancelReservation);

  return router;
};
