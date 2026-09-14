/** Feature 05 - Gestión de las salas del coworking (HU-05). */

import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import assert from 'assert';

import { MundoCoworking } from '../support/world';

Given(
  'que no existe ninguna sala con el nombre {string}',
  async function (this: MundoCoworking, nombreSala: string) {
    const existente = await this.uow.rooms.findByName(nombreSala);
    assert.strictEqual(
      existente,
      null,
      `Se esperaba que no existiera ninguna sala llamada ${nombreSala}`
    );
  }
);

Given(
  'que la sala {string} ya existe',
  async function (this: MundoCoworking, nombreSala: string) {
    await this.asegurarSala(nombreSala);
  }
);

Given(
  'que hay {int} salas disponibles',
  async function (this: MundoCoworking, cantidad: number) {
    for (let i = 1; i <= cantidad; i++) {
      await this.asegurarSala(`Sala ${i}`);
    }
  }
);

When(
  'el administrador crea una sala con:',
  async function (this: MundoCoworking, tabla: DataTable) {
    const datos = tabla.rowsHash();

    this.ultimaSala = await this.capturar(() =>
      this.services.roomService.createRoom({
        name: datos['nombre'],
        description: datos['descripción'] ?? null,
        capacity: Number.parseInt(datos['capacidad'], 10),
        hourlyRate: Number.parseFloat(datos['tarifa']),
      })
    );

    if (this.ultimaSala) {
      this.salas.set(this.ultimaSala.name, this.ultimaSala);
    }
  }
);

When(
  'el administrador intenta crear una sala con el nombre {string}',
  async function (this: MundoCoworking, nombreSala: string) {
    await this.capturar(() =>
      this.services.roomService.createRoom({
        name: nombreSala,
        capacity: 4,
        hourlyRate: 100,
      })
    );
  }
);

When(
  'el administrador intenta crear la sala {string} con capacidad {int}',
  async function (this: MundoCoworking, nombreSala: string, capacidad: number) {
    await this.capturar(() =>
      this.services.roomService.createRoom({
        name: nombreSala,
        capacity: capacidad,
        hourlyRate: 100,
      })
    );
  }
);

// Lo usa también la feature 07 (rendimiento): se define una sola vez aquí.
When(
  'el administrador solicita el listado de todas las salas',
  async function (this: MundoCoworking) {
    const inicio = Date.now();
    this.ultimoListadoSalas = await this.capturar(() =>
      this.services.roomService.getAllRooms()
    );
    this.ultimaDuracionMs = Date.now() - inicio;
  }
);

Then('la sala debe crearse correctamente', function (this: MundoCoworking) {
  if (this.ultimoError) throw this.ultimoError;
  assert.ok(this.ultimaSala, 'La sala no se creó');
});

Then(
  'la sala {string} debe estar disponible',
  async function (this: MundoCoworking, nombreSala: string) {
    const sala = await this.uow.rooms.findByName(nombreSala);
    assert.ok(sala, `La sala ${nombreSala} no existe`);
    assert.strictEqual(sala.available, true, `La sala ${nombreSala} no está disponible`);
  }
);

Then(
  'la respuesta debe contener {int} salas',
  function (this: MundoCoworking, cantidadEsperada: number) {
    if (this.ultimoError) throw this.ultimoError;
    assert.ok(this.ultimoListadoSalas, 'No se obtuvo ningún listado de salas');
    assert.strictEqual(this.ultimoListadoSalas.length, cantidadEsperada);
  }
);

Then(
  'cada sala debe incluir id, nombre, capacidad y tarifa por hora',
  function (this: MundoCoworking) {
    assert.ok(this.ultimoListadoSalas?.length, 'No se encontró ninguna sala');

    for (const sala of this.ultimoListadoSalas) {
      assert.ok(sala.id, 'Falta el id de la sala');
      assert.ok(sala.name, 'Falta el nombre de la sala');
      assert.ok(sala.capacity, 'Falta la capacidad de la sala');
      assert.notStrictEqual(sala.hourlyRate, undefined, 'Falta la tarifa por hora');
    }
  }
);
