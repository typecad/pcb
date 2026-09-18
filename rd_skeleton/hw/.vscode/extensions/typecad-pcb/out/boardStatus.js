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
    if (s.drcErrors !== null || s.drcWarnings !== null) {
        const errors = s.drcErrors ?? 0;
        const warnings = s.drcWarnings ?? 0;
        // one "·"-separated segment so a warnings-only count ("· 2W") doesn't
        // glue onto the parts count
        const counts = [
            ...(errors > 0 ? [`${errors}E`] : []),
            ...(warnings > 0 ? [`${warnings}W`] : []),
        ];
        if (counts.length > 0)
            text += ` · ${counts.join(' ')}`;
        tooltip.push(`DRC: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'} — click to view`);
    }
    if (s.stale) {
        text += ' · stale';
        tooltip.push('Source files changed since the last build — run ▶ Build Board.');
    }
    return { text, tooltip: tooltip.join('\n') };
}
//# sourceMappingURL=boardStatus.js.map