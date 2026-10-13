/**
 * HU-12: limitador de tasa (rate limiting) de ventana fija, por cliente.
 *
 * Cada clave (por defecto la IP) tiene un contador que se reinicia al vencer
 * la ventana. Superado el máximo se responde 429 con `Retry-After`. Se
 * implementa a mano (sin dependencias) para que se vea el mecanismo; el estado
 * vive en el proceso, así que con varias réplicas cada una limita por separado.
 */

import { NextFunction, Request, RequestHandler, Response } from 'express';

export interface RateLimiterOptions {
  /** Duración de la ventana en milisegundos. */
  windowMs: number;
  /** Peticiones permitidas por clave y ventana. */
  max: number;
  /** Cómo identificar al cliente (por defecto, su IP). */
  keyFn?: (req: Request) => string;
  /** Reloj inyectable para las pruebas. */
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export const createRateLimiter = (options: RateLimiterOptions): RequestHandler => {
  const { windowMs, max } = options;
  const now = options.now ?? Date.now;
  const keyFn = options.keyFn ?? ((req: Request) => req.ip ?? 'unknown');
  const buckets = new Map<string, Bucket>();
  let lastSweep = now();

  return (req: Request, res: Response, next: NextFunction): void => {
    const current = now();

    // Barrido periódico para que el mapa no crezca sin límite.
    if (current - lastSweep >= windowMs) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= current) buckets.delete(key);
      }
      lastSweep = current;
    }

    const key = keyFn(req);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      bucket = { count: 0, resetAt: current + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - current) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'Too many requests', retryAfter });
      return;
    }
    next();
  };
};

export interface RateLimitConfig {
  /** Límite general de /api. */
  general: Pick<RateLimiterOptions, 'windowMs' | 'max'>;
  /** Límite más estricto para login/registro (fuerza bruta). */
  auth: Pick<RateLimiterOptions, 'windowMs' | 'max'>;
}

/** Lee la configuración del entorno; `RATE_LIMIT_ENABLED=false` lo apaga. */
export const rateLimitConfigFromEnv = (
  env: NodeJS.ProcessEnv = process.env
): RateLimitConfig | undefined => {
  if (env.RATE_LIMIT_ENABLED === 'false') return undefined;
  const int = (value: string | undefined, fallback: number): number => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const windowMs = int(env.RATE_LIMIT_WINDOW_MS, 60_000);
  return {
    general: { windowMs, max: int(env.RATE_LIMIT_MAX, 300) },
    auth: { windowMs, max: int(env.RATE_LIMIT_AUTH_MAX, 20) },
  };
};
