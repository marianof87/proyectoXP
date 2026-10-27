/** Pruebas de integración contra PostgreSQL real (requieren DATABASE_URL). */
const base = require('./jest.config');

module.exports = {
  ...base,
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/*.integration.test.ts'],
  collectCoverage: false,
  coverageThreshold: undefined,
  // Un solo proceso: comparten la misma base de datos.
  maxWorkers: 1,
  testTimeout: 30_000,
};
