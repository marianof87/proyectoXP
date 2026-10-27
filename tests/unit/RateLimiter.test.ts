import { Request, Response } from 'express';

import { createRateLimiter } from '../../src/middleware/rateLimiter';

const fakeRes = () => {
  const res = {
    headers: {} as Record<string, string>,
    statusCode: 200,
    body: undefined as unknown,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
  return res;
};

const hit = (limiter: ReturnType<typeof createRateLimiter>, ip: string) => {
  const res = fakeRes();
  const next = jest.fn();
  limiter({ ip } as Request, res as unknown as Response, next);
  return { res, passed: next.mock.calls.length === 1 };
};

describe('createRateLimiter', () => {
  it('permite hasta el máximo y responde 429 después', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 3, now: () => 0 });
    expect([1, 2, 3].map(() => hit(limiter, 'a').passed)).toEqual([
      true,
      true,
      true,
    ]);
    const blocked = hit(limiter, 'a');
    expect(blocked.passed).toBe(false);
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.res.headers['Retry-After']).toBe('1');
    expect(blocked.res.headers['X-RateLimit-Remaining']).toBe('0');
  });

  it('cuenta cada cliente por separado', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => 0 });
    expect(hit(limiter, 'a').passed).toBe(true);
    expect(hit(limiter, 'b').passed).toBe(true);
    expect(hit(limiter, 'a').passed).toBe(false);
  });

  it('reinicia el contador al vencer la ventana', () => {
    let t = 0;
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => t });
    expect(hit(limiter, 'a').passed).toBe(true);
    expect(hit(limiter, 'a').passed).toBe(false);
    t = 1000;
    expect(hit(limiter, 'a').passed).toBe(true);
  });

  it('informa el límite y lo que queda en las cabeceras', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 5, now: () => 0 });
    const { res } = hit(limiter, 'a');
    expect(res.headers['X-RateLimit-Limit']).toBe('5');
    expect(res.headers['X-RateLimit-Remaining']).toBe('4');
  });
});
