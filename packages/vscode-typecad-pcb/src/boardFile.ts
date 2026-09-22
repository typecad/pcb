// Board-file discovery, kept free of vscode imports so it stays unit-testable.
import fs from 'node:fs';
import path from 'node:path';

export function mtimeOf(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * The project's compiled board. build/ can hold stray boards (fp upgrade
 * tests, imports, scratch files) that out-newest the real one — the
 * project's own board matches the hw package name (rd-skeleton-hw →
 * rd_skeleton) and wins over whatever stray was touched last; newest is
 * the fallback when no name matches.
 */
export function newestBoardFile(folder: string): string | null {
  const buildDir = path.join(folder, 'build');
  if (!fs.existsSync(buildDir)) return null;
  const boards = fs.readdirSync(buildDir).filter((f) => f.endsWith('.kicad_pcb'));
  if (boards.length === 0) return null;
  const byNewest = boards.map((f) => path.join(buildDir, f)).sort((a, b) => mtimeOf(b) - mtimeOf(a));
  try {
    const pkgName = String(JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8')).name ?? '');
    const stem = pkgName.replace(/-hw$/, '').replace(/[.-]/g, '_').toLowerCase();
    const own = byNewest.find((f) => path.basename(f, '.kicad_pcb').toLowerCase() === stem);
    if (own) return own;
  } catch {
    // no/read-failed package.json: newest-wins stands
  }
  return byNewest[0] ?? null;
}
