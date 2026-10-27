/** Punto de entrada de la API REST. */

import dotenv from 'dotenv';

dotenv.config();

import { AppOptions, createApp } from './app';
import { createPrismaServices } from './container';
import { disconnectPrisma, getPrismaClient } from './db';
import { createHttpMetrics, createRuntimeMetrics } from './metrics/runtime';
import { MonitorService } from './monitor/MonitorService';
import { createPostgresStats } from './monitor/postgresStats';
import { rateLimitConfigFromEnv } from './middleware/rateLimiter';
import { seedDemoAccounts } from './sim/Simulator';
import { PasswordPoolManager, resolveThreadCount } from './workers/passwordPool';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);

// HU-13: el pool de hilos carga el worker compilado (.js); con ts-node
// (`npm run dev`) no existe, así que ahí se sigue con bcrypt sobre libuv.
const runningCompiled = __filename.endsWith('.js');
const workerThreads = runningCompiled
  ? resolveThreadCount(process.env.WORKER_THREADS)
  : 0;
const passwordPool = new PasswordPoolManager(workerThreads);

const services = createPrismaServices(passwordPool.hasher);
const enableSimulator = process.env.ENABLE_SIMULATOR === 'true';

let metrics: AppOptions['metrics'];
if (process.env.ENABLE_METRICS === 'true') {
  const http = createHttpMetrics();
  const monitor = new MonitorService({
    runtime: createRuntimeMetrics({
      http,
      pool: () => passwordPool.view(),
      poolPurpose: 'bcrypt (registro y login)',
    }),
    db: createPostgresStats(getPrismaClient()),
  });
  metrics = {
    http,
    monitor,
    // Cambiar el tamaño del pool desde el monitor es una función de demo:
    // solo con el simulador habilitado y con el código compilado.
    threads:
      enableSimulator && runningCompiled
        ? {
            current: () => passwordPool.threads,
            resize: (n: number) => passwordPool.resize(n),
          }
        : undefined,
  };
}

const app = createApp(services, {
  rateLimit: rateLimitConfigFromEnv(),
  enableSimulator,
  metrics,
  // Solo detrás de un proxy de confianza (o en la demo con IPs virtuales):
  // con esto el rate limit usa la IP de X-Forwarded-For.
  trustProxy: process.env.TRUST_PROXY === 'true',
  // Botones de escenarios en el monitor: solo en modo demostración.
  simulatorControlUrl: enableSimulator ? process.env.SIM_CONTROL_URL : undefined,
});

const startServer = async (): Promise<void> => {
  try {
    await getPrismaClient().$connect();
    console.log('Database connected successfully');

    if (enableSimulator) {
      await seedDemoAccounts(
        services,
        process.env.DEMO_ADMIN_PASSWORD ?? 'Admin1234!'
      );
      console.log('Simulator enabled: demo accounts and rooms seeded');
    }

    metrics?.monitor.start();

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      console.log(
        passwordPool.threads > 0
          ? `Hash de contraseñas en ${passwordPool.threads} worker threads`
          : 'Hash de contraseñas en el pool de hilos de libuv'
      );
      if (metrics) console.log(`Monitor de recursos en http://localhost:${port}/monitor/`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

const shutdown = async (): Promise<void> => {
  metrics?.monitor.stop();
  await passwordPool?.destroy();
  await disconnectPrisma();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer();

export default app;
