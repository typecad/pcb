// ---------------------------------------------------------------------------
// Route apply: committed interactive routes become source TrackBuilders.
//
// A route arrives from the layout view as { net, w, pieces, vias } in board
// (y-down) millimetres. This plans pure text edits: one const declaration
// per route (`.from(...).to(...)` chain, `.via(...)` at every layer switch)
// inserted before the `typecad.create(` call, and the variable appended to
// that call's argument list — the same authoring style as the project's own
// hand-written routes. When the project has a _sync.ts sidecar, new routes
// land INSIDE its syncBoard() instead (planSyncRouteEdits) with a
// `syncTracks.push(name)` collect line — the sidecar is the machine-owned
// home for auto-inserts.
//
// Deletes plan the reverse: matched `.to()` runs drop from existing chains,
// a middle break SPLITS the route so a real gap replaces the copper, and
// emptied routes vanish with their create() argument. Regenerated chains
// preserve the route's options (net), every surviving via (with its own
// args), each point's layer — and the comments riding the kept lines. In a
// sync file, splits gain their own collect line and emptied routes take
// theirs along.
// ---------------------------------------------------------------------------

import { isSyncFileText, syncFunctionBodyRange, syncPushStatement, syncRouteInsertAt } from './syncFile.js';

export interface RouteInput {
  net: string | null;
  /** chain default width — pieces without their own `w` fall back to it */
  w: number;
  /** one width-run each: a mid-route width change severs the piece, so a
   *  piece's optional `w` is its whole run's width */
  pieces: Array<{ layer: string; w?: number; pts: Array<{ x: number; y: number }> }>;
  /** vias with their own barrel sizing; size/drill fall back to 0.6/0.3.
   *  `layers` names the span ([from, to] copper layers) — absent or the
   *  plain F.Cu/B.Cu pair emits a default through via */
  vias: Array<{ x: number; y: number; size?: number; drill?: number; layers?: [string, string] }>;
  /** the P-key power contract: emitted as .powerInfo() so the build
   *  enforces the width the solve produced */
  power?: { current: number; maxTempRise?: number } | null;
  /** the Z-key controlled-impedance note: a comment above the declaration
   *  records the solve so the intent survives edits */
  impedance?: { z0: number } | null;
  from: { ref: string; pin: string };
  to: { ref: string; pin: string } | null;
}

/** One planned text replacement (character range + new text). */
export interface PlannedEdit {
  start: number;
  end: number;
  line: string;
}

export interface RoutePlan {
  edits: PlannedEdit[];
  /** routes that produced edits — the skip list carries the rest */
  applied: number;
  skipped: string[];
}

const fmt = (n: number): string => String(parseFloat(n.toFixed(3)));

/** Escape a value for interpolation into a single-quoted TS string literal. */
export function escapeSingleQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/'/g, "\\'");
}

// ---------------------------------------------------------------------------
// The per-net track section dialect — the grammar the kicad2typecad write-back
// owns (`// Net: X` + `const track_X: TrackBuilder[] = [];` +
// `track_X.push(typecad.track({ net: 'X' }).from(...).to(...));`). When a
// project's routing already lives in this form, new routes MUST land in it
// too, byte-identical to how the write-back would render them: its oracle
// compares the section textually, and anything less than canonical reads as
// drift. The renderers below mirror display.ts's pushStatementSource with
// PLAIN chalk (identity) — net single-escaped, layer double-quoted, numbers
// via String(n), per-leg widths, an end via inline, one blank line between
// net blocks, spreads appended in board order.
// ---------------------------------------------------------------------------

/** The section's array name for a net — display.ts's sanitize rule. */
export function trackVarForNet(net: string): string {
  return (
    'track_' +
    net
      .replace(/[`'"]/g, '')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
  );
}

/** The oracle's number rendering (PLAIN_CH.chNum). */
const canonNum = (n: number): string => String(n);

/** One route as ONE canonical push statement — the oracle chains every
 *  positionally-contiguous run into a single statement (it never severs on
 *  width or layer changes; each leg carries its own), so the pieces of a
 *  route merge here exactly the way a rebuild → re-chain round-trips. */
/** One route leg in the canonical `.to({ x, y, layer, width })` form. */
function toClause(leg: { x: number; y: number; layer: string; width: number }): string {
  return `.to({ x: ${canonNum(leg.x)}, y: ${canonNum(leg.y)}, layer: "${leg.layer}", width: ${canonNum(leg.width)} })`;
}

/** A route's legs (per-piece width runs, one per point pair). */
function routeLegs(route: RouteInput): Array<{ x: number; y: number; layer: string; width: number }> {
  const legs: Array<{ x: number; y: number; layer: string; width: number }> = [];
  for (const piece of route.pieces) {
    for (let i = 1; i < piece.pts.length; i++) {
      legs.push({ x: piece.pts[i]!.x, y: piece.pts[i]!.y, layer: piece.layer, width: piece.w ?? route.w });
    }
  }
  return legs;
}

function sectionPushStatement(net: string, route: RouteInput): string | null {
  const legs = routeLegs(route);
  if (legs.length === 0 || route.pieces.length === 0) return null;
  const first = route.pieces[0]!;
  const firstWidth = first.w ?? route.w;
  const variable = trackVarForNet(net);
  let out =
    `${variable}.push(typecad.track({ net: '${escapeSingleQuoted(net)}' })` +
    `.from({ x: ${canonNum(first.pts[0]!.x)}, y: ${canonNum(first.pts[0]!.y)} }, "${first.layer}", ${canonNum(firstWidth)})`;
  for (const leg of legs) {
    out += toClause(leg);
  }
  // a via at the chain's end rides the statement (attachChainVias); the
  // default barrel matches what the build writes for an unspecified via
  const end = legs[legs.length - 1]!;
  const endVia = (route.vias ?? []).find((v) => ptEq(v, end, 0.001));
  if (endVia) {
    out += `.via({ size: ${canonNum(endVia.size ?? 0.6)}, drill: ${canonNum(endVia.drill ?? 0.3)} })`;
  }
  return out + ');';
}

/**
 * A route's mid-chain vias as standalone statements — the write-back's
 * canonical form for them (trackBlockSource renders standalone vias at
 * column 0, after a blank line, at the section end). A layer-transition
 * via (the via where a drawn route changes copper layer) sits at a
 * MIDDLE vertex of the chain, so attachChainVias leaves it standalone:
 * without these statements the route compiles to segments the build
 * cannot join across layers, and the vias the user drew vanish from the
 * board (seen live: both AMP_OUT transition vias missing).
 */
function standaloneViaStatements(net: string | null, route: RouteInput): string[] {
  const legs = route.pieces.flatMap((piece) => piece.pts.slice(1));
  const end = legs[legs.length - 1];
  // a FLOATING via (placed anywhere off copper) has no net — the canonical
  // grammar omits the property (viaArgSource), never writes net: 'null'
  const netProp = net ? ` net: '${escapeSingleQuoted(net)}',` : '';
  return (route.vias ?? [])
    .filter((v) => !end || !ptEq(v, end, 0.001))
    .map(
      (v) =>
        `typecad.via({ at: { x: ${canonNum(v.x)}, y: ${canonNum(v.y)} },${netProp} size: ${canonNum(v.size ?? 0.6)}, drill: ${canonNum(v.drill ?? 0.3)} });`,
    );
}

/** Does this text hold a per-net track section (the write-back's grammar)? */
export function hasTrackSection(text: string): boolean {
  return /(?:^|\n)track_[A-Za-z0-9_]+\.push\(typecad\.track\(/.test(text);
}

export interface SectionRoutePlan {
  edits: PlannedEdit[];
  applied: number;
  skipped: string[];
}

/**
 * Append routes to a file's per-net track section in the write-back's
 * canonical dialect: a route whose net already has a block lands as its
 * last push statement (board order — the build emits statement order); a
 * new net gains a whole block at the end of the section and a `...track_X`
 * spread appended to create()'s arguments (the oracle's args order). Skips
 * (not duplicates — those the caller handles) come back with reasons;
 * net-less routes are not writable in this dialect (the section is named).
 */
export function planSectionRouteEdits(text: string, routes: RouteInput[]): SectionRoutePlan {
  const edits: PlannedEdit[] = [];
  const skipped: string[] = [];
  let applied = 0;
  // tails this APPLY created: {net -> the statement bytes just appended (an
  // edit's line ends with it) and its final point}. Earlier routes are
  // pending EDITS — invisible to the text reads below — so without this, a
  // route starting where a just-appended statement ends added a sibling the
  // oracle re-chains as drift (seen live: one J1 route committed in three
  // steps landed as three statements split at 132.775 and 136.912)
  const pendingTails = new Map<string | null, { stmt: string; edit: PlannedEdit; end: { x: number; y: number } }>();
  const extendTail = (net: string | null, stmt: string, edit: PlannedEdit) => {
    const end = finalPointOf(stmt);
    if (end) pendingTails.set(net, { stmt, edit, end });
  };
  for (const route of routes) {
    const label = `${route.from.ref}.${route.from.pin}`;
    // a net-less TRACK cannot land in the named section — but a net-less
    // VIA (placed anywhere off copper, floating) can: its standalone
    // statement carries no net, exactly the canonical form
    if ((route.net === null || route.net === '') && route.pieces.length > 0) {
      skipped.push(`${label} (net-less routes cannot land in the track section)`);
      continue;
    }
    if (route.net === null || route.net === '') {
      if ((route.vias ?? []).length === 0) {
        skipped.push(`${label} (net-less and via-less — nothing to write)`);
        continue;
      }
    }
    // a VIA-ONLY entry (the free via — no pieces) carries no track statement;
    // its standalone via statements below are the whole write. The statement
    // builder reads pieces[0], so guard it rather than crash.
    const standalone = standaloneViaStatements(route.net, route);
    const statement = route.pieces.length > 0 && route.net ? sectionPushStatement(route.net, route) : null;
    if (statement === null && standalone.length === 0) {
      skipped.push(`${label} (no geometry)`);
      continue;
    }
    if (statement !== null && text.includes(statement)) {
      skipped.push(`${label} (identical statement already in the section)`);
      continue;
    }

    const variable = trackVarForNet(route.net ?? '');
    const pushRe = new RegExp(`^${variable}\\.push\\([^;]*\\);`, 'gm');
    let lastPush: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = pushRe.exec(text)) !== null) lastPush = m;

    // mid-chain vias (layer transitions) are standalone statements at the
    // section end, in the write-back's canonical form — one edit placing
    // all of this route's, after the last existing standalone via or
    // after the section's last statement (blank-line separated)
    let standaloneLanded = false;
    if (standalone.length > 0) {
      const viaRe = /^typecad\.via\([^;]*\);$/gm;
      let lastVia: RegExpExecArray | null = null;
      while ((m = viaRe.exec(text)) !== null) lastVia = m;
      if (lastVia) {
        const at = lastVia.index + lastVia[0].length;
        edits.push({ start: at, end: at, line: '\n' + standalone.join('\n') });
        standaloneLanded = true;
      } else {
        const lastStmt = lastAnyStatement(text);
        if (lastStmt) {
          edits.push({ start: lastStmt.end, end: lastStmt.end, line: '\n\n' + standalone.join('\n') });
          standaloneLanded = true;
        } else {
          skipped.push(`${label} (no section anchor for the route's vias)`);
        }
      }
    }
    // via-only: the standalone statements above were the whole write
    if (statement === null) {
      if (standaloneLanded) applied++;
      continue;
    }

    const legs = routeLegs(route);
    const startPt = route.pieces[0]!.pts[0]!;
    // WITHIN-APPLY CHAINING: extend the statement this apply just wrote
    const pending = pendingTails.get(route.net);
    if (pending && ptEq(pending.end, startPt, 0.001) && legs.length > 0) {
      const grown = pending.stmt.slice(0, -2) + legs.map(toClause).join('') + ');';
      pending.edit.line = pending.edit.line.slice(0, pending.edit.line.length - pending.stmt.length) + grown;
      extendTail(route.net, grown, pending.edit);
      applied++;
      continue;
    }

    if (lastPush) {
      const stmt = lastPush[0];
      // CONTIGUOUS CONTINUATION: the oracle chains positionally-contiguous
      // segments into ONE statement (buildTrackChains breaks chains only on
      // position gaps) — a route that starts where the net's last statement
      // ends must EXTEND that statement, not add a sibling. Two statements
      // for one contiguous run read as drift and get re-chained on the next
      // write-back (seen live: CH2_COM and DRIVE redraws).
      const lastEnd = finalPointOf(stmt);
      if (lastEnd && ptEq(lastEnd, startPt, 0.001) && legs.length > 0) {
        const viaM = /\.via\(\{[^}]*\}\)/.exec(stmt);
        const head = viaM ? stmt.slice(0, viaM.index) : stmt.slice(0, stmt.lastIndexOf(');'));
        const extended = head + legs.map(toClause).join('') + ');';
        edits.push({ start: lastPush.index, end: lastPush.index + stmt.length, line: extended });
        extendTail(route.net, extended, edits[edits.length - 1]!);
        applied++;
        continue;
      }
      // existing net: append as its last statement (the canonical board
      // order puts newly built copper after the existing chains)
      const at = lastPush.index + stmt.length;
      edits.push({ start: at, end: at, line: `\n${statement}` });
      extendTail(route.net, statement, edits[edits.length - 1]!);
      applied++;
      continue;
    }

    // An ORPHANED declaration (a net whose pushes were all deleted — the
    // array survives empty) is an existing net too: append the push right
    // after the declaration. Re-declaring beside it is a duplicate-symbol
    // build failure (seen live: track_DRIVE declared twice), and the
    // create() spread already names it — a second spread would double the
    // copper into create().
    const declRe = new RegExp(`^const ${variable}: TrackBuilder\\[\\] = \\[\\];`, 'gm');
    const decl = declRe.exec(text);
    if (decl) {
      const at = decl.index + decl[0].length;
      edits.push({ start: at, end: at, line: `\n${statement}` });
      extendTail(route.net, statement, edits[edits.length - 1]!);
      applied++;
      continue;
    }

    // The net may exist only in THIS apply's pending edits: a redraw pair —
    // two routes for one net in one payload (a re-send after a failed
    // build, or the old route riding beside its replacement) — starts both
    // at the same pad, so the contiguous-pending extension never fires,
    // and the scans above read the ORIGINAL text and saw nothing. Taking
    // the new-block path here re-DECLARES the symbol beside the block this
    // apply just wrote (seen live: track_SDA declared twice, esbuild dead)
    // and re-spreads it into create(). Append as a sibling push into the
    // pending block instead.
    const pendingBlock = pendingTails.get(route.net);
    if (pendingBlock) {
      pendingBlock.edit.line += `\n${statement}`;
      extendTail(route.net, statement, pendingBlock.edit);
      applied++;
      continue;
    }

    // new net: a whole block at the END of the section (after the last
    // push of the last group), separated by one blank line — and the
    // create() args gain the spread, after the last argument (only when
    // they do not already carry it)
    const lastAny = lastAnyStatement(text);
    if (!lastAny) {
      skipped.push(`${label} (no section to append to — not the section owner)`);
      continue;
    }
    const block =
      `\n\n// Net: ${route.net}\nconst ${variable}: TrackBuilder[] = [];\n${statement}`;
    edits.push({ start: lastAny.end, end: lastAny.end, line: block });
    extendTail(route.net, statement, edits[edits.length - 1]!);

    const create = findCreateCall(text);
    if (create && !text.slice(create.createIdx, create.closeIdx).includes(`...${variable}`)) {
      const insert = createArgsSpreadInsert(text, create, `...${variable}`);
      if (insert) edits.push(insert);
    }
    applied++;
  }
  return { edits, applied, skipped };
}

/** End offset of the section's last statement — a standalone via line, or
 *  the last `track_X.push(...)` of the last group. */
function lastAnyStatement(text: string): { end: number } | null {
  let last: { end: number } | null = null;
  for (const m of text.matchAll(/^(?:typecad\.via\([^;]*\);|track_[A-Za-z0-9_]+\.push\([^;]*\);)$/gm)) {
    last = { end: m.index + m[0].length };
  }
  return last;
}

/** The final point of a canonical push statement — its last `.to({ x, y …})`
 *  vertex, or the `.from({ x, y …})` point when it has no legs. */
function finalPointOf(stmt: string): { x: number; y: number } | null {
  const tos = [...stmt.matchAll(/\.to\(\{ x: (-?[\d.]+), y: (-?[\d.]+),/g)];
  const last = tos[tos.length - 1];
  if (last) return { x: parseFloat(last[1]!), y: parseFloat(last[2]!) };
  const from = /\.from\(\{ x: (-?[\d.]+), y: (-?[\d.]+)/.exec(stmt);
  return from ? { x: parseFloat(from[1]!), y: parseFloat(from[2]!) } : null;
}

/** The `...spread` append into create()'s arguments, after the last
 *  argument — matching buildCreateArgsSource's kept-then-spreads order and
 *  the call's own single/multi-line style. Null when the insertion point
 *  cannot be found safely. */
function createArgsSpreadInsert(
  text: string,
  create: { createIdx: number; closeIdx: number },
  spread: string,
): PlannedEdit | null {
  const open = text.indexOf('(', create.createIdx);
  if (open === -1 || open > create.closeIdx) return null;
  let depth = 0;
  const commas: number[] = [];
  for (let i = open; i < create.closeIdx; i++) {
    const ch = text[i]!;
    if (ch === "'" || ch === '"') {
      i++;
      while (i < create.closeIdx && text[i] !== ch) {
        if (text[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 1) commas.push(i);
  }
  const lastArgAfter = (commaIdx: number) => {
    const argStart = commaIdx === -1 ? open + 1 : commaIdx + 1;
    let end = create.closeIdx;
    while (end > argStart && /\s/.test(text[end - 1]!)) end--;
    return end > argStart ? { end, argStart } : null;
  };
  // the last argument runs from the final top-level comma (or the open
  // paren) to the close paren, trailing whitespace excluded. A TRAILING
  // comma after the last real argument (`...track_X,\n);` — what canonical
  // rewrites and hand edits leave) means the final comma is followed by
  // nothing: without backing up, the insert silently failed and every
  // new net's spread vanished while its block landed (seen live: SDA,
  // SCL, UART_RX, UART_TX blocks with no create() spreads, their copper
  // never reaching the board)
  let real = lastArgAfter(commas.length ? commas[commas.length - 1]! : -1);
  if (!real && commas.length) {
    // the final comma is TRAILING: the real last argument is the token
    // run BEFORE it — cap at the comma and trim back to its end, so the
    // insert lands between the real argument and the surviving comma
    const cap = commas.pop()!;
    const argStart = commas.length ? commas[commas.length - 1]! + 1 : open + 1;
    let end = cap;
    while (end > argStart && /\s/.test(text[end - 1]!)) end--;
    if (end > argStart) real = { end, argStart };
  }
  if (!real) return null;
  const multiline = text.slice(open, create.closeIdx).includes('\n');
  const argLineStart = text.lastIndexOf('\n', real.end - 1) + 1;
  const indent = multiline ? (/^[ \t]*/.exec(text.slice(argLineStart, real.end))?.[0] ?? '  ') : '';
  const at = real.end;
  return { start: at, end: at, line: `,${multiline ? '\n' + indent : ' '}${spread}` };
}

/** Do two points match within tolerance (board frame, mm)? */
const ptEq = (a: { x: number; y: number }, b: { x: number; y: number }, tol = 0.02): boolean =>
  Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;

/** A length-preserving comment shadow of the text: comment bodies become
 *  spaces so structural scans (create() lookup) never match prose that
 *  merely mentions an API call. String literals survive intact (a `//` in a
 *  URL is not a comment). */
function stripComments(text: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < text.length) {
    const ch = text[i]!;
    if (quote) {
      out += ch;
      if (ch === '\\') {
        if (i + 1 < text.length) out += text[i + 1]!;
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      i++;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (ch === '/' && text[i + 1] === '*') {
      out += '  ';
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out += text[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < text.length) {
        out += '  ';
        i += 2;
      }
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Locate `typecad.create(` and its balanced closing paren (null when
 *  absent/unbalanced). Comment-aware: a banner or doc comment that mentions
 *  the call is not the call. */
function findCreateCall(text: string): { createIdx: number; closeIdx: number } | null {
  const shadow = stripComments(text);
  const createIdx = shadow.indexOf('typecad.create(');
  if (createIdx === -1) return null;
  let depth = 0;
  for (let i = createIdx + 'typecad.create('.length - 1; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return { createIdx, closeIdx: i };
    }
  }
  return null;
}

/**
 * Where appended create() arguments belong: after the last REAL token
 * inside the parens, skipping trailing whitespace and comments — a line
 * comment after the last arg (`r1, // main part`) must not end up between
 * two commas. The last real token decides the separator.
 */
export function createArgInsertion(text: string, createIdx: number, closeIdx: number): { at: number; sep: string } {
  let at = createIdx + 'typecad.create('.length;
  let lastTok = '(';
  for (let i = at; i < closeIdx; i++) {
    const ch = text[i]!;
    if (ch === '/' && text[i + 1] === '/') {
      while (i < closeIdx && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < closeIdx && !(text[i] === '*' && text[i + 1] === '/')) i++;
      continue;
    }
    if (!/\s/.test(ch)) {
      at = i + 1;
      lastTok = ch;
    }
  }
  const sep = lastTok === '(' ? '' : lastTok === ',' ? ' ' : ', ';
  return { at, sep };
}

/**
 * Route names declared in the text (`const <name> = new TrackBuilder(`),
 * in declaration order. TrackBuilder-only by design — the create() guard
 * maintains the router's own invariant, not every const in the file.
 */
export function declaredRouteNames(text: string): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*new TrackBuilder\b/g)) {
    names.push(m[1]!);
  }
  return names;
}

/**
 * Declared route names that create() does not receive — a route left out of
 * the argument list builds nothing and its copper silently vanishes from
 * the board (nothing errors; the traces are just gone). Null when the text
 * has no create() call to check against.
 */
export function uncreatedRouteNames(text: string): string[] | null {
  const call = findCreateCall(text);
  if (!call) return null;
  const args = text.slice(call.createIdx, call.closeIdx + 1);
  return declaredRouteNames(text).filter((nm) => !new RegExp(`\\b${nm}\\b`).test(args));
}

/**
 * One edit rewriting create()'s argument list: `add` names splice in with a
 * correct separator (before any trailing comment), `remove` names drop out
 * for every argument position. Null when there is nothing to do or no
 * create() call in this text.
 */
export function planCreateArgsEdit(text: string, add: string[], remove: string[]): PlannedEdit | null {
  const call = findCreateCall(text);
  if (!call || (add.length === 0 && remove.length === 0)) return null;
  let args = text.slice(call.createIdx, call.closeIdx + 1);
  if (add.length > 0) {
    const { at, sep } = createArgInsertion(text, call.createIdx, call.closeIdx);
    const gap = text.slice(at, call.closeIdx); // trailing comment/whitespace, kept
    const spacer = gap === '' || /^\s/.test(gap) ? '' : ' ';
    const rel = at - call.createIdx;
    args = args.slice(0, rel) + `${sep}${add.join(', ')}${spacer}${gap})`;
  }
  for (const nm of remove) {
    // NOTE: these build RegExp SOURCE strings — every backslash is doubled.
    // Section-dialect arguments are SPREADS (`...track_X`): strip the dots
    // with the name or they outlive the removal and abut the survivor
    // ("......track_PROBE_1", seen live). Bare names (the loose dialect)
    // keep their own patterns below.
    args = args
      .replace(new RegExp(`,\\s*\\.\\.\\.${nm}\\b`), '')
      .replace(new RegExp(`\\.\\.\\.${nm}\\s*,\\s*`), '')
      .replace(new RegExp(`\\.\\.\\.${nm}\\b`), '')
      .replace(new RegExp(`,\\s*${nm}\\b`), '')
      .replace(new RegExp(`\\b${nm}\\s*,\\s*`), '')
      .replace(new RegExp(`\\(\\s*${nm}\\s*\\)`), '()');
  }
  return { start: call.createIdx, end: call.closeIdx + 1, line: args };
}

/** Generate the TrackBuilder source for one route (multi-line, 2-space indents). */
function routeSource(name: string, r: RouteInput): string {
  const netLit = r.net ? escapeSingleQuoted(r.net) : null;
  const head = `const ${name} = new TrackBuilder(typecad, { ${netLit ? `net: '${netLit}', ` : ''} })`;
  const chain: string[] = [];
  // walk pieces + vias in order: a via sits between consecutive pieces; its
  // position is the tail of the previous piece and the head of the next
  const segments = r.pieces.filter((p) => p.pts.length >= 2);
  if (segments.length === 0) return '';
  const first = segments[0]!;
  const f0 = first.pts[0]!;
  // one barrel line, sized and spanned from its own record — shared by
  // head, interior, and tail vias alike
  const viaLine = (v: RouteInput['vias'][number]): string => {
    const size = v.size !== undefined ? fmt(v.size) : '0.6';
    const drill = v.drill !== undefined ? fmt(v.drill) : '0.3';
    const plainThrough =
      !v.layers ||
      (v.layers[0] === 'F.Cu' && v.layers[1] === 'B.Cu') ||
      (v.layers[0] === 'B.Cu' && v.layers[1] === 'F.Cu');
    const layers = plainThrough ? '' : `, layers: ['${v.layers![0]}', '${v.layers![1]}']`;
    return `  .via({ size: ${size}, drill: ${drill}${layers} })`;
  };
  if (r.power && r.power.current > 0) {
    const dt = r.power.maxTempRise ?? 10;
    // 4 decimals: currents can be sub-milliamp and fmt's 3 would flatten them
    const cur = String(parseFloat(r.power.current.toFixed(4)));
    chain.push(`  .powerInfo({ current: ${cur}, maxTempRise: ${fmt(dt)} })`);
  }
  chain.push(`  .from({ x: ${fmt(f0.x)}, y: ${fmt(f0.y)} }, '${first.layer}', ${fmt(first.w ?? r.w)})`);
  // a via at the chain's HEAD — a resized source route's far half re-added
  // as its own chain: the barrel rides right after .from() at that point
  const headVia = r.vias.find((vi) => ptEq(vi, f0));
  if (headVia) chain.push(viaLine(headVia));
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si]!;
    // every piece after the first starts at the boundary point shared with
    // the previous piece's tail — already emitted — so it walks from pts[1]
    for (let pi = 1; pi < seg.pts.length; pi++) {
      const pt = seg.pts[pi]!;
      chain.push(`  .to({ x: ${fmt(pt.x)}, y: ${fmt(pt.y)}, layer: '${seg.layer}', width: ${fmt(seg.w ?? r.w)} })`);
      // any recorded via at an emitted point lands its barrel — piece
      // boundaries, mid-piece stitches, AND the chain's tail alike, with
      // its own sizing and layer span (plain F<->B pairs stay default)
      const v = r.vias.find((vi) => ptEq(vi, pt));
      if (v && v !== headVia) chain.push(viaLine(v));
    }
  }
  // the terminating ';' lands on whichever line ended the chain — a .to()
  // or a tail .via()
  chain[chain.length - 1] += ';';
  return `${head}\n${chain.join('\n')}`;
}

/**
 * Make TrackBuilder resolvable where create() lives: join the file's
 * `@typecad/pcb` import, or start one ahead of the first import. Called
 * only when the identifier is absent — every fresh `typecad-pcb create`
 * project's first drawn route would otherwise die on a skip that amounts
 * to "add the import yourself".
 */
function planTrackBuilderImport(text: string): PlannedEdit {
  // the match stops at the quote or its semicolon — never at trailing
  // whitespace, which would swallow the line break after an import that
  // carries no `;` (the fresh-project template's style)
  const m = /import\s*\{([^}]+)\}\s*from\s*['"]@typecad\/pcb['"];?/.exec(text);
  if (m) {
    const names = m[1]!.split(',').map((s) => s.trim()).filter(Boolean);
    return {
      start: m.index,
      end: m.index + m[0].length,
      line: `import { ${[...names, 'TrackBuilder'].join(', ')} } from '@typecad/pcb';`,
    };
  }
  // nothing to join: a standalone import line of its own (line-anchored, so
  // a comment that merely mentions "import" cannot steal the insert point)
  const firstImport = /^import\b/m.exec(text);
  const at = firstImport ? firstImport.index : 0;
  return { start: at, end: at, line: `import { TrackBuilder } from '@typecad/pcb';\n` };
}

/** One validated route declaration, ready to place. */
interface CollectedRoute {
  name: string;
  src: string;
  /** the impedance note line, when the route carried one */
  note?: string;
}

/**
 * The shared insert collection: unique routeN numbering continuing past the
 * text's own, generation, and the two idempotency guards (byte-identical
 * re-apply and same-endpoint corridor duplicates). Both targets — before
 * create() in hand-written files, inside syncBoard() in the sidecar — draw
 * from this so a route can never be judged duplicate by one path and fresh
 * by the other. `dupContexts` are additional texts the guards also inspect
 * (the entry file, when inserting into the sidecar — a re-sent gesture whose
 * previous copy lives in hand-written code is still a duplicate).
 */
function collectRouteDecls(
  text: string,
  routes: RouteInput[],
  ...dupContexts: string[]
): { items: CollectedRoute[]; skipped: string[] } {
  const contexts = [text, ...dupContexts];
  const items: CollectedRoute[] = [];
  const skipped: string[] = [];
  let maxExisting = 0;
  for (const ctx of contexts) {
    for (const m of ctx.matchAll(/\broute(\d+)\b/g)) {
      maxExisting = Math.max(maxExisting, Number(m[1]));
    }
  }
  // for corridor idempotency: same-net chains already in the file(s), by net
  // — loose builders AND the import's push chains (a re-sent gesture whose
  // previous copy is import-written copper is still a duplicate)
  const parsedRoutes = contexts.flatMap((ctx) => {
    const loose = parseRoutes(ctx);
    const pushes = parsePushChains(ctx).map((pc) => ({
      points: pc.points,
      opts: pc.opts,
    }));
    return [...loose, ...pushes];
  });
  const routeNetOf = (pr: { opts: string }): string | null => /net:\s*'([^']*)'/.exec(pr.opts)?.[1] ?? null;

  for (const r of routes) {
    const name = `route${++maxExisting}`;
    const src = routeSource(name, r);
    if (!src) {
      skipped.push(`${r.from.ref}.${r.from.pin}${r.to ? `→${r.to.ref}.${r.to.pin}` : ''} (no geometry)`);
      maxExisting--;
      continue;
    }
    // idempotency: a chain with these exact coordinates already in the file
    // is a re-apply of the same session route (a failed build leaves the
    // page's routes pending; the retry must not duplicate them). The
    // generated chain uses \n; a CRLF-authored file carries the same chain
    // as \r\n — both byte orders must count as present, or every retry
    // re-inserts the route as a duplicate
    const chain = src.slice(src.indexOf('.from('));
    if (contexts.some((ctx) => ctx.includes(chain) || ctx.includes(chain.replace(/\n/g, '\r\n')))) {
      skipped.push(`${r.from.ref}.${r.from.pin} (identical route already in source)`);
      maxExisting--;
      continue;
    }
    // corridor idempotency: a same-net chain already connecting the new
    // route's endpoints (either direction) IS that connection — a retried
    // gesture must not stack a parallel corridor beside it (the delete/
    // retry loop piled five near-duplicate R1→D1 routes this way). Byte
    // comparison misses reversed and jittered variants, so this one is
    // endpoint-based
    if (r.net) {
      const runs = r.pieces.filter((p) => p.pts.length >= 2);
      if (runs.length > 0) {
        const first = runs[0]!.pts[0]!;
        const lastRun = runs[runs.length - 1]!;
        const end = lastRun.pts[lastRun.pts.length - 1]!;
        const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < 0.1;
        const dup = parsedRoutes.some((pr) => {
          if (routeNetOf(pr) !== r.net || pr.points.length < 2) return false;
          const a2 = pr.points[0]!;
          const b2 = pr.points[pr.points.length - 1]!;
          return (near(first, a2) && near(end, b2)) || (near(first, b2) && near(end, a2));
        });
        if (dup) {
          skipped.push(`${r.from.ref}.${r.from.pin} (a route already connects those endpoints on ${r.net})`);
          maxExisting--;
          continue;
        }
      }
    }
    items.push({
      name,
      src,
      note:
        r.impedance && r.impedance.z0 > 0
          ? `// \u2248${fmt(r.impedance.z0)} \u03a9 controlled impedance (stackup solve)`
          : undefined,
    });
  }
  return { items, skipped };
}

/**
 * Plan the insertion of `routes` into one source document: declarations
 * before `typecad.create(` and variable names appended to its argument list.
 */
export function planRouteEdits(text: string, routes: RouteInput[]): RoutePlan {
  const edits: PlannedEdit[] = [];
  const skipped: string[] = [];
  if (routes.length === 0) return { edits, applied: 0, skipped };

  const createIdx = text.indexOf('typecad.create(');
  if (createIdx === -1) {
    return { edits, applied: 0, skipped: routes.map((r) => `${r.from.ref}.${r.from.pin}${r.to ? `→${r.to.ref}.${r.to.pin}` : ''} (no typecad.create( call found)`) };
  }
  const lineStart = text.lastIndexOf('\n', createIdx) + 1;
  const indentMatch = /^[ \t]*/.exec(text.slice(lineStart, createIdx));
  const indent = indentMatch ? indentMatch[0]! : '';

  const call = findCreateCall(text);
  if (!call) {
    return { edits: [], applied: 0, skipped: routes.map((r) => `${r.from.ref}.${r.from.pin} (unbalanced typecad.create()`) };
  }

  const { items, skipped: skips } = collectRouteDecls(text, routes);
  skipped.push(...skips);
  const decls = items.map((it) =>
    indent + (it.note ? `${it.note}\n${indent}` : '') + it.src,
  );
  const names = items.map((it) => it.name);
  if (names.length === 0) return { edits, applied: 0, skipped };

  // declarations need TrackBuilder in scope where create() lives. A file
  // that never mentions it doesn't skip — the import is planned alongside:
  // joining the @typecad/pcb import that's almost surely there, or
  // starting one
  if (!/\bTrackBuilder\b/.test(text)) {
    edits.push(planTrackBuilderImport(text));
  }

  // one edit: declarations + a blank line inserted before the create line
  const declLine = `${decls.join('\n\n')}\n\n`;
  const argsEdit = planCreateArgsEdit(text, names, [])!;
  if (argsEdit.start <= lineStart) {
    // create( at column 0: the insert and the args rewrite would touch —
    // fold them into one replacement
    edits.push({ start: argsEdit.start, end: argsEdit.end, line: declLine + argsEdit.line });
  } else {
    edits.push({ start: lineStart, end: lineStart, line: declLine });
    edits.push(argsEdit);
  }
  return { edits, applied: names.length, skipped };
}

/**
 * Plan the insertion of `routes` into the _sync.ts sidecar: declarations
 * inside syncBoard() (after the last route), each with its collect push onto
 * syncTracks. The entry file's `...syncTracks` spread and import are planned
 * separately (planSyncEntryEdits) — this touches only the sidecar.
 * `entryText` (the create()-owning file) feeds the idempotency guards so a
 * re-sent gesture whose old copy lives in hand-written code still reads as
 * a duplicate.
 */
export function planSyncRouteEdits(text: string, routes: RouteInput[], entryText?: string): RoutePlan {
  const edits: PlannedEdit[] = [];
  const skipped: string[] = [];
  if (routes.length === 0) return { edits, applied: 0, skipped };
  if (!isSyncFileText(text) || syncFunctionBodyRange(text) === null) {
    return {
      edits,
      applied: 0,
      skipped: routes.map((r) => `${r.from.ref}.${r.from.pin} (_sync.ts is not a typeCAD sync file)`),
    };
  }
  const at = syncRouteInsertAt(text);
  if (at === null) {
    return { edits, applied: 0, skipped: routes.map((r) => `${r.from.ref}.${r.from.pin} (no syncBoard() body found)`) };
  }
  const { items, skipped: skips } = collectRouteDecls(text, routes, ...(entryText ? [entryText] : []));
  skipped.push(...skips);
  if (items.length === 0) return { edits, applied: 0, skipped };
  for (const it of items) {
    // every insert lands at the same anchor; the applier's edit merger
    // concatenates same-offset inserts in planning order
    edits.push({
      start: at,
      end: at,
      line: `  ${it.note ? `${it.note}\n  ` : ''}${it.src}\n${syncPushStatement(it.name)}\n`,
    });
  }
  return { edits, applied: items.length, skipped };
}

export interface RouteDeleteInput {
  kind?: 'segment' | 'via';
  net: string | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string | null;
}

/** Does a deleted segment match the a->b run (either orientation)? */
const segMatch = (
  d: RouteDeleteInput,
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean =>
  (ptEq({ x: d.x1, y: d.y1 }, a) && ptEq({ x: d.x2, y: d.y2 }, b)) ||
  (ptEq({ x: d.x1, y: d.y1 }, b) && ptEq({ x: d.x2, y: d.y2 }, a));

interface ParsedPoint {
  x: number;
  y: number;
  /** layer literal on this point's own call, when it carried one */
  layer?: string;
  /** width token on this point's own call, verbatim — a number OR the
   *  identifier of a width constant (`VCCW`), re-emitted unchanged */
  width?: string;
  /** trailing `// …` from this point's own line, re-emitted beside it */
  comment?: string;
  /** blank/comment lines that followed this point inside the chain —
   *  regeneration puts them back after its line (they die with the point) */
  after?: string[];
}

interface ParsedVia {
  /** index into points the via sits at (the barrel lands on the chain's current point) */
  at: number;
  /** verbatim argument list, e.g. `{ size: 0.6, drill: 0.3 }` */
  args: string;
  /** trailing `// …` from the via's own line, re-emitted beside it */
  comment?: string;
}

interface ParsedRoute {
  name: string;
  /** `export ` when the declaration is exported — split halves carry it so a
   *  create() in another file can still reference them */
  exportPrefix: string;
  /** constructor options, verbatim (`net: 'VCC',`) — preserved on regeneration */
  opts: string;
  /** a `.powerInfo({ … })` call's verbatim args — the power contract rides
   *  through regeneration untouched */
  powerArgs: string | null;
  /** trailing `// …` from the .powerInfo line, when it carried one */
  powerComment?: string;
  /** comment lines between the head and the first chain line */
  headAfter?: string[];
  indent: string;
  points: ParsedPoint[];
  vias: ParsedVia[];
  start: number; // index of the declaration line
  end: number; // index past the block's last chain line
}

// head: `[export ]const NAME = new TrackBuilder(typecad, { … })` — exported
// and bare declarations alike, any name (hand-written routes read like
// `const vcc = …`). `\s*$` tolerates CRLF line endings and trailing blanks.
// Chains accept the object form `.to({ x, y, layer, width })` and the
// positional form `.from({ x, y }, 'F.Cu', 0.3)` alike; widths may be a
// width-constant identifier (`VCCW`), not just a number.
const HEAD_RE = /^([ \t]*)(export[ \t]+)?const ([A-Za-z_$][A-Za-z0-9_$]*) = new TrackBuilder\(typecad,\s*\{([^}]*)\}\s*\)\s*$/;
const WIDTH_TOK = String.raw`[A-Za-z_$][A-Za-z0-9_$]*|[\d.]+`;
const FROM_RE = new RegExp(String.raw`^\.from\(\{\s*x\s*:\s*(-?[\d.]+)\s*,\s*y\s*:\s*(-?[\d.]+)\s*\}(?:\s*,\s*'([^']*)')?(?:\s*,\s*(${WIDTH_TOK}))?\s*\)`);
const TO_RE = new RegExp(
  String.raw`^\.to\(\{\s*x\s*:\s*(-?[\d.]+)\s*,\s*y\s*:\s*(-?[\d.]+)\s*(?:,\s*layer\s*:\s*'([^']*)')?(?:,\s*width\s*:\s*(${WIDTH_TOK}))?\s*\}(?:\s*,\s*'([^']*)')?(?:\s*,\s*(${WIDTH_TOK}))?\s*\)`,
);

/** trailing `// …` text after a chain call on its own line (verbatim). The
 *  call text itself contains no `//` — layers/widths are quoted or bare
 *  tokens — so scanning from the call's end is exact. */
const tailComment = (line: string, consumed: number): string | undefined => {
  const at = line.indexOf('//', consumed);
  return at === -1 ? undefined : line.slice(at).trim();
};

/** Parse every `[export ]const NAME = new TrackBuilder...` block in the text. */
function parseRoutes(text: string): ParsedRoute[] {
  const out: ParsedRoute[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = HEAD_RE.exec(lines[i]!);
    if (!m) continue;
    const [, indent, exportPrefix, name, opts] = m;
    const points: ParsedPoint[] = [];
    const vias: ParsedVia[] = [];
    let powerArgs: string | null = null;
    let powerComment: string | undefined;
    let headAfter: string[] | undefined;
    let end = lines.length; // unterminated chain: block runs to EOF
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]!.trim();
      if (l.startsWith('.from(')) {
        const fm = FROM_RE.exec(l);
        if (fm) {
          const p: ParsedPoint = { x: +fm[1]!, y: +fm[2]! };
          if (fm[3]) p.layer = fm[3];
          if (fm[4]) p.width = fm[4];
          const fc = tailComment(l, fm[0].length);
          if (fc) p.comment = fc;
          points.push(p);
        }
      } else if (l.startsWith('.to(')) {
        const tm = TO_RE.exec(l);
        if (tm) {
          const p: ParsedPoint = { x: +tm[1]!, y: +tm[2]! };
          const layer = tm[3] ?? tm[5];
          const width = tm[4] ?? tm[6];
          if (layer) p.layer = layer;
          if (width) p.width = width;
          const tc = tailComment(l, tm[0].length);
          if (tc) p.comment = tc;
          points.push(p);
        }
      } else if (l.startsWith('.via(')) {
        // the via sits at the chain's current point (the last pushed one);
        // its args ride verbatim so custom sizes/drills survive regeneration
        const open = l.indexOf('(');
        const close = l.lastIndexOf(')');
        if (points.length > 0 && open !== -1 && close > open) {
          const via: ParsedVia = { at: points.length - 1, args: l.slice(open + 1, close) };
          const vc = tailComment(l, close + 1);
          if (vc) via.comment = vc;
          vias.push(via);
        }
      } else if (l.startsWith('.powerInfo(')) {
        // the power contract is chain-builder config, not geometry: capture
        // its args verbatim and keep scanning — without this the chain scan
        // would treat it as a foreign statement and truncate the route
        const open = l.indexOf('(');
        const close = l.lastIndexOf(')');
        if (close > open) {
          powerArgs = l.slice(open + 1, close);
          const pc = tailComment(l, close + 1);
          if (pc) powerComment = pc;
        }
      } else if (l === '' || l.startsWith('//') || l.startsWith('/*')) {
        // blank/comment lines INSIDE a chain are tolerated — a comment
        // carrying a ';' must not truncate the route — and they ride the
        // point they follow so regeneration puts them back instead of
        // silently eating them (before the first point: head comments)
        const prev = points[points.length - 1];
        if (prev) (prev.after ??= []).push(l);
        else if (l !== '') (headAfter ??= []).push(l);
        continue;
      } else {
        // any other statement ends the block without being consumed by it
        end = j;
        break;
      }
      // the FINAL chain line carries the terminating ';' — the block ends
      // there, consuming that line
      if (l.endsWith(';')) {
        end = j + 1;
        break;
      }
    }
    out.push({
      name: name!,
      exportPrefix: exportPrefix ?? '',
      opts: (opts ?? '').trim(),
      powerArgs,
      powerComment,
      headAfter,
      indent: indent!,
      points,
      vias,
      start: i,
      end,
    });
    i = end - 1;
  }
  return out;
}

// --- push-dialect chains (the import's form) --------------------------------
//
// `track_VCC.push(typecad.track({ net: 'VCC' }).from({ x, y }, "F.Cu", w).to({ … }).to({ … }));`
//
// The board import writes routed copper as one-line pushes onto per-net
// arrays; the layout view writes loose `const routeN = new TrackBuilder()`
// chains (in hand-written files) or the sidecar dialect. Deletes must work
// on both — a project whose copper is entirely import-written (rd_skeleton)
// otherwise reports "no TrackBuilder routes in source" and strands every
// deleted trace.

/** One `array.push(typecad.track(…).from(…).to(…)…);` statement. */
interface PushChain {
  arrayName: string;
  /** verbatim `typecad.track(...)` options argument, e.g. `{ net: 'VCC' }` */
  opts: string;
  points: ParsedPoint[];
  /** verbatim trailing `.via({ … })` argument, when the chain ended in one */
  viaArgs: string | null;
  indent: string;
  /** char range of the whole statement, [line start, through `;`] */
  start: number;
  end: number;
}

/** `.from({ x, y }, "layer", width)` mid-line (the loose FROM_RE is line-anchored). */
const PUSH_FROM_RE = new RegExp(
  String.raw`\.from\(\{\s*x\s*:\s*(-?[\d.]+)\s*,\s*y\s*:\s*(-?[\d.]+)\s*\}(?:\s*,\s*(['"])([^'"]*)\3)?(?:\s*,\s*(${WIDTH_TOK}))?\s*\)`,
  'g',
);
/** `.to({ x, y, layer, width })` mid-line, object form (optionally positional tail). */
const PUSH_TO_RE = new RegExp(
  String.raw`\.to\(\{\s*x\s*:\s*(-?[\d.]+)\s*,\s*y\s*:\s*(-?[\d.]+)\s*(?:,\s*layer\s*:\s*(['"])([^'"]*)\3)?(?:,\s*width\s*:\s*(${WIDTH_TOK}))?\s*\}(?:\s*,\s*(['"])([^'"]*)\6)?(?:\s*,\s*(${WIDTH_TOK}))?\s*\)`,
  'g',
);

function parsePushChains(text: string): PushChain[] {
  const out: PushChain[] = [];
  // unnamed-nets copper carries no options object at all (`typecad.track()`)
  const HEAD = /([A-Za-z_$][\w$]*)\.push\(\s*typecad\.track\(\s*(\{[^}]*\})?/g;
  let m: RegExpExecArray | null;
  while ((m = HEAD.exec(text)) !== null) {
    const arrayName = m[1]!;
    const opts = m[2] ?? '';
    const start = text.lastIndexOf('\n', m.index) + 1;
    const indent = /^[ \t]*/.exec(text.slice(start, m.index))?.[0] ?? '';
    // scan to the statement's terminating `;`, paren-balanced and
    // quote-aware (net names may carry parens)
    let depth = 2; // inside push( and track(
    let quote: string | null = null;
    let i = m.index + m[0].length;
    for (; i < text.length; i++) {
      const ch = text[i]!;
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"') quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ';' && depth <= 0) break;
    }
    const end = Math.min(i + 1, text.length);
    const body = text.slice(m.index + m[0].length, end);

    const points: ParsedPoint[] = [];
    const links: Array<{ at: number; match: RegExpExecArray; from: boolean }> = [];
    for (const [re, from] of [
      [PUSH_FROM_RE, true],
      [PUSH_TO_RE, false],
    ] as Array<[RegExp, boolean]>) {
      re.lastIndex = 0;
      let lm: RegExpExecArray | null;
      while ((lm = re.exec(body)) !== null) links.push({ at: lm.index, match: lm, from });
    }
    links.sort((a, b) => a.at - b.at);
    for (const { match, from } of links) {
      const p: ParsedPoint = { x: +match[1]!, y: +match[2]! };
      if (from) {
        if (match[4]) p.layer = match[4];
        if (match[5]) p.width = match[5];
      } else {
        const layer = match[4] ?? match[7];
        const width = match[5] ?? match[8];
        if (layer) p.layer = layer;
        if (width !== undefined && width !== '') p.width = width;
      }
      points.push(p);
    }
    // a trailing .via() rides the chain's last point
    let viaArgs: string | null = null;
    const afterLast = links.length > 0 ? body.slice(links[links.length - 1]!.at + links[links.length - 1]!.match[0].length) : body;
    const via = /\.via\(\s*(\{[^}]*\})\s*\)/.exec(afterLast);
    if (via) viaArgs = via[1]!;

    out.push({ arrayName, opts, points, viaArgs, indent, start, end });
  }
  return out;
}

/** Re-emit one push statement covering the given point indexes (a surviving run). */
function emitPushStatement(pc: PushChain, idxs: number[], viaArgs: string | null): string {
  const pts = idxs.map((i) => pc.points[i]!);
  const p0 = pts[0]!;
  let s =
    p0.layer !== undefined
      ? `${pc.arrayName}.push(typecad.track(${pc.opts}).from({ x: ${fmt(p0.x)}, y: ${fmt(p0.y)} }, "${p0.layer}"${p0.width !== undefined ? `, ${p0.width}` : ''})`
      : `${pc.arrayName}.push(typecad.track(${pc.opts}).from({ x: ${fmt(p0.x)}, y: ${fmt(p0.y)} })`;
  for (let k = 1; k < pts.length; k++) {
    const p = pts[k]!;
    const fields = [`x: ${fmt(p.x)}`, `y: ${fmt(p.y)}`];
    if (p.layer) fields.push(`layer: "${p.layer}"`);
    if (p.width !== undefined) fields.push(`width: ${p.width}`);
    s += `.to({ ${fields.join(', ')} })`;
  }
  if (viaArgs) s += `.via(${viaArgs})`;
  return `${pc.indent}${s});`;
}

export interface RouteDeletePlan {
  edits: PlannedEdit[];
  applied: number;
  skipped: string[];
  /** split-half names this plan could not pass to create() — set when the
   *  route blocks live in a file WITHOUT the create() call; the caller owns
   *  them (the create()-owning file must gain them). `sibling` is the
   *  original route name — the import that names it is where the half
   *  belongs too. */
  unhandledAdditions: Array<{ name: string; sibling: string }>;
  /** emptied-route names likewise left in create() elsewhere */
  unhandledRemovals: string[];
  /** deletes that matched no source segment — the source does not carry
   *  the geometry the user deleted (typically a stale view); the caller
   *  refuses the apply when these coincide with added routes on the same
   *  net, or the surviving source would ride beside the replacement */
  unmatched: RouteDeleteInput[];
}

/**
 * Plan the removal of deleted segments from the source's TrackBuilder
 * chains: matched segments drop, and a route that breaks in the middle
 * splits into two builders (routeN + routeNb) so a real GAP replaces the
 * deleted copper instead of a bridge. Fully emptied routes disappear along
 * with their create() argument. Surviving runs keep the route's options,
 * every via not adjacent to a cut, and each point's own layer.
 *
 * `opts.collectVar` switches to sidecar semantics: routes in a _sync.ts
 * body reach the board through `<collect>.push(name)` lines, not create()
 * arguments — split halves gain their own collect line, emptied routes take
 * theirs along, and create() is left alone.
 */
export function planRouteDeletes(
  text: string,
  deletes: RouteDeleteInput[],
  opts?: { collectVar?: string },
): RouteDeletePlan {
  const collectVar = opts?.collectVar;
  const edits: PlannedEdit[] = [];
  const skipped: string[] = [];
  const unhandledAdditions: Array<{ name: string; sibling: string }> = [];
  const unhandledRemovals: string[] = [];
  if (deletes.length === 0) return { edits, applied: 0, skipped, unhandledAdditions, unhandledRemovals, unmatched: [] };

  const routes = parseRoutes(text);
  const pushes = parsePushChains(text);

  // Standalone via statements — the canonical home of mid-chain (layer
  // transition) vias. Two delete paths own them: a VIA-kind delete names
  // one directly (the user selected the via), and a leg deletion that
  // removes the geometry a via joins orphans it (deleting the route must
  // take its transition vias — seen live: the track went, both vias
  // stayed on the rebuilt board).
  // the net clause is OPTIONAL — a floating via (placed anywhere off copper)
  // writes the net-less canonical statement, and its delete must match that
  // too (seen live: a floating via's delete matched no statement, fell to
  // segment matching, and refused the whole apply)
  const standaloneViaRe = /^typecad\.via\(\{ at: \{ x: (-?[\d.]+), y: (-?[\d.]+) \}(?:, net: '([^']*)')?[^)]*\}\);$/gm;
  const standaloneVias: Array<{ start: number; end: number; x: number; y: number; net: string; removed: boolean }> = [];
  for (const m of text.matchAll(standaloneViaRe)) {
    let end = m.index + m[0].length;
    const nl = /^\r?\n/.exec(text.slice(end));
    if (nl) end += nl[0].length;
    standaloneVias.push({ start: m.index, end, x: parseFloat(m[1]!), y: parseFloat(m[2]!), net: m[3] ?? '', removed: false });
  }
  // line-index -> char-offset mapping for block edits (create() edits are
  // computed in char offsets directly and stay untouched by this)
  const lineStarts: number[] = [];
  {
    let acc = 0;
    for (const ln of text.split('\n')) {
      lineStarts.push(acc);
      acc += ln.length + 1;
    }
  }
  if (routes.length === 0 && pushes.length === 0) {
    return {
      edits,
      applied: 0,
      skipped: deletes.map((d) => `segment ${d.x1},${d.y1}->${d.x2},${d.y2} (no TrackBuilder routes in source)`),
      unhandledAdditions,
      unhandledRemovals,
      unmatched: deletes.slice(),
    };
  }
  const call = findCreateCall(text);

  const namesToAdd: Array<{ name: string; sibling: string }> = [];
  const namesToRemove: string[] = [];
  /** indexes into `deletes` that matched a source segment somewhere */
  const matched = new Set<number>();
  /** via-kind deletes that named a standalone via statement directly —
   *  applied as statement removals, matched so they never read as
   *  unmatched noise (unmatched via-deletes stay bookkeeping: the page
   *  fires one at every deleted-segment endpoint; most carry no via) */
  const viaPtsEq = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
    Math.abs(a.x - b.x) < 0.002 && Math.abs(a.y - b.y) < 0.002;
  deletes.forEach((d, i) => {
    if (d.kind !== 'via') return;
    const at = { x: d.x1, y: d.y1 };
    const hit = standaloneVias.find((v) => !v.removed && viaPtsEq(v, at) && (!d.net || !v.net || v.net === d.net));
    if (!hit) return;
    hit.removed = true;
    matched.add(i);
  });
  /** per-route keep flags — a duplicate delete matching already-dying
   *  copper is absorbed, not unmatched (the page sends a via-delete at
   *  every deleted-segment endpoint; the via claims the source segment
   *  and the segment delete itself would otherwise read as unmatched) */
  const routeNet = (r: ParsedRoute): string | null => /net:\s*'([^']*)'/.exec(r.opts)?.[1] ?? null;
  const keptByRoute: Array<{ route: ParsedRoute; keep: boolean[] }> = [];

  for (const r of routes) {
    // remaining segment flags: segment i is (points[i], points[i+1])
    const keep: boolean[] = [];
    for (let i = 0; i + 1 < r.points.length; i++) {
      const hit = deletes.findIndex((d) => {
        if (d.kind === 'via') {
          // a via sits between two pieces: deleting it truncates the chain
          // there — the segment leaving the via point goes with it (the far
          // side survives as its own dangling route). A via on the chain's
          // tail drops the segment leading into it
          const via = { x: d.x1, y: d.y1 };
          if (ptEq(via, r.points[i]!)) return true;
          if (i + 1 === r.points.length - 1 && ptEq(via, r.points[i + 1]!)) return true;
          return false;
        }
        return segMatch(d, r.points[i]!, r.points[i + 1]!);
      });
      keep.push(hit === -1);
      if (hit !== -1) matched.add(hit);
    }
    keptByRoute.push({ route: r, keep });
    if (keep.every((k) => k)) continue; // untouched

    /** serialize one surviving run (a contiguous span of point indexes) */
    const emitRun = (name: string, idxs: number[]): string => {
      const lines: string[] = [];
      const pushAfter = (p: ParsedPoint): void => {
        for (const a of p.after ?? []) lines.push(a === '' ? '' : r.indent + a);
      };
      const p0 = r.points[idxs[0]!]!;
      // width may ride positionally only BEHIND a layer — .from()'s second
      // parameter is the layer string, so a width without a layer goes in
      // the object form instead. The token re-emits verbatim, so a width
      // constant (`VCCW`) stays a constant
      lines.push(
        r.indent +
          (p0.layer !== undefined
            ? `.from({ x: ${fmt(p0.x)}, y: ${fmt(p0.y)} }, '${p0.layer}'${p0.width !== undefined ? `, ${p0.width}` : ''})`
            : `.from({ x: ${fmt(p0.x)}, y: ${fmt(p0.y)}${p0.width !== undefined ? `, width: ${p0.width}` : ''} })`) +
          (p0.comment ? ` ${p0.comment}` : ''),
      );
      pushAfter(p0);
      for (let k = 1; k < idxs.length; k++) {
        const p = r.points[idxs[k]!]!;
        const fields = [`x: ${fmt(p.x)}`, `y: ${fmt(p.y)}`];
        if (p.layer) fields.push(`layer: '${p.layer}'`);
        if (p.width !== undefined) fields.push(`width: ${p.width}`);
        const last = k === idxs.length - 1;
        // the terminating ';' lands on the final chain line BEFORE its
        // comment — after the comment it would comment out the ';'
        lines.push(`${r.indent}.to({ ${fields.join(', ')} })${last ? ';' : ''}${p.comment ? ` ${p.comment}` : ''}`);
        // a via BETWEEN two kept segments survives with its own args; one at
        // a cut boundary dies with the deleted segment (no barrel on a gap)
        if (!last) {
          const v = r.vias.find((vv) => vv.at === idxs[k]!);
          if (v) lines.push(`${r.indent}.via(${v.args})${v.comment ? ` ${v.comment}` : ''}`);
        }
        pushAfter(p);
      }
      const headComments = (r.headAfter ?? []).map((c) => `\n${r.indent}${c}`).join('');
      const power = r.powerArgs ? `\n${r.indent}.powerInfo(${r.powerArgs})${r.powerComment ? ` ${r.powerComment}` : ''}` : '';
      return `${r.indent}${r.exportPrefix}const ${name} = new TrackBuilder(typecad, { ${r.opts} })${headComments}${power}\n${lines.join('\n')}`;
    };

    // split into contiguous runs of point indexes
    const runs: number[][] = [];
    let cur: number[] = [];
    for (let i = 0; i < keep.length; i++) {
      if (keep[i]) {
        if (cur.length === 0) cur.push(i);
        cur.push(i + 1);
      } else if (cur.length) {
        runs.push(cur);
        cur = [];
      }
    }
    if (cur.length) runs.push(cur);

    const blockLines = r.end - r.start;
    const blockStart = lineStarts[r.start] ?? 0;
    const blockEnd = lineStarts[r.start + blockLines] ?? text.length;
    if (runs.length === 0) {
      // emptied: remove the declaration AND the blank line that follows
      // it — repeated rewrites would otherwise pile up empty lines where
      // route blocks used to be. In a sidecar the route's collect line sits
      // between the chain and that blank — take it too, or it references a
      // declaration that no longer exists
      let emptyEnd = blockEnd;
      if (collectVar) {
        const collectLine = new RegExp(`^[ \\t]*${collectVar}\\.push\\(\\s*${r.name}\\s*\\)\\s*;?[ \\t]*\\r?\\n?`).exec(
          text.slice(emptyEnd),
        );
        if (collectLine) emptyEnd += collectLine[0].length;
      }
      const after = text.slice(emptyEnd);
      const blankLine = /^\r?\n/.exec(after);
      if (blankLine) emptyEnd += blankLine[0].length;
      edits.push({ start: blockStart, end: emptyEnd, line: '' });
      namesToRemove.push(r.name);
      continue;
    }
    const built: string[] = [emitRun(r.name, runs[0]!)];
    for (let ri = 1; ri < runs.length; ri++) {
      const base = `${r.name}${'abcdefgh'[ri - 1] ?? 'z'}`;
      // ensure uniqueness beyond existing names
      let candidate = base;
      let bump = 1;
      while (text.includes(`const ${candidate} =`) || built.some((b) => b.includes(`const ${candidate} =`))) {
        candidate = `${base}${++bump}`;
      }
      built.push(
        emitRun(candidate, runs[ri]!) + (collectVar ? `\n${r.indent}${collectVar}.push(${candidate});` : ''),
      );
      namesToAdd.push({ name: candidate, sibling: r.name });
    }
    edits.push({ start: blockStart, end: blockEnd, line: built.join('\n\n') + '\n' });
  }

  // push-dialect chains (the import's one-line `arr.push(typecad.track(…))`
  // statements): the same keep/run/split logic, re-emitted in their own
  // dialect. An array whose statements ALL die empties, and the oracle's
  // canonical section drops the whole block (comment + declaration) and its
  // create() spread — leaving either read as drift on the next write-back
  // (seen live: track_AMP_OUT's spread survived its last push).
  const pushChainInfos: Array<{ points: ParsedPoint[]; net: string | null; keep: boolean[] }> = [];
  const arrayStats = new Map<string, { total: number; dead: number }>();
  for (const pc of pushes) {
    const stats = arrayStats.get(pc.arrayName) ?? { total: 0, dead: 0 };
    stats.total++;
    arrayStats.set(pc.arrayName, stats);
    const net = /net:\s*'([^']*)'/.exec(pc.opts)?.[1] ?? null;
    const keep: boolean[] = [];
    for (let i = 0; i + 1 < pc.points.length; i++) {
      const hit = deletes.findIndex((d) => {
        if (d.kind === 'via') {
          // same semantics as loose chains: a via-delete truncates the chain
          // at the via point; a tail via takes the segment leading into it
          const via = { x: d.x1, y: d.y1 };
          if (ptEq(via, pc.points[i]!)) return true;
          if (i + 1 === pc.points.length - 1 && ptEq(via, pc.points[i + 1]!)) return true;
          return false;
        }
        return segMatch(d, pc.points[i]!, pc.points[i + 1]!);
      });
      keep.push(hit === -1);
      if (hit !== -1) matched.add(hit);
    }
    pushChainInfos.push({ points: pc.points, net, keep });
    if (keep.every((k) => k)) continue; // untouched

    const runs: number[][] = [];
    let cur: number[] = [];
    for (let i = 0; i < keep.length; i++) {
      if (keep[i]) {
        if (cur.length === 0) cur.push(i);
        cur.push(i + 1);
      } else if (cur.length) {
        runs.push(cur);
        cur = [];
      }
    }
    if (cur.length) runs.push(cur);

    if (runs.length === 0) {
      // emptied: the statement goes, and the line break with it
      let rmEnd = pc.end;
      const nl = /^\r?\n/.exec(text.slice(rmEnd));
      if (nl) rmEnd += nl[0].length;
      edits.push({ start: pc.start, end: rmEnd, line: '' });
      arrayStats.get(pc.arrayName)!.dead++;
      continue;
    }
    // the chain's trailing via survives only on the statement that still
    // ends at the chain's final point
    const lastRun = runs[runs.length - 1]!;
    const viaArgs = lastRun[lastRun.length - 1] === pc.points.length - 1 ? pc.viaArgs : null;
    const stmts = runs.map((r, ri) => emitPushStatement(pc, r, ri === runs.length - 1 ? viaArgs : null));
    edits.push({ start: pc.start, end: pc.end, line: stmts.join('\n') });
  }

  // arrays whose every statement died: the canonical section carries no
  // empty block — the declaration and its `// Net:` comment go, and the
  // create() spread joins namesToRemove for the combined rewrite below
  for (const [name, stats] of arrayStats) {
    if (stats.dead === 0 || stats.dead < stats.total) continue;
    const blockRe = new RegExp(`(\/\/ Net: [^\\r\\n]*\\r?\\n)const ${name}: TrackBuilder\\[\\] = \\[\\];\\r?\\n\\r?\\n?`);
    const blockM = blockRe.exec(text);
    if (blockM) {
      edits.push({ start: blockM.index, end: blockM.index + blockM[0].length, line: '' });
    } else {
      const declRe = new RegExp(`const ${name}: TrackBuilder\\[\\] = \\[\\];\\r?\\n\\r?\\n?`);
      const declM = declRe.exec(text);
      if (declM) edits.push({ start: declM.index, end: declM.index + declM[0].length, line: '' });
    }
    namesToRemove.push(name);
  }

  // ONE combined create() rewrite: additions splice in with a comment-aware
  // separator, then removals drop their names — never two edits over the
  // same range. Without a create() call in THIS text (route blocks live in a
  // dedicated module), the names surface as unhandled for the caller. A
  // sidecar needs none of this: its splits carry their own collect line and
  // its emptied routes died with theirs.
  if ((namesToAdd.length > 0 || namesToRemove.length > 0) && !collectVar) {
    const argsEdit = call
      ? planCreateArgsEdit(
          text,
          namesToAdd.map((a) => a.name),
          namesToRemove,
        )
      : null;
    if (argsEdit) {
      edits.push(argsEdit);
    } else {
      unhandledAdditions.push(...namesToAdd);
      unhandledRemovals.push(...namesToRemove);
    }
  }

  // duplicate absorption: a delete whose geometry matches copper another
  // delete already removed describes the same removal twice — the page's
  // via-delete at a segment endpoint claims the source segment, leaving
  // the segment delete itself apparently unmatched. Both dialects feed it.
  const chainsForGuards: Array<{ points: ParsedPoint[]; net: string | null; keep: boolean[] }> = [
    ...keptByRoute.map(({ route, keep }) => ({ points: route.points, net: routeNet(route), keep })),
    ...pushChainInfos,
  ];
  deletes.forEach((d, i) => {
    if (matched.has(i) || d.kind === 'via') return;
    for (const { points, net, keep } of chainsForGuards) {
      if (net && d.net && net !== d.net) continue;
      for (let s = 0; s + 1 < points.length; s++) {
        if (keep[s]) continue;
        if (segMatch(d, points[s]!, points[s + 1]!)) {
          matched.add(i);
          return;
        }
      }
    }
  });

  // Orphan sweep: a standalone via belongs to the geometry it joins —
  // when the deletions removed every leg touching its vertex, the via
  // statement must go with them (a via floating over deleted copper
  // re-materializes on every rebuild). Only fires when something was
  // actually deleted; a via still touching a SURVIVING vertex stays.
  const anyDeleted = chainsForGuards.some(({ keep }) => keep.some((k) => !k));
  if (anyDeleted && standaloneVias.length > 0) {
    const keptVertices: Array<{ x: number; y: number }> = [];
    for (const { points, keep } of chainsForGuards) {
      for (let s = 0; s + 1 < points.length; s++) {
        if (!keep[s]) continue;
        keptVertices.push(points[s]!, points[s + 1]!);
      }
    }
    for (const v of standaloneVias) {
      if (v.removed) continue;
      const stillJoined = keptVertices.some((p) => viaPtsEq(p, v));
      if (!stillJoined) v.removed = true;
    }
  }
  for (const v of standaloneVias) {
    if (v.removed) edits.push({ start: v.start, end: v.end, line: '' });
  }

  const unmatchedList = deletes.filter((_, i) => !matched.has(i));
  if (unmatchedList.length > 0) skipped.push(`${unmatchedList.length} deleted segment(s) matched no source route`);
  // proximity tagging: an unmatched delete NEAR source copper of its net is
  // drift (the view described source geometry with moved coordinates — the
  // stale-view phantom). One nowhere near any source copper is noise: the
  // page pushes a via-delete at EVERY deleted-segment endpoint, and most
  // endpoints carry no via — those must drop, not refuse the apply
  const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  const nearChains: Array<{ points: ParsedPoint[]; net: string | null }> = [
    ...routes.map((r) => ({ points: r.points, net: routeNet(r) })),
    ...pushChainInfos.map(({ points, net }) => ({ points, net })),
  ];
  const allRoutePts = nearChains.flatMap((r) =>
    r.points.map((p) => ({ x: p.x, y: p.y, net: r.net })),
  );
  const nearSource = (d: RouteDeleteInput): boolean => {
    for (const r of nearChains) {
      if (r.net && d.net && r.net !== d.net) continue;
      for (let s = 1; s < r.points.length; s++) {
        const a = r.points[s - 1]!;
        const b = r.points[s]!;
        if (segDist(d.x1, d.y1, a.x, a.y, b.x, b.y) < 0.3 || segDist(d.x2, d.y2, a.x, a.y, b.x, b.y) < 0.3)
          return true;
      }
    }
    // via-kind: near any parsed route point
    if (d.kind === 'via') {
      for (const p of allRoutePts) {
        if (p.net && d.net && p.net !== d.net) continue;
        if (Math.hypot(p.x - d.x1, p.y - d.y1) < 0.3) return true;
      }
    }
    return false;
  };
  for (const d of unmatchedList) {
    const tagged = d as RouteDeleteInput & { nearSource?: boolean };
    // via-kind unmatched deletes sit at deleted-segment endpoints — points
    // that ARE source geometry — so proximity says nothing; they are
    // endpoint bookkeeping (a via-delete fires at every endpoint, most
    // carry no via) and never refuse an apply. Only SEGMENT deletes near
    // source copper signal drift.
    tagged.nearSource = d.kind === 'via' ? false : nearSource(d);
  }
  return {
    edits,
    applied: matched.size,    skipped,
    unhandledAdditions,
    unhandledRemovals,
    /** deletes that matched nothing — the source does not carry the
     * geometry the user saw (a stale view); proceeding would leave that
     * geometry beside whatever replaces it */
    unmatched: unmatchedList,
  };
}
