// ---------------------------------------------------------------------------
// Semantic verification of a layout apply: after the rebuild, does the BOARD
// actually carry what the apply intended? The parse gate guarantees the
// source is syntactically intact; this catches the next class — a plan that
// parses but silently fails to produce the geometry (a route dropped by the
// board model, a delete that missed, a move that didn't land). vscode-free
// (regex scans over the .kicad_pcb text) so the checks are unit-tested.
// ---------------------------------------------------------------------------

export interface SemanticRoute {
  net: string | null;
  pieces: Array<{ layer: string; pts: Array<{ x: number; y: number }> }>;
  vias: Array<{ x: number; y: number }>;
}

export interface SemanticCheckInput {
  routes: SemanticRoute[];
  deletes: Array<{ net: string | null; x1: number; y1: number; x2: number; y2: number; layer: string | null }>;
  /** final placements (board frame, y-down) keyed by reference */
  placements: Array<{ ref: string; x: number; y: number }>;
  /** final texts (board frame): gr_texts by content + anchor */
  texts: Array<{ text: string; x: number; y: number }>;
}

export interface SemanticReport {
  ok: boolean;
  misses: string[];
  checked: number;
}

/** net code -> name from the board's `(net 12 "GND")` declarations */
function netNames(board: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const m of board.matchAll(/\(net (\d+) "((?:[^"\\]|\\.)*)"\)/g)) out.set(Number(m[1]), m[2]!);
  return out;
}

interface BoardSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
  net: number | null;
}

function boardSegments(board: string): BoardSeg[] {
  const out: BoardSeg[] = [];
  for (const m of board.matchAll(/\(segment \(start (-?[\d.]+) (-?[\d.]+)\) \(end (-?[\d.]+) (-?[\d.]+)\)[^\n]*?\(layer "([^"]+)"\)(?:[^\n]*?\(net (\d+)\))?/g)) {
    out.push({
      x1: parseFloat(m[1]!),
      y1: parseFloat(m[2]!),
      x2: parseFloat(m[3]!),
      y2: parseFloat(m[4]!),
      layer: m[5]!,
      net: m[6] !== undefined ? Number(m[6]) : null,
    });
  }
  return out;
}

function boardVias(board: string): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const m of board.matchAll(/\(via(?: \w+)? \(at (-?[\d.]+) (-?[\d.]+)\)/g)) out.push({ x: parseFloat(m[1]!), y: parseFloat(m[2]!) });
  return out;
}

function boardPlacements(board: string): Map<string, { x: number; y: number }> {
  // each footprint block: first (at x y [rot]) is the placement; the
  // Reference property names it
  const out = new Map<string, { x: number; y: number }>();
  const blocks = board.split(/\(footprint /).slice(1);
  for (const block of blocks) {
    const at = /\(at (-?[\d.]+) (-?[\d.]+)/.exec(block);
    const ref = /\(property "Reference" "([^"]+)"/.exec(block);
    if (at && ref) out.set(ref[1]!, { x: parseFloat(at[1]!), y: parseFloat(at[2]!) });
  }
  return out;
}

function boardTexts(board: string): Array<{ text: string; x: number; y: number }> {
  const out: Array<{ text: string; x: number; y: number }> = [];
  for (const m of board.matchAll(/\(gr_text "((?:[^"\\]|\\.)*)"[^\n]*?\(at (-?[\d.]+) (-?[\d.]+)/g))
    out.push({ text: m[1]!, x: parseFloat(m[2]!), y: parseFloat(m[3]!) });
  return out;
}

const TOL = 0.03; // mm — coordinates round-trip through 3-4 decimal writes
const near = (a: number, b: number) => Math.abs(a - b) < TOL;

function segMatches(segs: BoardSeg[], x1: number, y1: number, x2: number, y2: number, layer: string | null): boolean {
  for (const s of segs) {
    if (layer && s.layer !== layer) continue;
    if (
      (near(s.x1, x1) && near(s.y1, y1) && near(s.x2, x2) && near(s.y2, y2)) ||
      (near(s.x1, x2) && near(s.y1, y2) && near(s.x2, x1) && near(s.y2, y1))
    )
      return true;
  }
  return false;
}

const fmt = (n: number) => n.toFixed(2);

/**
 * Verify the rebuilt board against what an apply intended. Every check is
 * an existence (or absence) question; `misses` describes each failure in
 * user-facing words for the output channel and the page status.
 */
export function verifyBoardSemantics(board: string, check: SemanticCheckInput): SemanticReport {
  const misses: string[] = [];
  let checked = 0;
  const segs = boardSegments(board);
  const vias = boardVias(board);
  const names = netNames(board);

  for (const route of check.routes) {
    for (const piece of route.pieces) {
      for (let i = 1; i < piece.pts.length; i++) {
        const a = piece.pts[i - 1]!;
        const b = piece.pts[i]!;
        checked++;
        if (!segMatches(segs, a.x, a.y, b.x, b.y, piece.layer))
          misses.push(`route segment ${fmt(a.x)},${fmt(a.y)} → ${fmt(b.x)},${fmt(b.y)} on ${piece.layer}${route.net ? ` (net ${route.net})` : ''} is missing from the rebuilt board`);
      }
    }
    for (const v of route.vias) {
      checked++;
      if (!vias.some((bv) => near(bv.x, v.x) && near(bv.y, v.y)))
        misses.push(`via at ${fmt(v.x)},${fmt(v.y)}${route.net ? ` (net ${route.net})` : ''} is missing from the rebuilt board`);
    }
  }

  for (const d of check.deletes) {
    checked++;
    if (segMatches(segs, d.x1, d.y1, d.x2, d.y2, d.layer))
      misses.push(`deleted segment ${fmt(d.x1)},${fmt(d.y1)} → ${fmt(d.x2)},${fmt(d.y2)}${d.layer ? ` on ${d.layer}` : ''}${d.net ? ` (net ${d.net})` : ''} is STILL on the rebuilt board`);
  }

  if (check.placements.length > 0) {
    const placed = boardPlacements(board);
    for (const p of check.placements) {
      checked++;
      const at = placed.get(p.ref);
      if (!at) misses.push(`component ${p.ref} has no footprint on the rebuilt board`);
      else if (!near(at.x, p.x) || !near(at.y, p.y))
        misses.push(`component ${p.ref} sits at ${fmt(at.x)},${fmt(at.y)} — the apply moved it to ${fmt(p.x)},${fmt(p.y)}`);
    }
  }

  for (const t of check.texts) {
    checked++;
    if (!boardTexts(board).some((bt) => bt.text === t.text && near(bt.x, t.x) && near(bt.y, t.y)))
      misses.push(`text "${t.text}" at ${fmt(t.x)},${fmt(t.y)} is missing from the rebuilt board`);
  }

  // an empty check verifies nothing — say so rather than reporting "ok"
  return { ok: misses.length === 0 && checked > 0, misses, checked };
}
