import { describe, expect, it } from 'vitest';
import { createRebuildQueue } from '../watch.js';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('createRebuildQueue', () => {
  it('runs one task at a time and coalesces requests made during a run into one more run', async () => {
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    let release!: () => void;
    const gate = () => new Promise<void>((resolve) => (release = resolve));

    const queue = createRebuildQueue(async () => {
      runs++;
      active++;
      maxActive = Math.max(maxActive, active);
      await gate();
      active--;
    });

    const first = queue.request();
    await tick();
    expect(runs).toBe(1);

    // three saves while the first build is still running
    void queue.request();
    void queue.request();
    void queue.request();
    await tick();
    expect(runs).toBe(1); // nothing overlaps

    release(); // first build ends -> exactly one queued rebuild starts
    await tick();
    expect(runs).toBe(2);
    release();
    await first;

    expect(runs).toBe(2);
    expect(maxActive).toBe(1);
  });

  it('becomes idle again and accepts a later request', async () => {
    let runs = 0;
    const queue = createRebuildQueue(async () => {
      runs++;
    });
    await queue.request();
    await queue.request();
    expect(runs).toBe(2);
  });

  it('survives a task that throws', async () => {
    let runs = 0;
    const queue = createRebuildQueue(async () => {
      runs++;
      if (runs === 1) throw new Error('compile error');
    });
    await expect(queue.request()).resolves.toBeUndefined();
    await queue.request();
    expect(runs).toBe(2);
  });
});
