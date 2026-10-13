import { createInMemoryServices } from '../../src/container';
import { runPool } from '../../src/sim/pool';
import { Simulator } from '../../src/sim/Simulator';

describe('runPool', () => {
  it('no supera el límite de tareas en vuelo', async () => {
    let inFlight = 0;
    let peak = 0;
    const tasks = Array.from({ length: 20 }, () => async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
    });
    await runPool(tasks, 4);
    expect(peak).toBe(4);
  });

  it('aísla los fallos: una tarea que lanza no interrumpe al resto', async () => {
    const results = await runPool(
      [async () => 1, async () => { throw new Error('x'); }, async () => 3],
      2
    );
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
  });
});

describe('Simulator', () => {
  it('mantiene los invariantes y contabiliza todas las operaciones', async () => {
    const { services } = createInMemoryServices();
    const report = await new Simulator(services).run({
      operations: 200,
      concurrency: 25,
      seed: 7,
    });

    expect(report.invariants.noOverlaps).toBe(true);
    expect(report.invariants.noNegativeBalances).toBe(true);
    expect(report.outcomes.errors).toBe(0);
    expect(report.outcomes.confirmed).toBeGreaterThan(0);
    expect(report.outcomes.conflicts).toBeGreaterThan(0);

    const o = report.outcomes;
    expect(
      o.confirmed + o.conflicts + o.insufficientBalance + o.cancelled +
        o.cancelRejected + o.advanced + o.advanceRejected
    ).toBe(200);
  });

  it('es reproducible con la misma semilla', async () => {
    const run = async () => {
      const { services } = createInMemoryServices();
      return (await new Simulator(services).run({ operations: 80, concurrency: 8, seed: 42 })).outcomes;
    };
    expect(await run()).toEqual(await run());
  });
});
