/** Feature 11 - Gestión de sesiones y estados (HU-11, Unidad 5, historia técnica). */

import { Then, When } from '@cucumber/cucumber';
import assert from 'assert';

import { ReservationResponse } from '../../src/models';
import { MundoCoworking } from '../support/world';

// --- Actividad A: máquina de estados ---------------------------------------

async function avanzarEstadoUltimaReserva(
  mundo: MundoCoworking,
  nombreActor: string,
  estadoObjetivo: string
): Promise<void> {
  assert.ok(mundo.ultimaReserva, 'No hay ninguna reserva en este escenario');
  const urlBase = await mundo.urlBase();

  const respuesta = await fetch(
    `${urlBase}/api/reservations/${mundo.ultimaReserva.id}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mundo.tokenDe(nombreActor)}`,
      },
      body: JSON.stringify({ status: estadoObjetivo }),
    }
  );

  mundo.ultimoCodigoEstado = respuesta.status;
  if (respuesta.ok) {
    mundo.ultimaReserva = (await respuesta.json()) as ReservationResponse;
  }
}

When(
  '{string} avanza la última reserva a {string}',
  async function (this: MundoCoworking, actor: string, estado: string) {
    await avanzarEstadoUltimaReserva(this, actor, estado);
  }
);

When(
  '{string} intenta avanzar la última reserva a {string}',
  async function (this: MundoCoworking, actor: string, estado: string) {
    await avanzarEstadoUltimaReserva(this, actor, estado);
  }
);

Then(
  'la reserva debe quedar en el estado {string}',
  function (this: MundoCoworking, estadoEsperado: string) {
    assert.ok(this.ultimaReserva, 'No hay ninguna reserva en este escenario');
    assert.strictEqual(this.ultimaReserva.status, estadoEsperado);
  }
);

// --- Actividad B: idempotencia ----------------------------------------------

async function reservarPorHttp(
  mundo: MundoCoworking,
  nombreUsuario: string,
  nombreSala: string,
  claveIdempotencia: string
): Promise<void> {
  const urlBase = await mundo.urlBase();
  const usuario = mundo.obtenerUsuario(nombreUsuario);
  const sala = mundo.obtenerSala(nombreSala);

  const respuesta = await fetch(`${urlBase}/api/reservations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mundo.tokenDe(nombreUsuario)}`,
      'X-Idempotency-Key': claveIdempotencia,
    },
    body: JSON.stringify({
      userId: usuario.id,
      roomId: sala.id,
      startDate: '2027-02-01T09:00:00.000Z',
      endDate: '2027-02-01T11:00:00.000Z',
    }),
  });

  mundo.ultimoCodigoEstado = respuesta.status;
  if (respuesta.ok) {
    mundo.ultimaReserva = (await respuesta.json()) as ReservationResponse;
  }
}

When(
  '{string} reserva la sala {string} con la clave de idempotencia {string}',
  async function (
    this: MundoCoworking,
    nombre: string,
    nombreSala: string,
    clave: string
  ) {
    await reservarPorHttp(this, nombre, nombreSala, clave);
    this.primeraReservaIdempotente = this.ultimaReserva;
  }
);

When(
  '{string} vuelve a reservar la sala {string} con la misma clave de idempotencia {string}',
  async function (
    this: MundoCoworking,
    nombre: string,
    nombreSala: string,
    clave: string
  ) {
    await reservarPorHttp(this, nombre, nombreSala, clave);
  }
);

Then('debe recibir la misma reserva que la primera vez', function (this: MundoCoworking) {
  assert.ok(this.primeraReservaIdempotente, 'No se guardó la primera reserva');
  assert.ok(this.ultimaReserva, 'No se recibió ninguna reserva en el reintento');
  assert.strictEqual(this.ultimaReserva.id, this.primeraReservaIdempotente.id);
});

// --- Actividad C: cierre de sesión seguro ------------------------------------

When(
  '{string} cierra sesión',
  async function (this: MundoCoworking, nombre: string) {
    const urlBase = await this.urlBase();
    const respuesta = await fetch(`${urlBase}/api/users/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.tokenDe(nombre)}` },
    });
    this.ultimoCodigoEstado = respuesta.status;
  }
);

When(
  'se solicita cerrar sesión sin proporcionar un token',
  async function (this: MundoCoworking) {
    const urlBase = await this.urlBase();
    const respuesta = await fetch(`${urlBase}/api/users/logout`, {
      method: 'POST',
    });
    this.ultimoCodigoEstado = respuesta.status;
  }
);
