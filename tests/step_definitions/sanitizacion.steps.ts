/** Feature 10 - Saneamiento y validación de entradas (HU-10, historia técnica). */

import { Then, When } from '@cucumber/cucumber';
import assert from 'assert';

import { RoomResponse, UserResponse } from '../../src/models';
import { MundoCoworking } from '../support/world';

When(
  'se registra un usuario con un campo {string} no permitido',
  async function (this: MundoCoworking, campo: string) {
    const urlBase = await this.urlBase();
    const respuesta = await fetch(`${urlBase}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'intruso@example.com',
        name: 'Intruso',
        password: 'SecurePass123!',
        [campo]: 'ADMIN',
      }),
    });
    this.ultimoCodigoEstado = respuesta.status;
  }
);

When(
  'se registra un usuario con el nombre {string} con espacios extra',
  async function (this: MundoCoworking, nombreConEspacios: string) {
    const urlBase = await this.urlBase();
    const respuesta = await fetch(`${urlBase}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'saneado@example.com',
        name: nombreConEspacios,
        password: 'SecurePass123!',
      }),
    });
    this.ultimoCodigoEstado = respuesta.status;
    if (respuesta.ok) {
      this.ultimoUsuario = (await respuesta.json()) as UserResponse;
    }
  }
);

Then(
  'el usuario almacenado debe tener el nombre sin espacios extra {string}',
  function (this: MundoCoworking, nombreEsperado: string) {
    if (this.ultimoError) throw this.ultimoError;
    assert.ok(this.ultimoUsuario, 'No se registró ningún usuario');
    assert.strictEqual(this.ultimoUsuario.name, nombreEsperado);
  }
);

/** Crea una sala como `nombreAdmin` con el cuerpo dado, ya autenticado. */
async function crearSalaComoAdmin(
  mundo: MundoCoworking,
  nombreAdmin: string,
  cuerpo: Record<string, unknown>
): Promise<void> {
  const urlBase = await mundo.urlBase();
  const respuesta = await fetch(`${urlBase}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mundo.tokenDe(nombreAdmin)}`,
    },
    body: JSON.stringify(cuerpo),
  });
  mundo.ultimoCodigoEstado = respuesta.status;
  if (respuesta.ok) {
    mundo.ultimaSala = (await respuesta.json()) as RoomResponse;
  }
}

When(
  '{string} intenta crear una sala con una capacidad no numérica',
  async function (this: MundoCoworking, nombreAdmin: string) {
    await crearSalaComoAdmin(this, nombreAdmin, {
      name: 'Sala con Capacidad Inválida',
      capacity: 'muchas',
      hourlyRate: 100,
    });
  }
);

When(
  '{string} intenta crear una sala con una descripción demasiado larga',
  async function (this: MundoCoworking, nombreAdmin: string) {
    await crearSalaComoAdmin(this, nombreAdmin, {
      name: 'Sala con Descripción Larga',
      description: 'x'.repeat(501),
      capacity: 4,
      hourlyRate: 100,
    });
  }
);

When(
  '{string} crea una sala con una descripción con espacios extra',
  async function (this: MundoCoworking, nombreAdmin: string) {
    await crearSalaComoAdmin(this, nombreAdmin, {
      name: 'Sala Saneada',
      description: '   Espacio luminoso   ',
      capacity: 4,
      hourlyRate: 100,
    });
  }
);

Then(
  'la descripción almacenada de la sala no debe tener espacios extra',
  function (this: MundoCoworking) {
    if (this.ultimoError) throw this.ultimoError;
    assert.ok(this.ultimaSala, 'No se creó ninguna sala');
    assert.strictEqual(this.ultimaSala.description, 'Espacio luminoso');
  }
);

When(
  '{string} intenta añadir un importe no numérico a su balance',
  async function (this: MundoCoworking, nombre: string) {
    const urlBase = await this.urlBase();
    const usuario = this.obtenerUsuario(nombre);
    const respuesta = await fetch(
      `${urlBase}/api/users/${usuario.id}/balance`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.tokenDe(nombre)}`,
        },
        body: JSON.stringify({ amount: 'cien' }),
      }
    );
    this.ultimoCodigoEstado = respuesta.status;
  }
);

When(
  '{string} intenta reservar sin indicar la fecha de inicio',
  async function (this: MundoCoworking, nombre: string) {
    const urlBase = await this.urlBase();
    const usuario = this.obtenerUsuario(nombre);
    const sala = this.obtenerSala('Sala para Validación');

    const respuesta = await fetch(`${urlBase}/api/reservations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.tokenDe(nombre)}`,
      },
      body: JSON.stringify({
        userId: usuario.id,
        roomId: sala.id,
        endDate: '2027-01-01T11:00:00.000Z',
      }),
    });
    this.ultimoCodigoEstado = respuesta.status;
  }
);
