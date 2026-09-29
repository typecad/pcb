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
exports.sync = {
    building: false,
    applyBusy: false,
    lastError: null,
};
/** True while either pipeline owns the build step. */
function pipelineBusy() {
    return exports.sync.building || exports.sync.applyBusy;
}
//# sourceMappingURL=syncState.js.map