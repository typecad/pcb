/**
 * Footprint search over the installed KiCad footprint libraries.
 *
 * `typecad-pcb search <query> --footprint` — the counterpart of symbol
 * search. Symbols alone leave an agent halfway: `search` finds the part,
 * but the footprint (with the exact pad numbering `pin(n)` must match)
 * still has to be guessed. This scans the `.pretty` library names and
 * `.kicad_mod` file names, and for the matches it shows, reads the module
 * file to report its pad numbers and description — "crystal 3225" reveals
 * that the 3225 variants are 4-pin before a route() call ever fails.
 */

import fs from 'node:fs';
import path from 'node:path';
import { KiCAD } from '../../../kicad.js';

export interface FootprintSearchResult {
  /** Fully qualified footprint id, ready for `footprint:` in code. */
  id: string;
  /** Pad numbers present in the footprint (from its .kicad_mod). */
  pads: string[];
  /** First `(descr ...)` line of the module file, when present. */
  description: string;
  /** Higher is better; 0 means "did not match". */
  score: number;
}

/** Library index: lib name → footprint file names. Cached per process. */
let libraryIndex: Map<string, string[]> | null = null;

function buildIndex(footprintsDir: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(footprintsDir);
  } catch {
    return index;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.pretty')) continue;
    const lib = entry.slice(0, -'.pretty'.length);
    try {
      const files = fs
        .readdirSync(path.join(footprintsDir, entry))
        .filter((f) => f.endsWith('.kicad_mod'))
        .map((f) => f.slice(0, -'.kicad_mod'.length));
      if (files.length > 0) index.set(lib, files);
    } catch {
      // unreadable library — skip it
    }
  }
  return index;
}

function scoreCandidate(id: string, tokens: string[]): number {
  const hay = id.toLowerCase();
  let score = 0;
  let matched = 0;
  for (const token of tokens) {
    if (!hay.includes(token)) continue;
    matched++;
    // A token hitting the footprint name (after the colon) counts more
    // than one merely hitting the library name.
    score += hay.split(':')[1]?.includes(token) ? 40 : 15;
  }
  if (matched === 0) return 0;
  if (matched === tokens.length) score += 50;
  // Prefer canonical variants over the _HandSoldering twins so the top
  // results read as "the" footprint for the query.
  if (!/hand soldering|handsolder/i.test(hay)) score += 5;
  // Shorter ids break ties toward the plainer variant.
  score -= Math.min(id.length / 100, 5);
  return Math.round(score);
}

/** Read pad numbers + description from a .kicad_mod file (best effort). */
function readModuleDetails(modulePath: string): { pads: string[]; description: string } {
  try {
    const content = fs.readFileSync(modulePath, 'utf8');
    const pads = new Set<string>();
    for (const m of content.matchAll(/\(pad\s+"([^"]+)"/g)) {
      pads.add(m[1]!);
    }
    const descr = content.match(/\(descr\s+"([^"]*)"/);
    return {
      pads: [...pads],
      description: descr?.[1] ?? '',
    };
  } catch {
    return { pads: [], description: '' };
  }
}

/**
 * Search installed KiCad footprint libraries by name.
 *
 * @param query Free-text query; whitespace splits into tokens that must
 *   all appear in `Library:Footprint` (each token scores, all-token
 *   matches rank highest).
 * @param options.limit Maximum results after details are read (default 10).
 * @throws When KiCad or its footprint directory cannot be located.
 */
export function searchFootprints(query: string, options?: { limit?: number }): FootprintSearchResult[] {
  const footprintsDir = KiCAD.instance.getLibraryPaths().footprints;
  if (!footprintsDir || !fs.existsSync(footprintsDir)) {
    throw new Error(
      'KiCad footprint libraries not found — install KiCad (or point typecad.conf.ts at kicad_cli) and retry.',
    );
  }

  if (!libraryIndex) libraryIndex = buildIndex(footprintsDir);

  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  // Score everything first (cheap, names only)…
  const scored: Array<{ id: string; score: number }> = [];
  for (const [lib, modules] of libraryIndex) {
    for (const mod of modules) {
      const id = `${lib}:${mod}`;
      const score = scoreCandidate(id, tokens);
      if (score > 0) scored.push({ id, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  // …then read module details only for the page shown.
  const limit = options?.limit ?? 10;
  return scored.slice(0, limit).map(({ id, score }) => {
    const [lib, mod] = id.split(':');
    const details = readModuleDetails(path.join(footprintsDir, `${lib}.pretty`, `${mod}.kicad_mod`));
    return { id, score, pads: details.pads, description: details.description };
  });
}
