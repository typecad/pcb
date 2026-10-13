// `export assembly` end-to-end: the composed package (native gerbers +
// drill + job + placement + BOM) lands in one staging dir and the store-only
// zip carries every staged file.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportAssembly } from '../export.js';
import { parseArgv } from '../../parser.js';

const BOARD = `(kicad_pcb
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (net 0 "")
  (net 1 "GND")
  (net 2 "+3V3")
  (gr_line (start 0 0) (end 30 0) (layer "Edge.Cuts"))
  (gr_line (start 30 0) (end 30 20) (layer "Edge.Cuts"))
  (gr_line (start 30 20) (end 0 20) (layer "Edge.Cuts"))
  (gr_line (start 0 20) (end 0 0) (layer "Edge.Cuts"))
  (segment (start 5 5) (end 15 5) (width 0.25) (layer "F.Cu") (net 1))
  (via (at 15 5) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1))
  (footprint "Resistor_SMD:R_0603" (layer "F.Cu") (at 10 10 90)
    (attr smd)
    (property "Reference" "R1" (at 0 0 0))
    (property "Value" "1k" (at 0 0 0))
    (fp_line (start -1 -0.4) (end 1 0.8) (layer "F.Fab"))
    (pad "1" smd roundrect (at -0.75 0) (size 0.8 0.75) (layers "F.Cu" "F.Paste" "F.Mask") (net 1 "GND"))
    (pad "2" smd roundrect (at 0.75 0) (size 0.8 0.75) (layers "F.Cu" "F.Paste" "F.Mask") (net 2 "+3V3")))
  (footprint "Capacitor_SMD:C_0402" (layer "B.Cu") (at 20 8)
    (property "Reference" "C1" (at 0 0 0))
    (property "Value" "100n" (at 0 0 0))
    (fp_line (start -0.5 -0.25) (end 0.5 0.25) (layer "B.Fab"))
    (pad "1" smd roundrect (at -0.5 0) (size 0.5 0.5) (layers "B.Cu" "B.Paste" "B.Mask") (net 1 "GND"))
    (pad "2" smd roundrect (at 0.5 0) (size 0.5 0.5) (layers "B.Cu" "B.Paste" "B.Mask") (net 2 "+3V3")))
)`;

const NETLIST = `(export (design "pkg")
  (components
    (comp (ref "R1") (value "1k") (footprint "Resistor_SMD:R_0603")
      (fields (field (name "MPN") "C22935")))
    (comp (ref "C1") (value "100n") (footprint "Capacitor_SMD:C_0402")
      (fields (field (name "MPN") "C1525"))))
  (nets)
)`;

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-export-assembly-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('exportAssembly', () => {
  it('stages gerbers + pos + bom and zips them all', () => {
    const pcbPath = path.join(dir, 'pkg.kicad_pcb');
    fs.writeFileSync(pcbPath, BOARD);
    fs.writeFileSync(path.join(dir, 'pkg.net'), NETLIST);

    const result = exportAssembly(pcbPath, { rootDir: dir, profileId: 'jlcpcb', json: true });

    const staged = fs.readdirSync(result.stagingDir).sort();
    expect(staged).toContain('pkg-F_Cu.gtl');
    expect(staged).toContain('pkg-B_Cu.gbl');
    expect(staged).toContain('pkg-Edge_Cuts.gm1');
    expect(staged).toContain('pkg.drl');
    expect(staged).toContain('pkg-job.gbrjob');
    expect(staged).toContain('pkg-cpl.csv');
    expect(staged).toContain('pkg-bom.csv');

    // the jlc profile filters nothing here — both parts placed
    expect(result.placementRows).toBe(2);
    const cpl = fs.readFileSync(path.join(result.stagingDir, 'pkg-cpl.csv'), 'utf8');
    expect(cpl.trimEnd().split('\n')).toEqual([
      'Designator,Mid X,Mid Y,Layer,Rotation',
      'C1,20.000,8.000,B,0',
      // R1 body centroid: anchor (10,10) + R(90)·(0, 0.2) → (10.2, 10)
      'R1,10.200,10.000,T,90',
    ]);
    const bom = fs.readFileSync(path.join(result.stagingDir, 'pkg-bom.csv'), 'utf8');
    expect(bom.trimEnd().split('\n')).toEqual([
      'Comment,Designator,Footprint,LCSC Part #',
      '100n,C1,Capacitor_SMD:C_0402,C1525',
      '1k,R1,Resistor_SMD:R_0603,C22935',
    ]);

    // zip: a real store-only archive carrying every staged file
    expect(result.zipPath).toBe(path.join(dir, 'pkg-jlcpcb.zip'));
    const zip = fs.readFileSync(result.zipPath!);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const names: string[] = [];
    let off = 0;
    while (zip.readUInt32LE(off) === 0x04034b50) {
      const nameLen = zip.readUInt16LE(off + 26);
      names.push(zip.subarray(off + 30, off + 30 + nameLen).toString('utf8'));
      const size = zip.readUInt32LE(off + 18);
      const extraLen = zip.readUInt16LE(off + 28);
      off += 30 + nameLen + extraLen + size;
    }
    expect(names.sort()).toEqual(staged);
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(staged.length);
  });

  it('--no-zip keeps only the staging directory', () => {
    const pcbPath = path.join(dir, 'pkg.kicad_pcb');
    fs.writeFileSync(pcbPath, BOARD);
    const result = exportAssembly(pcbPath, { rootDir: dir, zip: false, json: true });
    expect(result.zipPath).toBeNull();
    // no --profile: generic placement file name
    expect(fs.readdirSync(result.stagingDir)).toContain('pkg-pnp.csv');
  });

  it('profiles without their own BOM shape assemble fine (openpnp → generic BOM)', () => {
    const pcbPath = path.join(dir, 'pkg.kicad_pcb');
    fs.writeFileSync(pcbPath, BOARD);
    // this used to throw "Unknown BOM profile 'openpnp'"
    const result = exportAssembly(pcbPath, { rootDir: dir, profileId: 'openpnp', json: true });
    const staged = fs.readdirSync(result.stagingDir);
    expect(staged).toContain('pkg-placements.csv');
    expect(staged).toContain('pkg.board.xml'); // native OpenPnP board file
    expect(result.placementBoardFile).toBe(path.join(result.stagingDir, 'pkg.board.xml'));
    const bom = fs.readFileSync(path.join(result.stagingDir, 'pkg-bom.csv'), 'utf8');
    expect(bom.trimEnd().split('\n')[0]).toBe('Reference,Qty,Value,Footprint,MPN,Side,Datasheet');
    // the BOARD fixture has Edge.Cuts 0..30 x 0..20 — dimensions ride along
    const xml = fs.readFileSync(path.join(result.stagingDir, 'pkg.board.xml'), 'utf8');
    expect(xml).toContain('<dimensions units="Millimeters" x="30" y="20"');
    expect(xml).toContain('<placement id="C1" side="Bottom"');
  });

  it('re-running the package preserves board.xml edits made in OpenPnP', () => {
    const pcbPath = path.join(dir, 'pkg.kicad_pcb');
    fs.writeFileSync(pcbPath, BOARD);
    exportAssembly(pcbPath, { rootDir: dir, profileId: 'openpnp', json: true });

    // the staging wipe must not eat the user's OpenPnP work: re-associate
    // R1's part between two runs
    const xmlPath = path.join(dir, 'pkg-openpnp', 'pkg.board.xml');
    const edited = fs
      .readFileSync(xmlPath, 'utf8')
      .replace('id="R1" side="Top" part-id="R_0603-1k"', 'id="R1" side="Top" part-id="MY-R"');
    fs.writeFileSync(xmlPath, edited, 'utf8');

    exportAssembly(pcbPath, { rootDir: dir, profileId: 'openpnp', json: true });
    const after = fs.readFileSync(xmlPath, 'utf8');
    expect(after).toContain('part-id="MY-R"');
    // geometry refreshed from the board (R1's body centroid at rot 90)
    expect(after).toContain('<location units="Millimeters" x="10.2" y="10" z="0.0" rotation="90"/>');
  });
});

describe('export flag parsing', () => {
  it('profile/side/centroid/exclude parse as value flags, --output space form works', () => {
    const parsed = parseArgv([
      'node',
      'typecad-pcb',
      'export',
      'pos',
      '--profile',
      'jlcpcb',
      '--side=front',
      '--centroid',
      'pads',
      '--exclude',
      'FID*,MH*',
      '--output',
      './out-dir',
      'build/board.kicad_pcb',
    ]);
    expect(parsed.subcommand).toBe('pos');
    expect(parsed.args['profile']).toBe('jlcpcb');
    expect(parsed.args['side']).toBe('front');
    expect(parsed.args['centroid']).toBe('pads');
    expect(parsed.args['exclude']).toBe('FID*,MH*');
    expect(parsed.args['output']).toBe('./out-dir');
    expect(parsed.positional).toEqual(['build/board.kicad_pcb']);
  });
});
