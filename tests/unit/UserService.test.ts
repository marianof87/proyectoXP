/**
 * Pruebas unitarias de UserService.
 *
 * Usan el repositorio en memoria en vez de simular Prisma: la versión anterior
 * simulaba `PrismaClient` y comprobaba las llamadas sobre una instancia
 * distinta de la que usaba el servicio, así que no verificaba nada real.
 */

import { InMemoryUserRepository } from '../../src/repositories/InMemoryRepositories';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../src/models/errors';
import { UserService } from '../../src/services/UserService';

describe('UserService', () => {
  let users: InMemoryUserRepository;
  let userService: UserService;

  const validInput = {
    email: 'test@example.com',
    name: 'Test User',
    password: 'SecurePass123!',
  };

  beforeEach(() => {
    users = new InMemoryUserRepository();
    userService = new UserService(users);
  });

  describe('registerUser', () => {
    it('crea el usuario con rol USER y balance 0', async () => {
      const result = await userService.registerUser(validInput);

      expect(result).toEqual({
        id: expect.any(Number),
        email: validInput.email,
        name: validInput.name,
        role: 'USER',
        balance: 0,
      });
    });

    it('nunca expone la contrasena en la respuesta', async () => {
      const result = await userService.registerUser(validInput);
      expect(result).not.toHaveProperty('password');
    });

    it('almacena la contrasena hasheada con bcrypt, no en texto plano', async () => {
      await userService.registerUser(validInput);

      const stored = await users.findByEmail(validInput.email);
      expect(stored?.password).not.toBe(validInput.password);
      expect(stored?.password).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    it('rechaza un email ya registrado', async () => {
      await userService.registerUser(validInput);

      await expect(userService.registerUser(validInput)).rejects.toThrow(
        ConflictError
      );
      await expect(userService.registerUser(validInput)).rejects.toThrow(
        'Email already registered'
      );
    });

    it('rechaza un email con formato invalido', async () => {
      await expect(
        userService.registerUser({ ...validInput, email: 'no-es-un-email' })
      ).rejects.toThrow(ValidationError);
    });

    it('rechaza una contrasena demasiado corta', async () => {
      await expect(
        userService.registerUser({ ...validInput, password: 'corta' })
      ).rejects.toThrow('Password must be at least 8 characters');
    });

    it('rechaza un nombre vacio', async () => {
      await expect(
        userService.registerUser({ ...validInput, name: '   ' })
      ).rejects.toThrow('Name is required');
    });
  });

  describe('getUserById', () => {
    it('devuelve el usuario existente', async () => {
      const created = await userService.registerUser(validInput);
      await expect(userService.getUserById(created.id)).resolves.toMatchObject({
        id: created.id,
        email: validInput.email,
      });
    });

    it('devuelve null si no existe', async () => {
      await expect(userService.getUserById(999)).resolves.toBeNull();
    });
  });

  describe('addBalance', () => {
    it('suma el importe al balance', async () => {
      const user = await userService.registerUser(validInput);

      const result = await userService.addBalance(user.id, 500);

      expect(result.balance).toBe(500);
      expect((await users.findById(user.id))?.balance).toBe(500);
    });

    it('acumula varias recargas', async () => {
      const user = await userService.registerUser(validInput);

      await userService.addBalance(user.id, 300);
      const result = await userService.addBalance(user.id, 200);

      expect(result.balance).toBe(500);
    });

    it.each([0, -100])('rechaza un importe no positivo (%s)', async (amount) => {
      const user = await userService.registerUser(validInput);

      await expect(userService.addBalance(user.id, amount)).rejects.toThrow(
        'Amount must be positive'
      );
    });

    it('falla si el usuario no existe', async () => {
      await expect(userService.addBalance(999, 100)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('login', () => {
    it('devuelve el usuario con credenciales correctas', async () => {
      const created = await userService.registerUser(validInput);

      await expect(
        userService.login({
          email: validInput.email,
          password: validInput.password,
        })
      ).resolves.toMatchObject({ id: created.id });
    });

    it('rechaza una contrasena incorrecta', async () => {
      await userService.registerUser(validInput);

      await expect(
        userService.login({ email: validInput.email, password: 'MalaClave1!' })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('da el mismo mensaje para email desconocido y clave incorrecta', async () => {
      await userService.registerUser(validInput);

      const unknownEmail = userService
        .login({ email: 'nadie@example.com', password: 'loquesea1!' })
        .catch((e: Error) => e.message);
      const wrongPassword = userService
        .login({ email: validInput.email, password: 'MalaClave1!' })
        .catch((e: Error) => e.message);

      expect(await unknownEmail).toBe('Invalid credentials');
      expect(await wrongPassword).toBe('Invalid credentials');
    });

    it('registra los intentos fallidos con su motivo', async () => {
      await userService.registerUser(validInput);

      await expect(
        userService.login({ email: validInput.email, password: 'MalaClave1!' })
      ).rejects.toThrow();
      await expect(
        userService.login({ email: 'nadie@example.com', password: 'x'.repeat(9) })
      ).rejects.toThrow();

      const attempts = userService.getFailedLoginAttempts();
      expect(attempts).toHaveLength(2);
      expect(attempts[0].reason).toBe('WRONG_PASSWORD');
      expect(attempts[1].reason).toBe('UNKNOWN_EMAIL');
    });

    it('no registra nada cuando el login es correcto', async () => {
      await userService.registerUser(validInput);

      await userService.login({
        email: validInput.email,
        password: validInput.password,
      });

      expect(userService.getFailedLoginAttempts()).toHaveLength(0);
    });

    it('filtra los intentos fallidos por email', async () => {
      await userService.registerUser(validInput);
      await userService
        .login({ email: validInput.email, password: 'MalaClave1!' })
        .catch(() => undefined);

      expect(userService.getFailedLoginAttempts(validInput.email)).toHaveLength(1);
      expect(userService.getFailedLoginAttempts('otro@example.com')).toHaveLength(0);
    });
  });

  describe('verifyPassword', () => {
    it('acepta la contrasena original y rechaza otra', async () => {
      await userService.registerUser(validInput);
      const stored = await users.findByEmail(validInput.email);

      expect(
        await userService.verifyPassword(validInput.password, stored!.password)
      ).toBe(true);
      expect(
        await userService.verifyPassword('otraClave1!', stored!.password)
      ).toBe(false);
    });
  });
});
