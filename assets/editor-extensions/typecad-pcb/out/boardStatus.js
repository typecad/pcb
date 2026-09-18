"use strict";
// ---------------------------------------------------------------------------
// Pure builder for the status bar entry (HAL's board-target line, pcb
// flavored). vscode-free so the formatting stays unit-testable.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.statusContent = statusContent;
function statusContent(s) {
    if (!s.boardName) {
        return {
            text: '$(circuit-board) typeCAD/pcb — no board',
            tooltip: 'typeCAD/pcb — no compiled board yet.\nClick to open the Board viewer, or run the ▶ Build Board lens.',
        };
    }
    const tooltip = [`typeCAD/pcb — ${s.boardName}`];
    let text = `$(circuit-board) ${s.boardName}`;
    if (s.parts !== null) {
        text += ` · ${s.parts} part${s.parts === 1 ? '' : 's'}`;
        tooltip.push(`${s.parts} component${s.parts === 1 ? '' : 's'}`);
    }
    if (s.unconnected !== null && s.unconnected > 0) {
        text += ` · ${s.unconnected} unconnected`;
        tooltip.push(`${s.unconnected} unconnected pad${s.unconnected === 1 ? '' : 's'} / single-pin net${s.unconnected === 1 ? '' : 's'} (see Problems)`);
    }
    if (s.drcErrors !== null) {
        if (s.drcErrors > 0)
            text += ` · ${s.drcErrors}E`;
        if (s.drcWarnings !== null && s.drcWarnings > 0)
            text += ` ${s.drcWarnings}W`;
        tooltip.push(`DRC: ${s.drcErrors} error${s.drcErrors === 1 ? '' : 's'}, ${s.drcWarnings ?? 0} warning${s.drcWarnings === 1 ? '' : 's'} — click to view`);
    }
    if (s.stale) {
        text += ' · stale';
        tooltip.push('Source files changed since the last build — run ▶ Build Board.');
    }
    return { text, tooltip: tooltip.join('\n') };
}
//# sourceMappingURL=boardStatus.js.map