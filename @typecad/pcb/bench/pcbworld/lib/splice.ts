/**
 * Strip / splice: the bench scores the *input* board with the router's
 * copper dropped in, never the board typecad writes — so the outline,
 * footprints, net table and design rules being checked are exactly
 * PCBWorld's.
 */
import { prettyPrint, SNode, Sym, isList, type SExpr } from '../../../src/sexpr/index.js';
import type { BenchBoard } from './board.js';
import type { RouteRun } from './route.js';

const COPPER_ITEMS = new Set(['segment', 'arc', 'via']);

/** The board with every track, arc and via removed (pads, zones, outline kept). */
export function stripCopper(board: BenchBoard): SExpr[] {
  return board.root.raw.filter((c) => !(isList(c) && COPPER_ITEMS.has(SNode.from(c).name)));
}

/**
 * The input board with its copper replaced by the router's. Net references
 * are rewritten into the input's own convention: `(net <code>)` when the
 * board declares a numbered net table (KiCad ≤9), `(net "<name>")` otherwise.
 */
export function spliceCopper(board: BenchBoard, copper: RouteRun['copper']): { text: string; dropped: number } {
  const numbered = board.root.children('net').length > 0;
  const codeOf = new Map<string, number>();
  for (const [code, name] of board.nets) codeOf.set(name, code);

  const root = stripCopper(board);
  let dropped = 0;
  for (const { node, net } of copper) {
    const code = codeOf.get(net);
    if (net && numbered && code === undefined) {
      dropped++; // a net the input never declared — cannot be scored honestly
      continue;
    }
    const netRef: SExpr[] = numbered ? [Sym.for('net'), code ?? 0] : [Sym.for('net'), net];
    const fixed = node.map((part) => (isList(part) && SNode.from(part).name === 'net' ? netRef : part));
    if (!fixed.some((p) => isList(p) && SNode.from(p).name === 'net')) fixed.push(netRef);
    root.push(fixed);
  }
  return { text: prettyPrint(root) + '\n', dropped };
}
