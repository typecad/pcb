/**
 * The pads manifest is derived data: build/<board>_pads.json must never be
 * older than the board it describes. A KiCad-side edit that flows through
 * sync without a full rebuild (or a locked write on Windows) left it one
 * revision behind, and the viewer rendered pad labels from it — copper
 * moved, pin numbers didn't (observed on rd_skeleton: C1 moved, labels
 * stayed at the previous position; the same signature earlier on U1).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { computePadsManifest, refreshPadsManifestFromBoard } from '../src/pcb/pcb_pads_writer.js';
import { parse } from '../src/sexpr/index.js';
import type { SExpr } from '../src/sexpr/types.js';

function boardText(y: number): string {
  return `(kicad_pcb (version 20260206) (generator typeCAD)
  (net 0 "")
  (net 1 "VCC")
  (net 2 "GND")
  (footprint "Capacitor_SMD:C_0603" (layer "F.Cu")
    (uuid "c1-uuid")
    (at ${133.75} ${y} 180)
    (property "Reference" "C1" (at 0 -1.4 180) (layer "F.SilkS") (uuid "c1-ref"))
    (pad "1" smd roundrect (at -0.775 0 180) (size 0.9 0.95) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (net 1 "VCC"))
    (pad "2" smd roundrect (at 0.775 0 180) (size 0.9 0.95) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (net 2 "GND"))
  )
)`;
}

describe('pads manifest refresh', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-pads-refresh-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('computes world pad positions with the footprint rotation applied', () => {
    // rot 180 flips both axes: pad 1 (-0.775 local) lands at +0.775 world
    const manifest = computePadsManifestFromBoardText(boardText(86.5));
    const c1 = manifest.pads.filter((p) => p.ref === 'C1');
    expect(c1).toHaveLength(2);
    expect(c1.find((p) => p.pin === '1')).toMatchObject({ x: 134.525, y: 86.5, net: 'VCC' });
    expect(c1.find((p) => p.pin === '2')).toMatchObject({ x: 132.975, y: 86.5, net: 'GND' });
  });

  it('rewrites a manifest older than the board — the moved-component case', async () => {
    const boardPath = path.join(dir, 'mod-ec.kicad_pcb');
    const padsPath = path.join(dir, 'mod-ec_pads.json');
    // the board has C1 at the NEW position…
    fs.writeFileSync(boardPath, boardText(86.5));
    // …and a manifest from the previous revision (C1 one millimetre up)
    fs.writeFileSync(padsPath, JSON.stringify(computePadsManifestFromBoardText(boardText(85.5))));
    // make the staleness explicit even on coarse-mtime filesystems
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(padsPath, past, past);

    expect(refreshPadsManifestFromBoard(boardPath)).toBe(true);
    const healed = JSON.parse(fs.readFileSync(padsPath, 'utf8'));
    const pin1 = healed.pads.find((p: { ref: string; pin: string }) => p.ref === 'C1' && p.pin === '1');
    expect(pin1.y).toBe(86.5);

    // a second call is a no-op — the manifest is current now
    expect(refreshPadsManifestFromBoard(boardPath)).toBe(false);
  });

  it('writes a missing manifest and leaves no temp file behind', () => {
    const boardPath = path.join(dir, 'mod-ec.kicad_pcb');
    fs.writeFileSync(boardPath, boardText(86.5));
    expect(refreshPadsManifestFromBoard(boardPath)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'mod-ec_pads.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'mod-ec_pads.json.tmp'))).toBe(false);
    expect(refreshPadsManifestFromBoard(path.join(dir, 'absent.kicad_pcb'))).toBe(false);
  });
});

function computePadsManifestFromBoardText(text: string) {
  // mirrors the healer's file->contents handoff
  const root = parse(text) as unknown as SExpr[];
  return computePadsManifest(root.slice(1));
}
