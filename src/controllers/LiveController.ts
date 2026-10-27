/** HU-12: calendario público, flujo de eventos (SSE) y simulador. */

import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { EventBus } from '../events/EventBus';
import { ValidationError } from '../models/errors';
import { ReservationService } from '../services/ReservationService';
import { Simulator } from '../sim/Simulator';
import { autoSimulationSchema, simulationSchema } from '../validation/schemas';

const DAY_MS = 24 * 3_600_000;
const MAX_RANGE_DAYS = 31;
const MAX_SSE_CLIENTS = 100;
const HEARTBEAT_MS = 25_000;

const parseDate = (value: unknown, name: string): Date | undefined => {
  if (value === undefined) return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Invalid "${name}" date`);
  }
  return date;
};

export class LiveController {
  constructor(
    private readonly reservations: ReservationService,
    private readonly events: EventBus,
    private readonly simulator: Simulator
  ) {}

  /** GET /api/reservations?from&to — solo datos no sensibles. */
  calendar = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const from =
        parseDate(req.query.from, 'from') ?? new Date(Date.now() - DAY_MS);
      const to =
        parseDate(req.query.to, 'to') ?? new Date(from.getTime() + 8 * DAY_MS);
      if (to.getTime() <= from.getTime()) {
        throw new ValidationError('"to" must be after "from"');
      }
      if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
        throw new ValidationError(`Range cannot exceed ${MAX_RANGE_DAYS} days`);
      }

      const list = await this.reservations.getCalendar(from, to);
      res.json(
        list.map((r) => ({
          id: r.id,
          roomId: r.roomId,
          startDate: r.startDate,
          endDate: r.endDate,
          status: r.status,
        }))
      );
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/events — Server-Sent Events tras cada commit. */
  stream = (req: Request, res: Response): void => {
    if (this.events.listenerCount >= MAX_SSE_CLIENTS) {
      res.status(503).json({ error: 'Too many live connections' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n: connected\n\n');

    const unsubscribe = this.events.subscribe((event) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  };

  /** POST /api/sim/run */
  simulate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const input = req.body as z.infer<typeof simulationSchema>;
      res.json(await this.simulator.run(input));
    } catch (error) {
      next(error);
    }
  };

  autoStart = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const input = req.body as z.infer<typeof autoSimulationSchema>;
      res.json(await this.simulator.startAuto(input));
    } catch (error) {
      next(error);
    }
  };

  autoStop = (_req: Request, res: Response): void => {
    res.json(this.simulator.stopAuto());
  };

  autoStatus = (_req: Request, res: Response): void => {
    res.json(this.simulator.autoStatus());
  };

  reset = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.simulator.stopAuto();
      await this.simulator.reset();
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  };
}
