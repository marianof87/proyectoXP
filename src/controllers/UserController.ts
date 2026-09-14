import { Request, Response, NextFunction } from 'express';
import { UserService, RegisterUserInput } from '../services/UserService';

const userService = new UserService();

export class UserController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: RegisterUserInput = req.body;

      if (!input.email || !input.name || !input.password) {
        res.status(400).json({
          error: 'Missing required fields: email, name, password',
        });
        return;
      }

      const user = await userService.registerUser(input);
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  }

  async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = parseInt(String(id), 10);

      if (isNaN(userId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const user = await userService.getUserById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  }

  async addBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { amount } = req.body;
      const userId = parseInt(String(id), 10);

      if (isNaN(userId) || amount === undefined) {
        res.status(400).json({ error: 'Invalid user ID or amount' });
        return;
      }

      const user = await userService.addBalance(userId, amount);
      res.json(user);
    } catch (error) {
      next(error);
    }
  }
}
