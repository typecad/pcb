// ---------------------------------------------------------------------------
// Named single-slot timers for the viewer's refresh scheduling. The viewer
// used to keep three loose `NodeJS.Timeout` fields (the watcher debounce, the
// retry/backoff re-check, the first-open retry), each cleared by hand at its
// own call sites and none cleared when the panel closed. Centralizing them
// gives one place that guarantees the invariants the ordering bugs came from:
//   - arming a slot REPLACES that slot's pending timer (never two of a kind)
//   - slots are independent — a watcher event's debounce must not cancel the
//     failure ladder's backoff retry (and vice versa)
//   - clear() drops everything pending (panel disposed)
// vscode-free so it unit-tests with fake timers.
// ---------------------------------------------------------------------------

export type TimerSlot = 'debounce' | 'retry' | 'show';

export class TimerSlots {
  private readonly timers = new Map<TimerSlot, NodeJS.Timeout>();

  arm(slot: TimerSlot, delayMs: number, fn: () => void): void {
    this.cancel(slot);
    const handle = setTimeout(() => {
      this.timers.delete(slot);
      fn();
    }, delayMs);
    this.timers.set(slot, handle);
  }

  cancel(slot: TimerSlot): void {
    const handle = this.timers.get(slot);
    if (handle) clearTimeout(handle);
    this.timers.delete(slot);
  }

  has(slot: TimerSlot): boolean {
    return this.timers.has(slot);
  }

  /** The slots with a pending timer (diagnostics / tests). */
  pending(): TimerSlot[] {
    return [...this.timers.keys()];
  }

  clear(): void {
    for (const handle of this.timers.values()) clearTimeout(handle);
    this.timers.clear();
  }
}
