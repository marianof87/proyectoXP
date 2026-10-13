/**
 * Entorno de las pruebas unitarias: bcrypt con el mínimo de rondas.
 * La seguridad del hash no es lo que se prueba aquí y cada hash con 10
 * rondas cuesta ~70 ms; en producción se mantiene el valor de BCRYPT_ROUNDS.
 */
process.env.BCRYPT_ROUNDS = '4';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
