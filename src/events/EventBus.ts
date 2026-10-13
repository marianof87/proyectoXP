/**
 * HU-12: bus de eventos en proceso.
 *
 * El servicio publica DESPUÉS del commit (nunca desde una transacción que
 * luego se revierte); el endpoint SSE y las pruebas se suscriben. Con varias
 * réplicas del contenedor haría falta LISTEN/NOTIFY de PostgreSQL: este bus
 * solo ve las reservas de su propio proceso.
 */

import { EventEmitter } from 'events';

import { ReservationResponse } from '../models';

export type ReservationEventType =
  | 'reservation.created'
  | 'reservation.cancelled'
  | 'reservation.status'
  /** Un intento que NO prosperó (conflicto o saldo): útil para ver la carrera. */
  | 'reservation.rejected'
  /** El calendario de demostración se vació. */
  | 'calendar.reset';

/** Datos no sensibles: sin usuario ni importe. */
export interface ReservationEvent {
  type: ReservationEventType;
  at: string;
  reservation: {
    id: number | null;
    roomId: number | null;
    startDate: Date | null;
    endDate: Date | null;
    status: ReservationResponse['status'] | null;
  };
  /** Solo en `reservation.rejected`. */
  reason?: 'CONFLICT' | 'INSUFFICIENT_BALANCE';
}

export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Un listener por cliente SSE conectado.
    this.emitter.setMaxListeners(0);
  }

  publish(type: ReservationEventType, reservation: ReservationResponse): void {
    const event: ReservationEvent = {
      type,
      at: new Date().toISOString(),
      reservation: {
        id: reservation.id,
        roomId: reservation.roomId,
        startDate: reservation.startDate,
        endDate: reservation.endDate,
        status: reservation.status,
      },
    };
    this.emitter.emit('reservation', event);
  }

  publishRejected(
    reason: 'CONFLICT' | 'INSUFFICIENT_BALANCE',
    attempt: { roomId: number; startDate: Date; endDate: Date }
  ): void {
    const event: ReservationEvent = {
      type: 'reservation.rejected',
      at: new Date().toISOString(),
      reason,
      reservation: { id: null, status: null, ...attempt },
    };
    this.emitter.emit('reservation', event);
  }

  publishReset(): void {
    const event: ReservationEvent = {
      type: 'calendar.reset',
      at: new Date().toISOString(),
      reservation: {
        id: null, roomId: null, startDate: null, endDate: null, status: null,
      },
    };
    this.emitter.emit('reservation', event);
  }

  /** Devuelve la función para cancelar la suscripción. */
  subscribe(listener: (event: ReservationEvent) => void): () => void {
    this.emitter.on('reservation', listener);
    return () => this.emitter.off('reservation', listener);
  }

  get listenerCount(): number {
    return this.emitter.listenerCount('reservation');
  }
}
