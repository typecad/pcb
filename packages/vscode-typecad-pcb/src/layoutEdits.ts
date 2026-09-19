// ---------------------------------------------------------------------------
// Layout-view placement edits: pure text transforms, no vscode dependency —
// the unit tests exercise exactly what `typecad/layout-rebuild` runs.
//
// A move arrives as a per-ref delta in board (y-down) millimetres. The
// component's source variable resolves elsewhere (the board's "Code"
// property); here we rewrite `<var>.pcb = { x: …, y: …, … }` literals by the
// delta. Literals only: a computed placement (x: b.center.x) is reported as
// skipped, never mangled.
// ---------------------------------------------------------------------------

export interface LayoutMove {
  ref: string;
  dx: number;
  dy: number;
  /** accumulated rotation in degrees (R-key presses) — added to the literal */
  rot?: number;
  /** the component's ORIGINAL pad centers, board frame — sticky endpoints */
  pads?: Array<{ x: number; y: number }>;
}

export interface PlacementEdit {
  /** the board reference this edit moves */
  ref: string;
  /** whole-line replacement for the matched literal */
  line: string;
  /** character range of the original match within the document */
  start: number;
  end: number;
}

export interface LayoutEditResult {
  edits: PlacementEdit[];
  /** refs that could not be applied, with the reason */
  skipped: Array<{ ref: string; reason: string }>;
}

/** Matches `  var.pcb = { … }` (leading indent captured, literal body only). */
function placementMatcher(variable: string): RegExp {
  return new RegExp(`^([ \\t]*)${escapeRegExp(variable)}\\.pcb\\s*=\\s*\\{([^}]*)\\}`, 'm');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** mm with up to 3 decimals, trailing zeros stripped — reads like hand-written code */
function fmt(n: number): string {
  return String(parseFloat(n.toFixed(3)));
}

/**
 * Compute the literal rewrites for `moves` against one source document.
 * `variableOf` maps a board reference to its source variable (empty/absent
 * when unknown). Only the first matching document wins per ref — pass each
 * src file in turn and stop when a ref resolves.
 */
export function planPlacementEdits(
  text: string,
  moves: LayoutMove[],
  variableOf: (ref: string) => string | undefined,
): LayoutEditResult {
  const edits: PlacementEdit[] = [];
  const skipped: Array<{ ref: string; reason: string }> = [];
  for (const move of moves) {
    const variable = variableOf(move.ref);
    if (!variable) {
      skipped.push({ ref: move.ref, reason: 'no source variable' });
      continue;
    }
    const match = placementMatcher(variable).exec(text);
    if (!match) {
      skipped.push({ ref: move.ref, reason: `no \`${variable}.pcb = {…}\` literal found` });
      continue;
    }
    const inner = match[2];
    const xNum = /\bx\s*:\s*(-?[\d.]+)/.exec(inner);
    const yNum = /\by\s*:\s*(-?[\d.]+)/.exec(inner);
    if (!xNum || !yNum) {
      skipped.push({ ref: move.ref, reason: 'placement is computed, not a literal' });
      continue;
    }
    const nx = parseFloat(xNum[1]) + move.dx;
    const ny = parseFloat(yNum[1]) + move.dy;
    let newInner = inner.replace(/\bx\s*:\s*-?[\d.]+/, `x: ${fmt(nx)}`).replace(/\by\s*:\s*-?[\d.]+/, `y: ${fmt(ny)}`);
    // rotation rides as a delta onto the literal's field (0 or absent = 0)
    if (move.rot) {
      const rotNum = /\brotation\s*:\s*(-?[\d.]+)/.exec(inner);
      const newRot = (rotNum ? parseFloat(rotNum[1]) : 0) + move.rot;
      if (rotNum) newInner = newInner.replace(/\brotation\s*:\s*-?[\d.]+/, `rotation: ${fmt(newRot)}`);
      else newInner = `${newInner.trimEnd()}, rotation: ${fmt(newRot)} `;
    }
    edits.push({
      ref: move.ref,
      line: `${match[1]}${variable}.pcb = { ${newInner.trim()} }`,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return { edits, skipped };
}

/**
 * Sticky TrackBuilder endpoints: any `.from({ x: …, y: … })` / `.to({ … })`
 * literal whose coordinates sit on one of the moved component's ORIGINAL
 * pads (within 0.05 mm) translates by the same delta — hand-built routes
 * follow the part instead of dangling. Pure numeric literals only.
 */
export function planEndpointEdits(
  text: string,
  move: LayoutMove,
): PlacementEdit[] {
  const pads = move.pads ?? [];
  if (pads.length === 0 || (!move.dx && !move.dy)) return [];
  const edits: PlacementEdit[] = [];
  // translate a numeric literal by delta, keeping ITS decimal precision
  // (source coordinates can carry 4+ decimals; rounding to 3 would erode
  // them every apply)
  const shift = (axis: 'x' | 'y') => (whole: string, lead: string, num: string): string => {
    const decimals = Math.max((num.split('.')[1] ?? '').length, 3);
    const value = (parseFloat(num) + (axis === 'x' ? move.dx : move.dy)).toFixed(decimals);
    return `${lead}${parseFloat(value)}`;
  };
  for (const kind of ['from', 'to'] as const) {
    const re = new RegExp(`\\.${kind}\\(\\{\\s*x\\s*:\\s*(-?[\\d.]+)\\s*,\\s*y\\s*:\\s*(-?[\\d.]+)`, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const ex = parseFloat(match[1]);
      const ey = parseFloat(match[2]);
      if (!pads.some((p) => Math.abs(p.x - ex) < 0.05 && Math.abs(p.y - ey) < 0.05)) continue;
      // only the x/y numbers inside this literal move — layer/width stay
      const head = text.indexOf('{', match.index);
      const tail = text.indexOf('}', head);
      if (head === -1 || tail === -1) continue;
      const inner = text.slice(head + 1, tail);
      const newInner = inner
        .replace(/(\bx\s*:\s*)(-?[\d.]+)/, shift('x'))
        .replace(/(\by\s*:\s*)(-?[\d.]+)/, shift('y'));
      edits.push({
        ref: `${move.ref} route endpoint`,
        // the replacement covers exactly [match.index, tail+1] — the literal
        // through its closing brace, nothing beyond
        line: `${text.slice(match.index, head + 1)}${newInner}}`,
        start: match.index,
        end: tail + 1,
      });
    }
  }
  return edits;
}

/** Apply planned edits to a document's text (latest edit first, ranges stay valid). */
export function applyPlacementEdits(text: string, edits: PlacementEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  for (const edit of sorted) out = out.slice(0, edit.start) + edit.line + out.slice(edit.end);
  return out;
}

// ---------------------------------------------------------------------------
// Silk/fab text edits (gr_text — the pcb.text() API): a `.text({ … })` call
// literal is matched by its authored value + x/y anchor, then rewritten with
// the new value/anchor/rotation. Literals only; nested-object props (justify)
// are skipped over, not parsed.
// ---------------------------------------------------------------------------

export interface TextEditInput {
  /** authored text + anchor (board frame) the source literal is matched by */
  text0: string;
  x0: number;
  y0: number;
  /** final value + anchor (board frame); rot = accumulated 90° presses */
  text: string;
  x: number;
  y: number;
  rot: number;
}

/** Find the balanced `{ … }` object literal starting at/after the call head. */
function objectLiteralRange(text: string, head: number): { head: number; open: number; close: number } | null {
  const open = text.indexOf('{', head);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { head, open, close: i };
    }
  }
  return null;
}

/**
 * Compute the `.text({ … })` literal rewrites for `edits` against one source
 * document. A call matches an edit when its x/y literals sit within 0.05 mm
 * of the authored anchor and its text literal equals the authored value.
 */
export function planTextEdits(text: string, edits: TextEditInput[]): LayoutEditResult {
  const planned: PlacementEdit[] = [];
  const skipped: Array<{ ref: string; reason: string }> = [];
  const used = new Set<number>();
  const callRe = /\.text\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = callRe.exec(text)) !== null) {
    const range = objectLiteralRange(text, match.index);
    if (!range) continue;
    const inner = text.slice(range.open + 1, range.close);
    const xNum = /\bx\s*:\s*(-?[\d.]+)/.exec(inner);
    const yNum = /\by\s*:\s*(-?[\d.]+)/.exec(inner);
    const tNum = /\btext\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/.exec(inner);
    if (!xNum || !yNum || !tNum) continue;
    const cx = parseFloat(xNum[1]);
    const cy = parseFloat(yNum[1]);
    const ctext = tNum[2];
    const edit = edits.find(
      (e, i) =>
        !used.has(i) &&
        e.text0 === ctext &&
        Math.abs(e.x0 - cx) < 0.05 &&
        Math.abs(e.y0 - cy) < 0.05,
    );
    if (!edit) continue;
    used.add(edits.indexOf(edit));
    let newInner = inner;
    if (edit.text !== ctext) {
      const esc = edit.text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
      newInner = newInner.replace(tNum[0], () => `text: ${tNum[1]}${esc}${tNum[1]}`);
    }
    if (edit.x !== cx) newInner = newInner.replace(/\bx\s*:\s*-?[\d.]+/, `x: ${fmt(edit.x)}`);
    if (edit.y !== cy) newInner = newInner.replace(/\by\s*:\s*-?[\d.]+/, `y: ${fmt(edit.y)}`);
    // rotation accumulates onto the literal like placements (absent = 0)
    if (edit.rot) {
      const rotNum = /\brotation\s*:\s*(-?[\d.]+)/.exec(inner);
      const newRot = (rotNum ? parseFloat(rotNum[1]) : 0) + edit.rot;
      if (rotNum) newInner = newInner.replace(/\brotation\s*:\s*-?[\d.]+/, `rotation: ${fmt(newRot)}`);
      else newInner = `${newInner.trimEnd()}, rotation: ${fmt(newRot)} `;
    }
    planned.push({
      ref: `text "${edit.text0}"`,
      // exactly the call's object literal, nothing beyond
      line: `${text.slice(match.index, range.open + 1)}${newInner}}`,
      start: match.index,
      end: range.close + 1,
    });
  }
  for (let i = 0; i < edits.length; i++) {
    if (!used.has(i))
      skipped.push({ ref: `text "${edits[i]!.text0}"`, reason: 'no .text({…}) literal matches its authored value/anchor' });
  }
  return { edits: planned, skipped };
}
