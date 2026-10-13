/**
 * HU-12: simulador de tráfico concurrente (datos ficticios).
 *
 * Lanza reservas y cancelaciones aleatorias contra los servicios REALES con
 * un grupo de "trabajadores" lógicos y comprueba al final los invariantes del
 * sistema: ninguna sala con reservas vivas solapadas y ningún saldo negativo.
 * Con `seed` el resultado es reproducible.
 */

import bcrypt from 'bcrypt';

import { Services } from '../container';
import { Reservation, ReservationStatus, Room } from '../models';
import { ConflictError, ValidationError } from '../models/errors';
import { runPool } from './pool';

export const SIM_ROOMS = [
  { name: 'Sala Aurora', capacity: 4, hourlyRate: 10 },
  { name: 'Sala Boreal', capacity: 6, hourlyRate: 15 },
  { name: 'Sala Cénit', capacity: 8, hourlyRate: 20 },
  { name: 'Sala Delta', capacity: 10, hourlyRate: 25 },
  { name: 'Sala Eclipse', capacity: 12, hourlyRate: 30 },
];
const SIM_USERS = 20;
const SIM_BALANCE = 150;
const LIVE: ReservationStatus[] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'];
const HOUR = 3_600_000;

export interface SimulationInput {
  operations: number;
  concurrency: number;
  /** Semilla del generador aleatorio (reproducibilidad). */
  seed?: number;
  /** Latencia simulada por operación, para ver el calendario llenarse. */
  delayMs?: number;
  /** Día objetivo AAAA-MM-DD (UTC); por defecto, mañana. */
  day?: string;
}

export interface SimulationReport {
  seed: number;
  operations: number;
  concurrency: number;
  durationMs: number;
  outcomes: {
    confirmed: number;
    conflicts: number;
    insufficientBalance: number;
    cancelled: number;
    cancelRejected: number;
    advanced: number;
    advanceRejected: number;
    errors: number;
  };
  invariants: {
    noOverlaps: boolean;
    noNegativeBalances: boolean;
    overlapsFound: number;
    negativeBalances: number;
  };
}

/** Generador pseudoaleatorio determinista (mulberry32). */
const rng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const newOutcomes = (): SimulationReport['outcomes'] => ({
  confirmed: 0,
  conflicts: 0,
  insufficientBalance: 0,
  cancelled: 0,
  cancelRejected: 0,
  advanced: 0,
  advanceRejected: 0,
  errors: 0,
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface AutoInput {
  ratePerSec: number;
  maxSeconds: number;
  day?: string;
}

export type AutoStatus =
  | { running: false }
  | {
      running: true;
      ratePerSec: number;
      day?: string;
      elapsedSec: number;
      remainingSec: number;
      inFlight: number;
      peakInFlight: number;
      total: number;
      outcomes: SimulationReport['outcomes'];
    };

interface StepContext {
  outcomes: SimulationReport['outcomes'];
  confirmedIds: number[];
}

interface Step {
  kind: 'book' | 'cancel' | 'advance';
  pick: number;
  userId: number;
  roomId: number;
  startMs: number;
  durationH: number;
}

/** Medianoche UTC del día pedido (AAAA-MM-DD) o de mañana por defecto. */
const dayStartOf = (day?: string): number => {
  if (day) {
    const parsed = new Date(`${day}T00:00:00.000Z`).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  return base.getTime() + 24 * HOUR;
};

const randomStep = (
  random: () => number,
  rooms: Room[],
  userIds: number[],
  dayStart: number
): Step => {
  const pick = (n: number): number => Math.floor(random() * n);
  const roll = random();
  return {
    kind: roll < 0.2 ? 'cancel' : roll < 0.3 ? 'advance' : 'book',
    pick: random(),
    userId: userIds[pick(userIds.length)],
    roomId: rooms[pick(rooms.length)].id,
    startMs: dayStart + pick(2) * 24 * HOUR + (8 + pick(10)) * HOUR,
    durationH: 1 + pick(3),
  };
};

export class Simulator {
  constructor(private readonly services: Services) {}

  /** Crea (una sola vez) las salas y usuarios ficticios y repone saldos. */
  async seed(): Promise<{ rooms: Room[]; userIds: number[] }> {
    const { uow } = this.services;

    const rooms: Room[] = [];
    for (const def of SIM_ROOMS) {
      const existing = await uow.rooms.findByName(def.name);
      rooms.push(
        existing ??
          (await uow.rooms.create({ ...def, description: 'Sala simulada' }))
      );
    }

    // Hash no utilizable para login: estos usuarios solo existen para simular.
    const unusableHash = await bcrypt.hash(`sim-${Date.now()}`, 4);
    const userIds: number[] = [];
    for (let i = 1; i <= SIM_USERS; i++) {
      const email = `sim.user${i}@sim.local`;
      let user = await uow.users.findByEmail(email);
      if (!user) {
        user = await uow.users.create({
          email,
          name: `Usuario Sim ${i}`,
          password: unusableHash,
          role: 'USER',
          balance: SIM_BALANCE,
        });
      } else if (user.balance < SIM_BALANCE) {
        user = await uow.users.incrementBalance(user.id, SIM_BALANCE - user.balance);
      }
      userIds.push(user.id);
    }
    return { rooms, userIds };
  }

  async run(input: SimulationInput): Promise<SimulationReport> {
    const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
    const random = rng(seed);
    const delayMs = input.delayMs ?? 0;

    const { rooms, userIds } = await this.seed();
    const dayStart = dayStartOf(input.day);

    const ctx: StepContext = {
      outcomes: newOutcomes(),
      confirmedIds: [],
    };

    // Las decisiones aleatorias se toman por adelantado y en orden, así la
    // semilla fija el plan aunque el intercalado de las tareas varíe.
    const plan = Array.from({ length: input.operations }, () => ({
      ...randomStep(random, rooms, userIds, dayStart),
      delay: random() * delayMs,
    }));

    const started = Date.now();
    const tasks = plan.map((step) => async (): Promise<void> => {
      if (step.delay > 0) await sleep(Math.round(step.delay));
      await this.perform(step, ctx);
    });

    await runPool(tasks, input.concurrency);
    const durationMs = Date.now() - started;

    return {
      seed,
      operations: input.operations,
      concurrency: input.concurrency,
      durationMs,
      outcomes: ctx.outcomes,
      invariants: await this.checkInvariants(
        rooms,
        userIds,
        dayStart,
        this.services.uow
      ),
    };
  }

  // ---- Tráfico "en vivo": llegadas aleatorias continuas (HU-12) ----------

  private auto?: {
    timer: NodeJS.Timeout;
    stopAt: number;
    startedAt: number;
    ratePerSec: number;
    day?: string;
    ctx: StepContext;
    inFlight: number;
    peakInFlight: number;
    total: number;
  };

  autoStatus(): AutoStatus {
    const a = this.auto;
    if (!a) {
      return { running: false };
    }
    return {
      running: true,
      ratePerSec: a.ratePerSec,
      day: a.day,
      elapsedSec: Math.round((Date.now() - a.startedAt) / 1000),
      remainingSec: Math.max(0, Math.round((a.stopAt - Date.now()) / 1000)),
      inFlight: a.inFlight,
      peakInFlight: a.peakInFlight,
      total: a.total,
      outcomes: a.ctx.outcomes,
    };
  }

  /**
   * Genera peticiones con llegadas aleatorias (proceso de Poisson) sin
   * esperar a que terminen las anteriores: varias quedan "en vuelo" a la vez.
   * Se detiene sola tras `maxSeconds`.
   */
  async startAuto(opts: AutoInput): Promise<AutoStatus> {
    this.stopAuto();
    const { rooms, userIds } = await this.seed();
    const dayStart = dayStartOf(opts.day);
    const mean = 1000 / opts.ratePerSec;

    const state = {
      timer: undefined as unknown as NodeJS.Timeout,
      startedAt: Date.now(),
      stopAt: Date.now() + opts.maxSeconds * 1000,
      ratePerSec: opts.ratePerSec,
      day: opts.day,
      ctx: {
        outcomes: newOutcomes(),
        confirmedIds: [],
      } as StepContext,
      inFlight: 0,
      peakInFlight: 0,
      total: 0,
    };
    this.auto = state;

    const schedule = (): void => {
      if (this.auto !== state) return;
      if (Date.now() >= state.stopAt) {
        this.stopAuto();
        return;
      }
      // Llegadas con tiempo exponencial entre peticiones.
      const wait = -Math.log(1 - Math.random()) * mean;
      state.timer = setTimeout(() => {
        // A veces llegan varias a la vez (ráfaga), como en la vida real.
        const burst = Math.random() < 0.2 ? 2 + Math.floor(Math.random() * 3) : 1;
        for (let i = 0; i < burst; i++) {
          const step = randomStep(Math.random, rooms, userIds, dayStart);
          state.inFlight++;
          state.total++;
          state.peakInFlight = Math.max(state.peakInFlight, state.inFlight);
          void sleep(Math.random() * 250)
            .then(() => this.perform(step, state.ctx))
            .finally(() => {
              state.inFlight--;
            });
        }
        schedule();
      }, wait);
    };
    schedule();
    return this.autoStatus();
  }

  stopAuto(): AutoStatus {
    if (this.auto) {
      clearTimeout(this.auto.timer);
      this.auto = undefined;
    }
    return { running: false };
  }

  /** Vacía reservas (y claves de idempotencia por cascada) y repone saldos. */
  async reset(): Promise<void> {
    await this.services.uow.reservations.deleteAll();
    await this.seed();
    for (const email of ['demo@coworking.demo']) {
      const u = await this.services.uow.users.findByEmail(email);
      if (u && u.balance < 500) {
        await this.services.uow.users.incrementBalance(u.id, 500 - u.balance);
      }
    }
    this.services.events.publishReset();
  }

  /** Ejecuta un paso; clasifica el resultado y nunca lanza. */
  private async perform(step: Step, ctx: StepContext): Promise<void> {
    const { reservationService } = this.services;
    const { outcomes, confirmedIds } = ctx;
    try {
      if (step.kind === 'advance' && confirmedIds.length > 0) {
        const id = confirmedIds[Math.floor(step.pick * confirmedIds.length)];
        try {
          const current = await this.services.uow.reservations.findById(id);
          if (current) {
            await reservationService.advanceStatus(
              id,
              current.status === 'IN_PROGRESS' ? 'COMPLETED' : 'IN_PROGRESS'
            );
            outcomes.advanced++;
          }
        } catch (error) {
          if (!(error instanceof ConflictError)) throw error;
          outcomes.advanceRejected++;
        }
        return;
      }

      if (step.kind === 'cancel' && confirmedIds.length > 0) {
        const id = confirmedIds[Math.floor(step.pick * confirmedIds.length)];
        try {
          await reservationService.cancelReservation(id);
          outcomes.cancelled++;
        } catch (error) {
          if (error instanceof ValidationError || error instanceof ConflictError) {
            outcomes.cancelRejected++;
          } else {
            throw error;
          }
        }
        return;
      }

      const startDate = new Date(step.startMs);
      const endDate = new Date(step.startMs + step.durationH * HOUR);
      try {
        const created = await reservationService.bookRoom({
          userId: step.userId,
          roomId: step.roomId,
          startDate,
          endDate,
        });
        outcomes.confirmed++;
        confirmedIds.push(created.id);
      } catch (error) {
        if (error instanceof ConflictError) outcomes.conflicts++;
        else if (
          error instanceof ValidationError &&
          error.message === 'Insufficient balance'
        ) {
          outcomes.insufficientBalance++;
        } else throw error;
      }
    } catch {
      outcomes.errors++;
    }
  }

  private async checkInvariants(
    rooms: Room[],
    userIds: number[],
    dayStart: number,
    uow: Services['uow']
  ): Promise<SimulationReport['invariants']> {
    const all: Reservation[] = await uow.reservations.findBetween(
      new Date(dayStart - HOUR),
      new Date(dayStart + 5 * 24 * HOUR)
    );

    let overlapsFound = 0;
    for (const room of rooms) {
      const live = all
        .filter((r) => r.roomId === room.id && LIVE.includes(r.status))
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      for (let i = 1; i < live.length; i++) {
        if (live[i].startDate.getTime() < live[i - 1].endDate.getTime()) {
          overlapsFound++;
        }
      }
    }

    let negativeBalances = 0;
    for (const id of userIds) {
      const user = await uow.users.findById(id);
      if (user && user.balance < 0) negativeBalances++;
    }

    return {
      noOverlaps: overlapsFound === 0,
      noNegativeBalances: negativeBalances === 0,
      overlapsFound,
      negativeBalances,
    };
  }
}

/**
 * Datos de demostración para la interfaz: un ADMIN y un USER con credenciales
 * conocidas. Solo se invoca con ENABLE_SIMULATOR=true.
 */
export const seedDemoAccounts = async (
  services: Services,
  adminPassword: string
): Promise<void> => {
  const { uow } = services;
  const rounds = Number.parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10);

  if (!(await uow.users.findByEmail('admin@coworking.demo'))) {
    await uow.users.create({
      email: 'admin@coworking.demo',
      name: 'Admin Demo',
      password: await bcrypt.hash(adminPassword, rounds),
      role: 'ADMIN',
      balance: 0,
    });
  }
  if (!(await uow.users.findByEmail('demo@coworking.demo'))) {
    await uow.users.create({
      email: 'demo@coworking.demo',
      name: 'Usuario Demo',
      password: await bcrypt.hash('Demo1234!', rounds),
      role: 'USER',
      balance: 500,
    });
  }
  await new Simulator(services).seed();
};
