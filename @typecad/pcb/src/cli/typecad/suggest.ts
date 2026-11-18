/**
 * "Did you mean ...?" helpers for the CLI: nearest known command or flag for a
 * mistyped one. Pure functions, no I/O.
 */

function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_]/g, '');
}

/** Edit distance where swapping two adjacent letters ("buidl" -> "build") costs 1. */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * Closest candidate to `input`, or undefined when nothing is close enough.
 * Case and `-`/`_` differences count as an exact match (`symbol-source` ->
 * `symbol_source`); otherwise the edit distance must be small for the length.
 */
export function suggestClosest(input: string, candidates: Iterable<string>): string | undefined {
  const target = normalize(input);
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const n = normalize(candidate);
    if (n === target) return candidate;
    const d = editDistance(target, n);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  const limit = Math.max(1, Math.floor(target.length / 3));
  return best !== undefined && bestDistance <= limit ? best : undefined;
}
