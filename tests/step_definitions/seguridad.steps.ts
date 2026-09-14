/** Feature 08 - Seguridad y protección de los datos (HU-08, historia técnica). */

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'assert';
import bcrypt from 'bcrypt';

import { MundoCoworking } from '../support/world';

/** Formato de un hash bcrypt ($2a$, $2b$ o $2y$ según la variante). */
const PATRON_BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const EMAIL_AUDITADO = 'auditoria.seguridad@example.com';

Given(
  'que un nuevo usuario se registra con la contraseña {string}',
  async function (this: MundoCoworking, contrasena: string) {
    this.ultimaContrasenaUsada = contrasena;
    this.ultimoUsuario = await this.services.userService.registerUser({
      email: EMAIL_AUDITADO,
      name: 'Auditoría de seguridad',
      password: contrasena,
    });
  }
);

Given(
  'que el usuario {string} existe con la contraseña {string}',
  async function (this: MundoCoworking, nombre: string, contrasena: string) {
    const usuario = await this.services.userService.registerUser({
      email: `${nombre.toLowerCase()}@example.com`,
      name: nombre,
      password: contrasena,
    });
    this.usuarios.set(nombre, usuario);
    this.ultimaContrasenaUsada = contrasena;
  }
);

When('se consulta la contraseña almacenada', async function (this: MundoCoworking) {
  // Se lee por el repositorio: el servicio nunca devuelve el hash hacia fuera.
  const almacenado = await this.uow.users.findByEmail(EMAIL_AUDITADO);
  assert.ok(almacenado, 'El usuario registrado no se persistió');
  this.hashAlmacenado = almacenado.password;
});

When(
  '{string} intenta acceder con la contraseña incorrecta {string}',
  async function (this: MundoCoworking, nombre: string, contrasenaErronea: string) {
    const usuario = this.obtenerUsuario(nombre);
    await this.capturar(() =>
      this.services.userService.login({
        email: usuario.email,
        password: contrasenaErronea,
      })
    );
  }
);

When(
  'se intenta acceder con un email que no existe',
  async function (this: MundoCoworking) {
    await this.capturar(() =>
      this.services.userService.login({
        email: 'no.existe@example.com',
        password: 'CualquierClave123',
      })
    );
  }
);

Then('la contraseña debe estar hasheada con bcrypt', function (this: MundoCoworking) {
  assert.ok(this.hashAlmacenado, 'No se leyó ninguna contraseña almacenada');
  assert.match(
    this.hashAlmacenado,
    PATRON_BCRYPT,
    `El valor almacenado "${this.hashAlmacenado}" no es un hash bcrypt`
  );
});

Then(
  'el valor almacenado no debe ser la contraseña en texto plano',
  function (this: MundoCoworking) {
    assert.ok(this.hashAlmacenado, 'No se leyó ninguna contraseña almacenada');
    assert.notStrictEqual(
      this.hashAlmacenado,
      this.ultimaContrasenaUsada,
      'La contraseña se almacenó en texto plano'
    );
  }
);

Then(
  'el hash debe poder verificarse contra la contraseña original',
  async function (this: MundoCoworking) {
    assert.ok(this.hashAlmacenado && this.ultimaContrasenaUsada);
    assert.strictEqual(
      await bcrypt.compare(this.ultimaContrasenaUsada, this.hashAlmacenado),
      true,
      'El hash almacenado no se corresponde con la contraseña original'
    );
  }
);

Then(
  'el intento fallido debe quedar registrado en el sistema',
  function (this: MundoCoworking) {
    const intentos = this.services.userService.getFailedLoginAttempts();
    assert.ok(intentos.length > 0, 'No se registró ningún intento fallido');
    assert.strictEqual(intentos[intentos.length - 1].reason, 'WRONG_PASSWORD');
  }
);
