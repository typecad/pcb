// Shared writer utilities: board-identity derivation and package branding
// used by every fabrication writer (copper, graphics, drill, job).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typecad/pcb's own version, read from the package manifest. */
export const PKG_VERSION: string = (() => {
  try {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
    return (JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/**
 * Default %TF.GenerationSoftware branding for our output: `typeCAD,pcb,<v>`.
 * Callers may override (the parity harness passes golden-matching values).
 */
export const TYPECAD_SOFTWARE = `typeCAD,pcb,${PKG_VERSION}`;

/** Board file stem: basename without the .kicad_pcb extension. */
export function boardStem(boardPath: string): string {
  return path.basename(boardPath).replace(/\.kicad_pcb$/, '');
}

/**
 * KiCad derives the ProjectId GUID from the board filename with uuid-v4
 * version/variant nibbles overlaid (not derivable); this matches the
 * observed shape without pretending to match KiCad's random tail.
 */
export function projectGuid(stem: string): string {
  const bytes: number[] = [];
  for (const ch of `${stem}.kicad_pcb`) bytes.push(ch.charCodeAt(0) & 0xff);
  while (bytes.length < 16) bytes.push(0);
  bytes[6] = 0x40 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
