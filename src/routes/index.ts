import express, { RequestHandler, Router } from 'express';

import { Services } from '../container';
import { LiveController } from '../controllers/LiveController';
import { ReservationController } from '../controllers/ReservationController';
import { RoomController } from '../controllers/RoomController';
import { UserController } from '../controllers/UserController';
import {
  authenticate,
  requireOwnerOrAdmin,
  requireRole,
} from '../middleware/authMiddleware';
import { createRateLimiter, RateLimitConfig } from '../middleware/rateLimiter';
import { validateRequest } from '../middleware/validateRequest';
import { Simulator } from '../sim/Simulator';
import {
  addBalanceSchema,
  advanceReservationStatusSchema,
  bookRoomSchema,
  checkAvailabilitySchema,
  createRoomSchema,
  loginSchema,
  registerSchema,
  autoSimulationSchema,
  simulationSchema,
} from '../validation/schemas';

/** Monta las rutas sobre los servicios recibidos (sin singletons globales). */
export interface RouterOptions {
  /** Límites de tasa; sin él no se limita (pruebas). */
  rateLimit?: RateLimitConfig;
  /** HU-12: habilita POST /api/sim/run. Apagado por defecto. */
  enableSimulator?: boolean;
}

export const createRouter = (
  services: Services,
  options: RouterOptions = {}
): Router => {
  const router: Router = express.Router();

  if (options.rateLimit) {
    router.use(createRateLimiter(options.rateLimit.general));
  }
  const authLimiter: RequestHandler[] = options.rateLimit
    ? [createRateLimiter(options.rateLimit.auth)]
    : [];

  const users = new UserController(
    services.userService,
    services.tokenService,
    services.sessionService
  );
  const rooms = new RoomController(services.roomService);
  const reservations = new ReservationController(services.reservationService);

  const auth = authenticate(services.tokenService, services.sessionService);

  // Usuarios - públicas
  // Con límite propio, más estricto: frena la fuerza bruta (HU-08).
  router.post(
    '/users/register',
    ...authLimiter,
    validateRequest(registerSchema),
    users.register
  );
  router.post(
    '/users/login',
    ...authLimiter,
    validateRequest(loginSchema),
    users.login
  );

  // Usuarios - protegidas (HU-09). "/users/me" va antes de "/users/:id":
  // Express resuelve las rutas en orden de registro, así que si "/:id" fuera
  // primero capturaría "/users/me" con id = "me".
  router.get('/users/me', auth, users.me);
  // HU-11 (Actividad C): revoca el token actual (logout).
  router.post('/users/logout', auth, users.logout);
  router.get('/users/:id', users.getUserById);
  router.post(
    '/users/:id/balance',
    auth,
    requireOwnerOrAdmin('id'),
    validateRequest(addBalanceSchema),
    users.addBalance
  );

  // Salas - la creación es solo para ADMIN (HU-05 + HU-09)
  router.post(
    '/rooms',
    auth,
    requireRole(['ADMIN']),
    validateRequest(createRoomSchema),
    rooms.createRoom
  );
  router.get('/rooms', rooms.getAllRooms);
  router.get('/rooms/:id', rooms.getRoomById);
  router.post(
    '/rooms/:id/check-availability',
    validateRequest(checkAvailabilitySchema),
    rooms.checkAvailability
  );

  // Reservas - requieren estar autenticado; el historial es solo del dueño o un ADMIN
  router.post(
    '/reservations',
    auth,
    validateRequest(bookRoomSchema),
    reservations.bookRoom
  );
  router.get(
    '/users/:userId/reservations',
    auth,
    requireOwnerOrAdmin('userId'),
    reservations.getUserReservations
  );
  router.delete('/reservations/:id', auth, reservations.cancelReservation);
  // HU-11 (Actividad A): avanzar el estado es una operación de staff (ADMIN).
  router.patch(
    '/reservations/:id/status',
    auth,
    requireRole(['ADMIN']),
    validateRequest(advanceReservationStatusSchema),
    reservations.advanceStatus
  );

  // HU-12: calendario público, eventos en vivo y simulador.
  const live = new LiveController(
    services.reservationService,
    services.events,
    new Simulator(services)
  );
  router.get('/reservations', live.calendar);
  router.get('/events', live.stream);
  if (options.enableSimulator) {
    router.post(
      '/sim/run',
      (req, _res, next) => {
        // Cuerpo vacío = parámetros por defecto.
        req.body ??= {};
        next();
      },
      validateRequest(simulationSchema),
      live.simulate
    );
    // Tráfico continuo, estado y reinicio del calendario de demostración.
    router.post(
      '/sim/auto',
      (req, _res, next) => {
        req.body ??= {};
        next();
      },
      validateRequest(autoSimulationSchema),
      live.autoStart
    );
    router.post('/sim/auto/stop', live.autoStop);
    router.get('/sim/auto', live.autoStatus);
    router.post('/sim/reset', live.reset);
  }

  return router;
};
