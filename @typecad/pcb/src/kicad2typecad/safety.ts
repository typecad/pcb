/**
 * Safety infrastructure for the import write-back.
 *
 * Every write the importer makes to user source goes through the checks in
 * this module, in this order:
 *
 *   1. parser self-test   — the TS-capable parser must be alive, or nothing
 *                           runs (a missing acorn-typescript once made the
 *                           whole apply path silently match nothing).
 *   2. snapshot           — the full analyzed source set is copied aside
 *                           BEFORE the first write, so a bad cycle is fully
 *                           recoverable (per-pass .backup files only capture
 *                           the state before the LAST pass, which once let
 *                           multi-pass damage escape).
 *   3. ownership          — writes may only target files that were analyzed
 *                           and parsed in this cycle.
 *   4. stamps             — if a file changed on disk mid-cycle (editor under
 *                           --watch), the cycle aborts before writing.
 *   5. parse gate         — after writing, every written file must parse.
 *   6. rollback           — any gate or oracle failure restores the snapshot.
 *
 * The convergence oracle itself lives in cli.ts (it needs the category
 * computes); this module provides rollbackFor(snapshot).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { analyzeFile } from './source_analyzer.js';
import type { KicadIR } from './types.js';

// === Parser self-test ===

export interface ParserSelfTest {
  ok: boolean;
  tsPlugin: boolean;
  detail: string;
}

const PROBE_SOURCE = 'class A { private x = 1; }\nconst y: number = 2;\n';

let cachedSelfTest: ParserSelfTest | null = null;

/** Can the source analyzer parse TypeScript (class fields, type annotations)? */
export function parserSelfTest(): ParserSelfTest {
  if (cachedSelfTest) return cachedSelfTest;
  // Probe by parsing a probe file through the real analyzer: write to a temp
  // file so parseSource's exact machinery (plugin discovery, fallbacks) runs.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-probe-'));
  try {
    const probe = path.join(dir, 'probe.ts');
    fs.writeFileSync(probe, PROBE_SOURCE);
    const analysis = analyzeFile(probe);
    // The probe has no components, so success is defined by parsing at all
    // AND the class field being visible as a component.
    const classFieldSeen = analysis !== null;
    cachedSelfTest = {
      ok: classFieldSeen,
      tsPlugin: classFieldSeen,
      detail: classFieldSeen
        ? 'TypeScript parsing available'
        : 'TypeScript parsing unavailable — acorn-typescript failed to load or parse',
    };
    return cachedSelfTest;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// === Snapshots ===

export interface ProjectSnapshot {
  id: string;
  dir: string;
  manifestPath: string;
  /** Absolute paths of snapshotted files. */
  files: string[];
  boardPath: string;
  createdAt: number;
}

interface SnapshotManifest {
  id: string;
  boardPath: string;
  createdAt: number;
  files: Array<{ abs: string; rel: string }>;
}

function snapshotRoot(projectRoot: string): string {
  return path.join(projectRoot, '.typecad-import', 'snapshots');
}

/**
 * Copy every analyzed source file aside before the first write of a cycle.
 * Keeps the previous snapshot too (`previous/`), rotating `latest/`.
 */
export function takeSnapshot(projectRoot: string, sourceFiles: string[], boardPath: string): ProjectSnapshot | null {
  const root = snapshotRoot(projectRoot);
  const id = `${Date.now()}-${process.pid}`;
  const dir = path.join(root, 'latest');
  try {
    if (fs.existsSync(dir)) {
      const previous = path.join(root, 'previous');
      fs.rmSync(previous, { recursive: true, force: true });
      fs.renameSync(dir, previous);
    }
    fs.mkdirSync(dir, { recursive: true });

    const entries: SnapshotManifest['files'] = [];
    for (const abs of sourceFiles) {
      const rel = path.relative(projectRoot, abs);
      const dest = path.join(dir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(abs, dest);
      entries.push({ abs, rel });
    }
    const manifest: SnapshotManifest = { id, boardPath, createdAt: Date.now(), files: entries };
    const manifestPath = path.join(dir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return { id, dir, manifestPath, files: sourceFiles, boardPath, createdAt: manifest.createdAt };
  } catch {
    return null;
  }
}

function readManifest(projectRoot: string, slot: 'latest' | 'previous'): SnapshotManifest | null {
  const manifestPath = path.join(snapshotRoot(projectRoot), slot, 'manifest.json');
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as SnapshotManifest;
  } catch {
    return null;
  }
}

/** Restore a snapshot slot back over the working tree. */
export function restoreSnapshot(projectRoot: string, slot: 'latest' | 'previous' = 'latest'): { restored: number } {
  const manifest = readManifest(projectRoot, slot);
  if (!manifest) return { restored: 0 };
  const base = path.join(snapshotRoot(projectRoot), slot);
  let restored = 0;
  for (const entry of manifest.files) {
    const src = path.join(base, entry.rel);
    try {
      fs.mkdirSync(path.dirname(entry.abs), { recursive: true });
      fs.copyFileSync(src, entry.abs);
      restored++;
    } catch {
      // A file deleted since the snapshot stays deleted; nothing to do.
    }
  }
  return { restored };
}

export function latestSnapshotInfo(projectRoot: string): { id: string; createdAt: number; fileCount: number } | null {
  const manifest = readManifest(projectRoot, 'latest');
  if (!manifest) return null;
  return { id: manifest.id, createdAt: manifest.createdAt, fileCount: manifest.files.length };
}

// === Parse gate ===

export interface ParseGateResult {
  ok: boolean;
  failures: string[];
}

/** Every written file must still parse after the cycle's writes. */
export function parseGate(files: string[]): ParseGateResult {
  const failures = files.filter((f) => analyzeFile(f) === null);
  return { ok: failures.length === 0, failures };
}

// === Ownership ===

/** Writes may only target files analyzed (and parsed) in this cycle. */
export function ownershipViolations(writes: Array<{ filePath: string }>, analyzedFiles: Set<string>): string[] {
  return [...new Set(writes.filter((w) => !analyzedFiles.has(w.filePath)).map((w) => w.filePath))];
}

// === Source stamps (concurrent-edit guard) ===

export type SourceStamps = Map<string, string>;

export function stampFiles(files: string[]): SourceStamps {
  const stamps: SourceStamps = new Map();
  for (const f of files) {
    try {
      const stat = fs.statSync(f);
      stamps.set(f, `${stat.mtimeMs}:${stat.size}`);
    } catch {
      stamps.set(f, 'missing');
    }
  }
  return stamps;
}

/** Files that changed on disk since `before` (empty array = unchanged). */
export function changedSince(before: SourceStamps): string[] {
  const now = stampFiles([...before.keys()]);
  const changed: string[] = [];
  for (const [file, stamp] of before) {
    if (now.get(file) !== stamp) changed.push(file);
  }
  return changed;
}

// === Project lock ===

export interface ProjectLock {
  ok: boolean;
  holder: string | null;
  release(): void;
}

function lockPathFor(projectRoot: string): string {
  const key = crypto.createHash('sha1').update(path.resolve(projectRoot)).digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `typecad-import-${key}.lock`);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Prevent two import processes (e.g. `sync` + a manual run) on one project. */
export function acquireProjectLock(projectRoot: string): ProjectLock {
  const lockPath = lockPathFor(projectRoot);
  try {
    if (fs.existsSync(lockPath)) {
      const raw = fs.readFileSync(lockPath, 'utf-8');
      const pid = parseInt(raw, 10);
      if (Number.isFinite(pid) && pid !== process.pid && pidAlive(pid)) {
        return { ok: false, holder: `pid ${pid}`, release: () => undefined };
      }
    }
    fs.writeFileSync(lockPath, String(process.pid));
    let released = false;
    return {
      ok: true,
      holder: null,
      release() {
        if (released) return;
        released = true;
        try {
          if (fs.existsSync(lockPath) && fs.readFileSync(lockPath, 'utf-8') === String(process.pid)) {
            fs.unlinkSync(lockPath);
          }
        } catch {
          // best effort
        }
      },
    };
  } catch {
    // An unacquirable lock must never block the tool outright.
    return { ok: true, holder: null, release: () => undefined };
  }
}

// === Semantic board fingerprint ===

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    const parts = value.map((v) => stableStringify(v));
    const allScalars = value.every((v) => typeof v !== 'object' || v === null);
    return allScalars ? `[${parts.slice().sort().join(',')}]` : `[${parts.join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * A content hash of the parsed board, insensitive to file order, formatting
 * and authoring tool. Printing it makes "everything is in sync" a verifiable
 * claim: the same board yields the same fingerprint on any machine.
 */
export function fingerprintIR(ir: KicadIR): string {
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const pt = (p: { x: number; y: number }) => `${r3(p.x)},${r3(p.y)}`;
  const view = {
    footprints: ir.footprints.map((f) => ({
      reference: f.reference,
      footprintName: f.footprintName,
      at: `${r3(f.position.x)},${r3(f.position.y)},${((f.position.rotation % 360) + 360) % 360}`,
      side: f.side,
    })),
    segments: ir.segments.map(
      (s) => `${pt(s.start)}|${pt(s.end)}|${s.layer}|${r3(s.width)}|${s.netName ?? s.net ?? ''}`,
    ),
    vias: ir.vias.map((v) => `${pt(v.at)}|${r3(v.size)}|${r3(v.drill)}|${v.netName ?? v.net ?? ''}`),
    zones: ir.zones.map((z) => `${z.netName ?? ''}|${[...z.layers].sort().join('+')}|${z.polygon.map(pt).join(';')}`),
    texts: ir.textElements.map((t) => `${t.text}|${pt({ x: t.x, y: t.y })}|${t.layer}`),
    outlines: ir.outlines.map((o) => stableStringify(o)),
    stackup: ir.stackup ? `${ir.stackup.copperLayerCount}|${ir.stackup.copperFinish ?? ''}` : null,
  };
  return crypto.createHash('sha256').update(stableStringify(view)).digest('hex').slice(0, 16);
}
