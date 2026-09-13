/**
 * KiCad netlist helpers shared by the viewer and PCBA pipelines: parse a
 * .net s-expression into per-ref metadata and discover one next to a
 * gerber directory (the typeCAD build layout: build/gerbers + build/<board>.net).
 */
import fs from 'node:fs';
import path from 'node:path';
import { isList, nameOf, parse } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';

/**
 * Parse a KiCad netlist into per-ref metadata (footprint name + value).
 * Throws on unparseable input — a truncated netlist (realistic mid-rebuild,
 * when the file is being rewritten) must surface, not silently render as
 * "no metadata"; callers turn the throw into a warning.
 */
export function parseNetlistComponents(content: string): Record<string, { footprint?: string; value?: string }> {
  const map: Record<string, { footprint?: string; value?: string }> = {};
  const tree = parse(content);
  const walk = (expr: SExpr): void => {
    if (!isList(expr)) return;
    if (nameOf(expr[0]) === 'comp') {
      let ref = '';
      let footprint = '';
      let value = '';
      for (const child of expr) {
        if (!isList(child)) continue;
        const key = nameOf(child[0]);
        if (key === 'ref' && typeof child[1] === 'string') ref = child[1];
        if (key === 'footprint' && typeof child[1] === 'string') footprint = child[1];
        if (key === 'value' && typeof child[1] === 'string') value = child[1];
      }
      if (ref && (footprint || value)) map[ref] = { footprint: footprint || undefined, value: value || undefined };
    }
    for (const child of expr) walk(child);
  };
  walk(tree);
  return map;
}

/**
 * Find a netlist beside the gerbers: typeCAD/KiCad projects keep
 * `build/<board>.net` next to `build/gerbers`, so the input directory and
 * its parent are both probed — directory inputs (`build/gerbers`) resolve in
 * the parent, file inputs in their own directory's parent. Multiple
 * candidates resolve to the most recently modified.
 */
export function discoverNetlist(inputPaths: string[]): string | null {
  for (const input of inputPaths) {
    try {
      const base = path.dirname(path.resolve(input));
      const dirs = fs.existsSync(base) ? [base, path.dirname(base)] : [path.dirname(base)];
      for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        const candidates = fs
          .readdirSync(dir)
          .filter((f) => f.endsWith('.net'))
          .map((f) => path.join(dir, f))
          .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
        if (candidates.length > 0) return candidates[0]!;
      }
    } catch {
      // unreadable input — try the next one
    }
  }
  return null;
}
