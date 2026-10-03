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
    // NOTE: these build RegExp SOURCE strings — every backslash is doubled
    args = args
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
  // dialect. The array stays in create() either way — a spread of an emptied
  // array contributes nothing — so there is no create-args maintenance here.
  const pushChainInfos: Array<{ points: ParsedPoint[]; net: string | null; keep: boolean[] }> = [];
  for (const pc of pushes) {
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
      continue;
    }
    // the chain's trailing via survives only on the statement that still
    // ends at the chain's final point
    const lastRun = runs[runs.length - 1]!;
    const viaArgs = lastRun[lastRun.length - 1] === pc.points.length - 1 ? pc.viaArgs : null;
    const stmts = runs.map((r, ri) => emitPushStatement(pc, r, ri === runs.length - 1 ? viaArgs : null));
    edits.push({ start: pc.start, end: pc.end, line: stmts.join('\n') });
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
    applied: matched.size,
    skipped,
    unhandledAdditions,
    unhandledRemovals,
    /** deletes that matched nothing — the source does not carry the
     * geometry the user saw (a stale view); proceeding would leave that
     * geometry beside whatever replaces it */
    unmatched: unmatchedList,
  };
}
