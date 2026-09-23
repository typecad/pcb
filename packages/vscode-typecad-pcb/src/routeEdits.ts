// ---------------------------------------------------------------------------
// Route apply: committed interactive routes become source TrackBuilders.
//
// A route arrives from the layout view as { net, w, pieces, vias } in board
// (y-down) millimetres. This plans pure text edits: one const declaration
// per route (`.from(...).to(...)` chain, `.via(...)` at every layer switch)
// inserted before the `typecad.create(` call, and the variable appended to
// that call's argument list — the same authoring style as the project's own
// hand-written routes.
// ---------------------------------------------------------------------------

export interface RouteInput {
  net: string | null;
  w: number;
  pieces: Array<{ layer: string; pts: Array<{ x: number; y: number }> }>;
  vias: Array<{ x: number; y: number }>;
  from: { ref: string; pin: string };
  to: { ref: string; pin: string } | null;
}

export interface RoutePlan {
  edits: Array<{ uri: string; start: number; end: number; line: string }>;
  skipped: string[];
}

const fmt = (n: number): string => String(parseFloat(n.toFixed(3)));

/** Generate the TrackBuilder source for one route (multi-line, 2-space indents). */
function routeSource(name: string, r: RouteInput): string {
  const head = `const ${name} = new TrackBuilder(typecad, { ${r.net ? `net: '${r.net}', ` : ''} })`;
  const chain: string[] = [];
  // walk pieces + vias in order: a via sits between consecutive pieces; its
  // position is the tail of the previous piece and the head of the next
  const segments: Array<{ layer: string; pts: Array<{ x: number; y: number }> }> = r.pieces.filter((p) => p.pts.length >= 2);
  if (segments.length === 0) return '';
  const first = segments[0]!;
  const f0 = first.pts[0]!;
  chain.push(`  .from({ x: ${fmt(f0.x)}, y: ${fmt(f0.y)} }, '${first.layer}', ${fmt(r.w)})`);
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si]!;
    for (let pi = si === 0 ? 1 : 1; pi < seg.pts.length; pi++) {
      const pt = seg.pts[pi]!;
      const isTail = pi === seg.pts.length - 1 && si < segments.length - 1;
      if (isTail) {
        // end this layer's run at the via, drop the via, continue on the next piece
        chain.push(`  .to({ x: ${fmt(pt.x)}, y: ${fmt(pt.y)}, layer: '${seg.layer}', width: ${fmt(r.w)} })`);
        chain.push(`  .via({ size: 0.6, drill: 0.3 })`);
      } else {
        chain.push(`  .to({ x: ${fmt(pt.x)}, y: ${fmt(pt.y)}, layer: '${seg.layer}', width: ${fmt(r.w)} })`);
      }
    }
  }
  return `${head}\n${chain.join('\n')};`;
}

/**
 * Plan the insertion of `routes` into one source document: declarations
 * before `typecad.create(` and variable names appended to its argument list.
 */
export function planRouteEdits(text: string, routes: RouteInput[]): RoutePlan {
  const edits: RoutePlan['edits'] = [];
  const skipped: string[] = [];
  if (routes.length === 0) return { edits, skipped };

  const createIdx = text.indexOf('typecad.create(');
  if (createIdx === -1) {
    return { edits, skipped: routes.map((r) => `${r.from.ref}.${r.from.pin}${r.to ? `→${r.to.ref}.${r.to.pin}` : ''} (no typecad.create( call found)`) };
  }
  // unique variable names: route1, route2... continuing past existing ones
  let maxExisting = 0;
  for (const m of text.matchAll(/\broute(\d+)\b/g)) {
    maxExisting = Math.max(maxExisting, Number(m[1]));
  }
  const lineStart = text.lastIndexOf('\n', createIdx) + 1;
  const indentMatch = /^[ \t]*/.exec(text.slice(lineStart, createIdx));
  const indent = indentMatch ? indentMatch[0]! : '';

  // find the create() call's closing paren (balanced)
  let depth = 0;
  let closeIdx = -1;
  for (let i = createIdx + 'typecad.create('.length - 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }
  if (closeIdx === -1) {
    return { edits, skipped: routes.map((r) => `${r.from.ref}.${r.from.pin} (unbalanced typecad.create()`) };
  }

  const decls: string[] = [];
  const names: string[] = [];
  for (const r of routes) {
    const name = `route${++maxExisting}`;
    const src = routeSource(name, r);
    if (!src) {
      skipped.push(`${r.from.ref}.${r.from.pin}${r.to ? `→${r.to.ref}.${r.to.pin}` : ''} (no geometry)`);
      maxExisting--;
      continue;
    }
    decls.push(indent + src);
    names.push(name);
  }
  if (names.length === 0) return { edits, skipped };

  // one edit: declarations + a blank line inserted before the create line
  edits.push({
    uri: '',
    start: lineStart,
    end: lineStart,
    line: `${decls.join('\n\n')}\n\n`,
  });
  // second edit: replace the create() call's closing paren with the
  // appended variables + the paren back. The last non-whitespace char
  // decides the separator (a trailing arg comma must not double up)
  let lastMeaning = closeIdx - 1;
  while (lastMeaning > createIdx && /\s/.test(text[lastMeaning] ?? '')) lastMeaning--;
  const sep = text[lastMeaning] === '(' ? '' : text[lastMeaning] === ',' ? ' ' : ', ';
  edits.push({
    uri: '',
    start: closeIdx,
    end: closeIdx + 1,
    line: `${sep}${names.join(', ')})`,
  });
  return { edits, skipped };
}

export interface RouteDeleteInput {
  net: string | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string | null;
}

/** Do two points match within tolerance (board frame, mm)? */
const ptEq = (a: { x: number; y: number }, b: { x: number; y: number }, tol = 0.02): boolean =>
  Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;

/** Does a deleted segment match the a->b run (either orientation)? */
const segMatch = (
  d: RouteDeleteInput,
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean =>
  (ptEq({ x: d.x1, y: d.y1 }, a) && ptEq({ x: d.x2, y: d.y2 }, b)) ||
  (ptEq({ x: d.x1, y: d.y1 }, b) && ptEq({ x: d.x2, y: d.y2 }, a));

interface ParsedRoute {
  name: string;
  head: string; // 'const NAME = new TrackBuilder(typecad, { ... })'
  indent: string;
  points: Array<{ x: number; y: number }>;
  layer: string;
  width: number;
  start: number; // index of 'const' line
  end: number; // index past the closing ');'
}

/** Parse every `const routeN = new TrackBuilder...` block in the text. */
function parseRoutes(text: string): ParsedRoute[] {
  const out: ParsedRoute[] = [];
  const re = /^([ \t]*)const (route\d+) = new TrackBuilder\(typecad, \{ ([^}]*)\}\)[ \t]*$/;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]!);
    if (!m) continue;
    const [, indent, name, opts] = m;
    const points: Array<{ x: number; y: number }> = [];
    let layer = '';
    let width = 0.3;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j]!.trim();
      if (l.startsWith('.from(')) {
        const fm = /\.from\(\{ x: (-?[\d.]+), y: (-?[\d.]+) \}(?:, '([^']+)')?(?:, ([\d.]+))?\)/.exec(l);
        if (fm) {
          points.push({ x: +fm[1]!, y: +fm[2]! });
          if (fm[3]) layer = fm[3];
          if (fm[4]) width = +fm[4];
        }
      } else if (l.startsWith('.to(')) {
        const tm = /\.to\(\{ x: (-?[\d.]+), y: (-?[\d.]+)(?:, layer: '([^']+)')?(?:, width: ([\d.]+))? \}\)/.exec(l);
        if (tm) {
          points.push({ x: +tm[1]!, y: +tm[2]! });
          if (tm[3]) layer = tm[3];
          if (tm[4]) width = +tm[4];
        }
      } else if (l.startsWith('.via(')) {
        // via: the next piece continues from the same point — kept as-is
        continue;
      } else if (l.endsWith(';')) {
        break;
      }
      // the FINAL chain line carries the terminating ';' — stop there so the
      // block ends at the route, not at create()'s closer
      if ((l.startsWith('.from(') || l.startsWith('.to(')) && l.endsWith(';')) break;
    }
    out.push({
      name: name!,
      head: lines[i]!,
      indent: indent!,
      points,
      layer,
      width,
      start: i,
      end: j + 1, // include the ');' line
    });
    i = j;
  }
  return out;
}

/** Serialize points back into a builder chain. */
function routeSourceFor(head: string, indent: string, pts: Array<{ x: number; y: number }>, layer: string, width: number): string {
  const chain: string[] = [];
  const f0 = pts[0]!;
  chain.push(`.from({ x: ${fmt(f0.x)}, y: ${fmt(f0.y)} }, '${layer}', ${fmt(width)})`);
  for (let i = 1; i < pts.length; i++) {
    chain.push(`.to({ x: ${fmt(pts[i]!.x)}, y: ${fmt(pts[i]!.y)}, layer: '${layer}', width: ${fmt(width)} })`);
  }
  return `${head}\n${chain.map((c) => indent + c).join('\n')};`;
}

export interface RouteDeletePlan {
  edits: Array<{ uri: string; start: number; end: number; line: string }>;
  applied: number;
  skipped: string[];
}

/**
 * Plan the removal of deleted segments from the source's TrackBuilder
 * chains: matched segments drop, and a route that breaks in the middle
 * splits into two builders (routeN + routeNb) so a real GAP replaces the
 * deleted copper instead of a bridge. Fully emptied routes disappear along
 * with their create() argument.
 */
export function planRouteDeletes(text: string, deletes: RouteDeleteInput[]): RouteDeletePlan {
  const edits: RouteDeletePlan['edits'] = [];
  const skipped: string[] = [];
  let applied = 0;
  if (deletes.length === 0) return { edits, applied, skipped };

  const routes = parseRoutes(text);
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
  if (routes.length === 0) {
    return { edits, applied, skipped: deletes.map((d) => `segment ${d.x1},${d.y1}->${d.x2},${d.y2} (no TrackBuilder routes in source)`) };
  }

  // track create() argument names per route for additions/removals
  const createIdx = text.indexOf('typecad.create(');
  if (createIdx === -1) {
    return { edits, applied, skipped: deletes.map((d) => 'segment (no typecad.create( call found)') };
  }
  let depth = 0;
  let closeIdx = -1;
  for (let i = createIdx + 'typecad.create('.length - 1; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }

  let maxNum = 0;
  for (const r of routes) maxNum = Math.max(maxNum, Number(r.name.slice(5)));
  const namesToAdd: string[] = [];
  const namesToRemove: string[] = [];

  for (const r of routes) {
    // remaining segment flags: segment i is (pts[i], pts[i+1])
    const keep: boolean[] = [];
    for (let i = 0; i + 1 < r.points.length; i++) {
      const hit = deletes.some((d) => segMatch(d, r.points[i]!, r.points[i + 1]!));
      keep.push(!hit);
      if (hit) applied++;
    }
    if (keep.every((k) => k)) continue; // untouched
    // split into contiguous runs
    const runs: Array<Array<{ x: number; y: number }>> = [];
    let cur: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < keep.length; i++) {
      if (keep[i]) {
        if (cur.length === 0) cur.push(r.points[i]!);
        cur.push(r.points[i + 1]!);
      } else if (cur.length) {
        runs.push(cur);
        cur = [];
      }
    }
    if (cur.length) runs.push(cur);

    const blockLines = r.end - r.start;
    const indent = r.indent;
    if (runs.length === 0) {
      // emptied: remove the declaration (and blank line after if doubled)
      edits.push({ uri: '', start: lineStarts[r.start] ?? 0, end: lineStarts[r.start + blockLines] ?? text.length, line: '' });
      namesToRemove.push(r.name);
      continue;
    }
    const headCore = `const ${r.name} = new TrackBuilder(typecad, {  })`;
    const built: string[] = [];
    built.push(routeSourceFor(headCore, indent, runs[0]!, r.layer, r.width));
    for (let ri = 1; ri < runs.length; ri++) {
      const nm = `${r.name}${'abcdefgh'[ri - 1] ?? 'z'}`;
      // ensure uniqueness beyond existing names
      let candidate = nm;
      let bump = 1;
      while (text.includes(`const ${candidate} =`) || built.some((b) => b.includes(`const ${candidate} =`))) {
        candidate = `${nm}${++bump}`;
      }
      maxNum = Math.max(maxNum, 0);
      built.push(routeSourceFor(`const ${candidate} = new TrackBuilder(typecad, {  })`, indent, runs[ri]!, r.layer, r.width));
      namesToAdd.push(candidate);
    }
    edits.push({ uri: '', start: lineStarts[r.start] ?? 0, end: lineStarts[r.start + blockLines] ?? text.length, line: built.join('\n\n') + '\n' });
  }

  if (namesToRemove.length && closeIdx !== -1) {
    // remove those names from create(...): scan the arg list text
    const argsText = text.slice(createIdx, closeIdx + 1);
    let nextArgs = argsText;
    for (const nm of namesToRemove) {
      nextArgs = nextArgs
        .replace(new RegExp(`,\s*${nm}\b`), '')
        .replace(new RegExp(`\b${nm}\s*,\s*`), '')
        .replace(new RegExp(`\(\s*${nm}\s*\)`), '()');
    }
    edits.push({ uri: '', start: createIdx, end: closeIdx + 1, line: nextArgs });
  }
  if (namesToAdd.length && closeIdx !== -1 && !edits.some((e) => e.start === createIdx)) {
    // additions ride the same rewrite: recompute against the pending args
    // (simplest: append into the create() edit already planned)
    const argsEdit = edits.find((e) => e.start === createIdx);
    if (argsEdit) {
      argsEdit.line = argsEdit.line.replace(/\)\s*$/, `, ${namesToAdd.join(', ')})`);
    } else {
      const lastMeaning = (() => {
        let k = closeIdx - 1;
        while (k > createIdx && /\s/.test(text[k] ?? '')) k--;
        return text[k];
      })();
      edits.push({
        uri: '',
        start: closeIdx,
        end: closeIdx + 1,
        line: `${lastMeaning === '(' ? '' : ', '}${namesToAdd.join(', ')})`,
      });
    }
  }

  const unmatched = deletes.length - applied;
  if (unmatched > 0) skipped.push(`${unmatched} deleted segment(s) matched no source route`);
  return { edits, applied, skipped };
}
