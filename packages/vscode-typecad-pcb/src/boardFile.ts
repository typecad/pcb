// Board-file discovery, kept free of vscode imports so it stays unit-testable.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export function mtimeOf(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Is this board file byte-for-byte the output of the last build? The build
 * records a sha256 of every board it writes in .typecad-board.json
 * (`hashes`); a KiCad save (or any other out-of-band write) changes the
 * bytes and breaks the match.
 *
 * true  — the build wrote exactly this file (drift against source is a
 *         build bug, never something to absorb back into source)
 * false — the file differs from what the build wrote (a real external edit)
 * null  — unknown: no manifest / pre-hash toolchain / unreadable board.
 *         Callers keep their legacy (mtime) behavior.
 */
export function boardIsBuildOutput(board: string): boolean | null {
  const hash = boardContentHash(board);
  if (!hash) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(board), '.typecad-board.json'), 'utf8')) as {
      hashes?: Record<string, unknown>;
    };
    const recorded = manifest.hashes?.[path.basename(board)];
    if (typeof recorded !== 'string') return null;
    return recorded === hash;
  } catch {
    return null;
  }
}

/**
 * Is another process (the KiCad sync terminal, a manual `import`) holding
 * the project's import lock? Mirrors @typecad/pcb's kicad2typecad/safety.ts
 * (sha1 of the resolved project root → a pid file in the temp dir; a dead
 * pid is a stale lock). While one is held it OWNS board→source import: the
 * viewer must not start a competing absorb (the importer would refuse it,
 * and the viewer would burn its once-per-revision attempt on a no-op).
 * Drive-letter case is tried both ways — the terminal's cwd and the
 * workspace folder do not always agree on it on Windows.
 */
export function importLockHeld(folder: string): boolean {
  const roots = new Set<string>([path.resolve(folder)]);
  const abs = path.resolve(folder);
  if (/^[A-Za-z]:/.test(abs)) {
    roots.add(abs[0]!.toLowerCase() + abs.slice(1));
    roots.add(abs[0]!.toUpperCase() + abs.slice(1));
  }
  for (const root of roots) {
    const key = createHash('sha1').update(root).digest('hex').slice(0, 12);
    const lock = path.join(os.tmpdir(), `typecad-import-${key}.lock`);
    try {
      const pid = parseInt(fs.readFileSync(lock, 'utf8'), 10);
      if (!Number.isFinite(pid) || pid === process.pid) continue;
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        /* stale lock */
      }
    } catch {
      /* no lock file */
    }
  }
  return false;
}

const identityCache = new Map<string, { mtimeMs: number; size: number; id: string }>();

/**
 * A board's IDENTITY: a short digest of its bytes. Whether "the board
 * changed" is a question about content — a touched/re-saved file with the
 * same bytes is the same board (no re-render, no refused apply), and a
 * rewrite that lands inside one coarse mtime tick is still a different one.
 * (AGE questions — is the page newer than the board, is the DRC report
 * older — stay on mtimes: they are about order, not identity.)
 *
 * Hashing a multi-MB board on every watcher event would be wasteful, so a
 * result is reused while the file's mtime AND size are unchanged. Empty
 * string when the file is unreadable (callers treat it as "unknown").
 */
export function boardIdentity(board: string): string {
  try {
    const st = fs.statSync(board);
    const hit = identityCache.get(board);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.id;
    const id = createHash('sha256').update(fs.readFileSync(board)).digest('hex').slice(0, 16);
    identityCache.set(board, { mtimeMs: st.mtimeMs, size: st.size, id });
    return id;
  } catch {
    return '';
  }
}

/** sha256 of a file's bytes, or null when unreadable. */
export function boardContentHash(board: string): string | null {
  try {
    return createHash('sha256').update(fs.readFileSync(board)).digest('hex');
  } catch {
    return null;
  }
}

/**
 * The project's compiled boards, from the build manifest
 * (.typecad-board.json): `boards` lists every board the project's create()
 * calls produce (multi-board projects — mother/daughter, board/jig), `board`
 * names the most recent one. Empty when there is no manifest.
 */
export function listBoardFiles(folder: string): string[] {
  const buildDir = path.join(folder, 'build');
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(buildDir, '.typecad-board.json'), 'utf8')) as {
      boards?: unknown;
    };
    if (!Array.isArray(manifest.boards)) return [];
    return manifest.boards
      .filter((b): b is string => typeof b === 'string' && b.endsWith('.kicad_pcb'))
      .map((b) => path.join(buildDir, b))
      .filter((b) => fs.existsSync(b));
  } catch {
    return [];
  }
}

/**
 * The project's compiled board. The build's own manifest
 * (.typecad-board.json, written beside the board) is the truth — a renamed
 * board is found at once and a leftover under the previous name can never
 * shadow it (seen live: the project was renamed and the stale old-named
 * board kept being rendered). Without a manifest, the package-name match
 * prefers the project's own board over strays; newest is the fallback.
 * `stem` selects one board of a multi-board project; unknown stems fall
 * back to the active-board resolution so the viewer always shows something.
 */
export function newestBoardFile(folder: string, stem?: string): string | null {
  const buildDir = path.join(folder, 'build');
  if (stem) {
    const norm = stem.replace(/[.-]/g, '_').toLowerCase();
    const hit = listBoardFiles(folder).find(
      (f) => path.basename(f, '.kicad_pcb').replace(/[.-]/g, '_').toLowerCase() === norm,
    );
    if (hit) return hit;
  }
  if (!fs.existsSync(buildDir)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(buildDir, '.typecad-board.json'), 'utf8')) as {
      board?: unknown;
    };
    if (typeof manifest.board === 'string' && manifest.board.endsWith('.kicad_pcb')) {
      const manifestBoard = path.join(buildDir, manifest.board);
      if (fs.existsSync(manifestBoard)) return manifestBoard;
    }
  } catch {
    /* no/invalid manifest: the heuristics below */
  }
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

/**
 * The source file the build actually runs, from typecad.conf.ts's
 * `entry: './src/<name>.ts'` — resolved against the hw folder, or null when
 * the conf is missing or carries no entry. The apply bridge targets THIS
 * file first: a workspace with stray copies in src/ (a stale duplicate
 * carrying its own typecad.create()) must not capture route rewrites —
 * edits landing there build nothing while the board silently misses every
 * drawn trace.
 */
export function entrySourceFile(folder: string): string | null {
  try {
    const conf = fs.readFileSync(path.join(folder, 'typecad.conf.ts'), 'utf8');
    const m = /entry\s*:\s*['"]([^'"]+)['"]/.exec(conf);
    if (!m || !m[1]) return null;
    return path.resolve(folder, m[1]);
  } catch {
    return null;
  }
}

/**
 * The newest mtime among the project's build inputs — every .ts under src/
 * plus typecad.conf.ts itself. Compared against the board's mtime it answers
 * "does the board reflect the sources?" without running anything.
 */
export function newestSourceMtime(folder: string): number {
  let newest = 0;
  const consider = (file: string): void => {
    try {
      const m = fs.statSync(file).mtimeMs;
      if (m > newest) newest = m;
    } catch {
      // unreadable entries simply don't count
    }
  };
  consider(path.join(folder, 'typecad.conf.ts'));
  const srcDir = path.join(folder, 'src');
  if (fs.existsSync(srcDir)) {
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) consider(full);
      }
    };
    walk(srcDir);
  }
  return newest;
}

/**
 * The mtime of the OLDEST board the project's build produced — the one that
 * decides whether a build is owed. A multi-board project (mother/daughter,
 * board/jig) is built by one run that rewrites every board; judging
 * staleness by the active board alone misses a build that died after
 * writing it but before writing a sibling (the sibling is stale, the active
 * board looks fine). Falls back to the single resolved board without a
 * manifest; null when nothing is built.
 */
export function oldestBoardMtime(folder: string): number | null {
  const boards = listBoardFiles(folder);
  if (boards.length > 0) return Math.min(...boards.map(mtimeOf));
  const board = newestBoardFile(folder);
  return board ? mtimeOf(board) : null;
}

let sourceMtimeCache: { folder: string; value: number; at: number } | null = null;

/**
 * newestSourceMtime for callers that ask often (the status bar on every
 * save/watch tick): a directory walk stat()s every source file, which is
 * wasted work when nothing changed. Reused for `ttlMs` unless
 * invalidateSourceMtime() ran (the source watcher and save hook call it, so
 * a real edit is never hidden). Decisions that START A BUILD must use the
 * uncached newestSourceMtime.
 */
export function newestSourceMtimeCached(folder: string, ttlMs = 2_000): number {
  const now = Date.now();
  if (sourceMtimeCache && sourceMtimeCache.folder === folder && now - sourceMtimeCache.at < ttlMs) {
    return sourceMtimeCache.value;
  }
  const value = newestSourceMtime(folder);
  sourceMtimeCache = { folder, value, at: now };
  return value;
}

export function invalidateSourceMtime(): void {
  sourceMtimeCache = null;
}

/**
 * Is any compiled board older than a source? True means a build is owed —
 * the board on disk (and therefore the Board viewer) describes a previous
 * revision of the sources. Null when there is no board yet (always owed,
 * but the caller decides whether that is a build or a "run create first").
 * `cached` uses the memoized source scan (status display only).
 */
export function boardStale(folder: string, opts: { cached?: boolean } = {}): boolean | null {
  const oldest = oldestBoardMtime(folder);
  if (oldest === null) return null;
  return (opts.cached ? newestSourceMtimeCached(folder) : newestSourceMtime(folder)) > oldest;
}

/**
 * The version of @typecad/pcb the project's `npx typecad-pcb` resolves to —
 * found the same way npx walks up parent node_modules directories
 * (`hw/node_modules` → `hw/../node_modules` → …). Null when nothing
 * resolves; callers then keep their legacy behavior instead of gating on a
 * version they cannot know.
 */
export function projectToolchainVersion(folder: string): string | null {
  let dir = path.resolve(folder);
  for (;;) {
    const pkgPath = path.join(dir, 'node_modules', '@typecad', 'pcb', 'package.json');
    try {
      const version = String((JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string }).version ?? '');
      if (version) return version;
    } catch {
      // no manifest here — keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The mtime of @typecad/pcb's compiled page generator (dist), resolved the
 * same walk-up way as projectToolchainVersion — null when nothing resolves.
 * The restore fast path compares it against the page's mtime: a page older
 * than the generator BITS that should have written it predates a toolchain
 * edit (this repo links the toolchain as a workspace — features land
 * WITHOUT a version bump, so the version-string staleness check alone
 * serves such pages forever).
 */
export function projectToolchainGeneratorMtime(folder: string): number | null {
  let dir = path.resolve(folder);
  for (;;) {
    const gen = path.join(dir, 'node_modules', '@typecad', 'pcb', 'dist', 'gerber_viewer', 'render', 'viewer_html.js');
    try {
      return fs.statSync(gen).mtimeMs;
    } catch {
      // not here — keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The generator stamp embedded in a viewer page
 * (<meta name="tc-viewer-generator">, written by gerber-viewer build) —
 * null on pre-stamp pages.
 */
export function pageGeneratorVersion(html: string): string | null {
  const m = /<meta name="tc-viewer-generator" content="([^"]*)"/.exec(html);
  return m ? m[1]! : null;
}
