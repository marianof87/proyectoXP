/** Features 03, 04 y 06 - Reserva, visualización y cancelación (HU-03/04/06). */

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'assert';

import { aFechaHora, MundoCoworking, SALDO_POR_DEFECTO } from '../support/world';

Given(
  'que la sala {string} está disponible el {string}',
  async function (this: MundoCoworking, nombreSala: string, _fecha: string) {
    await this.asegurarSala(nombreSala);
  }
);

Given(
  'que el usuario {string} tiene saldo suficiente',
  async function (this: MundoCoworking, nombre: string) {
    await this.asegurarUsuario(nombre, SALDO_POR_DEFECTO);
  }
);

Given(
  'que la sala {string} está reservada el {string} de {string} a {string}',
  async function (
    this: MundoCoworking,
    nombreSala: string,
    fecha: string,
    horaInicio: string,
    horaFin: string
  ) {
    const sala = await this.asegurarSala(nombreSala);
    const reservante = await this.asegurarUsuario('Reservante', SALDO_POR_DEFECTO);

    await this.services.reservationService.bookRoom({
      userId: reservante.id,
      roomId: sala.id,
      startDate: aFechaHora(fecha, horaInicio),
      endDate: aFechaHora(fecha, horaFin),
    });
  }
);

/**
 * Reserva efectiva. La comparten el paso afirmativo ("reserva") y el de
 * tanteo ("intenta reservar"): la diferencia está solo en el Then que sigue.
 */
async function reservar(
  mundo: MundoCoworking,
  nombreUsuario: string,
  nombreSala: string,
  horaInicio: string,
  horaFin: string,
  fecha: string
): Promise<void> {
  // Un escenario puede nombrar a un usuario sin configurarlo (p. ej. "María",
  // que solo existe para chocar con una sala ya ocupada).
  const usuario = mundo.usuarios.has(nombreUsuario)
    ? mundo.obtenerUsuario(nombreUsuario)
    : await mundo.asegurarUsuario(nombreUsuario, SALDO_POR_DEFECTO);

  const sala = mundo.obtenerSala(nombreSala);

  mundo.balanceAntesDeReservar = usuario.balance;

  mundo.ultimaReserva = await mundo.capturar(() =>
    mundo.services.reservationService.bookRoom({
      userId: usuario.id,
      roomId: sala.id,
      startDate: aFechaHora(fecha, horaInicio),
      endDate: aFechaHora(fecha, horaFin),
    })
  );
}

When(
  '{string} reserva la {string} de {string} a {string} el {string}',
  async function (
    this: MundoCoworking,
    usuario: string,
    sala: string,
    horaInicio: string,
    horaFin: string,
    fecha: string
  ) {
    await reservar(this, usuario, sala, horaInicio, horaFin, fecha);
  }
);

When(
  '{string} intenta reservar la {string} de {string} a {string} el {string}',
  async function (
    this: MundoCoworking,
    usuario: string,
    sala: string,
    horaInicio: string,
    horaFin: string,
    fecha: string
  ) {
    await reservar(this, usuario, sala, horaInicio, horaFin, fecha);
  }
);

Then('la reserva debe confirmarse correctamente', function (this: MundoCoworking) {
  if (this.ultimoError) throw this.ultimoError;
  assert.ok(this.ultimaReserva, 'No se creó la reserva');
});

Then(
  'la sala {string} no debe estar disponible en esa franja',
  async function (this: MundoCoworking, nombreSala: string) {
    assert.ok(this.ultimaReserva, 'No se creó ninguna reserva');

    const sala = this.obtenerSala(nombreSala);
    const disponible = await this.services.roomService.checkRoomAvailability(
      sala.id,
      this.ultimaReserva.startDate,
      this.ultimaReserva.endDate
    );

    assert.strictEqual(
      disponible,
      false,
      `La sala ${nombreSala} sigue disponible en la franja reservada`
    );
  }
);

// --- HU-04: visualización del historial de reservas ---------------------

When('{string} consulta sus reservas', async function (
  this: MundoCoworking,
  nombreUsuario: string
) {
  const usuario = this.obtenerUsuario(nombreUsuario);
  this.ultimoListadoReservas = await this.capturar(() =>
    this.services.reservationService.getUserReservations(usuario.id)
  );
});

Then(
  'debe recibir {int} reservas',
  function (this: MundoCoworking, cantidadEsperada: number) {
    if (this.ultimoError) throw this.ultimoError;
    assert.ok(this.ultimoListadoReservas, 'No se obtuvo ningún listado');
    assert.strictEqual(this.ultimoListadoReservas.length, cantidadEsperada);
  }
);

Then(
  'cada reserva debe incluir sala, fechas, estado y coste',
  function (this: MundoCoworking) {
    assert.ok(this.ultimoListadoReservas?.length, 'El listado está vacío');

    for (const reserva of this.ultimoListadoReservas) {
      assert.ok(reserva.id, 'Falta el id de la reserva');
      assert.ok(reserva.roomId, 'Falta la sala de la reserva');
      assert.ok(reserva.startDate instanceof Date, 'Falta la fecha de inicio');
      assert.ok(reserva.endDate instanceof Date, 'Falta la fecha de fin');
      assert.ok(reserva.status, 'Falta el estado de la reserva');
      assert.notStrictEqual(reserva.totalCost, undefined, 'Falta el coste');
    }
  }
);

Then(
  'el estado de la primera reserva debe ser {string}',
  function (this: MundoCoworking, estadoEsperado: string) {
    assert.ok(this.ultimoListadoReservas?.length, 'El listado está vacío');
    assert.strictEqual(this.ultimoListadoReservas[0].status, estadoEsperado);
  }
);

// --- HU-06: cancelación de reservas -------------------------------------

/**
 * Cancela la última reserva del escenario, comprobando antes que pertenece
 * al usuario que la cancela.
 */
async function cancelarUltimaReserva(
  mundo: MundoCoworking,
  nombreUsuario: string
): Promise<void> {
  assert.ok(mundo.ultimaReserva, 'En este escenario no se creó ninguna reserva');

  const usuario = mundo.obtenerUsuario(nombreUsuario);
  assert.strictEqual(
    mundo.ultimaReserva.userId,
    usuario.id,
    `La última reserva no pertenece a ${nombreUsuario}`
  );

  const idReserva = mundo.ultimaReserva.id;
  const cancelada = await mundo.capturar(() =>
    mundo.services.reservationService.cancelReservation(idReserva)
  );

  if (cancelada) {
    mundo.ultimaReserva = cancelada;
    // El reembolso se comprueba releyendo el usuario del almacén.
    mundo.ultimoBalance = (await mundo.refrescarUsuario(nombreUsuario)).balance;
  }
}

When(
  '{string} cancela su última reserva',
  async function (this: MundoCoworking, nombreUsuario: string) {
    await cancelarUltimaReserva(this, nombreUsuario);
  }
);

When(
  '{string} intenta cancelar su última reserva',
  async function (this: MundoCoworking, nombreUsuario: string) {
    await cancelarUltimaReserva(this, nombreUsuario);
  }
);

When(
  '{string} intenta cancelar de nuevo su última reserva',
  async function (this: MundoCoworking, nombreUsuario: string) {
    await cancelarUltimaReserva(this, nombreUsuario);
  }
);

Then(
  'la sala {string} debe volver a estar disponible en esa franja',
  async function (this: MundoCoworking, nombreSala: string) {
    assert.ok(this.ultimaReserva, 'No hay ninguna reserva en el escenario');

    const sala = this.obtenerSala(nombreSala);
    const disponible = await this.services.roomService.checkRoomAvailability(
      sala.id,
      this.ultimaReserva.startDate,
      this.ultimaReserva.endDate
    );

    assert.strictEqual(
      disponible,
      true,
      `La sala ${nombreSala} sigue ocupada tras cancelar la reserva`
    );
  }
);
