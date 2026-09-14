import { Given, When, Then, Before, After, DataTable } from '@cucumber/cucumber';
import { PrismaClient } from '@prisma/client';
import { UserService, RegisterUserInput } from '../../src/services/UserService';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const userService = new UserService();

// Store test data
interface TestContext {
  lastRegistrationResult?: any;
  lastError?: Error;
  lastUser?: any;
  users: Map<string, any>;
}

let context: TestContext = {
  users: new Map(),
};

Before(async function () {
  context = {
    users: new Map(),
  };
});

After(async function () {
  // Clean up test data
  await prisma.user.deleteMany({});
});

// User Registration Steps

Given('there are no users with email {string}', async (email: string) => {
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });
  if (existingUser) {
    await prisma.user.delete({ where: { email } });
  }
});

When(
  'a user registers with:',
  async function (dataTable: DataTable) {
    const data = dataTable.rowsHashAsObject() as any;
    const input: RegisterUserInput = {
      email: data.email,
      name: data.name,
      password: data.password,
    };

    try {
      const result = await userService.registerUser(input);
      context.lastRegistrationResult = result;
      context.lastUser = result;
      context.users.set(result.email, result);
    } catch (error) {
      context.lastError = error as Error;
    }
  }
);

Then('the user should be created successfully', async function () {
  if (context.lastError) {
    throw context.lastError;
  }
  if (!context.lastRegistrationResult) {
    throw new Error('User was not created');
  }
});

Then('the user should have role {string}', async function (expectedRole: string) {
  if (context.lastRegistrationResult?.role !== expectedRole) {
    throw new Error(
      `Expected role ${expectedRole}, got ${context.lastRegistrationResult?.role}`
    );
  }
});

Then('the user should have balance {int}', async function (expectedBalance: number) {
  if (context.lastRegistrationResult?.balance !== expectedBalance) {
    throw new Error(
      `Expected balance ${expectedBalance}, got ${context.lastRegistrationResult?.balance}`
    );
  }
});

Given('a user exists with email {string}', async function (email: string) {
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });
  if (!existingUser) {
    await prisma.user.create({
      data: {
        email,
        name: 'Test User',
        password: await bcrypt.hash('TestPass123!', 10),
        role: 'USER',
        balance: 0,
      },
    });
  }
});

When(
  'a user tries to register with email {string} and password {string}',
  async function (email: string, password: string) {
    try {
      await userService.registerUser({
        email,
        name: 'Test User',
        password,
      });
    } catch (error) {
      context.lastError = error as Error;
    }
  }
);

Then('the registration should fail', function () {
  if (!context.lastError) {
    throw new Error('Expected registration to fail but it succeeded');
  }
});

Then('the error message should be {string}', function (expectedMessage: string) {
  if (context.lastError?.message !== expectedMessage) {
    throw new Error(
      `Expected error message "${expectedMessage}", got "${context.lastError?.message}"`
    );
  }
});
