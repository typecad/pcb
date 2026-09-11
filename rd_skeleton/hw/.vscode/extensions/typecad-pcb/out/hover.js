"use strict";
// ---------------------------------------------------------------------------
// The hover card. Pure string → string so it is unit-tested without VS Code.
//
// Pad status mirrors the CLI's own `unconnectedPads` definition: a pad is
// unconnected when it carries no net and is not np_thru_hole (mechanical
// mounting holes are legitimately net-less).
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderComponentHover = renderComponentHover;
/** Make a string safe inside a markdown table cell (pipes break the table). */
function cell(text) {
    return text.replace(/\|/g, '\\|').trim();
}
/**
 * The bold hover title is plain markdown, so schematic-controlled text (a
 * value with backticks, asterisks, brackets) must not open spans or links
 * halfway through it. cell() is not enough here — it must also not run over
 * code() output, whose backticks are load-bearing.
 */
function bold(text) {
    return text
        .replace(/`/g, "'")
        .replace(/[*_[\]]/g, (ch) => `\\${ch}`)
        .replace(/\|/g, '\\|');
}
/** Names render as code spans; embedded backticks become quotes, and pipes
 * are escaped so a code span cannot split the enclosing table row. */
function code(text) {
    return `\`${text.replace(/`/g, "'").replace(/\|/g, '\\|')}\``;
}
function padRow(pad) {
    const signal = pad.pinType ?? (pad.type === 'np_thru_hole' ? 'mechanical' : '');
    let status;
    if (pad.net !== null) {
        status = '$(check) connected';
    }
    else if (pad.type === 'np_thru_hole') {
        status = '$(circle-slash) mechanical';
    }
    else {
        status = '$(warning) unconnected';
    }
    const net = pad.net !== null ? code(pad.net) : '—';
    // Mounting holes carry no pad number in the .kicad_pcb.
    return `| ${cell(pad.pad) || '—'} | ${net} | ${cell(signal)} | ${status} |`;
}
function renderComponentHover(detail) {
    const lines = [];
    const title = detail.value ? `${detail.reference} — ${detail.value}` : detail.reference;
    lines.push(`$(circuit-board) **${bold(title)}**`);
    if (detail.footprint) {
        lines.push('');
        lines.push(code(detail.footprint));
    }
    const placement = [detail.side, `(${detail.at.x}, ${detail.at.y})`];
    if (detail.at.rotation)
        placement.push(`rot ${detail.at.rotation}°`);
    if (detail.dimensions)
        placement.push(`${detail.dimensions.width} × ${detail.dimensions.height} mm`);
    lines.push('');
    lines.push(cell(placement.filter((p) => p !== '').join(' · ')));
    if (detail.pads.length > 0) {
        lines.push('');
        lines.push('| Pad | Net | Signal | Status |');
        lines.push('| :-: | :-- | :-- | :-- |');
        for (const pad of detail.pads)
            lines.push(padRow(pad));
        const electrical = detail.pads.filter((p) => p.type !== 'np_thru_hole');
        const connected = electrical.filter((p) => p.net !== null).length;
        lines.push('');
        if (connected === electrical.length) {
            lines.push(`$(check) all ${electrical.length} pad${electrical.length === 1 ? '' : 's'} connected`);
        }
        else {
            lines.push(`$(warning) ${connected} of ${electrical.length} pads connected — ${electrical.length - connected} unconnected`);
        }
    }
    const origin = [];
    if (detail.source)
        origin.push(code(detail.source));
    if (detail.variable)
        origin.push(`variable ${code(detail.variable)}`);
    if (origin.length > 0) {
        lines.push('');
        lines.push(`_${cell(origin.join(' · '))}_`);
    }
    // Cross-probe: open the board viewer centered on this component. Command
    // URIs require a trusted markdown string; the extension narrows trust to
    // exactly this command.
    const args = encodeURIComponent(JSON.stringify([detail.reference]));
    lines.push('');
    lines.push(`[$(symbol-module) view on board](command:typecad-pcb.viewComponent?${args})`);
    return lines.join('\n');
}
//# sourceMappingURL=hover.js.map