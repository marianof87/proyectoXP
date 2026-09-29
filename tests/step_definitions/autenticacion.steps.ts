/** Feature 09 - Autenticación y autorización con JWT (HU-09, historia técnica). */

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'assert';

import {
  ReservationResponse,
  RoomResponse,
  UserResponse,
} from '../../src/models';
import { MundoCoworking } from '../support/world';

Given(
  'que el usuario {string} puede iniciar sesión con la contraseña {string}',
  async function (this: MundoCoworking, nombre: string, contrasena: string) {
    const usuario = await this.services.userService.registerUser({
      email: `${nombre.toLowerCase()}@example.com`,
      name: nombre,
      password: contrasena,
    });
    this.usuarios.set(nombre, usuario);
    this.contrasenasDeUsuario.set(nombre, contrasena);
  }
);

Given(
  'que el administrador {string} puede iniciar sesión con la contraseña {string}',
  async function (this: MundoCoworking, nombre: string, contrasena: string) {
    await this.asegurarAdministrador(nombre);
    // asegurarAdministrador ya usa la contraseña "AdminPass123!" por defecto;
    // se valida aquí para que el escenario documente el valor esperado.
    assert.strictEqual(this.contrasenasDeUsuario.get(nombre), contrasena);
  }
);

Given(
  '{string} inició sesión',
  async function (this: MundoCoworking, nombre: string) {
    await this.iniciarSesion(nombre);
  }
);

When(
  '{string} inicia sesión con su contraseña',
  async function (this: MundoCoworking, nombre: string) {
    await this.iniciarSesion(nombre);
  }
);

When(
  'se solicita el perfil sin proporcionar un token',
  async function (this: MundoCoworking) {
    const urlBase = await this.urlBase();
    const respuesta = await fetch(`${urlBase}/api/users/me`);
    this.ultimoCodigoEstado = respuesta.status;
  }
);

When(
  'se solicita el perfil con un token inválido',
  async function (this: MundoCoworking) {
    const urlBase = await this.urlBase();
    const respuesta = await fetch(`${urlBase}/api/users/me`, {
      headers: { Authorization: 'Bearer token-manipulado-o-invalido' },
    });
    this.ultimoCodigoEstado = respuesta.status;
  }
);

When(
  '{string} solicita su perfil',
  async function (this: MundoCoworking, nombre: string) {
    const urlBase = await this.urlBase();
    this.ultimoActor = nombre;

    const respuesta = await fetch(`${urlBase}/api/users/me`, {
      headers: { Authorization: `Bearer ${this.tokenDe(nombre)}` },
    });

    this.ultimoCodigoEstado = respuesta.status;
    if (respuesta.ok) {
      this.ultimoPerfil = (await respuesta.json()) as UserResponse;
    }
  }
);

/** Crea una sala autenticada como `nombre`; el resultado depende de su rol. */
async function crearSalaAutenticada(
  mundo: MundoCoworking,
  nombre: string
): Promise<void> {
  const urlBase = await mundo.urlBase();

  const respuesta = await fetch(`${urlBase}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mundo.tokenDe(nombre)}`,
    },
    body: JSON.stringify({
      name: `Sala de ${nombre}`,
      capacity: 4,
      hourlyRate: 100,
    }),
  });

  mundo.ultimoCodigoEstado = respuesta.status;
  if (respuesta.ok) {
    mundo.ultimaSala = (await respuesta.json()) as RoomResponse;
  }
}

When(
  '{string} intenta crear una sala autenticada',
  async function (this: MundoCoworking, nombre: string) {
    await crearSalaAutenticada(this, nombre);
  }
);

When(
  '{string} crea una sala autenticado',
  async function (this: MundoCoworking, nombre: string) {
    await crearSalaAutenticada(this, nombre);
  }
);

/** Consulta las reservas de `objetivo` autenticado como `actor`. */
async function consultarReservasAutenticado(
  mundo: MundoCoworking,
  actor: string,
  objetivo: string
): Promise<void> {
  const urlBase = await mundo.urlBase();
  const usuarioObjetivo = mundo.obtenerUsuario(objetivo);

  const respuesta = await fetch(
    `${urlBase}/api/users/${usuarioObjetivo.id}/reservations`,
    { headers: { Authorization: `Bearer ${mundo.tokenDe(actor)}` } }
  );

  mundo.ultimoCodigoEstado = respuesta.status;
  if (respuesta.ok) {
    mundo.ultimoListadoReservas = (await respuesta.json()) as ReservationResponse[];
  }
}

When(
  '{string} consulta las reservas de {string} autenticada',
  async function (this: MundoCoworking, actor: string, objetivo: string) {
    await consultarReservasAutenticado(this, actor, objetivo);
  }
);

When(
  '{string} consulta las reservas de {string} autenticado',
  async function (this: MundoCoworking, actor: string, objetivo: string) {
    await consultarReservasAutenticado(this, actor, objetivo);
  }
);

When(
  '{string} consulta sus propias reservas autenticada',
  async function (this: MundoCoworking, nombre: string) {
    await consultarReservasAutenticado(this, nombre, nombre);
  }
);

Then('debe recibir un token JWT válido', function (this: MundoCoworking) {
  assert.ok(this.ultimoToken, 'No se recibió ningún token');
  assert.match(
    this.ultimoToken,
    /^[\w-]+\.[\w-]+\.[\w-]+$/,
    `El token recibido "${this.ultimoToken}" no tiene forma de JWT`
  );
});

Then(
  'el código de estado HTTP debe ser {int}',
  function (this: MundoCoworking, esperado: number) {
    assert.strictEqual(
      this.ultimoCodigoEstado,
      esperado,
      `Se esperaba el estado ${esperado}, se recibió ${this.ultimoCodigoEstado}`
    );
  }
);

Then('debe recibir su propio perfil', function (this: MundoCoworking) {
  assert.ok(this.ultimoPerfil, 'No se recibió ningún perfil');
  assert.ok(this.ultimoActor, 'No se registró quién solicitó el perfil');

  const esperado = this.obtenerUsuario(this.ultimoActor);
  assert.strictEqual(this.ultimoPerfil.id, esperado.id);
  assert.strictEqual(this.ultimoPerfil.email, esperado.email);
});

Then(
  'debe recibir la respuesta correctamente',
  function (this: MundoCoworking) {
    assert.ok(
      this.ultimoCodigoEstado !== undefined &&
        this.ultimoCodigoEstado >= 200 &&
        this.ultimoCodigoEstado < 300,
      `Se esperaba una respuesta 2xx, se recibió ${this.ultimoCodigoEstado}`
    );
  }
);
