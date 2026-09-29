// ---------------------------------------------------------------------------
// Version-checked self-update for the workspace-bundled extension copy.
//
// The scaffold installs the extension into <hw>/.vscode/extensions/typecad-pcb
// from the @typecad/pcb package's bundled asset. That copy never updated —
// projects kept running the version that happened to be current when they
// were created, and every extension fix had to be hand-synced. The running
// copy now checks the workspace's OWN dependency asset at activation (the
// workspace package is current because the toolchain runs through it): when
// the asset is newer, the extension copies it over itself and asks for a
// reload. vscode-free core for unit testing; the activation wiring lives in
// extension.ts.
// ---------------------------------------------------------------------------

import * as fs from 'node:fs';
import * as path from 'node:path';

/** The bundled asset inside the workspace's @typecad/pcb dependency. */
export const ASSET_SUBPATH = path.join('node_modules', '@typecad', 'pcb', 'assets', 'editor-extensions', 'typecad-pcb');

/** The asset root when it exists, else null (no dependency install). */
export function assetExtensionRoot(hwFolder: string): string | null {
  const root = path.join(hwFolder, ASSET_SUBPATH);
  try {
    if (fs.existsSync(path.join(root, 'package.json')) && fs.existsSync(path.join(root, 'out', 'extension.js'))) return root;
  } catch {
    // unreadable — treat as absent
  }
  return null;
}

/**
 * Semver-ish compare with pre-releases: 1.0.0 < 2.0.0, and within a version
 * 1.0.0-alpha.1 < 1.0.0-alpha.2 < 1.0.0 (release outranks pre-release).
 * Unparsable versions compare by plain string order (last resort).
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): { nums: number[]; pre: string[] } | null => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(v.trim());
    if (!m) return null;
    return {
      nums: [Number(m[1]), Number(m[2]), Number(m[3])],
      pre: m[4] ? m[4].split('.') : [],
    };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return a.trim() < b.trim() ? -1 : a.trim() > b.trim() ? 1 : 0;
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i]! !== pb.nums[i]!) return pa.nums[i]! < pb.nums[i]! ? -1 : 1;
  }
  // release > pre-release
  if (pa.pre.length === 0 && pb.pre.length > 0) return 1;
  if (pa.pre.length > 0 && pb.pre.length === 0) return -1;
  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i++) {
    const x = pa.pre[i] ?? '';
    const y = pb.pre[i] ?? '';
    if (x === y) continue;
    const nx = /^\d+$/.test(x) ? Number(x) : null;
    const ny = /^\d+$/.test(y) ? Number(y) : null;
    if (nx !== null && ny !== null) return nx < ny ? -1 : 1;
    if (nx !== null) return -1; // numeric identifiers sort below alphanumerics
    if (ny !== null) return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/** Update only when the asset is strictly NEWER than the running copy. */
export function shouldUpdate(selfVersion: string, assetVersion: string): boolean {
  return compareVersions(assetVersion, selfVersion) > 0;
}

export interface UpdatePlan {
  /** the asset root to copy from */
  from: string;
  /** the running extension's root (out/..) */
  to: string;
  fromVersion: string;
  toVersion: string;
}

/**
 * Decide a self-update: the asset under hwFolder against the running copy
 * at selfRoot. Null when the asset is missing, equal, or older.
 */
export function planExtensionUpdate(hwFolder: string, selfRoot: string): UpdatePlan | null {
  const asset = assetExtensionRoot(hwFolder);
  if (!asset) return null;
  const readVersion = (root: string): string | null => {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      if (parsed && typeof parsed === 'object' && typeof (parsed as { version?: unknown }).version === 'string')
        return (parsed as { version: string }).version;
    } catch {
      // unreadable manifests cannot drive an update
    }
    return null;
  };
  const assetVersion = readVersion(asset);
  const selfVersion = readVersion(selfRoot);
  if (!assetVersion || !selfVersion) return null;
  if (!shouldUpdate(selfVersion, assetVersion)) return null;
  return { from: asset, to: selfRoot, fromVersion: selfVersion, toVersion: assetVersion };
}

/** Copy the asset's out/ + manifests over the running copy. Throws on IO errors. */
export function applyExtensionUpdate(plan: UpdatePlan): void {
  fs.mkdirSync(path.join(plan.to, 'out'), { recursive: true });
  for (const entry of ['package.json', 'README.md']) {
    try {
      fs.copyFileSync(path.join(plan.from, entry), path.join(plan.to, entry));
    } catch {
      // optional files
    }
  }
  const outDir = path.join(plan.from, 'out');
  for (const name of fs.readdirSync(outDir)) {
    fs.copyFileSync(path.join(outDir, name), path.join(plan.to, 'out', name));
  }
}
