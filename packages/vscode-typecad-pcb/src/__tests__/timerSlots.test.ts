import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimerSlots } from '../timerSlots.js';

describe('TimerSlots', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('arming a slot replaces that slot’s pending timer', () => {
    const t = new TimerSlots();
    const a = vi.fn();
    const b = vi.fn();
    t.arm('debounce', 1_000, a);
    t.arm('debounce', 1_000, b);
    vi.advanceTimersByTime(1_000);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('slots are independent — a debounce never cancels the backoff retry', () => {
    const t = new TimerSlots();
    const retry = vi.fn();
    const debounce = vi.fn();
    t.arm('retry', 30_000, retry);
    t.arm('debounce', 1_500, debounce);
    vi.advanceTimersByTime(1_500);
    expect(debounce).toHaveBeenCalledTimes(1);
    expect(t.has('retry')).toBe(true);
    vi.advanceTimersByTime(28_500);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('a fired slot is no longer pending', () => {
    const t = new TimerSlots();
    t.arm('show', 10, () => undefined);
    expect(t.pending()).toEqual(['show']);
    vi.advanceTimersByTime(10);
    expect(t.pending()).toEqual([]);
  });

  it('clear() drops everything (panel disposed)', () => {
    const t = new TimerSlots();
    const fn = vi.fn();
    t.arm('debounce', 10, fn);
    t.arm('retry', 10, fn);
    t.arm('show', 10, fn);
    t.clear();
    vi.advanceTimersByTime(1_000);
    expect(fn).not.toHaveBeenCalled();
    expect(t.pending()).toEqual([]);
  });
});
