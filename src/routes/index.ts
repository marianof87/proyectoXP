import express, { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { RoomController } from '../controllers/RoomController';
import { ReservationController } from '../controllers/ReservationController';

const router: Router = express.Router();

const userController = new UserController();
const roomController = new RoomController();
const reservationController = new ReservationController();

// User routes
router.post('/users/register', (req, res, next) =>
  userController.register(req, res, next)
);
router.get('/users/:id', (req, res, next) =>
  userController.getUserById(req, res, next)
);
router.post('/users/:id/balance', (req, res, next) =>
  userController.addBalance(req, res, next)
);

// Room routes
router.post('/rooms', (req, res, next) =>
  roomController.createRoom(req, res, next)
);
router.get('/rooms', (req, res, next) =>
  roomController.getAllRooms(req, res, next)
);
router.get('/rooms/:id', (req, res, next) =>
  roomController.getRoomById(req, res, next)
);
router.post('/rooms/:id/check-availability', (req, res, next) =>
  roomController.checkAvailability(req, res, next)
);

// Reservation routes
router.post('/reservations', (req, res, next) =>
  reservationController.bookRoom(req, res, next)
);
router.get('/users/:userId/reservations', (req, res, next) =>
  reservationController.getUserReservations(req, res, next)
);
router.delete('/reservations/:id', (req, res, next) =>
  reservationController.cancelReservation(req, res, next)
);

export default router;
