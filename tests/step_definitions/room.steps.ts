import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { PrismaClient } from '@prisma/client';
import { RoomService } from '../../src/services/RoomService';

const prisma = new PrismaClient();
const roomService = new RoomService();

interface TestContext {
  lastRoomCreated?: any;
  lastError?: Error;
  lastRoomList?: any[];
  rooms: Map<string, any>;
}

let context: TestContext = {
  rooms: new Map(),
};

// Room Management Steps

Given('no room exists with name {string}', async (roomName: string) => {
  const existingRoom = await prisma.room.findUnique({
    where: { name: roomName },
  });
  if (existingRoom) {
    await prisma.room.delete({ where: { name: roomName } });
  }
});

When(
  'admin creates a room with:',
  async function (dataTable: DataTable) {
    const data = dataTable.rowsHashAsObject() as any;

    try {
      const result = await roomService.createRoom({
        name: data.name,
        description: data.description,
        capacity: parseInt(data.capacity),
        hourlyRate: parseFloat(data.hourlyRate),
      });
      context.lastRoomCreated = result;
      context.rooms.set(result.name, result);
    } catch (error) {
      context.lastError = error as Error;
    }
  }
);

Then('the room should be created successfully', function () {
  if (context.lastError) {
    throw context.lastError;
  }
  if (!context.lastRoomCreated) {
    throw new Error('Room was not created');
  }
});

Then('room {string} should be available', async function (roomName: string) {
  const room = context.rooms.get(roomName);
  if (!room || !room.available) {
    throw new Error(`Room ${roomName} is not available`);
  }
});

Given('room {string} already exists', async function (roomName: string) {
  const existingRoom = await prisma.room.findUnique({
    where: { name: roomName },
  });
  if (!existingRoom) {
    await prisma.room.create({
      data: {
        name: roomName,
        capacity: 4,
        hourlyRate: 100,
        available: true,
      },
    });
  }
  context.rooms.set(roomName, existingRoom);
});

When(
  'admin tries to create a room with name {string}',
  async function (roomName: string) {
    try {
      await roomService.createRoom({
        name: roomName,
        capacity: 4,
        hourlyRate: 100,
      });
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

Given('there are {int} rooms available', async function (roomCount: number) {
  // Clear existing rooms
  await prisma.room.deleteMany({});

  // Create rooms
  for (let i = 1; i <= roomCount; i++) {
    await prisma.room.create({
      data: {
        name: `Sala ${i}`,
        capacity: 4,
        hourlyRate: 100,
        available: true,
      },
    });
  }
});

When('admin requests the list of all rooms', async function () {
  try {
    const rooms = await roomService.getAllRooms();
    context.lastRoomList = rooms;
  } catch (error) {
    context.lastError = error as Error;
  }
});

Then(
  'the response should contain {int} rooms',
  async function (expectedCount: number) {
    if (!context.lastRoomList || context.lastRoomList.length !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} rooms, got ${context.lastRoomList?.length || 0}`
      );
    }
  }
);

Then(
  'each room should have id, name, capacity, and hourlyRate',
  function () {
    if (!context.lastRoomList || context.lastRoomList.length === 0) {
      throw new Error('No rooms found');
    }

    for (const room of context.lastRoomList) {
      if (!room.id || !room.name || !room.capacity || room.hourlyRate === undefined) {
        throw new Error('Room object missing required fields');
      }
    }
  }
);
