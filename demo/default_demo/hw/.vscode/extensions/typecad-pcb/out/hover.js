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
exports.renderNetHover = renderNetHover;
exports.quotedTextAt = quotedTextAt;
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
/**
 * The net hover card: declared/routed provenance, a single-pin warning, and
 * the editor→board half of net cross-probing (highlight the net's traces).
 */
function renderNetHover(net, singlePin) {
    const lines = [];
    lines.push(`$(circuit-board) net **${bold(net.name)}**`);
    lines.push('');
    if (singlePin) {
        lines.push('$(warning) only one pin on this net — see Problems');
        lines.push('');
    }
    const origin = [];
    if (net.source)
        origin.push(`declared ${code(net.source)}`);
    if (net.routeSource)
        origin.push(`routed ${code(net.routeSource)}`);
    if (origin.length > 0) {
        lines.push(`_${cell(origin.join(' · '))}_`);
        lines.push('');
    }
    const args = encodeURIComponent(JSON.stringify([net.name]));
    lines.push(`[$(symbol-parameter) show on board](command:typecad-pcb.viewNet?${args})`);
    return lines.join('\n');
}
/**
 * Full text of the string literal containing the column, or null. Net names
 * carry characters the word tokenizer splits on ("Net-(R1-Pad2)", names with
 * spaces), so the net hover needs the whole quoted span, not the word under
 * the cursor.
 */
function quotedTextAt(line, character) {
    for (const match of line.matchAll(/'([^']*)'|"([^"]*)"/g)) {
        const text = match[1] ?? match[2] ?? '';
        const start = (match.index ?? 0) + 1;
        if (character >= start && character <= start + text.length)
            return text;
    }
    return null;
}
//# sourceMappingURL=hover.js.map