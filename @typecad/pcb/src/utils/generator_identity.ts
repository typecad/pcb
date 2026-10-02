import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Identity stamped into every file typeCAD writes.
 *
 * KiCad's file spec: third-party writers must NOT claim `pcbnew` — the
 * `generator` token identifies the tool that produced the file, and
 * `generator_version` identifies its version. Every file we emit (boards,
 * schematics, footprint upgrades, symbol-library merges, project templates)
 * carries both, with the version auto-numbered from this package's real
 * version so a board can always be traced to the exact writer build.
 */
export const GENERATOR_NAME = 'typeCAD/pcb';

let cachedVersion: string | null = null;

/**
 * The writer version — resolved from this package's package.json at runtime
 * (the module lives in both src/utils/ and dist/utils/, so the manifest is
 * always two levels up). Falls back to a dev marker when the manifest cannot
 * be read (e.g. bundled contexts).
 */
export function generatorVersion(): string {
  if (cachedVersion) return cachedVersion;
  const here = path.dirname(fileURLToPath(import.meta.url));
  try {
    const manifest = path.resolve(here, '..', '..', 'package.json');
    const version = JSON.parse(fs.readFileSync(manifest, 'utf-8')).version;
    if (typeof version === 'string' && version !== '') {
      cachedVersion = version;
      return version;
    }
  } catch {
    // unreadable manifest — fall through
  }
  cachedVersion = '0.0.0-dev';
  return cachedVersion;
}
