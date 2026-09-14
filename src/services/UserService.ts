/**
 * HU-01 Registro, HU-02 Balance, HU-08 Seguridad.
 *
 * Lógica de negocio pura: recibe el repositorio por constructor, así que no
 * conoce ni Prisma ni Express.
 */

import bcrypt from 'bcrypt';

import { toUserResponse, UserResponse } from '../models';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../models/errors';
import { IUserRepository } from '../repositories/interfaces';

export interface RegisterUserInput {
  email: string;
  name: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** Registro de un intento de acceso fallido (HU-08). */
export interface FailedLoginAttempt {
  email: string;
  timestamp: Date;
  reason: 'UNKNOWN_EMAIL' | 'WRONG_PASSWORD';
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export class UserService {
  /**
   * Bitácora en memoria de intentos fallidos. Se mantiene simple a
   * propósito (KISS): cubre el criterio "los intentos fallidos se registran"
   * sin introducir todavia una tabla de auditoria.
   */
  private readonly failedLoginAttempts: FailedLoginAttempt[] = [];

  constructor(private readonly users: IUserRepository) {}

  async registerUser(input: RegisterUserInput): Promise<UserResponse> {
    this.validateRegistration(input);

    const existingUser = await this.users.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    const password = await bcrypt.hash(input.password, this.bcryptRounds());

    const user = await this.users.create({
      email: input.email,
      name: input.name,
      password,
      role: 'USER',
      balance: 0,
    });

    return toUserResponse(user);
  }

  async getUserById(id: number): Promise<UserResponse | null> {
    const user = await this.users.findById(id);
    return user ? toUserResponse(user) : null;
  }

  async addBalance(userId: number, amount: number): Promise<UserResponse> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError('Amount must be positive');
    }

    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return toUserResponse(await this.users.incrementBalance(userId, amount));
  }

  /**
   * HU-08: devuelve el mismo mensaje tanto si el email no existe como si la
   * contraseña es incorrecta, para no revelar qué cuentas están registradas.
   */
  async login(input: LoginInput): Promise<UserResponse> {
    const user = await this.users.findByEmail(input.email);

    if (!user) {
      this.recordFailedLogin(input.email, 'UNKNOWN_EMAIL');
      throw new UnauthorizedError('Invalid credentials');
    }

    const passwordMatches = await this.verifyPassword(
      input.password,
      user.password
    );

    if (!passwordMatches) {
      this.recordFailedLogin(input.email, 'WRONG_PASSWORD');
      throw new UnauthorizedError('Invalid credentials');
    }

    return toUserResponse(user);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /** Intentos fallidos registrados, opcionalmente filtrados por email. */
  getFailedLoginAttempts(email?: string): FailedLoginAttempt[] {
    if (email === undefined) return [...this.failedLoginAttempts];
    return this.failedLoginAttempts.filter((a) => a.email === email);
  }

  private recordFailedLogin(
    email: string,
    reason: FailedLoginAttempt['reason']
  ): void {
    const attempt: FailedLoginAttempt = { email, timestamp: new Date(), reason };
    this.failedLoginAttempts.push(attempt);
    console.warn(
      `[security] Failed login attempt for "${email}" (${reason}) at ${attempt.timestamp.toISOString()}`
    );
  }

  /** Validación de entrada (HU-08: "se validan todos los inputs"). */
  private validateRegistration(input: RegisterUserInput): void {
    if (!EMAIL_PATTERN.test(input.email)) {
      throw new ValidationError('Invalid email format');
    }
    if (input.name.trim().length === 0) {
      throw new ValidationError('Name is required');
    }
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      );
    }
  }

  private bcryptRounds(): number {
    const parsed = Number.parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10);
    return Number.isNaN(parsed) ? 10 : parsed;
  }
}
