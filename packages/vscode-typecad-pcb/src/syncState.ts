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
  /** the last auto-build failed — cleared by the next success */
  lastError: string | null;
}

export const sync: SyncState = {
  building: false,
  applyBusy: false,
  lastError: null,
};

/** True while either pipeline owns the build step. */
export function pipelineBusy(): boolean {
  return sync.building || sync.applyBusy;
}
