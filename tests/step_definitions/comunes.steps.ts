/**
 * Pasos compartidos por varias features.
 *
 * Viven en un único fichero porque Cucumber aborta la suite entera si dos
 * ficheros registran la misma expresión ("duplicate step definition"), que es
 * justo lo que ocurría en la versión anterior.
 */

import { Then } from '@cucumber/cucumber';
import assert from 'assert';

import { MundoCoworking } from '../support/world';

/** Comprueba que la última acción capturada terminó en error. */
function debeHaberFallado(mundo: MundoCoworking, accion: string): void {
  assert.ok(mundo.ultimoError, `Se esperaba que ${accion} fallara, pero tuvo éxito`);
}

Then('la operación debe fallar', function (this: MundoCoworking) {
  debeHaberFallado(this, 'la operación');
});

Then('el registro debe fallar', function (this: MundoCoworking) {
  debeHaberFallado(this, 'el registro');
});

Then('la reserva debe fallar', function (this: MundoCoworking) {
  debeHaberFallado(this, 'la reserva');
});

Then('el acceso debe fallar', function (this: MundoCoworking) {
  debeHaberFallado(this, 'el acceso');
});

/**
 * Los mensajes se comparan en inglés a propósito: son el contrato de la API
 * REST, no texto de la historia de usuario.
 */
Then(
  'el mensaje de error debe ser {string}',
  function (this: MundoCoworking, esperado: string) {
    assert.ok(this.ultimoError, 'Se esperaba un error, pero no se produjo ninguno');
    assert.strictEqual(this.ultimoError.message, esperado);
  }
);

Then(
  'el estado de la reserva debe ser {string}',
  function (this: MundoCoworking, estadoEsperado: string) {
    if (this.ultimoError) throw this.ultimoError;
    assert.ok(this.ultimaReserva, 'No se creó ninguna reserva en este escenario');
    assert.strictEqual(this.ultimaReserva.status, estadoEsperado);
  }
);
