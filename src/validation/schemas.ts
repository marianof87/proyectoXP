/**
 * HU-10: esquemas Zod para el body de cada ruta que escribe datos.
 *
 * Validan y sanean forma/tipo en el borde HTTP (trim, coerción de números,
 * rechazo de campos no declarados con `.strict()`). Las reglas de negocio
 * -formato de email, fuerza de contraseña, capacidad positiva, saldo
 * suficiente...- siguen viviendo en los servicios (UserService, RoomService,
 * ReservationService), que ya las prueban las features 01, 05, 06 y 08: este
 * archivo no las duplica.
 *
 * `login` es la excepción a "validar todo lo posible": no exige formato de
 * email, porque UserService.login debe devolver el mismo error genérico
 * tanto si el email no existe como si el formato es inválido (HU-08).
 */

import { z } from 'zod';

export const registerSchema = z
  .object({
    email: z.string().trim().min(1),
    name: z.string().trim().min(1),
    password: z.string().min(1),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().min(1),
    password: z.string().min(1),
  })
  .strict();

export const addBalanceSchema = z
  .object({
    amount: z.number(),
  })
  .strict();

export const createRoomSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().max(500).optional(),
    capacity: z.coerce.number(),
    hourlyRate: z.coerce.number(),
  })
  .strict();

export const checkAvailabilitySchema = z
  .object({
    startDate: z.string().min(1),
    endDate: z.string().min(1),
  })
  .strict();

export const bookRoomSchema = z
  .object({
    userId: z.coerce.number(),
    roomId: z.coerce.number(),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
  })
  .strict();

/**
 * HU-11: solo los dos estados a los que esta ruta puede avanzar. CANCELLED
 * sigue sin pasar por aquí (ver ReservationService.ts): cancelar es el
 * camino ya probado por HU-06, con su propio reembolso.
 */
export const advanceReservationStatusSchema = z
  .object({
    status: z.enum(['IN_PROGRESS', 'COMPLETED']),
  })
  .strict();

/** HU-12: parámetros del simulador, con topes para no saturar el servidor. */
export const simulationSchema = z
  .object({
    operations: z.coerce.number().int().min(1).max(500).default(50),
    concurrency: z.coerce.number().int().min(1).max(50).default(10),
    seed: z.coerce.number().int().min(0).optional(),
    delayMs: z.coerce.number().int().min(0).max(300).default(0),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

/** HU-12: tráfico continuo en vivo (llegadas aleatorias). */
export const autoSimulationSchema = z
  .object({
    ratePerSec: z.coerce.number().min(0.5).max(20).default(3),
    maxSeconds: z.coerce.number().int().min(5).max(600).default(120),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();
