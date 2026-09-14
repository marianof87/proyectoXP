import express, { Router } from 'express';

import { Services } from '../container';
import { ReservationController } from '../controllers/ReservationController';
import { RoomController } from '../controllers/RoomController';
import { UserController } from '../controllers/UserController';

/** Monta las rutas sobre los servicios recibidos (sin singletons globales). */
export const createRouter = (services: Services): Router => {
  const router: Router = express.Router();

  const users = new UserController(services.userService);
  const rooms = new RoomController(services.roomService);
  const reservations = new ReservationController(services.reservationService);

  // Usuarios
  router.post('/users/register', users.register);
  router.post('/users/login', users.login);
  router.get('/users/:id', users.getUserById);
  router.post('/users/:id/balance', users.addBalance);

  // Salas
  router.post('/rooms', rooms.createRoom);
  router.get('/rooms', rooms.getAllRooms);
  router.get('/rooms/:id', rooms.getRoomById);
  router.post('/rooms/:id/check-availability', rooms.checkAvailability);

  // Reservas
  router.post('/reservations', reservations.bookRoom);
  router.get('/users/:userId/reservations', reservations.getUserReservations);
  router.delete('/reservations/:id', reservations.cancelReservation);

  return router;
};
