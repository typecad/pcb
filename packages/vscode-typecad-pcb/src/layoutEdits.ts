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
  /**
   * flip gesture (Shift+F): the component's TARGET side. The literal gains
   * / rewrites `side: 'back'|'front'` — the writer mirrors the footprint's
   * pad-local Y for back-side parts, so `rotation` stays untouched.
   */
  side?: 'front' | 'back';
  /**
   * FINAL pad centers (board frame) matching `pads` 1:1. A flip mirrors
   * each pad's offset, so sticky route endpoints translate PER PAD — a
   * uniform delta would only fit pure moves. Absent = translate by dx/dy.
   */
  padsTo?: Array<{ x: number; y: number }>;
  /**
   * the component's FINAL position, board frame. A part whose placement
   * lives in the constructor's inline `pcb:` option has no `var.pcb = {…}`
   * literal — the first apply INSERTS one, and it must carry the absolute
   * position (the delta would override the constructor placement with a
   * near-(0,0) jump). Optional for older pages; the delta fallback only
   * suits parts truly placed at the origin.
   */
  ax?: number;
  ay?: number;
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

/** A placement move with no literal anywhere, held for the _sync.ts stage
 *  (absolute finals — the sync assignment carries the part's placement). */
export interface DeferredPlacement {
  ref: string;
  variable: string;
  x: number;
  y: number;
  rot: number;
  /** flip gesture target side (Shift+F) — written into the sync placement */
  side?: 'front' | 'back';
}

export interface LayoutEditResult<T = DeferredPlacement> {
  edits: PlacementEdit[];
  /** refs that could not be applied, with the reason */
  skipped: Array<{ ref: string; reason: string }>;
  /** inputs with nothing to rewrite in this file, held for the sync stage */
  deferred?: T[];
}

/**
 * Matches `  var.pcb = { … }` and the sync sidecar's `  parts.var.pcb = { … }`
 * (leading indent and optional `parts.` captured, literal body only).
 */
function placementMatcher(variable: string): RegExp {
  return new RegExp(`^([ \\t]*)(parts\\.)?${escapeRegExp(variable)}\\.pcb\\s*=\\s*\\{([^}]*)\\}`, 'm');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escape a value for splicing into an existing quoted string literal. */
function escapeQuoted(value: string, quote: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(new RegExp(escapeRegExp(quote), 'g'), `\\${quote}`);
}

/** mm with up to 3 decimals, trailing zeros stripped — reads like hand-written code */
export function fmt(n: number): string {
  return String(parseFloat(n.toFixed(3)));
}

/** Whether a no-literal move defers to the _sync.ts stage instead of
 *  inserting after the constructor (per-move so exotic multi-file cases keep
 *  the fallback). */
export type PlacementDeferPredicate = (move: LayoutMove) => boolean;

/**
 * Compute the literal rewrites for `moves` against one source document.
 * A move whose `<var>.pcb = {…}` literal already exists (including the sync
 * sidecar's `parts.<var>.pcb = {…}`) is rewritten in place; one with NO
 * literal yet defers to the _sync.ts stage when `deferInsert` allows it —
 * the machine-owned sidecar is where auto-inserts live — and otherwise falls
 * back to an assignment INSERTED after the variable's constructor statement.
 * An unplaced component (stacked at the origin) is the layout view's whole
 * reason to exist, and silently skipping its move strands every trace drawn
 * between the moved pads. Computed (non-literal) placements stay skipped,
 * never mangled. `variableOf` maps a board reference to its source variable
 * (empty/absent when unknown). Only the first matching document wins per
 * ref — pass each src file in turn and stop when a ref resolves.
 */
export function planPlacementEdits(
  text: string,
  moves: LayoutMove[],
  variableOf: (ref: string) => string | undefined,
  opts?: { deferInsert?: PlacementDeferPredicate },
): LayoutEditResult {
  const edits: PlacementEdit[] = [];
  const skipped: Array<{ ref: string; reason: string }> = [];
  const deferred: Array<{ ref: string; variable: string; x: number; y: number; rot: number }> = [];
  for (const move of moves) {
    const variable = variableOf(move.ref);
    if (!variable) {
      skipped.push({ ref: move.ref, reason: 'no source variable' });
      continue;
    }
    const match = placementMatcher(variable).exec(text);
    let newInner: string;
    let start: number;
    let end: number;
    let lead: string;
    let inserted = false;
    let partsPrefix = '';
    if (match) {
      const inner = match[3];
      const xNum = /\bx\s*:\s*(-?[\d.]+)/.exec(inner);
      const yNum = /\by\s*:\s*(-?[\d.]+)/.exec(inner);
      if (!xNum || !yNum) {
        skipped.push({ ref: move.ref, reason: 'placement is computed, not a literal' });
        continue;
      }
      const nx = parseFloat(xNum[1]) + move.dx;
      const ny = parseFloat(yNum[1]) + move.dy;
      newInner = inner.replace(/\bx\s*:\s*-?[\d.]+/, `x: ${fmt(nx)}`).replace(/\by\s*:\s*-?[\d.]+/, `y: ${fmt(ny)}`);
      start = match.index;
      end = match.index + match[0].length;
      lead = match[1] ?? '';
      partsPrefix = match[2] ?? '';
    } else if (opts?.deferInsert?.(move)) {
      deferred.push({
        ref: move.ref,
        variable,
        x: Number.isFinite(move.ax) ? move.ax! : move.dx,
        y: Number.isFinite(move.ay) ? move.ay! : move.dy,
        rot: move.rot ?? 0,
        ...(move.side ? { side: move.side } : {}),
      });
      continue;
    } else {
      const ins = insertionAfterConstructor(text, variable);
      if (!ins) {
        skipped.push({ ref: move.ref, reason: `no \`${variable}.pcb = {…}\` literal found` });
        continue;
      }
      newInner = ` x: ${fmt(Number.isFinite(move.ax) ? move.ax! : move.dx)}, y: ${fmt(Number.isFinite(move.ay) ? move.ay! : move.dy)}`;
      start = ins.at;
      end = ins.at;
      lead = `\n${ins.indent}`;
      inserted = true;
    }
    // rotation rides as a delta onto the literal's field (0 or absent = 0)
    if (move.rot) {
      const rotNum = /\brotation\s*:\s*(-?[\d.]+)/.exec(newInner);
      const newRot = (rotNum ? parseFloat(rotNum[1]) : 0) + move.rot;
      if (rotNum) newInner = newInner.replace(/\brotation\s*:\s*-?[\d.]+/, `rotation: ${fmt(newRot)}`);
      else newInner = `${newInner.trimEnd()}, rotation: ${fmt(newRot)} `;
    }
    // flip rides as an ABSOLUTE side (the viewer sends the target — an even
    // number of Shift+F presses applies as no flip). Rewritten when present,
    // appended when the literal omitted it.
    if (move.side) {
      const sideRe = /\bside\s*:\s*(['"])(front|back)\1/;
      if (sideRe.test(newInner)) newInner = newInner.replace(sideRe, `side: '${move.side}'`);
      else newInner = `${newInner.trimEnd().replace(/,\s*$/, '')}, side: '${move.side}' `;
    }
    edits.push({
      ref: move.ref,
      // an inserted assignment is a whole new statement: it carries its own
      // terminating semicolon; a rewrite swaps only the literal (the
      // existing `;` sits outside the matched range and survives)
      line: `${lead}${partsPrefix}${variable}.pcb = { ${newInner.trim()} }${inserted ? ';' : ''}`,
      start,
      end,
    });
  }
  return { edits, skipped, ...(deferred.length > 0 ? { deferred } : {}) };
}

/** Find the end of `<var> = …;` (the constructor statement) — insertion goes right after it. */
function insertionAfterConstructor(text: string, variable: string): { at: number; indent: string } | null {
  const decl = new RegExp(`^([ \\t]*)(?:const|let|var) ${escapeRegExp(variable)} =`, 'm').exec(text);
  if (!decl) return null;
  // scan to the statement's terminating semicolon, paren/brace balanced —
  // object literals and nested calls must not fool it
  let depth = 0;
  for (let i = decl.index; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '{') depth++;
    else if (ch === ')' || ch === '}') depth--;
    else if (ch === ';' && depth <= 0) return { at: i + 1, indent: decl[1] ?? '' };
  }
  return null;
}

/**
 * Sticky TrackBuilder endpoints: any `.from({ x: …, y: … })` / `.to({ … })`
 * literal whose coordinates sit on one of the moved component's ORIGINAL
 * pads (within 0.05 mm) translates with it — hand-built routes follow the
 * part instead of dangling. Pure numeric literals only. A pure move
 * translates every endpoint by the part's delta; when the payload carries
 * `padsTo` (a flip mirrors each pad's offset) the endpoint follows ITS
 * pad's own final position instead.
 */
export function planEndpointEdits(
  text: string,
  move: LayoutMove,
): PlacementEdit[] {
  const pads = move.pads ?? [];
  if (pads.length === 0 || (!move.dx && !move.dy && !move.padsTo)) return [];
  const edits: PlacementEdit[] = [];
  // translate a numeric literal by delta, keeping ITS decimal precision
  // (source coordinates can carry 4+ decimals; rounding to 3 would erode
  // them every apply)
  const shift = (axis: 'x' | 'y', delta: number) => (whole: string, lead: string, num: string): string => {
    const decimals = Math.max((num.split('.')[1] ?? '').length, 3);
    const value = (parseFloat(num) + delta).toFixed(decimals);
    return `${lead}${parseFloat(value)}`;
  };
  /** the delta this move gives the endpoint that sits on pad `i` */
  const deltaFor = (i: number): { dx: number; dy: number } => {
    const to = move.padsTo?.[i];
    if (to && pads[i]) return { dx: to.x - pads[i]!.x, dy: to.y - pads[i]!.y };
    return { dx: move.dx, dy: move.dy };
  };
  for (const kind of ['from', 'to'] as const) {
    const re = new RegExp(`\\.${kind}\\(\\{\\s*x\\s*:\\s*(-?[\\d.]+)\\s*,\\s*y\\s*:\\s*(-?[\\d.]+)`, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const ex = parseFloat(match[1]);
      const ey = parseFloat(match[2]);
      let padIdx = -1;
      for (let p = 0; p < pads.length; p++) {
        if (Math.abs(pads[p]!.x - ex) < 0.05 && Math.abs(pads[p]!.y - ey) < 0.05) {
          padIdx = p;
          break;
        }
      }
      if (padIdx === -1) continue;
      const { dx, dy } = deltaFor(padIdx);
      // only the x/y numbers inside this literal move — layer/width stay
      const head = text.indexOf('{', match.index);
      const tail = text.indexOf('}', head);
      if (head === -1 || tail === -1) continue;
      const inner = text.slice(head + 1, tail);
      const newInner = inner
        .replace(/(\bx\s*:\s*)(-?[\d.]+)/, shift('x', dx))
        .replace(/(\by\s*:\s*)(-?[\d.]+)/, shift('y', dy));
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
export function applyPlacementEdits(text: string, edits: Array<{ start: number; end: number; line: string }>): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  for (const edit of sorted) out = out.slice(0, edit.start) + edit.line + out.slice(edit.end);
  return out;
}

export interface OutlineRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A zone rectangle identified for an edit or a deletion: geometry plus the
 *  copper layer (identical rects on different layers are distinct zones —
 *  the imported planes share one rect across four layers). */
export interface ZoneRectMatch extends OutlineRect {
  layer: string;
}

interface ZoneLiteralMatch {
  /** the literal's `{ … }` open/close offsets */
  open: number;
  close: number;
  /** the full statement: line start through the terminating `;` */
  stmtStart: number;
  stmtEnd: number;
  rect: { x: number; y: number; w: number; h: number };
  layers: string[];
  method: string;
  priority?: number;
}

/** Every `.zone({ … })` / `.keepout({ … })` literal in a document, with
 *  geometry, layers, and statement bounds. Tolerates the CRLF and multi-line
 *  literal forms; numeric x/y/width/height literals only. */
function findZoneLiterals(text: string): ZoneLiteralMatch[] {
  const out: ZoneLiteralMatch[] = [];
  const callRe = /\.(zone|keepout)\s*\(\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = callRe.exec(text)) !== null) {
    const open = text.indexOf('{', match.index);
    let depth = 0;
    let close = -1;
    for (let i = open; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close === -1) continue;
    const inner = text.slice(open + 1, close);
    const xNum = /\bx\s*:\s*(-?[\d.]+)/.exec(inner);
    const yNum = /\by\s*:\s*(-?[\d.]+)/.exec(inner);
    const wNum = /\bwidth\s*:\s*(-?[\d.]+)/.exec(inner);
    const hNum = /\bheight\s*:\s*(-?[\d.]+)/.exec(inner);
    if (!xNum || !yNum || !wNum || !hNum) continue;
    const layers: string[] = [];
    const layersRe = /\blayers\s*:\s*\[([^\]]*)\]/.exec(inner);
    if (layersRe) {
      for (const l of layersRe[1].matchAll(/['"]([^'"]+)['"]/g)) layers.push(l[1]!);
    }
    const priorityNum = /\bpriority\s*:\s*(-?[\d.]+)/.exec(inner);
    const lineStart = text.lastIndexOf('\n', match.index) + 1;
    let stmtEnd = close;
    const semi = text.indexOf(';', close);
    if (semi !== -1 && !/[^;\s)]/.test(text.slice(close + 1, semi))) stmtEnd = semi;
    out.push({
      open,
      close,
      stmtStart: lineStart,
      stmtEnd: stmtEnd + 1,
      rect: { x: parseFloat(xNum[1]), y: parseFloat(yNum[1]), w: parseFloat(wNum[1]), h: parseFloat(hNum[1]) },
      layers,
      method: match[1]!,
      priority: priorityNum ? parseFloat(priorityNum[1]) : undefined,
    });
  }
  return out;
}

/**
 * The highest zone priority declared in a document (0 when none — the API
 * default). The layout view's insert stage starts new pours ABOVE it: in
 * KiCad's fill order a lower-priority zone keeps its clearance from
 * higher-priority copper, so a pour dropped inside a GND plane must
 * out-rank the plane or the plane's fill subordinates it to nothing.
 */
export function maxZonePriority(text: string): number {
  let max = 0;
  for (const m of findZoneLiterals(text)) {
    if (m.priority !== undefined && m.priority > max) max = m.priority;
  }
  return max;
}

function rectMatches(m: ZoneLiteralMatch, r: ZoneRectMatch): boolean {
  return (
    m.layers.includes(r.layer) &&
    Math.abs(m.rect.x - r.x) < 0.05 &&
    Math.abs(m.rect.y - r.y) < 0.05 &&
    Math.abs(m.rect.w - r.w) < 0.05 &&
    Math.abs(m.rect.h - r.h) < 0.05
  );
}

/**
 * Zone geometry edits from the layout view: each carries the zone's
 * AUTHORED rect (matched against the source literal, layer included) and
 * the NEW rect. The matching `typecad.zone()`/`.keepout()` literal's
 * x/y/width/height are rewritten in place — every other key (fill, the
 * comment text around it) stays. A `net` on the edit reassigns the pour:
 * an existing `net: '…'` key is rewritten, and a literal without one
 * gains it right after the opening brace. Numeric literals only; a zone
 * with no matching literal (a `pcb.plane()` materialization, an
 * import-authored polygon) is reported, never mangled.
 */
export function planZoneGeometryEdits(text: string, edits: Array<{ original: ZoneRectMatch; rect: OutlineRect; net?: string }>): {
  edits: PlacementEdit[];
  skipped: string[];
} {
  const literals = findZoneLiterals(text);
  const planned: PlacementEdit[] = [];
  const skipped: string[] = [];
  const used = new Set<number>();
  for (const edit of edits) {
    const hit = literals.findIndex((m, i) => !used.has(i) && rectMatches(m, edit.original));
    if (hit === -1) {
      skipped.push(
        `zone (${edit.original.layer} at ${edit.original.x},${edit.original.y}) has no editable literal — plane-materialized or import-authored zones are not editable`,
      );
      continue;
    }
    used.add(hit);
    const m = literals[hit]!;
    const inner = text.slice(m.open + 1, m.close);
    let newInner = inner
      .replace(/\bx\s*:\s*-?[\d.]+/, `x: ${fmt(edit.rect.x)}`)
      .replace(/\by\s*:\s*-?[\d.]+/, `y: ${fmt(edit.rect.y)}`)
      .replace(/\bwidth\s*:\s*-?[\d.]+/, `width: ${fmt(edit.rect.w)}`)
      .replace(/\bheight\s*:\s*-?[\d.]+/, `height: ${fmt(edit.rect.h)}`);
    if (edit.net !== undefined) {
      const netKey = /\bnet\s*:\s*(['"])(?:\\.|(?!\1)[^\\])*\1/.exec(newInner);
      if (netKey) newInner = newInner.replace(netKey[0], `net: '${escapeQuoted(edit.net, "'")}'`);
      else newInner = ` net: '${escapeQuoted(edit.net, "'")}',${newInner}`;
    }
    planned.push({
      ref: `zone (${edit.original.layer} @ ${edit.original.x},${edit.original.y})`,
      line: `${text.slice(m.open, m.open + 1)}${newInner}}`,
      start: m.open,
      end: m.close + 1,
    });
  }
  return { edits: planned, skipped };
}

/**
 * Zone deletions from the layout view: the matching literal's WHOLE
 * statement (its line through the terminating `;`) is removed — the same
 * guard rails as the edit planner, one zone per match.
 */
export function planZoneDeletions(text: string, deletes: ZoneRectMatch[]): {
  edits: PlacementEdit[];
  skipped: string[];
} {
  const literals = findZoneLiterals(text);
  const planned: PlacementEdit[] = [];
  const skipped: string[] = [];
  const used = new Set<number>();
  for (const del of deletes) {
    const hit = literals.findIndex((m, i) => !used.has(i) && rectMatches(m, del));
    if (hit === -1) {
      skipped.push(
        `zone (${del.layer} at ${del.x},${del.y}) has no removable literal — plane-materialized or import-authored zones are not deletable`,
      );
      continue;
    }
    used.add(hit);
    const m = literals[hit]!;
    planned.push({
      ref: `zone (${del.layer} @ ${del.x},${del.y})`,
      line: '',
      start: m.stmtStart,
      end: m.stmtEnd,
    });
  }
  return { edits: planned, skipped };
}

/**
 * Board outline rewrite: the layout view's outline edit arrives as the
 * AUTHORED rect (matched against the source literal) and the NEW rect, both
 * board-frame min-corner rectangles. The planner finds the
 * `.outline(x, y, width, height[, fillet])` call whose numeric geometry
 * matches the original (within 0.05 mm) and rewrites the first four
 * arguments — the fillet argument, when present, stays. Numeric literals
 * only; an outline built by `outlinePolygon`/`outlinePath` (or computed)
 * cannot match and is reported, never mangled.
 */
export function planOutlineEdits(
  text: string,
  original: OutlineRect,
  rect: OutlineRect,
): { edits: PlacementEdit[]; reason?: string } {
  const callRe = /\.outline\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = callRe.exec(text)) !== null) {
    const open = match.index + match[0].length;
    const close = text.indexOf(')', open);
    if (close === -1) continue;
    const inner = text.slice(open, close);
    const nums = inner.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 4) continue;
    const [ox, oy, ow, oh] = nums.slice(0, 4).map((n) => parseFloat(n));
    if (![ox, oy, ow, oh].every(Number.isFinite)) continue;
    if (
      Math.abs(ox - original.x) > 0.05 ||
      Math.abs(oy - original.y) > 0.05 ||
      Math.abs(ow - original.w) > 0.05 ||
      Math.abs(oh - original.h) > 0.05
    )
      continue;
    // rewrite only the first four numbers, in place, preserving the rest
    // (a fillet radius rides untouched)
    let idx = 0;
    const newInner = inner.replace(/-?\d+(?:\.\d+)?/g, (num) => {
      if (idx >= 4) return num;
      const out = fmt([rect.x, rect.y, rect.w, rect.h][idx++]!);
      return out;
    });
    return {
      edits: [
        {
          ref: 'board outline',
          line: `${text.slice(match.index, open)}${newInner})`,
          start: match.index,
          end: close + 1,
        },
      ],
    };
  }
  return { edits: [], reason: 'no `.outline(x, y, width, height)` literal matches the board outline' };
}

/** A text style diff: only keys the user actually changed (w/h map to the API's width/height). */
export interface TextStyleInput {
  w?: number;
  h?: number;
  thickness?: number;
  font?: string;
  italic?: boolean;
  bold?: boolean;
  justify?: { horizontal?: 'left' | 'right' | 'center'; vertical?: 'top' | 'bottom' | 'middle'; mirror?: boolean };
}

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
  /** changed style keys only — a position-only edit carries none */
  style?: TextStyleInput;
}

/** Replace `key: <number>` in a literal, or append it when absent. */
function setNumKey(inner: string, key: string, val: number): string {
  const re = new RegExp(`\\b${key}\\s*:\\s*-?[\\d.]+`);
  if (re.test(inner)) return inner.replace(re, `${key}: ${fmt(val)}`);
  return `${inner.trimEnd().replace(/,\s*$/, '')}, ${key}: ${fmt(val)} `;
}

/** Replace `key: <bool>` in a literal, or append it when absent. */
function setBoolKey(inner: string, key: string, val: boolean): string {
  const re = new RegExp(`\\b${key}\\s*:\\s*(?:true|false)`);
  if (re.test(inner)) return inner.replace(re, `${key}: ${val}`);
  return `${inner.trimEnd().replace(/,\s*$/, '')}, ${key}: ${val} `;
}

/** Replace `key: '<string>'` in a literal, or append it when absent. */
function setStrKey(inner: string, key: string, val: string): string {
  const re = new RegExp(`\\b${key}\\s*:\\s*(['"])(?:\\\\.|(?!\\1).)*\\1`);
  const esc = val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  if (re.test(inner)) return inner.replace(re, `${key}: '${esc}'`);
  return `${inner.trimEnd().replace(/,\s*$/, '')}, ${key}: '${esc}' `;
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

/** The identity a planned .text edit reports — one authored value+anchor. */
export function textEditRef(t: TextEditInput): string {
  return `text "${t.text0}"@${t.x0},${t.y0}`;
}

/** Split an object-literal body on top-level commas (string/brace aware). */
function splitTopLevel(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let str: string | null = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (str) {
      if (ch === '\\') i++;
      else if (ch === str) str = null;
      continue;
    }
    if (ch === "'" || ch === '"') str = ch;
    else if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
  }
  const tail = body.slice(start);
  if (tail.trim()) out.push(tail);
  return out;
}

/**
 * The layout-literal body for one label edit: the footprint-local position
 * plus the style diff, merged into whatever the existing literal carried
 * (unmanaged keys — layer, show, an unedited justify — stay put).
 */
function labelLayoutBody(
  label: { x: number; y: number; rot: number; style?: TextStyleInput },
  part: { x: number; y: number; rot: number },
  existingBody: string,
): string {
  const rad = (-part.rot * Math.PI) / 180;
  const c = Math.cos(rad);
  const s2 = Math.sin(rad);
  const dx = label.x - part.x;
  const dy = label.y - part.y;
  // only the keys this edit manages are stripped from the existing body:
  // the position, plus the style keys the diff actually carries
  const sty = label.style;
  const manages = new Set(['x', 'y', 'rotation']);
  if (sty) {
    if (sty.w !== undefined) manages.add('width');
    if (sty.h !== undefined) manages.add('height');
    if (sty.thickness !== undefined) manages.add('thickness');
    if (sty.font !== undefined) manages.add('font');
    if (sty.italic !== undefined) manages.add('italic');
    if (sty.bold !== undefined) manages.add('bold');
    if (sty.justify) manages.add('justify');
  }
  const kept = splitTopLevel(existingBody)
    .filter((entry) => {
      const k = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(entry);
      return !k || !manages.has(k[1]!);
    })
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(', ');
  let bodyStr = kept ? kept + ', ' : '';
  bodyStr += `x: ${fmt(dx * c - dy * s2)}, y: ${fmt(dx * s2 + dy * c)}, rotation: ${fmt(label.rot - part.rot)}`;
  if (sty) {
    if (sty.w !== undefined) bodyStr = setNumKey(bodyStr, 'width', sty.w);
    if (sty.h !== undefined) bodyStr = setNumKey(bodyStr, 'height', sty.h);
    if (sty.thickness !== undefined) bodyStr = setNumKey(bodyStr, 'thickness', sty.thickness);
    if (sty.font !== undefined) bodyStr = setStrKey(bodyStr, 'font', sty.font);
    if (sty.italic !== undefined) bodyStr = setBoolKey(bodyStr, 'italic', sty.italic);
    if (sty.bold !== undefined) bodyStr = setBoolKey(bodyStr, 'bold', sty.bold);
    if (sty.justify) {
      const parts: string[] = [];
      if (sty.justify.horizontal !== undefined) parts.push(`horizontal: '${sty.justify.horizontal}'`);
      if (sty.justify.vertical !== undefined) parts.push(`vertical: '${sty.justify.vertical}'`);
      if (sty.justify.mirror !== undefined) parts.push(`mirror: ${sty.justify.mirror}`);
      if (parts.length > 0) {
        const obj = `{ ${parts.join(', ')} }`;
        const jRe = /\bjustify\s*:\s*\{[^}]*\}/;
        bodyStr = jRe.test(bodyStr) ? bodyStr.replace(jRe, `justify: ${obj}`) : `${bodyStr.trimEnd().replace(/,\s*$/, '')}, justify: ${obj}`;
      }
    }
  }
  // appended keys carry a trailing space (the setters' append format) —
  // trim it so the assembled literal has no double spacing before `}`
  return bodyStr.replace(/\s+$/, '');
}

/** A label spec held for the _sync.ts stage — the body is rendered there,
 *  against the part's FINAL placement (stage 1 has applied by then). */
export interface DeferredLabel {
  ref: string;
  variable: string;
  prop: string;
  label: { kind: 'reference' | 'value' | 'fab'; x: number; y: number; rot: number; style?: TextStyleInput };
}

/**
 * Label layout edits for parts WITHOUT a Component constructor literal to
 * rewrite — subclass factories (`new LED({ … })`) and prefix-derived
 * references never carry `reference: 'D1'`, so planComponentEdits cannot
 * match them. The layout lands as a post-construction assignment on the
 * component's public field (`led.referenceLayout = { … }`), inserted after
 * the constructor statement or replacing an existing assignment — including
 * the sync sidecar's `parts.<var>.<prop>` form, which is what wins at
 * runtime once it exists. Fresh inserts defer to the sync stage when
 * `deferInsert` allows.
 */
export function planLabelAssignments(
  text: string,
  specs: Array<{ ref: string; label: { kind: 'reference' | 'value' | 'fab'; x: number; y: number; rot: number; style?: TextStyleInput } }>,
  variableOf: (ref: string) => string | undefined,
  placementOf: (ref: string) => { x: number; y: number; rot: number } | null,
  opts?: { deferInsert?: (ref: string) => boolean },
): LayoutEditResult<DeferredLabel> {
  const edits: PlacementEdit[] = [];
  const skipped: Array<{ ref: string; reason: string }> = [];
  const deferred: DeferredLabel[] = [];
  for (const spec of specs) {
    const variable = variableOf(spec.ref);
    if (!variable) {
      skipped.push({ ref: spec.ref, reason: 'no source variable' });
      continue;
    }
    const prop = spec.label.kind === 'fab' ? 'fab' : `${spec.label.kind}Layout`;
    const assignRe = new RegExp(`^([ \\t]*)(parts\\.)?${escapeRegExp(variable)}\\.${prop}\\s*=`, 'm');
    const match = assignRe.exec(text);
    let bodyStr: string;
    let start: number;
    let end: number;
    let lead: string;
    let partsPrefix = '';
    let inserted = false;
    if (match) {
      const part = placementOf(spec.ref);
      if (!part) {
        skipped.push({ ref: spec.ref, reason: 'no .pcb placement literal found' });
        continue;
      }
      const r = objectLiteralRange(text, match.index + match[0].length - 1);
      if (!r) {
        skipped.push({ ref: spec.ref, reason: `${variable}.${prop} assignment is not an object literal` });
        continue;
      }
      bodyStr = labelLayoutBody(spec.label, part, text.slice(r.open + 1, r.close));
      start = match.index;
      end = r.close + 1;
      lead = match[1] ?? '';
      partsPrefix = match[2] ?? '';
    } else if (opts?.deferInsert?.(spec.ref)) {
      deferred.push({ ref: spec.ref, variable, prop, label: spec.label });
      continue;
    } else {
      const part = placementOf(spec.ref);
      if (!part) {
        skipped.push({ ref: spec.ref, reason: 'no .pcb placement literal found' });
        continue;
      }
      const ins = insertionAfterConstructor(text, variable);
      if (!ins) {
        skipped.push({ ref: spec.ref, reason: `no \`${variable}\` constructor statement found` });
        continue;
      }
      bodyStr = labelLayoutBody(spec.label, part, '');
      start = ins.at;
      end = ins.at;
      lead = `\n${ins.indent}`;
      inserted = true;
    }
    edits.push({
      ref: `${spec.ref} ${prop}`,
      // an inserted assignment is a whole new statement (own semicolon); a
      // rewrite swaps only the object literal — the existing `;` survives
      line: `${lead}${partsPrefix}${variable}.${prop} = { ${bodyStr} }${inserted ? ';' : ''}`,
      start,
      end,
    });
  }
  return { edits, skipped, ...(deferred.length > 0 ? { deferred } : {}) };
}

/**
 * The sync sidecar's label statement for one deferred spec — the full
 * `parts.<var>.<prop> = { … };` line, rendered against the part's final
 * placement. (No leading indent: the sync stage adds it.)
 */
export function syncLabelStatement(
  spec: DeferredLabel,
  part: { x: number; y: number; rot: number },
): string {
  return `parts.${spec.variable}.${spec.prop} = { ${labelLayoutBody(spec.label, part, '')} };`;
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
      const esc = escapeQuoted(edit.text, tNum[1]!);
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
    // style keys arrive as a DIFF — every present key replaces its literal
    // value (or is appended when the source literal omitted it)
    const sty = edit.style;
    if (sty) {
      if (sty.w !== undefined) newInner = setNumKey(newInner, 'width', sty.w);
      if (sty.h !== undefined) newInner = setNumKey(newInner, 'height', sty.h);
      if (sty.thickness !== undefined) newInner = setNumKey(newInner, 'thickness', sty.thickness);
      if (sty.font !== undefined) newInner = setStrKey(newInner, 'font', sty.font);
      if (sty.italic !== undefined) newInner = setBoolKey(newInner, 'italic', sty.italic);
      if (sty.bold !== undefined) newInner = setBoolKey(newInner, 'bold', sty.bold);
      if (sty.justify) {
        const parts: string[] = [];
        if (sty.justify.horizontal !== undefined) parts.push(`horizontal: '${sty.justify.horizontal}'`);
        if (sty.justify.vertical !== undefined) parts.push(`vertical: '${sty.justify.vertical}'`);
        if (sty.justify.mirror !== undefined) parts.push(`mirror: ${sty.justify.mirror}`);
        if (parts.length > 0) {
          const obj = `{ ${parts.join(', ')} }`;
          const jRe = /\bjustify\s*:\s*\{[^}]*\}/;
          if (jRe.test(newInner)) newInner = newInner.replace(jRe, `justify: ${obj}`);
          else newInner = `${newInner.trimEnd().replace(/,\s*$/, '')}, justify: ${obj} `;
        }
      }
    }
    planned.push({
      ref: textEditRef(edit),
      // exactly the call's object literal, nothing beyond
      line: `${text.slice(match.index, range.open + 1)}${newInner}}`,
      start: match.index,
      end: range.close + 1,
    });
  }
  for (let i = 0; i < edits.length; i++) {
    if (!used.has(i))
      skipped.push({ ref: textEditRef(edits[i]!), reason: 'no .text({…}) literal matches its authored value/anchor' });
  }
  return { edits: planned, skipped };
}



// ---------------------------------------------------------------------------
// Component LABEL repositioning: a Reference/Value fp_text dragged in the
// layout view. The final world position arrives in board (y-down) mm; it is
// converted to FOOTPRINT-LOCAL coordinates against the part's final
// placement (literal + the same apply's move delta) and written into the
// Component constructor's referenceLayout / valueLayout options — exactly
// what the board writer's applyLayoutToFpText consumes on rebuild.
// ---------------------------------------------------------------------------


/** Parse a `<var>.pcb = { x, y, rotation? }` literal — standalone or the
 *  sync sidecar's `parts.<var>.pcb` form (null when computed). */
export function parsePlacementLiteral(
  text: string,
  variable: string,
): { x: number; y: number; rot: number } | null {
  const match = new RegExp(`^([ \\t]*)(parts\\.)?${escapeRegExp(variable)}\\.pcb\\s*=\\s*\\{([^}]*)\\}`, 'm').exec(text);
  if (!match) return null;
  const xNum = /\bx\s*:\s*(-?[\d.]+)/.exec(match[3]);
  const yNum = /\by\s*:\s*(-?[\d.]+)/.exec(match[3]);
  if (!xNum || !yNum) return null;
  const rNum = /\brotation\s*:\s*(-?[\d.]+)/.exec(match[3]);
  return { x: parseFloat(xNum[1]), y: parseFloat(yNum[1]), rot: rNum ? parseFloat(rNum[1]) : 0 };
}


// ---------------------------------------------------------------------------
// Reference RENAMES: the in-place editor on a part's refdes text. Rewrites
// the `reference: '…'` literal in the Component constructor; skipped when
// the new name collides with another component's reference.
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Combined constructor pass: value, rename, and label-layout edits for one
// component target the SAME `new Component({ … })` literal — applied as one
// replacement so the ranges never collide in a single WorkspaceEdit.
// ---------------------------------------------------------------------------

export interface ComponentEditSpec {
  ref: string;
  value?: string;
  newRef?: string;
  label?: { kind: 'reference' | 'value' | 'fab'; x: number; y: number; rot: number; style?: TextStyleInput };
}

export function planComponentEdits(
  text: string,
  specs: ComponentEditSpec[],
  placementOf: (ref: string) => { x: number; y: number; rot: number } | null,
  allRefs: Set<string>,
): LayoutEditResult {
  const planned: PlacementEdit[] = [];
  const skipped: Array<{ ref: string; reason: string }> = [];
  const used = new Set<number>();
  // the declaring variable rides along: a standalone `<var>.referenceLayout
  // = {…}` statement OVERRIDES the constructor option at runtime, and the
  // label edit must land where it actually wins. The declaration prefix is
  // optional (non-declaring `new Component(…)` usages still match, they just
  // carry no variable) and tolerates a type annotation — but the options
  // literal is anchored at the `new`, never at the statement start, so an
  // annotation's own braces cannot capture it.
  const callRe =
    /(?:(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[^=;]+?)?\s*=\s*)?(new\s+Component\s*\()/g;
  let match: RegExpExecArray | null;
  while ((match = callRe.exec(text)) !== null) {
    const variable = match[1];
    const newAt = match.index + match[0].length - match[2]!.length;
    const range = objectLiteralRange(text, newAt);
    if (!range) continue;
    const inner = text.slice(range.open + 1, range.close);
    const rNum = /\breference\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/.exec(inner);
    if (!rNum) continue;
    const ref = rNum[2];
    const spec = specs.find((sp, i) => !used.has(i) && sp.ref === ref);
    if (!spec) continue;
    used.add(specs.indexOf(spec));
    let skip: string | null = null;
    if (spec.newRef && allRefs.has(spec.newRef) && spec.newRef !== ref)
      skip = `\`${spec.newRef}\` is already a component reference`;
    let newInner = inner;
    const after: string[] = [];
    if (!skip && spec.newRef) {
      const esc = escapeQuoted(spec.newRef, rNum[1]!);
      newInner = newInner.replace(rNum[0], () => `reference: ${rNum[1]}${esc}${rNum[1]}`);
    }
    if (!skip && spec.value !== undefined) {
      const vNum = /\bvalue\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/.exec(inner);
      // escape against the literal being written into: an existing value
      // literal may quote differently than the reference beside it
      const esc = escapeQuoted(spec.value, vNum ? vNum[1]! : rNum[1]!);
      if (vNum) newInner = newInner.replace(vNum[0], () => `value: ${vNum[1]}${esc}${vNum[1]}`);
      else after.push(`value: ${rNum[1]}${esc}${rNum[1]}`);
    }
    if (!skip && spec.label) {
      const part = placementOf(ref);
      if (!part) {
        skip = 'no .pcb placement literal found';
      } else {
        // a post-construction `<var>.<kind>Layout = {…}` statement beats the
        // constructor option when the code runs — rewrite THAT and leave the
        // constructor untouched (an appended option there is dead weight the
        // statement overrides, so the rebuild would revert the drag). The
        // sync sidecar's `parts.<var>.<kind>Layout` is the same override,
        // one indirection deeper.
        const stmtProp = `${spec.label.kind}Layout`;
        // no declaring variable → no standalone statement to prefer
        const am = variable
          ? new RegExp(`^([ \\t]*)(parts\\.)?${escapeRegExp(variable)}\\.${stmtProp}\\s*=\\s*\\{`, 'm').exec(text)
          : null;
        const ar = am ? objectLiteralRange(text, am.index + am[0].length - 1) : null;
        if (am && ar) {
          const bodyStr = labelLayoutBody(spec.label, part, text.slice(ar.open + 1, ar.close));
          planned.push({
            ref: `${ref} ${stmtProp}`,
            line: `${am[1] ?? ''}${am[2] ?? ''}${variable}.${stmtProp} = { ${bodyStr} }`,
            start: am.index,
            end: ar.close + 1,
          });
        } else {
          // reference/value carry their own Layout option names; the small
          // fab refdes text is positioned by the plain 'fab' option
          const prop = spec.label.kind === 'fab' ? 'fab' : `${spec.label.kind}Layout`;
          // the layout literal may already carry keys this edit does not
          // manage (layer, show, styled by hand…) — keep them. Balanced-brace
          // parsing: a nested justify object must not truncate the literal
          const keyRe = new RegExp(`\\b${prop}\\s*:`);
          const km = keyRe.exec(inner);
          let bodyStr = '';
          let span: { start: number; end: number } | null = null;
          if (km) {
            const r = objectLiteralRange(inner, km.index + km[0].length - 1);
            if (r) {
              bodyStr = labelLayoutBody(spec.label, part, inner.slice(r.open + 1, r.close));
              span = { start: km.index, end: r.close + 1 };
            }
          }
          if (span) {
            const literal = `${prop}: { ${bodyStr} }`;
            newInner = newInner.slice(0, span.start) + literal + newInner.slice(span.end);
          } else {
            after.push(`${prop}: { ${labelLayoutBody(spec.label, part, '')} }`);
          }
        }
      }
    }
    if (skip) {
      skipped.push({ ref, reason: skip });
      continue;
    }
    if (after.length) {
      // re-locate the anchor on the REPLACED text: the rename/value edits
      // above may have shifted it, and a stale offset splices mid-token
      const anchor = /\breference\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/.exec(newInner);
      const at = anchor ? anchor.index + anchor[0].length : newInner.trimEnd().length;
      newInner = newInner.slice(0, at) + ', ' + after.join(', ') + newInner.slice(at);
    }
    planned.push({
      ref,
      line: `${text.slice(match.index, range.open + 1)}${newInner}}`,
      start: match.index,
      end: range.close + 1,
    });
  }
  for (let i = 0; i < specs.length; i++) {
    if (!used.has(i)) skipped.push({ ref: specs[i]!.ref, reason: 'no Component constructor literal found' });
  }
  return { edits: planned, skipped };
}
