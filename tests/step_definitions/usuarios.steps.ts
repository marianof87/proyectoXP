/** Feature 01 - Registro e identificación de usuarios (HU-01). */

import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import assert from 'assert';

import { MundoCoworking } from '../support/world';

Given(
  'que no existe ningún usuario con el email {string}',
  async function (this: MundoCoworking, email: string) {
    const existente = await this.uow.users.findByEmail(email);
    assert.strictEqual(
      existente,
      null,
      `Se esperaba que no existiera ningún usuario con el email ${email}`
    );
  }
);

Given(
  'que existe un usuario con el email {string}',
  async function (this: MundoCoworking, email: string) {
    await this.services.userService.registerUser({
      email,
      name: 'Usuario de prueba',
      password: 'TestPass123!',
    });
  }
);

When(
  'un usuario se registra con:',
  async function (this: MundoCoworking, tabla: DataTable) {
    // rowsHash() convierte la tabla de dos columnas en un objeto clave/valor.
    const datos = tabla.rowsHash();

    this.ultimoUsuario = await this.capturar(() =>
      this.services.userService.registerUser({
        email: datos['email'],
        name: datos['nombre'],
        password: datos['contraseña'],
      })
    );
  }
);

When(
  'un usuario intenta registrarse con el email {string} y la contraseña {string}',
  async function (this: MundoCoworking, email: string, contrasena: string) {
    await this.capturar(() =>
      this.services.userService.registerUser({
        email,
        name: 'Usuario de prueba',
        password: contrasena,
      })
    );
  }
);

Then('el usuario debe crearse correctamente', function (this: MundoCoworking) {
  if (this.ultimoError) throw this.ultimoError;
  assert.ok(this.ultimoUsuario, 'El usuario no se creó');
});

Then(
  'el usuario debe tener el rol {string}',
  function (this: MundoCoworking, rolEsperado: string) {
    assert.ok(this.ultimoUsuario, 'No se registró ningún usuario');
    assert.strictEqual(this.ultimoUsuario.role, rolEsperado);
  }
);

Then(
  'el usuario debe tener un balance de {int}',
  function (this: MundoCoworking, balanceEsperado: number) {
    assert.ok(this.ultimoUsuario, 'No se registró ningún usuario');
    assert.strictEqual(this.ultimoUsuario.balance, balanceEsperado);
  }
);
