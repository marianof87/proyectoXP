/**
 * Errores de dominio.
 *
 * Reemplazan el mapeo por `err.message.includes(...)` que hacia el middleware:
 * cada error lleva su propio código HTTP, de modo que cambiar un mensaje no
 * cambia silenciosamente el status de la respuesta.
 */

export abstract class DomainError extends Error {
  abstract readonly statusCode: number;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 404 - el recurso solicitado no existe. */
export class NotFoundError extends DomainError {
  readonly statusCode = 404;
  constructor(message: string) {
    super(message);
  }
}

/** 409 - choca con el estado actual (email repetido, sala ocupada...). */
export class ConflictError extends DomainError {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
  }
}

/** 400 - la petición es invalida o viola una regla de negocio. */
export class ValidationError extends DomainError {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
  }
}

/** 401 - credenciales incorrectas (HU-08, seguridad). */
export class UnauthorizedError extends DomainError {
  readonly statusCode = 401;
  constructor(message: string) {
    super(message);
  }
}
