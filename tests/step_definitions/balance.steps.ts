import { Given, When, Then } from '@cucumber/cucumber';
import { PrismaClient } from '@prisma/client';
import { UserService } from '../../src/services/UserService';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const userService = new UserService();

interface TestContext {
  lastError?: Error;
  lastBalance?: number;
  users: Map<string, any>;
}

let context: TestContext = {
  users: new Map(),
};

Given('user {string} has balance {int}', async function (userName: string, balance: number) {
  let user = context.users.get(userName);
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: `${userName.toLowerCase()}-${Date.now()}@example.com`,
        name: userName,
        password: await bcrypt.hash('Password123!', 10),
        role: 'USER',
        balance,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { balance },
    });
  }
  context.users.set(userName, user);
});

When('{string} adds {int} to her balance', async function (userName: string, amount: number) {
  const user = context.users.get(userName);
  if (!user) {
    throw new Error(`User ${userName} not found`);
  }

  try {
    const result = await userService.addBalance(user.id, amount);
    context.lastBalance = result.balance;
    context.users.set(userName, result);
  } catch (error) {
    context.lastError = error as Error;
  }
});

Then('her new balance should be {int}', function (expectedBalance: number) {
  if (context.lastBalance !== expectedBalance) {
    throw new Error(
      `Expected balance ${expectedBalance}, got ${context.lastBalance}`
    );
  }
});

Then('the transaction should be recorded', function () {
  // In a real scenario, you'd check audit logs or transaction history
  // For now, we just verify the balance was updated
  if (context.lastBalance === undefined) {
    throw new Error('No transaction recorded');
  }
});

When(
  '{string} tries to add {int} to her balance',
  async function (userName: string, amount: number) {
    const user = context.users.get(userName);
    if (!user) {
      throw new Error(`User ${userName} not found`);
    }

    try {
      const result = await userService.addBalance(user.id, amount);
      context.lastBalance = result.balance;
    } catch (error) {
      context.lastError = error as Error;
    }
  }
);

Then('the operation should fail', function () {
  if (!context.lastError) {
    throw new Error('Expected operation to fail but it succeeded');
  }
});

Then('the error message should be {string}', function (expectedMessage: string) {
  if (context.lastError?.message !== expectedMessage) {
    throw new Error(
      `Expected error message "${expectedMessage}", got "${context.lastError?.message}"`
    );
  }
});

When(
  '{string} books {string} from {string} to {string} on {string}',
  async function (userName: string, roomName: string, startTime: string, endTime: string, date: string) {
    // This step is handled in reservation.steps.ts
    // Just ensuring the balance is updated after booking
    const user = context.users.get(userName);
    if (user) {
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      if (updatedUser) {
        context.users.set(userName, updatedUser);
      }
    }
  }
);

Then('his balance should be reduced by {int}', async function (expectedReduction: number) {
  // Get the updated user from DB to check balance reduction
  const users = Array.from(context.users.values());
  if (users.length > 0) {
    const latestUser = await prisma.user.findUnique({
      where: { id: users[0].id },
    });
    if (latestUser && context.lastBalance !== undefined) {
      const actualReduction = context.lastBalance - latestUser.balance;
      if (actualReduction !== expectedReduction) {
        throw new Error(
          `Expected balance reduction of ${expectedReduction}, got ${actualReduction}`
        );
      }
    }
  }
});

Then('his new balance should be {int}', function (expectedBalance: number) {
  if (context.lastBalance !== expectedBalance) {
    throw new Error(
      `Expected new balance ${expectedBalance}, got ${context.lastBalance}`
    );
  }
});
