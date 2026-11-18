// ---------------------------------------------------------------------------
// Shared sync state between the extension shell and the Board viewer panel.
// vscode-free on purpose: the source watcher / status indicator (extension.ts)
// and the apply pipeline (viewer.ts) coordinate through it so the apply's
// own source writes never trigger a duplicate auto-build, and so the status
// bar can say what the pipeline is doing.
// ---------------------------------------------------------------------------

export interface SyncState {
  /** an auto-build (source watcher / staleness sweep) is running */
  building: boolean;
  /** a layout apply owns the pipeline — its edits must not double-build */
  applyBusy: boolean;
  /** the viewer is absorbing a board-side edit into source (import --apply)
   *  — its source writes must not race a render or double-build */
  absorbing: boolean;
  /** Why automatic board→source maintenance has stopped, or null. Set when
   *  the importer cannot reach a fixed point (the circuit breaker tripped)
   *  or the build does not reproduce source; cleared by the next render that
   *  finds the board and sources in sync. Surfaced in the status bar so a
   *  stalled sync is a visible state, not a line in an output channel. */
  paused: string | null;
  /** the last auto-build failed — cleared by the next success */
  lastError: string | null;
  /** Date.now() when the most recent build (auto-build or apply) STARTED
   *  reading sources — 0 before any. A source written after this moment may
   *  be missing from the board even though the board's mtime is newer (the
   *  build finished after the save), so the board-mtime test alone loses it. */
  lastBuildStartedAt: number;
}

export const sync: SyncState = {
  building: false,
  applyBusy: false,
  absorbing: false,
  paused: null,
  lastError: null,
  lastBuildStartedAt: 0,
};

/** True while either pipeline owns the build step. */
export function pipelineBusy(): boolean {
  return sync.building || sync.applyBusy || sync.absorbing;
}

/**
 * Does the board owe a build? Sources newer than the board, OR sources
 * written after the last build started (saved mid-build: the board landed
 * later, so its mtime hides the edit). Null board = nothing built yet —
 * not the auto-build's job (matches boardStale's null).
 */
export function buildOwed(newestSourceMtime: number, boardMtime: number | null, lastBuildStartedAt: number): boolean {
  if (boardMtime === null) return false;
  if (newestSourceMtime > boardMtime) return true;
  return lastBuildStartedAt > 0 && newestSourceMtime > lastBuildStartedAt;
}

// The status bar lives in extension.ts; the pipeline that changes `paused`
// lives in viewer.ts. A one-slot listener keeps them decoupled and vscode-free.
let syncListener: (() => void) | null = null;

export function onSyncChange(fn: (() => void) | null): void {
  syncListener = fn;
}

/** Set (or clear, with null) the paused reason; notifies only on a change. */
export function setSyncPaused(reason: string | null): void {
  if (sync.paused === reason) return;
  sync.paused = reason;
  syncListener?.();
}
