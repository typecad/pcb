// ---------------------------------------------------------------------------
// Image → board-geometry pipeline, part 2: contour tracing. The polished
// output path for artwork — instead of hundreds of merged rectangles, each
// ink's cell grid is traced into rectilinear boundary loops, holes are
// classified by nesting, and every shape bridges its holes into ONE simple
// ring with a hairline keyhole slit (the trick KiCad's own image converter
// uses — kicad_pcb gr_poly carries a single ring, no holes).
//
// All functions here are unit-agnostic (cell coords in, whatever out) and
// deterministic: loops come out in scan order, corner ties break by a fixed
// turn rule, and simplification is Douglas-Peucker on exact input.
// ---------------------------------------------------------------------------

export interface RingPt {
  x: number;
  y: number;
}

export interface NestedShape {
  outer: RingPt[];
  holes: RingPt[][];
}

/** Signed area (shoelace). Used for |area| sorting only, never classification. */
function signedArea(ring: RingPt[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Even-odd point-in-ring test (ray cast). */
function ringContains(ring: RingPt[], pt: RingPt): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Drop intermediate vertices of collinear runs and repeated points (exact). */
export function mergeCollinear(ring: RingPt[]): RingPt[] {
  if (ring.length < 3) return ring;
  const onLine = (a: RingPt, b: RingPt, c: RingPt): boolean =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) === 0 &&
    Math.min(a.x, c.x) <= b.x && b.x <= Math.max(a.x, c.x) &&
    Math.min(a.y, c.y) <= b.y && b.y <= Math.max(a.y, c.y);
  const out: RingPt[] = [];
  for (const cur of ring) {
    const prev = out[out.length - 1];
    if (prev && prev.x === cur.x && prev.y === cur.y) continue;
    if (out.length >= 2 && onLine(out[out.length - 2]!, out[out.length - 1]!, cur)) {
      out[out.length - 1] = cur;
      continue;
    }
    out.push(cur);
  }
  // the seam: the loop may close collinearly across the wrap point — either
  // the last vertex (between its neighbors and the first) or the first
  // vertex (between the last and the second) is redundant
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    if (onLine(out[out.length - 2]!, out[out.length - 1]!, out[0]!)) {
      out.pop();
      changed = true;
      continue;
    }
    if (onLine(out[out.length - 1]!, out[0]!, out[1]!)) {
      out.shift();
      changed = true;
    }
  }
  return out;
}

interface DirEdge {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  dx: number;
  dy: number;
}

/**
 * Trace the boolean grid's boundary into closed rectilinear loops. Directed
 * edges keep the interior on the LEFT of travel; the corner tie (two
 * diagonal cells set, two unset) prefers hugging the current component
 * (left turn, then straight, then right), so 8-connected diagonal regions
 * read through their pinch point as one loop. Loops come out
 * collinear-merged, in scan order.
 */
export function traceLoops(grid: Uint8Array, w: number, h: number): RingPt[][] {
  const all: DirEdge[] = [];
  const byStart = new Map<string, number[]>();
  const key = (x: number, y: number): string => `${x},${y}`;
  const set = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && grid[y * w + x] === 1;
  const push = (sx: number, sy: number, dx: number, dy: number): void => {
    const idx = all.length;
    all.push({ sx, sy, ex: sx + dx, ey: sy + dy, dx, dy });
    const k = key(sx, sy);
    const list = byStart.get(k);
    if (list) list.push(idx);
    else byStart.set(k, [idx]);
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!set(x, y)) continue;
      if (!set(x, y - 1)) push(x, y, 1, 0); // top open: →
      if (!set(x + 1, y)) push(x + 1, y, 0, 1); // right open: ↓
      if (!set(x, y + 1)) push(x + 1, y + 1, -1, 0); // bottom open: ←
      if (!set(x - 1, y)) push(x, y + 1, 0, -1); // left open: ↑
    }
  }

  const used = new Uint8Array(all.length);
  const turns = (dx: number, dy: number): Array<[number, number]> => [
    [-dy, dx], // left turn — hug the current component through pinch points
    [dx, dy], // straight
    [dy, -dx], // right turn
  ];

  const loops: RingPt[][] = [];
  for (const list of byStart.values()) {
    for (const startIdx of list) {
      if (used[startIdx]) continue;
      const first = all[startIdx]!;
      used[startIdx] = 1;
      const pts: RingPt[] = [{ x: first.sx, y: first.sy }];
      let cdx = first.dx;
      let cdy = first.dy;
      let cx = first.ex;
      let cy = first.ey;
      let guard = all.length + 8;
      while (guard-- > 0) {
        if (cx === first.sx && cy === first.sy) break; // closed
        pts.push({ x: cx, y: cy });
        const options = byStart.get(key(cx, cy));
        if (!options) break;
        let chosen = -1;
        for (const [ndx, ndy] of turns(cdx, cdy)) {
          const hit = options.find((o) => !used[o] && all[o]!.dx === ndx && all[o]!.dy === ndy);
          if (hit !== undefined) {
            chosen = hit;
            break;
          }
        }
        if (chosen === -1) chosen = options.find((o) => !used[o]) ?? -1;
        if (chosen === -1) break;
        used[chosen] = 1;
        const e = all[chosen]!;
        cdx = e.dx;
        cdy = e.dy;
        cx = e.ex;
        cy = e.ey;
      }
      const merged = mergeCollinear(pts);
      if (merged.length >= 4) loops.push(merged);
    }
  }
  return loops;
}

/**
 * Nest arbitrary non-crossing rings into shapes: containment depth by
 * even-odd counting — even depth is an outer, odd a hole of its innermost
 * container (the containing ring with the greatest depth). Shared by the
 * raster tracer and SVG input, whose subpaths carry holes the same way a
 * traced donut does.
 */
export function nestRings(rings: RingPt[][]): NestedShape[] {
  const info = rings.map((ring) => {
    const rep = ring.reduce(
      (best, p) => (p.y < best.y || (p.y === best.y && p.x < best.x) ? p : best),
      ring[0]!,
    );
    return { ring, rep, depth: 0, parent: -1 };
  });
  for (let i = 0; i < info.length; i++) {
    for (let j = 0; j < info.length; j++) {
      if (i === j) continue;
      if (ringContains(info[j]!.ring, info[i]!.rep)) {
        info[i]!.depth++;
        if (info[i]!.parent === -1 || info[j]!.depth > info[info[i]!.parent]!.depth) {
          info[i]!.parent = j;
        }
      }
    }
  }
  const shapes: NestedShape[] = [];
  const indexOfRing = new Map<RingPt[], number>();
  for (let i = 0; i < info.length; i++) {
    if (info[i]!.depth % 2 === 0) {
      indexOfRing.set(info[i]!.ring, shapes.length);
      shapes.push({ outer: info[i]!.ring, holes: [] });
    }
  }
  for (let i = 0; i < info.length; i++) {
    if (info[i]!.depth % 2 === 0) continue;
    // odd depth: a hole — walk up to the nearest even-depth container
    let p = info[i]!.parent;
    while (p >= 0 && info[p]!.depth % 2 === 1) p = info[p]!.parent;
    const shape = p >= 0 ? shapes[indexOfRing.get(info[p]!.ring) ?? -1] : undefined;
    if (shape) shape.holes.push(info[i]!.ring);
  }
  return shapes;
}

/** Douglas-Peucker for a closed ring: split at the vertex farthest from
 *  vertex 0, simplify both halves, rejoin. Tolerance in ring units. Exact
 *  collinear runs merge regardless of tolerance (always safe). */
export function simplifyRing(ring: RingPt[], tolerance: number): RingPt[] {
  const merged = mergeCollinear(ring);
  if (tolerance <= 0 || merged.length <= 4) return merged;
  const dp = (chain: RingPt[]): RingPt[] => {
    if (chain.length <= 2) return chain;
    const a = chain[0]!;
    const b = chain[chain.length - 1]!;
    let idx = -1;
    let maxD = -1;
    for (let i = 1; i < chain.length - 1; i++) {
      const p = chain[i]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const d =
        len === 0
          ? Math.hypot(p.x - a.x, p.y - a.y)
          : Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD <= tolerance) return [a, b];
    return [...dp(chain.slice(0, idx + 1)).slice(0, -1), ...dp(chain.slice(idx))];
  };
  let far = 1;
  let farD = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = (ring[i]!.x - ring[0]!.x) ** 2 + (ring[i]!.y - ring[0]!.y) ** 2;
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const first = dp(ring.slice(0, far + 1));
  const second = dp([...ring.slice(far), ring[0]!]);
  return mergeCollinear([...first.slice(0, -1), ...second.slice(0, -1)]);
}

/**
 * Bridge a shape's holes into its outer ring with hairline keyhole slits:
 * at the closest vertex pair, the ring detours around the full hole and
 * returns — a doubled zero-width edge that even-odd fill (and KiCad's own
 * image converter, which emits exactly this shape) renders as a hole.
 * Holes bridge smallest-vertex-first for determinism.
 */
export function bridgeHoles(outer: RingPt[], holes: RingPt[][]): RingPt[] {
  let ring = outer;
  const pending = [...holes].sort((a, b) => a[0]!.x - b[0]!.x || a[0]!.y - b[0]!.y);
  for (const hole of pending) {
    let bi = 0;
    let bj = 0;
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      for (let j = 0; j < hole.length; j++) {
        const d = (ring[i]!.x - hole[j]!.x) ** 2 + (ring[i]!.y - hole[j]!.y) ** 2;
        if (d < best) {
          best = d;
          bi = i;
          bj = j;
        }
      }
    }
    const walked = [...hole.slice(bj), ...hole.slice(0, bj), hole[bj]!];
    ring = [...ring.slice(0, bi + 1), ...walked, ring[bi]!, ...ring.slice(bi + 1)];
  }
  return ring;
}
