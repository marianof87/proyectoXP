import { UserService } from '../../src/services/UserService';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

// Mock Prisma
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  })),
}));

// Mock bcrypt
jest.mock('bcrypt');

describe('UserService', () => {
  let userService: UserService;
  let mockPrisma: any;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create a new instance of UserService for each test
    userService = new UserService();

    // Get the mocked Prisma client
    mockPrisma = new PrismaClient();
  });

  describe('registerUser', () => {
    it('should successfully register a new user', async () => {
      // Arrange
      const input = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'SecurePass123!',
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      (mockPrisma.user.create as jest.Mock).mockResolvedValue({
        id: 1,
        email: input.email,
        name: input.name,
        password: 'hashedPassword',
        role: 'USER',
        balance: 0,
      });

      // Act
      const result = await userService.registerUser(input);

      // Assert
      expect(result).toEqual({
        id: 1,
        email: input.email,
        name: input.name,
        role: 'USER',
        balance: 0,
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: input.email,
          name: input.name,
        }),
      });
    });

    it('should throw error when email already exists', async () => {
      // Arrange
      const input = {
        email: 'existing@example.com',
        name: 'Test User',
        password: 'SecurePass123!',
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        email: input.email,
      });

      // Act & Assert
      await expect(userService.registerUser(input)).rejects.toThrow(
        'Email already registered'
      );
    });
  });

  describe('addBalance', () => {
    it('should successfully add positive balance', async () => {
      // Arrange
      (mockPrisma.user.update as jest.Mock).mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        password: 'hash',
        role: 'USER',
        balance: 500,
      });

      // Act
      const result = await userService.addBalance(1, 500);

      // Assert
      expect(result.balance).toBe(500);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          balance: {
            increment: 500,
          },
        },
      });
    });

    it('should throw error when trying to add negative balance', async () => {
      // Act & Assert
      await expect(userService.addBalance(1, -100)).rejects.toThrow(
        'Amount must be positive'
      );
    });
  });

  describe('verifyPassword', () => {
    it('should return true for matching password', async () => {
      // Arrange
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      // Act
      const result = await userService.verifyPassword('password', 'hashedPassword');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      // Arrange
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      // Act
      const result = await userService.verifyPassword(
        'wrongPassword',
        'hashedPassword'
      );

      // Assert
      expect(result).toBe(false);
    });
  });
});
