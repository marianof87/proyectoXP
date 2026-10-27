import type { Server } from 'http';
import type { AddressInfo } from 'net';

import { createApp } from '../../src/app';
import { createInMemoryServices, Services } from '../../src/container';
import { RouterOptions } from '../../src/routes';

const start = async (options: RouterOptions = {}) => {
  const { services } = createInMemoryServices();
  const server: Server = await new Promise((resolve) => {
    const s = createApp(services, options).listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { services, server, base };
};

const book = (services: Services, userId: number, roomId: number, h: number) =>
  services.reservationService.bookRoom({
    userId,
    roomId,
    startDate: new Date(Date.UTC(2030, 0, 1, h)),
    endDate: new Date(Date.UTC(2030, 0, 1, h + 1)),
  });

describe('API en vivo (HU-12)', () => {
  let ctx: Awaited<ReturnType<typeof start>>;
  afterEach(async () => {
    ctx.server.closeAllConnections();
    await new Promise((r) => ctx.server.close(r));
  });

  it('el simulador no existe si no está habilitado (404)', async () => {
    ctx = await start();
    const res = await fetch(`${ctx.base}/api/sim/run`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('el simulador corre con el flag y respeta los topes', async () => {
    ctx = await start({ enableSimulator: true });
    const ok = await fetch(`${ctx.base}/api/sim/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations: 30, concurrency: 5, seed: 1 }),
    });
    expect(ok.status).toBe(200);
    const report = (await ok.json()) as { invariants: { noOverlaps: boolean } };
    expect(report.invariants.noOverlaps).toBe(true);

    const tooMany = await fetch(`${ctx.base}/api/sim/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations: 501 }),
    });
    expect(tooMany.status).toBe(400);
  });

  it('el calendario devuelve solo datos no sensibles', async () => {
    ctx = await start();
    const user = await ctx.services.userService.registerUser({
      email: 'a@b.co', name: 'A', password: 'Password123!',
    });
    await ctx.services.userService.addBalance(user.id, 100);
    const room = await ctx.services.roomService.createRoom({
      name: 'S', capacity: 2, hourlyRate: 10,
    });
    await book(ctx.services, user.id, room.id, 9);

    const res = await fetch(
      `${ctx.base}/api/reservations?from=2030-01-01T00:00:00Z&to=2030-01-02T00:00:00Z`
    );
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(Object.keys(body[0]).sort()).toEqual(
      ['endDate', 'id', 'roomId', 'startDate', 'status']
    );
  });

  it('rechaza rangos inválidos del calendario', async () => {
    ctx = await start();
    const res = await fetch(`${ctx.base}/api/reservations?from=2030-02-01&to=2030-01-01`);
    expect(res.status).toBe(400);
  });

  it('publica eventos SSE solo tras un commit exitoso', async () => {
    ctx = await start();
    const user = await ctx.services.userService.registerUser({
      email: 'a@b.co', name: 'A', password: 'Password123!',
    });
    await ctx.services.userService.addBalance(user.id, 100);
    const room = await ctx.services.roomService.createRoom({
      name: 'S', capacity: 2, hourlyRate: 10,
    });

    const res = await fetch(`${ctx.base}/api/events`);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    await reader.read(); // comentario inicial

    await book(ctx.services, user.id, room.id, 9);
    // Choque: falla; no publica "created" (sí un "rejected").
    await expect(book(ctx.services, user.id, room.id, 9)).rejects.toThrow();
    await book(ctx.services, user.id, room.id, 12);

    let text = '';
    while ((text.match(/event: reservation\.created/g) ?? []).length < 2) {
      const { value } = await reader.read();
      text += new TextDecoder().decode(value);
    }
    expect((text.match(/event: reservation\.rejected/g) ?? []).length).toBe(1);
    expect((text.match(/event: reservation\.created/g) ?? []).length).toBe(2);
    await reader.cancel();
  });

  it('devuelve 429 al superar el límite de la API', async () => {
    ctx = await start({
      rateLimit: {
        general: { windowMs: 60_000, max: 5 },
        auth: { windowMs: 60_000, max: 2 },
      },
    });
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await fetch(`${ctx.base}/api/rooms`)).status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
  });

  it('limita más el login que el resto de la API', async () => {
    ctx = await start({
      rateLimit: {
        general: { windowMs: 60_000, max: 100 },
        auth: { windowMs: 60_000, max: 2 },
      },
    });
    const login = () =>
      fetch(`${ctx.base}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'x@y.co', password: 'nope' }),
      });
    const statuses = [(await login()).status, (await login()).status, (await login()).status];
    expect(statuses).toEqual([401, 401, 429]);
  });
});
