/**
 * World compartido por todos los step definitions.
 *
 * Cucumber crea una instancia por escenario, de modo que el estado (usuarios,
 * salas, último error...) queda aislado entre escenarios. Antes cada fichero
 * de pasos tenía su propio `let context` a nivel de módulo, compartido entre
 * escenarios y entre ficheros: de ahí los pasos duplicados y las carreras.
 *
 * La persistencia es en memoria (progXP.pdf, sección 1), así que
 * `npm run test:e2e` no necesita PostgreSQL ni migraciones.
 */

import { After, setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

import { createApp } from '../../src/app';
import { createInMemoryServices, Services } from '../../src/container';
import { InMemoryUnitOfWork } from '../../src/repositories/InMemoryRepositories';
import {
  ReservationResponse,
  RoomResponse,
  UserResponse,
} from '../../src/models';

/** Saldo por defecto de un usuario cuyo balance no fija el escenario. */
export const SALDO_POR_DEFECTO = 1000;

export class MundoCoworking extends World {
  readonly uow: InMemoryUnitOfWork;
  readonly services: Services;

  /** Entidades creadas durante el escenario, indexadas por su nombre Gherkin. */
  readonly usuarios = new Map<string, UserResponse>();
  readonly salas = new Map<string, RoomResponse>();

  ultimoError?: Error;
  ultimoUsuario?: UserResponse;
  ultimaSala?: RoomResponse;
  ultimoListadoSalas?: RoomResponse[];
  ultimaReserva?: ReservationResponse;
  ultimoListadoReservas?: ReservationResponse[];
  ultimoBalance?: number;
  balanceAntesDeReservar?: number;
  ultimaDuracionMs?: number;
  ultimoCodigoEstado?: number;
  ultimaContrasenaUsada?: string;
  /** Hash leído del almacén, para las aserciones de seguridad (HU-08). */
  hashAlmacenado?: string;

  private servidor?: Server;

  constructor(options: IWorldOptions) {
    super(options);
    const { services, uow } = createInMemoryServices();
    this.services = services;
    this.uow = uow;
  }

  /**
   * Ejecuta una acción capturando el error en lugar de propagarlo.
   * Es lo que permite que los escenarios negativos comprueben el mensaje.
   */
  async capturar<T>(accion: () => Promise<T>): Promise<T | undefined> {
    try {
      const resultado = await accion();
      this.ultimoError = undefined;
      return resultado;
    } catch (error) {
      this.ultimoError = error as Error;
      return undefined;
    }
  }

  /** Crea el usuario si no existe y lo deja con el balance indicado. */
  async asegurarUsuario(nombre: string, balance: number): Promise<UserResponse> {
    const existente = this.usuarios.get(nombre);
    if (existente) {
      const actualizado =
        balance > existente.balance
          ? await this.services.userService.addBalance(
              existente.id,
              balance - existente.balance
            )
          : existente;
      this.usuarios.set(nombre, actualizado);
      return actualizado;
    }

    const creado = await this.services.userService.registerUser({
      email: `${this.emailDe(nombre)}@example.com`,
      name: nombre,
      password: 'Password123!',
    });

    const usuario =
      balance > 0
        ? await this.services.userService.addBalance(creado.id, balance)
        : creado;

    this.usuarios.set(nombre, usuario);
    return usuario;
  }

  /** Crea la sala si no existe, con una tarifa por hora opcional. */
  async asegurarSala(nombre: string, tarifaPorHora = 100): Promise<RoomResponse> {
    const existente = this.salas.get(nombre);
    if (existente) return existente;

    const sala = await this.services.roomService.createRoom({
      name: nombre,
      capacity: 4,
      hourlyRate: tarifaPorHora,
    });
    this.salas.set(nombre, sala);
    return sala;
  }

  obtenerUsuario(nombre: string): UserResponse {
    const usuario = this.usuarios.get(nombre);
    if (!usuario) {
      throw new Error(`El usuario "${nombre}" no se configuró en este escenario`);
    }
    return usuario;
  }

  obtenerSala(nombre: string): RoomResponse {
    const sala = this.salas.get(nombre);
    if (!sala) {
      throw new Error(`La sala "${nombre}" no se configuró en este escenario`);
    }
    return sala;
  }

  /** Relee el usuario del almacén para comprobar efectos secundarios reales. */
  async refrescarUsuario(nombre: string): Promise<UserResponse> {
    const cacheado = this.obtenerUsuario(nombre);
    const fresco = await this.services.userService.getUserById(cacheado.id);
    if (!fresco) throw new Error(`El usuario "${nombre}" desapareció del almacén`);
    this.usuarios.set(nombre, fresco);
    return fresco;
  }

  /**
   * Arranca la API sobre los repositorios en memoria en un puerto efímero.
   *
   * La feature de rendimiento mide latencia HTTP real, no llamadas directas a
   * los servicios, así que necesita un servidor de verdad.
   */
  async urlBase(): Promise<string> {
    if (!this.servidor) {
      const app = createApp(this.services);
      this.servidor = await new Promise<Server>((resolve) => {
        const escuchando = app.listen(0, () => resolve(escuchando));
      });
    }
    const { port } = this.servidor.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async cerrarServidor(): Promise<void> {
    if (!this.servidor) return;
    const servidor = this.servidor;
    this.servidor = undefined;
    await new Promise<void>((resolve, reject) => {
      servidor.close((error) => (error ? reject(error) : resolve()));
    });
  }

  /** "Juan García" -> "juan.garcia", para construir emails únicos y válidos. */
  private emailDe(nombre: string): string {
    return nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '.');
  }
}

setWorldConstructor(MundoCoworking);

// Cierra el servidor si el escenario lo levantó, para que el proceso termine.
After(async function (this: MundoCoworking) {
  await this.cerrarServidor();
});

/** Convierte "2026-10-20" + "09:00" en una fecha UTC estable. */
export const aFechaHora = (fecha: string, hora: string): Date =>
  new Date(`${fecha}T${hora.padStart(5, '0')}:00.000Z`);
