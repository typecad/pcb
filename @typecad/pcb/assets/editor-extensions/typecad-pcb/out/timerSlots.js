"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerSlots = void 0;
class TimerSlots {
    constructor() {
        this.timers = new Map();
    }
    arm(slot, delayMs, fn) {
        this.cancel(slot);
        const handle = setTimeout(() => {
            this.timers.delete(slot);
            fn();
        }, delayMs);
        this.timers.set(slot, handle);
    }
    cancel(slot) {
        const handle = this.timers.get(slot);
        if (handle)
            clearTimeout(handle);
        this.timers.delete(slot);
    }
    has(slot) {
        return this.timers.has(slot);
    }
    /** The slots with a pending timer (diagnostics / tests). */
    pending() {
        return [...this.timers.keys()];
    }
    clear() {
        for (const handle of this.timers.values())
            clearTimeout(handle);
        this.timers.clear();
    }
}
exports.TimerSlots = TimerSlots;
//# sourceMappingURL=timerSlots.js.map