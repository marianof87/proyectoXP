/** Pruebas unitarias de RoomService (HU-05). */

import {
  InMemoryReservationRepository,
  InMemoryRoomRepository,
} from '../../src/repositories/InMemoryRepositories';
import { ConflictError, ValidationError } from '../../src/models/errors';
import { RoomService } from '../../src/services/RoomService';

const at = (hour: number): Date =>
  new Date(`2026-10-20T${String(hour).padStart(2, '0')}:00:00.000Z`);

describe('RoomService', () => {
  let rooms: InMemoryRoomRepository;
  let reservations: InMemoryReservationRepository;
  let roomService: RoomService;

  const validRoom = { name: 'Sala A', capacity: 4, hourlyRate: 100 };

  beforeEach(() => {
    rooms = new InMemoryRoomRepository();
    reservations = new InMemoryReservationRepository();
    roomService = new RoomService(rooms, reservations);
  });

  describe('createRoom', () => {
    it('crea la sala disponible por defecto', async () => {
      const room = await roomService.createRoom(validRoom);

      expect(room).toMatchObject({ name: 'Sala A', available: true });
    });

    it('guarda description como null si no se indica', async () => {
      const room = await roomService.createRoom(validRoom);
      expect(room.description).toBeNull();
    });

    it('rechaza un nombre duplicado', async () => {
      await roomService.createRoom(validRoom);

      await expect(roomService.createRoom(validRoom)).rejects.toThrow(
        ConflictError
      );
      await expect(roomService.createRoom(validRoom)).rejects.toThrow(
        'Room name already exists'
      );
    });

    it.each([0, -1, 2.5])('rechaza una capacidad invalida (%s)', async (capacity) => {
      await expect(
        roomService.createRoom({ ...validRoom, capacity })
      ).rejects.toThrow(ValidationError);
    });

    it('rechaza una tarifa negativa', async () => {
      await expect(
        roomService.createRoom({ ...validRoom, hourlyRate: -10 })
      ).rejects.toThrow('Hourly rate cannot be negative');
    });

    it('rechaza un nombre vacio', async () => {
      await expect(
        roomService.createRoom({ ...validRoom, name: '  ' })
      ).rejects.toThrow('Room name is required');
    });
  });

  describe('getAllRooms / getRoomById', () => {
    it('lista todas las salas creadas', async () => {
      await roomService.createRoom(validRoom);
      await roomService.createRoom({ ...validRoom, name: 'Sala B' });

      await expect(roomService.getAllRooms()).resolves.toHaveLength(2);
    });

    it('devuelve lista vacia si no hay salas', async () => {
      await expect(roomService.getAllRooms()).resolves.toEqual([]);
    });

    it('devuelve null para un id inexistente', async () => {
      await expect(roomService.getRoomById(999)).resolves.toBeNull();
    });
  });

  describe('checkRoomAvailability', () => {
    const bookSlot = async (roomId: number, from: number, to: number) => {
      await reservations.create({
        userId: 1,
        roomId,
        startDate: at(from),
        endDate: at(to),
        status: 'CONFIRMED',
        totalCost: 100,
      });
    };

    it('esta libre si no hay reservas', async () => {
      const room = await roomService.createRoom(validRoom);

      await expect(
        roomService.checkRoomAvailability(room.id, at(9), at(11))
      ).resolves.toBe(true);
    });

    it('esta ocupada si una reserva se solapa', async () => {
      const room = await roomService.createRoom(validRoom);
      await bookSlot(room.id, 9, 11);

      await expect(
        roomService.checkRoomAvailability(room.id, at(10), at(12))
      ).resolves.toBe(false);
    });

    it('permite reservas contiguas: 11:00 no choca con 09:00-11:00', async () => {
      const room = await roomService.createRoom(validRoom);
      await bookSlot(room.id, 9, 11);

      await expect(
        roomService.checkRoomAvailability(room.id, at(11), at(13))
      ).resolves.toBe(true);
    });

    it('ignora las reservas canceladas', async () => {
      const room = await roomService.createRoom(validRoom);
      const reservation = await reservations.create({
        userId: 1,
        roomId: room.id,
        startDate: at(9),
        endDate: at(11),
        status: 'CONFIRMED',
        totalCost: 100,
      });
      await reservations.updateStatus(reservation.id, 'CANCELLED');

      await expect(
        roomService.checkRoomAvailability(room.id, at(9), at(11))
      ).resolves.toBe(true);
    });

    it('no confunde las reservas de otra sala', async () => {
      const roomA = await roomService.createRoom(validRoom);
      const roomB = await roomService.createRoom({ ...validRoom, name: 'Sala B' });
      await bookSlot(roomA.id, 9, 11);

      await expect(
        roomService.checkRoomAvailability(roomB.id, at(9), at(11))
      ).resolves.toBe(true);
    });
  });
});
