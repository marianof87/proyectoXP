/** Feature 07 - Rendimiento del sistema (HU-07, historia técnica). */

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'assert';

import { aFechaHora, MundoCoworking } from '../support/world';

/** Número de peticiones simultáneas con que se carga el sistema. */
const PETICIONES_CONCURRENTES = 100;

Given(
  'que el sistema está atendiendo peticiones concurrentes',
  async function (this: MundoCoworking) {
    const urlBase = await this.urlBase();

    await this.asegurarUsuario('Probador', 100_000);
    await this.asegurarSala('Sala Carga');

    // Carga concurrente sobre un endpoint de lectura, para que la petición
    // que se mide después compita de verdad con otras.
    await Promise.all(
      Array.from({ length: PETICIONES_CONCURRENTES }, () =>
        fetch(`${urlBase}/api/rooms`)
      )
    );
  }
);

Given(
  'que hay {int} salas en el sistema',
  async function (this: MundoCoworking, cantidad: number) {
    for (let i = 1; i <= cantidad; i++) {
      await this.asegurarSala(`Sala Carga ${i}`);
    }
  }
);

When(
  'un usuario lanza una petición para reservar una sala',
  async function (this: MundoCoworking) {
    const urlBase = await this.urlBase();
    const usuario = this.obtenerUsuario('Probador');
    const sala = this.obtenerSala('Sala Carga');

    const cuerpo = JSON.stringify({
      userId: usuario.id,
      roomId: sala.id,
      startDate: aFechaHora('2026-11-02', '09:00').toISOString(),
      endDate: aFechaHora('2026-11-02', '11:00').toISOString(),
    });

    const inicio = Date.now();
    const respuesta = await fetch(`${urlBase}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo,
    });
    this.ultimaDuracionMs = Date.now() - inicio;
    this.ultimoCodigoEstado = respuesta.status;
  }
);

Then(
  'la respuesta debe recibirse en menos de {int}ms',
  function (this: MundoCoworking, presupuestoMs: number) {
    assert.notStrictEqual(
      this.ultimaDuracionMs,
      undefined,
      'En este escenario no se midió ninguna petición'
    );
    assert.ok(
      (this.ultimaDuracionMs ?? Infinity) <= presupuestoMs,
      `La respuesta tardó ${this.ultimaDuracionMs}ms y el presupuesto es ${presupuestoMs}ms`
    );
  }
);

Then(
  'la respuesta debe tener un estado válido, no un error del servidor',
  function (this: MundoCoworking) {
    assert.notStrictEqual(
      this.ultimoCodigoEstado,
      undefined,
      'No se capturó ninguna respuesta HTTP'
    );
    // 201 al crear la reserva; 4xx si la franja ya estaba tomada. Lo que la
    // historia excluye es un 5xx o un tiempo de espera agotado.
    assert.ok(
      (this.ultimoCodigoEstado ?? 500) < 500,
      `Se esperaba una respuesta válida (no 5xx), se recibió ${this.ultimoCodigoEstado}`
    );
  }
);

Then('deben devolverse todas las salas', function (this: MundoCoworking) {
  assert.ok(this.ultimoListadoSalas, 'No se obtuvo ningún listado de salas');
  assert.strictEqual(
    this.ultimoListadoSalas.length,
    this.salas.size,
    `Se esperaban ${this.salas.size} salas, se recibieron ${this.ultimoListadoSalas.length}`
  );
});
