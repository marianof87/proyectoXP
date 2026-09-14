/** Feature 02 - Gestión del balance de la cuenta (HU-02). */

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'assert';

import { MundoCoworking } from '../support/world';

Given(
  'que el usuario {string} tiene un balance de {int}',
  async function (this: MundoCoworking, nombre: string, balance: number) {
    await this.asegurarUsuario(nombre, balance);
  }
);

Given(
  'que la sala {string} cuesta {int} por hora',
  async function (this: MundoCoworking, nombreSala: string, coste: number) {
    // La sala puede existir ya (feature 03) o no (features 02 y 06): en el
    // segundo caso se crea directamente con la tarifa pedida.
    if (!this.salas.has(nombreSala)) {
      await this.asegurarSala(nombreSala, coste);
      return;
    }

    const sala = this.obtenerSala(nombreSala);
    const actualizada = await this.uow.rooms.updateHourlyRate(sala.id, coste);
    this.salas.set(nombreSala, { ...sala, hourlyRate: actualizada.hourlyRate });
  }
);

/** Recarga de saldo: comparten implementación el caso normal y el negativo. */
async function anadirSaldo(
  mundo: MundoCoworking,
  nombre: string,
  importe: number
): Promise<void> {
  const usuario = mundo.obtenerUsuario(nombre);
  const actualizado = await mundo.capturar(() =>
    mundo.services.userService.addBalance(usuario.id, importe)
  );

  if (actualizado) {
    mundo.usuarios.set(nombre, actualizado);
    mundo.ultimoBalance = actualizado.balance;
  }
}

When(
  '{string} añade {int} a su balance',
  async function (this: MundoCoworking, nombre: string, importe: number) {
    await anadirSaldo(this, nombre, importe);
  }
);

When(
  '{string} intenta añadir {int} a su balance',
  async function (this: MundoCoworking, nombre: string, importe: number) {
    await anadirSaldo(this, nombre, importe);
  }
);

Then(
  'su nuevo balance debe ser {int}',
  function (this: MundoCoworking, esperado: number) {
    if (this.ultimoError) throw this.ultimoError;
    assert.strictEqual(this.ultimoBalance, esperado);
  }
);

Then('la operación debe quedar registrada', function (this: MundoCoworking) {
  assert.notStrictEqual(
    this.ultimoBalance,
    undefined,
    'No se registró ningún cambio de saldo'
  );
});

Then(
  'su balance debe reducirse en {int}',
  async function (this: MundoCoworking, reduccionEsperada: number) {
    if (this.ultimoError) throw this.ultimoError;
    assert.notStrictEqual(
      this.balanceAntesDeReservar,
      undefined,
      'En este escenario no se realizó ninguna reserva'
    );

    // Se relee del almacén: comprueba que la reserva descontó de verdad.
    const [nombreUsuario] = Array.from(this.usuarios.keys());
    const usuario = await this.refrescarUsuario(nombreUsuario);

    const reduccionReal = (this.balanceAntesDeReservar ?? 0) - usuario.balance;
    assert.strictEqual(reduccionReal, reduccionEsperada);

    this.ultimoBalance = usuario.balance;
  }
);
