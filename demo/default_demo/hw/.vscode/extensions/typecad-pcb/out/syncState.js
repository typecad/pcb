"use strict";
// ---------------------------------------------------------------------------
// Shared sync state between the extension shell and the Board viewer panel.
// vscode-free on purpose: the source watcher / status indicator (extension.ts)
// and the apply pipeline (viewer.ts) coordinate through it so the apply's
// own source writes never trigger a duplicate auto-build, and so the status
// bar can say what the pipeline is doing.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.sync = void 0;
exports.pipelineBusy = pipelineBusy;
exports.buildOwed = buildOwed;
exports.onSyncChange = onSyncChange;
exports.setSyncPaused = setSyncPaused;
exports.sync = {
    building: false,
    applyBusy: false,
    absorbing: false,
    paused: null,
    lastError: null,
    lastBuildStartedAt: 0,
};
/** True while either pipeline owns the build step. */
function pipelineBusy() {
    return exports.sync.building || exports.sync.applyBusy || exports.sync.absorbing;
}
/**
 * Does the board owe a build? Sources newer than the board, OR sources
 * written after the last build started (saved mid-build: the board landed
 * later, so its mtime hides the edit). Null board = nothing built yet —
 * not the auto-build's job (matches boardStale's null).
 */
function buildOwed(newestSourceMtime, boardMtime, lastBuildStartedAt) {
    if (boardMtime === null)
        return false;
    if (newestSourceMtime > boardMtime)
        return true;
    return lastBuildStartedAt > 0 && newestSourceMtime > lastBuildStartedAt;
}
// The status bar lives in extension.ts; the pipeline that changes `paused`
// lives in viewer.ts. A one-slot listener keeps them decoupled and vscode-free.
let syncListener = null;
function onSyncChange(fn) {
    syncListener = fn;
}
/** Set (or clear, with null) the paused reason; notifies only on a change. */
function setSyncPaused(reason) {
    if (exports.sync.paused === reason)
        return;
    exports.sync.paused = reason;
    syncListener?.();
}
//# sourceMappingURL=syncState.js.map