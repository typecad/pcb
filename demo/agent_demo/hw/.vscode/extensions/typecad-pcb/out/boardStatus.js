"use strict";
// ---------------------------------------------------------------------------
// Pure builder for the status bar entry (HAL's board-target line, pcb
// flavored). vscode-free so the formatting stays unit-testable.
//
// The tooltip is MARKDOWN: lines carry command links ([Build Board](command:…))
// the extension wraps in a trusted MarkdownString — plain lines render as
// paragraphs, so join with blank lines.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.statusContent = statusContent;
function statusContent(s) {
    if (!s.boardName) {
        return {
            text: '$(circuit-board) typeCAD/pcb — no board',
            tooltip: 'typeCAD/pcb — no compiled board yet.\n\nClick to run the build, or use the ▶ Build Board lens on any hw source.',
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
    else {
        // counts reset on every rebuild — say so, or a fresh chip reads as clean
        tooltip.push('DRC: not run for this revision — [Run DRC](command:typecad-pcb.runDrc)');
    }
    if (s.stale) {
        text += ' · stale';
        tooltip.push('Source files changed since the last build — [Build Board](command:typecad-pcb.buildBoard).');
    }
    return { text, tooltip: tooltip.join('\n\n') };
}
//# sourceMappingURL=boardStatus.js.map