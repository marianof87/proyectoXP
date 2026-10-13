/** Feature 12 - Concurrencia simulada, limitación de tasa y calendario (HU-12). */

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'assert';

import type { SimulationReport } from '../../src/sim/Simulator';
import { aFechaHora, MundoCoworking } from '../support/world';

interface Contexto extends MundoCoworking {
  informeSimulacion?: SimulationReport;
  estados?: number[];
  calendario?: Array<Record<string, unknown>>;
}

Given('que el simulador está habilitado', function (this: Contexto) {
  this.opcionesApp = { enableSimulator: true };
});

Given('que el simulador no está habilitado', function (this: Contexto) {
  this.opcionesApp = {};
});

When(
  'se lanza una simulación de {int} operaciones con concurrencia {int}',
  async function (this: Contexto, operations: number, concurrency: number) {
    const urlBase = await this.urlBase();
    const respuesta = await fetch(`${urlBase}/api/sim/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations, concurrency, seed: 11 }),
    });
    this.ultimoCodigoEstado = respuesta.status;
    if (respuesta.ok) {
      this.informeSimulacion = (await respuesta.json()) as SimulationReport;
    }
  }
);

Then(
  'no debe haber reservas solapadas en ninguna sala',
  function (this: Contexto) {
    assert.ok(this.informeSimulacion, 'no hubo informe de simulación');
    assert.strictEqual(this.informeSimulacion.invariants.overlapsFound, 0);
  }
);

Then('ningún saldo debe quedar negativo', function (this: Contexto) {
  assert.strictEqual(
    this.informeSimulacion?.invariants.negativeBalances,
    0
  );
});

Then(
  'ninguna operación debe terminar con un error inesperado',
  function (this: Contexto) {
    assert.strictEqual(this.informeSimulacion?.outcomes.errors, 0);
  }
);

Given(
  'que la API limita a {int} peticiones por ventana',
  function (this: Contexto, max: number) {
    this.opcionesApp = {
      rateLimit: {
        general: { windowMs: 60_000, max },
        auth: { windowMs: 60_000, max },
      },
    };
  }
);

When(
  'un cliente envía {int} peticiones de listado de salas',
  async function (this: Contexto, cantidad: number) {
    const urlBase = await this.urlBase();
    this.estados = [];
    for (let i = 0; i < cantidad; i++) {
      this.estados.push((await fetch(`${urlBase}/api/rooms`)).status);
    }
  }
);

Then(
  '{int} respuestas deben ser exitosas',
  function (this: Contexto, cantidad: number) {
    assert.strictEqual(this.estados?.filter((s) => s === 200).length, cantidad);
  }
);

Then(
  '{int} respuestas deben tener el estado {int}',
  function (this: Contexto, cantidad: number, estado: number) {
    assert.strictEqual(
      this.estados?.filter((s) => s === estado).length,
      cantidad
    );
  }
);

Given(
  'que existe una reserva confirmada de {string} en {string}',
  async function (this: Contexto, nombre: string, sala: string) {
    const usuario = await this.asegurarUsuario(nombre, 500);
    const salaCreada = await this.asegurarSala(sala);
    await this.services.reservationService.bookRoom({
      userId: usuario.id,
      roomId: salaCreada.id,
      startDate: aFechaHora('2030-03-04', '09:00'),
      endDate: aFechaHora('2030-03-04', '11:00'),
    });
  }
);

When('se consulta el calendario público de ese día', async function (this: Contexto) {
  const urlBase = await this.urlBase();
  const respuesta = await fetch(
    `${urlBase}/api/reservations?from=2030-03-04T00:00:00Z&to=2030-03-05T00:00:00Z`
  );
  this.ultimoCodigoEstado = respuesta.status;
  this.calendario = (await respuesta.json()) as Array<Record<string, unknown>>;
});

Then(
  'cada entrada debe incluir solo sala, franja y estado',
  function (this: Contexto) {
    assert.ok(this.calendario && this.calendario.length === 1);
    assert.deepStrictEqual(Object.keys(this.calendario[0]).sort(), [
      'endDate',
      'id',
      'roomId',
      'startDate',
      'status',
    ]);
  }
);

Then(
  'la respuesta debe tener el estado {int}',
  function (this: Contexto, estado: number) {
    assert.strictEqual(this.ultimoCodigoEstado, estado);
  }
);
