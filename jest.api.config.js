/** Pruebas de API (HTTP real sobre repositorios en memoria): tests/api. */
const base = require('./jest.config');

module.exports = {
  ...base,
  roots: ['<rootDir>/tests/api'],
  collectCoverage: false,
  coverageThreshold: undefined,
};
