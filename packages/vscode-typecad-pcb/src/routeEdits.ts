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
