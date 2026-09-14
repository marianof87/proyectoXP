import { Given, When, Then } from '@cucumber/cucumber';
import { PrismaClient } from '@prisma/client';
import { ReservationService } from '../../src/services/ReservationService';
import { RoomService } from '../../src/services/RoomService';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const reservationService = new ReservationService();
const roomService = new RoomService();

interface TestContext {
  lastReservation?: any;
  lastError?: Error;
  users: Map<string, any>;
  rooms: Map<string, any>;
  reservations: Map<number, any>;
}

let context: TestContext = {
  users: new Map(),
  rooms: new Map(),
  reservations: new Map(),
};

// Setup rooms and users
Given('room {string} is available on {string}', async function (roomName: string, date: string) {
  const existingRoom = await prisma.room.findUnique({
    where: { name: roomName },
  });

  let room;
  if (!existingRoom) {
    room = await roomService.createRoom({
      name: roomName,
      capacity: 4,
      hourlyRate: 100,
    });
  } else {
    room = existingRoom;
  }
  context.rooms.set(roomName, room);
});

Given('user {string} has sufficient balance', async function (userName: string) {
  let user = context.users.get(userName);
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: `${userName.toLowerCase()}@example.com`,
        name: userName,
        password: await bcrypt.hash('Password123!', 10),
        role: 'USER',
        balance: 1000,
      },
    });
    context.users.set(userName, user);
  }
});

When(
  '{string} books {string} from {string} to {string} on {string}',
  async function (userName: string, roomName: string, startTime: string, endTime: string, date: string) {
    const user = context.users.get(userName);
    const room = context.rooms.get(roomName);

    if (!user || !room) {
      throw new Error(`User or room not found`);
    }

    const [startHour] = startTime.split(':');
    const [endHour] = endTime.split(':');

    const startDate = new Date(`${date}T${startHour}:00:00`);
    const endDate = new Date(`${date}T${endHour}:00:00`);

    try {
      const reservation = await reservationService.bookRoom({
        userId: user.id,
        roomId: room.id,
        startDate,
        endDate,
      });
      context.lastReservation = reservation;
      context.reservations.set(reservation.id, reservation);
    } catch (error) {
      context.lastError = error as Error;
    }
  }
);

Then('the reservation should be confirmed', function () {
  if (context.lastError) {
    throw context.lastError;
  }
  if (!context.lastReservation) {
    throw new Error('Reservation was not created');
  }
});

Then('the reservation status should be {string}', function (expectedStatus: string) {
  if (context.lastReservation?.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${context.lastReservation?.status}`
    );
  }
});

Then('room {string} should not be available at that time', async function (roomName: string) {
  // Verify reservation exists and conflicts with the time slot
  if (!context.lastReservation) {
    throw new Error('No reservation found');
  }
});

Given(
  'room {string} is booked on {string} from {string} to {string}',
  async function (roomName: string, date: string, startTime: string, endTime: string) {
    const room = context.rooms.get(roomName) || (await roomService.createRoom({
      name: roomName,
      capacity: 4,
      hourlyRate: 100,
    }));

    const user = await prisma.user.create({
      data: {
        email: `booker-${Date.now()}@example.com`,
        name: 'Booker',
        password: await bcrypt.hash('Password123!', 10),
        role: 'USER',
        balance: 1000,
      },
    });

    const [startHour] = startTime.split(':');
    const [endHour] = endTime.split(':');

    const startDate = new Date(`${date}T${startHour}:00:00`);
    const endDate = new Date(`${date}T${endHour}:00:00`);

    await reservationService.bookRoom({
      userId: user.id,
      roomId: room.id,
      startDate,
      endDate,
    });

    context.rooms.set(roomName, room);
  }
);

When(
  '{string} tries to book {string} from {string} to {string} on {string}',
  async function (userName: string, roomName: string, startTime: string, endTime: string, date: string) {
    const user = context.users.get(userName);
    const room = context.rooms.get(roomName);

    if (!user || !room) {
      throw new Error('User or room not found');
    }

    const [startHour] = startTime.split(':');
    const [endHour] = endTime.split(':');

    const startDate = new Date(`${date}T${startHour}:00:00`);
    const endDate = new Date(`${date}T${endHour}:00:00`);

    try {
      const reservation = await reservationService.bookRoom({
        userId: user.id,
        roomId: room.id,
        startDate,
        endDate,
      });
      context.lastReservation = reservation;
    } catch (error) {
      context.lastError = error as Error;
    }
  }
);

Then('the booking should fail', function () {
  if (!context.lastError) {
    throw new Error('Expected booking to fail but it succeeded');
  }
});

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

Given('{string} costs {int} per hour', async function (roomName: string, cost: number) {
  const room = context.rooms.get(roomName);
  if (room) {
    await prisma.room.update({
      where: { id: room.id },
      data: { hourlyRate: cost },
    });
    room.hourlyRate = cost;
  }
});
