// ---------------------------------------------------------------------------
// The build's signature on its own output. Every board the build writes is
// recorded in build/.typecad-board.json as a sha256 of the exact bytes
// (`hashes`). Board→source sync paths (import --watch, the vscode viewer's
// drift absorb) use it to tell the build's own output from a real KiCad
// edit: re-importing our own output was a build→import→build feedback loop
// whenever the round trip was not an exact fixed point.
//
// The vscode extension carries a copy of this check (boardFile.ts,
// boardIsBuildOutput) — its build cannot reach across package roots.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeFileAtomic } from './atomic_write.js';

/**
 * true  — the file is byte-for-byte what the last build wrote
 * false — it differs (an out-of-band edit, e.g. a KiCad save)
 * null  — unknown (no manifest, pre-hash toolchain, unreadable board)
 */
export function boardIsBuildOutput(boardPath: string): boolean | null {
  let hash: string;
  try {
    hash = createHash('sha256').update(fs.readFileSync(boardPath)).digest('hex');
  } catch {
    return null;
  }
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(path.dirname(boardPath), '.typecad-board.json'), 'utf8'),
    ) as { hashes?: Record<string, unknown> };
    const recorded = manifest.hashes?.[path.basename(boardPath)];
    if (typeof recorded !== 'string') return null;
    return recorded === hash;
  } catch {
    return null;
  }
}

/** sha256 of board text as the build writes it (utf8). */
export function boardSignature(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

/**
 * Re-sign a board the build rewrote after serialization (zone-fill
 * materialization rewrites the file in place) so the manifest describes the
 * FINAL bytes. Best-effort: a missing/unreadable manifest is left alone.
 */
export function recordBoardSignature(boardPath: string, contents: string): void {
  const manifestPath = path.join(path.dirname(boardPath), '.typecad-board.json');
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    const prev = manifest.hashes && typeof manifest.hashes === 'object' ? (manifest.hashes as Record<string, unknown>) : {};
    manifest.hashes = { ...prev, [path.basename(boardPath)]: boardSignature(contents) };
    writeFileAtomic(manifestPath, JSON.stringify(manifest));
  } catch {
    /* no manifest — the signature is an optimization; checks fall back to legacy */
  }
}
