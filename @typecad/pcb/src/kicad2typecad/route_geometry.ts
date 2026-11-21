// ---------------------------------------------------------------------------
// route_geometry.ts — copper-level equivalence for _sync.ts routing blocks.
//
// The routing region compare is token-exact against the board regenerator's
// canonical text. Routes the layout view writes are geometrically identical
// but not always in that canonical shape: two legs drawn in separate
// gestures stay two routes (the regenerator chains them into one), and
// routes land in drawing order (the regenerator groups by net). A token
// compare reads that as drift on the build's own output — check-sync then
// reports "the build does not reproduce this board" and the viewer pauses
// sync, although every segment matches.
//
// This module reduces a sidecar routing block to a multiset of copper
// primitives (segments keyed by net/layer/width/unordered endpoints, vias by
// position and literal) so equal copper compares equal regardless of how it
// is chained or ordered. Conservative by construction: any statement it does
// not fully understand makes the whole block unparseable (null), and the
// caller keeps the strict token compare.
// ---------------------------------------------------------------------------

const NUM = String.raw`(-?\d+(?:\.\d+)?(?:e-?\d+)?)`;
const STR = String.raw`'((?:[^'\\]|\\.)*)'`;

const CHAIN_RE = new RegExp(
  String.raw`const\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+TrackBuilder\(\s*typecad\s*,\s*\{([^{}]*)\}\s*\)((?:\s*\.(?:from|to|via)\([^()]*\))+)\s*;`,
  'g',
);
const PUSH_RE = /syncTracks\.push\(\s*([A-Za-z_$][\w$]*)\s*\)\s*;/g;
const STANDALONE_VIA_RE = /typecad\.via\(\s*(\{[^()]*\})\s*\)\s*;/g;
const LINK_RE = /\.(from|to|via)\(([^()]*)\)/g;
const FROM_ARGS_RE = new RegExp(String.raw`^\s*\{\s*x\s*:\s*${NUM}\s*,\s*y\s*:\s*${NUM}\s*\}\s*,\s*${STR}\s*,\s*${NUM}\s*$`);
const TO_ARGS_RE = new RegExp(
  String.raw`^\s*\{\s*x\s*:\s*${NUM}\s*,\s*y\s*:\s*${NUM}\s*,\s*layer\s*:\s*${STR}\s*,\s*width\s*:\s*${NUM}\s*\}\s*$`,
);
const OPTS_RE = new RegExp(String.raw`^\s*(?:net\s*:\s*${STR}\s*,?\s*)?$`);

const fmt = (n: number): string => (Math.round(n * 1000) / 1000).toFixed(3);

/**
 * One via's copper key. A via written mid-chain (`.to(…).via({…}).to(…)`,
 * how the layout view writes a layer change) and the regenerator's
 * standalone `typecad.via({ at, net, … })` at the same point are the same
 * barrel — both reduce to net, position, size, drill and span. Only the keys
 * a via literal can carry are accepted; anything else is unparseable (null).
 */
function viaKey(body: string, chain: { net: string; at: { x: number; y: number } } | null): string | null {
  let rest = body.trim().replace(/^\{/, '').replace(/\}$/, '');
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(rest);
    if (m) rest = rest.slice(0, m.index) + rest.slice(m.index + m[0].length);
    return m;
  };
  const at = take(new RegExp(String.raw`\bat\s*:\s*\{\s*x\s*:\s*${NUM}\s*,\s*y\s*:\s*${NUM}\s*\}`));
  const net = take(new RegExp(String.raw`\bnet\s*:\s*${STR}`));
  const size = take(new RegExp(String.raw`\bsize\s*:\s*${NUM}`));
  const drill = take(new RegExp(String.raw`\bdrill\s*:\s*${NUM}`));
  const layers = take(new RegExp(String.raw`\blayers\s*:\s*\[\s*${STR}\s*,\s*${STR}\s*\]`));
  if (rest.replace(/[\s,]/g, '') !== '' || !size || !drill) return null;
  // a chain via sits at the chain's current point, on the chain's net
  if (chain ? at || net : !at) return null;
  const x = chain ? chain.at.x : +at![1]!;
  const y = chain ? chain.at.y : +at![2]!;
  const span = layers ? [layers[1]!, layers[2]!].sort().join('/') : '';
  const through = span === '' || span === 'B.Cu/F.Cu';
  const viaNet = chain ? chain.net : (net?.[1] ?? '');
  return `via|${viaNet}|${fmt(x)},${fmt(y)}|${fmt(+size[1]!)}|${fmt(+drill[1]!)}|${through ? 'through' : span}`;
}

/**
 * Sorted copper primitives of a sidecar routing block, or null when the
 * block holds anything beyond canonical TrackBuilder chains, their
 * syncTracks.push collect lines, and standalone typecad.via() calls.
 */
export function syncRouteGeometry(block: string): string[] | null {
  // comment lines (the generated "// Net: X" headers) carry no copper
  let rest = block
    .split(/\r?\n/)
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  const prims: string[] = [];
  const declared: string[] = [];

  let bad = false;
  rest = rest.replace(CHAIN_RE, (_m, name: string, opts: string, links: string) => {
    const o = OPTS_RE.exec(opts);
    if (!o) {
      bad = true;
      return '';
    }
    const net = o[1] ?? '';
    declared.push(name);
    let at: { x: number; y: number } | null = null;
    for (const link of links.matchAll(LINK_RE)) {
      const [, kind, args] = link as unknown as [string, string, string];
      if (kind === 'from') {
        const f: RegExpExecArray | null = at === null ? FROM_ARGS_RE.exec(args) : null;
        if (!f) {
          bad = true;
          break;
        }
        at = { x: +f[1]!, y: +f[2]! };
      } else if (kind === 'to') {
        const t: RegExpExecArray | null = at !== null ? TO_ARGS_RE.exec(args) : null;
        if (!t) {
          bad = true;
          break;
        }
        const next: { x: number; y: number } = { x: +t[1]!, y: +t[2]! };
        const a = `${fmt(at!.x)},${fmt(at!.y)}`;
        const b = `${fmt(next.x)},${fmt(next.y)}`;
        const [p, q] = a < b ? [a, b] : [b, a];
        prims.push(`seg|${net}|${t[3]}|${fmt(+t[4]!)}|${p}|${q}`);
        at = next;
      } else {
        if (at === null) {
          bad = true;
          break;
        }
        const key = viaKey(args, { net, at });
        if (!key) {
          bad = true;
          break;
        }
        prims.push(key);
      }
    }
    if (at === null) bad = true;
    return '';
  });
  if (bad) return null;

  const pushed: string[] = [];
  rest = rest.replace(PUSH_RE, (_m, name: string) => {
    pushed.push(name);
    return '';
  });
  // every declared route collected exactly once, nothing else collected
  if (pushed.length !== declared.length || [...pushed].sort().join() !== [...declared].sort().join()) return null;

  rest = rest.replace(STANDALONE_VIA_RE, (_m, arg: string) => {
    const key = viaKey(arg, null);
    if (key) prims.push(key);
    else bad = true;
    return '';
  });
  if (bad || rest.trim() !== '') return null;
  return prims.sort();
}

/**
 * Whether two sidecar routing blocks lay exactly the same copper. False when
 * either block cannot be reduced — the caller then trusts its token compare.
 */
export function sameSyncRouteGeometry(current: string, wanted: string): boolean {
  const a = syncRouteGeometry(current);
  const b = syncRouteGeometry(wanted);
  if (!a || !b) return false;
  return a.length === b.length && a.every((p, i) => p === b[i]);
}
