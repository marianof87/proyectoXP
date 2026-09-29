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
