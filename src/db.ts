/**
 * Cliente Prisma único para todo el proceso (patrón singleton).
 *
 * Tipado de verdad: `PrismaClient` se importa del cliente generado, no como
 * `any`, para que los errores de consulta salten en `tsc` y no en producción.
 * Requiere haber ejecutado `npm run prisma:generate`.
 */
import { PrismaClient } from '@prisma/client';

let instance: PrismaClient | undefined;

export const getPrismaClient = (): PrismaClient => {
  if (!instance) {
    instance = new PrismaClient();
  }
  return instance;
};

export const disconnectPrisma = async (): Promise<void> => {
  if (instance) {
    await instance.$disconnect();
    instance = undefined;
  }
};
