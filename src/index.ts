/** Punto de entrada de la API REST. */

import dotenv from 'dotenv';

dotenv.config();

import { createApp } from './app';
import { createPrismaServices } from './container';
import { disconnectPrisma, getPrismaClient } from './db';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);

const app = createApp(createPrismaServices());

const startServer = async (): Promise<void> => {
  try {
    await getPrismaClient().$connect();
    console.log('Database connected successfully');

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

const shutdown = async (): Promise<void> => {
  await disconnectPrisma();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer();

export default app;
