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
    const newInner = inner.replace(/\bx\s*:\s*-?[\d.]+/, `x: ${fmt(nx)}`).replace(/\by\s*:\s*-?[\d.]+/, `y: ${fmt(ny)}`);
    edits.push({
      ref: move.ref,
      line: `${match[1]}${variable}.pcb = { ${newInner.trim()} }`,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return { edits, skipped };
}

/** Apply planned edits to a document's text (latest edit first, ranges stay valid). */
export function applyPlacementEdits(text: string, edits: PlacementEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  for (const edit of sorted) out = out.slice(0, edit.start) + edit.line + out.slice(edit.end);
  return out;
}
