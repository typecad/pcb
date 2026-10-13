// Assembly export: centroid math, provider profiles, BOM grouping, the
// store-only zip writer, and the board-model fields they consume.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PLACEMENT_PROFILES, BOM_PROFILES } from '../profiles.js';
import {
  footprintLocalToBoard,
  componentCentroid,
  buildPlacementRows,
  renderPlacementCsv,
  csvEscape,
  refMatches,
} from '../centroid.js';
import { buildBomRows, renderBomCsv } from '../bom.js';
import { zipStore, crc32 } from '../zip.js';
import { exportPlacement, exportBom, loadNetlistBesideBoard } from '../index.js';
import { renderOpenPnpBoardXml, mergeOpenPnpBoardXml, chainOutline } from '../openpnp.js';
import type { PlacementRow } from '../centroid.js';
import { buildBoardModel } from '../../cli/typecad/board_model.js';
import type { BoardComponent, BoardModel } from '../../cli/typecad/board_model.js';
import type { NetlistModel } from '../../cli/diagnostics/netlist_model.js';

// The pad-verified transport vector from the live board: a footprint at
// (137.6, 84.8, 90) stores pad 3 at local (-1.76, 0) and plots it at board
// (137.6, 86.56).
const U3 = { x: 137.6, y: 84.8, rotation: 90 };

describe('footprintLocalToBoard', () => {
  it('matches the pad-verified U3 vector', () => {
    expect(footprintLocalToBoard(U3, { x: -1.76, y: 0 })).toEqual({ x: 137.6, y: 86.56 });
  });
  it('is the identity at rotation 0', () => {
    expect(footprintLocalToBoard({ x: 10, y: 20, rotation: 0 }, { x: 1.5, y: -2 })).toEqual({
      x: 11.5,
      y: 18,
    });
  });
});
describe('footprintLocalToBoard (angles)', () => {
  it('+90 sends (0,1) to (1,0); -90 sends (0,1) to (-1,0)', () => {
    const p90 = footprintLocalToBoard({ x: 0, y: 0, rotation: 90 }, { x: 0, y: 1 });
    expect(p90.x).toBeCloseTo(1, 10);
    expect(p90.y).toBeCloseTo(0, 10);
    const m90 = footprintLocalToBoard({ x: 0, y: 0, rotation: -90 }, { x: 0, y: 1 });
    expect(m90.x).toBeCloseTo(-1, 10);
    expect(m90.y).toBeCloseTo(0, 10);
    const r180 = footprintLocalToBoard({ x: 0, y: 0, rotation: 180 }, { x: 1, y: 2 });
    expect(r180.x).toBeCloseTo(-1, 10);
    expect(r180.y).toBeCloseTo(-2, 10);
  });
});

function comp(partial: Partial<BoardComponent>): BoardComponent {
  return {
    reference: 'R1',
    value: '1k',
    footprint: 'Resistor_SMD:R_0603',
    side: 'front',
    at: { x: 0, y: 0, rotation: 0 },
    dimensions: null,
    bodyCenter: null,
    dnp: false,
    excludeFromPos: false,
    excludeFromBom: false,
    pads: [],
    ...partial,
  };
}

describe('componentCentroid', () => {
  const c = comp({
    at: { x: 100, y: 50, rotation: 90 },
    // fab outline bbox center offset (0, 2) in the footprint frame
    bodyCenter: { x: 0, y: 2 },
    pads: [
      { pad: '1', net: null, type: 'smd', at: { x: -1, y: 0 }, layers: ['F.Cu'] },
      { pad: '2', net: null, type: 'smd', at: { x: 1, y: 0 }, layers: ['F.Cu'] },
    ],
  });

  it('anchor reports the at origin', () => {
    expect(componentCentroid(c, 'anchor')).toEqual({ x: 100, y: 50 });
  });
  it('body transports the bbox center through the rotation', () => {
    // local (0,2) at rot 90 → offset (+2, 0)
    const p = componentCentroid(c, 'body');
    expect(p.x).toBeCloseTo(102, 10);
    expect(p.y).toBeCloseTo(50, 10);
  });
  it('pads averages transformed pad centers', () => {
    // pads at local (-1,0)/(1,0) → board (100,101)/(100,49) → mean (100,50)
    expect(componentCentroid(c, 'pads')).toEqual({ x: 100, y: 50 });
  });
  it('falls back to the anchor when the datum is missing', () => {
    expect(componentCentroid(comp({}), 'body')).toEqual({ x: 0, y: 0 });
    expect(componentCentroid(comp({}), 'pads')).toEqual({ x: 0, y: 0 });
  });
});

describe('buildPlacementRows', () => {
  const comps = [
    comp({ reference: 'R1', side: 'front', at: { x: 1, y: 2, rotation: -90 } }),
    comp({ reference: 'C1', side: 'back', at: { x: 3, y: 4, rotation: 10 } }),
    comp({ reference: 'U1', dnp: true }),
    comp({ reference: 'U2', excludeFromPos: true }),
    comp({ reference: 'FID1' }),
  ];

  it('normalizes rotation into [0,360) and sorts refs naturally', () => {
    const { rows } = buildPlacementRows(comps, {
      mode: 'anchor',
      side: 'both',
      origin: { x: 0, y: 0 },
      rotationOffset: 0,
      bottomRotation: 0,
      exclude: [],
      includeDnp: false,
    });
    expect(rows.map((r) => r.ref)).toEqual(['C1', 'FID1', 'R1']);
    expect(rows.find((r) => r.ref === 'R1')!.rotation).toBe(270);
  });
  it('applies offsets: bottom rotation only to back parts, origin rebase', () => {
    const { rows } = buildPlacementRows(comps, {
      mode: 'anchor',
      side: 'both',
      origin: { x: 1, y: 1 },
      rotationOffset: 5,
      bottomRotation: 180,
      exclude: [],
      includeDnp: false,
    });
    const r1 = rows.find((r) => r.ref === 'R1')!;
    const c1 = rows.find((r) => r.ref === 'C1')!;
    expect(r1.rotation).toBe(275); // -90 + 5, front: no bottom adjust
    expect(c1.rotation).toBe(195); // 10 + 5 + 180, back
    expect(r1.x).toBe(0);
    expect(r1.y).toBe(1);
  });
  it('snaps a rotation that lands just under 360 back to 0', () => {
    const { rows } = buildPlacementRows(
      [
        comp({ reference: 'R1', at: { x: 0, y: 0, rotation: -1e-9 } }),
        comp({ reference: 'C1', side: 'back', at: { x: 0, y: 0, rotation: 179.9999999 } }),
      ],
      {
        mode: 'anchor',
        side: 'both',
        origin: { x: 0, y: 0 },
        rotationOffset: 0,
        bottomRotation: 180,
        exclude: [],
        includeDnp: false,
      },
    );
    expect(rows.find((r) => r.ref === 'R1')!.rotation).toBe(0);
    expect(rows.find((r) => r.ref === 'C1')!.rotation).toBe(0); // 179.9999999+180 → 360-ε → 0
  });
  it("applies OpenPnP's bottom transform: x negated, rotation mirrored (180 − rot)", () => {
    const { rows } = buildPlacementRows(
      [
        comp({ reference: 'R1', side: 'front', at: { x: 10, y: 10, rotation: 45 } }),
        comp({ reference: 'C1', side: 'back', at: { x: 10, y: 10, rotation: 45 } }),
      ],
      {
        mode: 'anchor',
        side: 'both',
        origin: { x: 0, y: 0 },
        rotationOffset: 0,
        bottomRotation: 0,
        flipBottomX: true,
        mirrorBottomRotation: true,
        exclude: [],
        includeDnp: false,
      },
    );
    const r1 = rows.find((r) => r.ref === 'R1')!;
    expect(r1.x).toBe(10);
    expect(r1.rotation).toBe(45);
    const c1 = rows.find((r) => r.ref === 'C1')!;
    expect(c1.x).toBe(-10);
    expect(c1.rotation).toBe(135); // 180 − 45
  });
  it('side filter, dnp, exclude_from_pos_files and ref globs skip parts with reasons', () => {    const { rows, skipped } = buildPlacementRows(comps, {
      mode: 'anchor',
      side: 'front',
      origin: { x: 0, y: 0 },
      rotationOffset: 0,
      bottomRotation: 0,
      exclude: ['FID*'],
      includeDnp: false,
    });
    expect(rows.map((r) => r.ref)).toEqual(['R1']);
    expect(skipped).toEqual(
      expect.arrayContaining([
        { ref: 'C1', reason: 'side filter' },
        { ref: 'U1', reason: 'dnp' },
        { ref: 'U2', reason: 'exclude_from_pos_files' },
        { ref: 'FID1', reason: 'excluded' },
      ]),
    );
  });
  it('includeDnp keeps DNP parts (kicad parity)', () => {
    const { rows } = buildPlacementRows(comps, {
      mode: 'anchor',
      side: 'both',
      origin: { x: 0, y: 0 },
      rotationOffset: 0,
      bottomRotation: 0,
      exclude: [],
      includeDnp: true,
    });
    expect(rows.map((r) => r.ref)).toContain('U1');
  });
});

describe('renderPlacementCsv', () => {
  const row = {
    ref: 'R1',
    value: '1k, 1%',
    footprint: 'Resistor_SMD:R_0603',
    x: 137.6,
    y: 84.8,
    rotation: 90,
    side: 'front' as const,
    dnp: false,
  };

  it('kicad profile matches kicad-cli pos CSV semantics', () => {
    const csv = renderPlacementCsv([row], PLACEMENT_PROFILES['kicad']!);
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe('## Unit = mm, Angle = deg.');
    expect(lines[2]).toBe('Ref,Val,Pos X,Pos Y,Rot,Side');
    expect(lines[3]).toBe('"R1","1k, 1%",137.600000,84.800000,90.000000,top'); // side stays bare
  });
  it('jlcpcb profile emits the CPL shape with T/B sides and integer rotation', () => {
    const csv = renderPlacementCsv(
      [row, { ...row, ref: 'C1', side: 'back' as const, rotation: 10.5 }],
      PLACEMENT_PROFILES['jlcpcb']!,
    );
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe('Designator,Mid X,Mid Y,Layer,Rotation');
    expect(lines[1]).toBe('R1,137.600,84.800,T,90');
    expect(lines[2]).toBe('C1,137.600,84.800,B,11');
  });
  it('pcbway and seeed keep the CPL columns with their own side spelling', () => {
    const pcbway = renderPlacementCsv([row], PLACEMENT_PROFILES['pcbway']!);
    expect(pcbway.trimEnd().split('\n')[1]).toBe('R1,137.600,84.800,Top,90');
    const seeed = renderPlacementCsv([row], PLACEMENT_PROFILES['seeed']!);
    expect(seeed.trimEnd().split('\n')[1]).toBe('R1,137.600,84.800,T,90');
  });
  it('openpnp profile emits the reference-CSV importer shape', () => {
    const csv = renderPlacementCsv([row], PLACEMENT_PROFILES['openpnp']!);
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe('id,x,y,rotation,side');
    expect(lines[1]).toBe('R1,137.6000,84.8000,90.00,Top');
  });
  it('converts units for the generic profile', () => {
    const csv = renderPlacementCsv([row], PLACEMENT_PROFILES['generic']!, { units: 'in' });
    expect(csv.trimEnd().split('\n')[1]).toBe(
      'R1,"1k, 1%",Resistor_SMD:R_0603,5.417,3.339,90.00,Top',
    );
  });
});

describe('csvEscape + refMatches', () => {
  it('quotes on delimiter, quote, newline — or always', () => {
    expect(csvEscape('plain', ',', 'minimal')).toBe('plain');
    expect(csvEscape('a,b', ',', 'minimal')).toBe('"a,b"');
    expect(csvEscape('a"b', ',', 'minimal')).toBe('"a""b"');
    expect(csvEscape('a\nb', ',', 'minimal')).toBe('"a\nb"');
    expect(csvEscape('plain', ',', 'always')).toBe('"plain"');
  });
  it('globs match case-insensitively on * and ?', () => {
    expect(refMatches('FID*', 'FID1')).toBe(true);
    expect(refMatches('fid*', 'Fiducial2')).toBe(true);
    expect(refMatches('MH?', 'MH1')).toBe(true);
    expect(refMatches('MH?', 'MH12')).toBe(false);
    expect(refMatches('R*', 'U1')).toBe(false);
  });
});

const netlist = (fields: Record<string, Record<string, string>>): NetlistModel => ({
  file: 'fixture.net',
  tool: null,
  components: Object.entries(fields).map(([reference, f]) => ({
    reference,
    value: '',
    footprint: '',
    fields: f,
    isVia: false,
  })),
  nets: [],
});

describe('BOM rows + rendering', () => {
  const comps = [
    comp({ reference: 'R1', value: '1k', footprint: 'R_0603', side: 'front' }),
    comp({ reference: 'R2', value: '1k', footprint: 'R_0603', side: 'back' }),
    comp({ reference: 'R3', value: '10k', footprint: 'R_0603', side: 'front' }),
    comp({ reference: 'C1', value: '100n', footprint: 'C_0402', side: 'front', dnp: true }),
    comp({ reference: 'U1', value: 'LM358', footprint: 'SOIC-8', excludeFromBom: true }),
    comp({ reference: 'FID1', value: 'Fiducial', footprint: 'Fid_1mm' }),
  ];

  it('groups by value+footprint+mpn and skips dnp/exclude_from_bom/globs', () => {
    const { rows, skipped } = buildBomRows(comps, netlist({
      R1: { MPN: 'C22935' },
      R2: { MPN: 'C22935' },
      R3: { MPN: 'C22936' },
      U1: { MPN: 'X' },
    }), { grouped: true, exclude: ['FID*'] });
    // R1+R2 share value+footprint+mpn — one line despite different sides
    expect(rows.length).toBe(2);
    const r1r2 = rows.find((r) => r.value === '1k')!;
    expect(r1r2.refs).toEqual(['R1', 'R2']);
    expect(r1r2.mpn).toBe('C22935');
    expect(r1r2.sides).toEqual(['front', 'back']);
    expect(skipped).toEqual(
      expect.arrayContaining([
        { ref: 'C1', reason: 'dnp' },
        { ref: 'U1', reason: 'exclude_from_bom' },
        { ref: 'FID1', reason: 'excluded' },
      ]),
    );
  });

  it('jlcpcb BOM renders the two-slot order shape', () => {
    const { rows } = buildBomRows(
      [comp({ reference: 'R1', value: '1k', footprint: 'R_0603' })],
      netlist({ R1: { MPN: 'C22935' } }),
      { grouped: true, exclude: [] },
    );
    const csv = renderBomCsv(rows, BOM_PROFILES['jlcpcb']!);
    expect(csv.trimEnd().split('\n')).toEqual([
      'Comment,Designator,Footprint,LCSC Part #',
      '1k,R1,R_0603,C22935',
    ]);
  });

  it('ungrouped kicad BOM keeps one row per reference, MPN joined', () => {
    const { rows } = buildBomRows(
      [
        comp({ reference: 'R1', value: '1k', footprint: 'R_0603' }),
        comp({ reference: 'R2', value: '1k, 1%', footprint: 'R_0603' }),
      ],
      netlist({ R1: { MPN: 'C22935', Datasheet: 'https://x/y,z' }, R2: {} }),
      { grouped: false, exclude: [] },
    );
    const csv = renderBomCsv(rows, BOM_PROFILES['kicad']!);
    expect(csv.trimEnd().split('\n')).toEqual([
      'Ref,Val,Footprint,MPN,Datasheet',
      '"R1","1k","R_0603","C22935","https://x/y,z"',
      '"R2","1k, 1%","R_0603","",""',
    ]);
  });
});

describe('zipStore', () => {
  it('crc32 matches the canonical test vector', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  // store-only entries read back with plain buffer slicing
  function readZip(buf: Buffer): { name: string; data: Buffer }[] {
    const out: { name: string; data: Buffer }[] = [];
    let off = 0;
    while (buf.readUInt32LE(off) === 0x04034b50) {
      const size = buf.readUInt32LE(off + 18);
      const nameLen = buf.readUInt16LE(off + 26);
      const extraLen = buf.readUInt16LE(off + 28);
      const name = buf.subarray(off + 30, off + 30 + nameLen).toString('utf8');
      const dataStart = off + 30 + nameLen + extraLen;
      out.push({ name, data: buf.subarray(dataStart, dataStart + size) });
      off = dataStart + size;
    }
    // central directory follows; EOCD is the last 22 bytes
    expect(buf.readUInt32LE(buf.length - 22)).toBe(0x06054b50);
    expect(buf.readUInt16LE(buf.length - 22 + 10)).toBe(out.length);
    return out;
  }

  it('round-trips stored entries with intact CRCs', () => {
    const entries = [
      { name: 'board-F_Cu.gtl', data: new TextEncoder().encode('%FSLAX46Y46*%\nM02*\n') },
      { name: 'board-cpl.csv', data: new TextEncoder().encode('Designator,Mid X\nR1,5.0\n') },
    ];
    const zip = zipStore(entries);
    const read = readZip(zip);
    expect(read.map((e) => e.name)).toEqual(['board-F_Cu.gtl', 'board-cpl.csv']);
    for (let i = 0; i < entries.length; i++) {
      expect(Buffer.compare(Buffer.from(read[i]!.data), Buffer.from(entries[i]!.data))).toBe(0);
      expect(crc32(read[i]!.data)).toBe(crc32(entries[i]!.data));
    }
  });
});

// ---------------------------------------------------------------------------
// End-to-end on a fixture board: board_model's new fields → exportPlacement
// / exportBom exactly as the CLI commands drive them.
// ---------------------------------------------------------------------------

const FIXTURE_BOARD = `(kicad_pcb
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (net 0 "")
  (net 1 "GND")
  (net 2 "+3V3")
  (aux_origin 5 5)
  (gr_line (start 0 0) (end 30 0) (layer "Edge.Cuts"))
  (gr_line (start 30 0) (end 30 20) (layer "Edge.Cuts"))
  (gr_line (start 30 20) (end 0 20) (layer "Edge.Cuts"))
  (gr_line (start 0 20) (end 0 0) (layer "Edge.Cuts"))
  (footprint "Resistor_SMD:R_0603" (layer "F.Cu") (at 137.6 84.8 90)
    (attr smd)
    (property "Reference" "R1" (at 0 0 0))
    (property "Value" "1k" (at 0 0 0))
    (fp_line (start -1 -0.4) (end 1 0.8) (layer "F.Fab"))
    (pad "1" smd roundrect (at -0.75 0) (size 0.8 0.75) (layers "F.Cu" "F.Paste" "F.Mask") (net 1 "GND"))
    (pad "2" smd roundrect (at 0.75 0) (size 0.8 0.75) (layers "F.Cu" "F.Paste" "F.Mask") (net 2 "+3V3")))
  (footprint "Resistor_SMD:R_0603" (layer "F.Cu") (at 140 84.8 90)
    (attr smd)
    (property "Reference" "R2" (at 0 0 0))
    (property "Value" "1k" (at 0 0 0))
    (fp_line (start -1 -0.4) (end 1 0.8) (layer "F.Fab"))
    (pad "1" smd roundrect (at -0.75 0) (size 0.8 0.75) (layers "F.Cu" "F.Paste" "F.Mask") (net 1 "GND"))
    (pad "2" smd roundrect (at 0.75 0) (size 0.8 0.75) (layers "F.Cu" "F.Paste" "F.Mask") (net 2 "+3V3")))
  (footprint "Capacitor_SMD:C_0402" (layer "B.Cu") (at 10 10)
    (dnp yes)
    (property "Reference" "C1" (at 0 0 0))
    (property "Value" "100n" (at 0 0 0))
    (fp_line (start -0.5 -0.25) (end 0.5 0.25) (layer "B.Fab"))
    (pad "1" smd roundrect (at -0.5 0) (size 0.5 0.5) (layers "B.Cu" "B.Paste" "B.Mask") (net 1 "GND"))
    (pad "2" smd roundrect (at 0.5 0) (size 0.5 0.5) (layers "B.Cu" "B.Paste" "B.Mask") (net 2 "+3V3")))
  (footprint "Diode_SMD:D_SOD-323" (layer "B.Cu") (at 12 12 30)
    (property "Reference" "D1" (at 0 0 0))
    (property "Value" "1N4148W" (at 0 0 0))
    (fp_line (start -0.85 -0.65) (end 0.85 0.65) (layer "B.Fab"))
    (pad "1" smd roundrect (at -0.9 0) (size 0.6 0.6) (layers "B.Cu" "B.Paste" "B.Mask") (net 1 "GND"))
    (pad "2" smd roundrect (at 0.9 0) (size 0.6 0.6) (layers "B.Cu" "B.Paste" "B.Mask") (net 2 "+3V3")))
  (footprint "Package_SO:SOIC-8" (layer "F.Cu") (at 50 50 -90)
    (attr (exclude_from_pos_files yes) (exclude_from_bom yes))
    (property "Reference" "U1" (at 0 0 0))
    (property "Value" "LM358" (at 0 0 0))
    (fp_line (start -2 -1.5) (end 2 1.5) (layer "F.Fab"))
    (pad "1" smd roundrect (at -1.9 0) (size 0.5 0.5) (layers "F.Cu" "F.Paste" "F.Mask") (net 1 "GND")))
  (footprint "MountingHole:MountingHole_2.2mm" (layer "F.Cu") (at 3 3)
    (attr dnp)
    (property "Reference" "H1" (at 0 0 0))
    (property "Value" "MH" (at 0 0 0))
    (pad "" np_thru_hole circle (at 0 0) (size 2.2 2.2) (drill 2.2) (layers "F&B.Cu" "*.Mask")))
  (footprint "Fiducial:Fiducial_1mm" (layer "F.Cu") (at 2 12)
    (property "Reference" "FID1" (at 0 0 0))
    (property "Value" "Fiducial" (at 0 0 0))
    (pad "" smd circle (at 0 0) (size 1 1) (layers "F.Cu" "F.Paste" "F.Mask")))
  (footprint "Connector:USB_C" (layer "F.Cu") (at 20 20 45)
    (property "Reference" "J1" (at 0 0 0))
    (property "Value" "USB-C" (at 0 0 0))
    (fp_line (start -4 -2) (end 4 2) (layer "F.Fab"))
    (pad "1" smd rect (at -3 0) (size 0.6 1) (layers "F.Cu" "F.Paste" "F.Mask") (net 2 "+3V3")))
)`;

const FIXTURE_NETLIST = `(export (design "fixture")
  (components
    (comp (ref "R1") (value "1k") (footprint "Resistor_SMD:R_0603")
      (fields (field (name "MPN") "C22935")))
    (comp (ref "R2") (value "1k") (footprint "Resistor_SMD:R_0603")
      (fields (field (name "MPN") "C22935")))
    (comp (ref "J1") (value "USB-C") (footprint "Connector:USB_C"))
  )
  (nets)
)`;

let dir: string;
let boardPath: string;
let board: BoardModel;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-assembly-'));
  boardPath = path.join(dir, 'fixture.kicad_pcb');
  fs.writeFileSync(boardPath, FIXTURE_BOARD);
  fs.writeFileSync(path.join(dir, 'fixture.net'), FIXTURE_NETLIST);
  board = buildBoardModel(boardPath);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('board_model assembly fields', () => {
  it('parses bodyCenter from the fab outline bbox', () => {
    const r1 = board.components.find((c) => c.reference === 'R1')!;
    // fp_line endpoints x[-1,1] y[-0.4,0.8] → 2.0 × 1.2 box centered (0, 0.2)
    expect(r1.dimensions).toEqual({ width: 2, height: 1.2 });
    expect(r1.bodyCenter).toEqual({ x: 0, y: 0.2 });
  });
  it('parses every dnp/exclude shape KiCad writes', () => {
    expect(board.components.find((c) => c.reference === 'R1')!.dnp).toBe(false);
    expect(board.components.find((c) => c.reference === 'C1')!.dnp).toBe(true); // (dnp yes)
    expect(board.components.find((c) => c.reference === 'H1')!.dnp).toBe(true); // (attr dnp)
    const u1 = board.components.find((c) => c.reference === 'U1')!;
    expect(u1.excludeFromPos).toBe(true); // (attr (exclude_from_pos_files yes))
    expect(u1.excludeFromBom).toBe(true);
  });
  it('parses the aux origin', () => {
    expect(board.auxOrigin).toEqual({ x: 5, y: 5 });
  });
});

describe('exportPlacement end-to-end', () => {
  it('jlcpcb profile writes the CPL with body centroids and filters', () => {
    const result = exportPlacement(board, { profileId: 'jlcpcb', outputDir: dir });
    expect(path.basename(result.file)).toBe('fixture-cpl.csv');
    const lines = fs.readFileSync(result.file, 'utf8').trimEnd().split('\n');
    expect(lines[0]).toBe('Designator,Mid X,Mid Y,Layer,Rotation');
    // R1/R2: body centroid = anchor + R(90)·(0, 0.2) → +0.2 in x; FID1
    // excluded by the profile, C1 dnp, U1 exclude_from_pos, H1 dnp
    expect(lines.slice(1)).toEqual([
      'D1,12.000,12.000,B,30',
      'J1,20.000,20.000,T,45',
      'R1,137.800,84.800,T,90',
      'R2,140.200,84.800,T,90',
    ]);
    expect(result.skipped.map((s) => s.ref).sort()).toEqual(['C1', 'FID1', 'H1', 'U1']);
  });

  it('kicad profile reports anchors, includes dnp, six-decimal semantics', () => {
    const result = exportPlacement(board, { profileId: 'kicad', outputDir: dir });
    const lines = fs.readFileSync(result.file, 'utf8').trimEnd().split('\n');
    expect(lines[0]).toBe('## Unit = mm, Angle = deg.');
    expect(lines[2]).toBe('Ref,Val,Pos X,Pos Y,Rot,Side');
    const byRef = new Map(lines.slice(3).map((l) => [l.split(',')[0]!.replace(/"/g, ''), l]));
    expect(byRef.get('R1')).toBe('"R1","1k",137.600000,84.800000,90.000000,top');
    expect(byRef.get('C1')).toBe('"C1","100n",10.000000,10.000000,0.000000,bottom');
    // U1 carries exclude_from_pos_files → out even for kicad
    expect(byRef.has('U1')).toBe(false);
    expect(byRef.has('H1')).toBe(true); // dnp rides along, as kicad-cli does
    expect(byRef.has('FID1')).toBe(true);
  });

  it('rebases onto the aux origin on request', () => {
    const result = exportPlacement(board, { profileId: 'jlcpcb', origin: 'aux', outputDir: dir });
    const lines = fs.readFileSync(result.file, 'utf8').trimEnd().split('\n');
    expect(lines[1]).toBe('D1,7.000,7.000,B,30');
    expect(lines).toContain('J1,15.000,15.000,T,45');
    void result;
  });

  it('side filter keeps only the requested face', () => {
    const result = exportPlacement(board, { profileId: 'kicad', side: 'back', outputDir: dir });
    expect(result.rows.map((r) => r.ref)).toEqual(['C1', 'D1']);
  });

  it('openpnp writes the native .board.xml beside the CSV, bottom transformed', () => {
    const result = exportPlacement(board, { profileId: 'openpnp', outputDir: dir });
    expect(path.basename(result.file)).toBe('fixture-placements.csv');
    expect(result.boardFile).toBe(path.join(dir, 'fixture.board.xml'));

    // D1 sits on the back at (12, 12, rot 30): OpenPnP wants x negated and
    // the rotation mirrored; R1 is front-side and untouched; dnp C1 stays out
    const csv = fs.readFileSync(result.file!, 'utf8').trimEnd().split('\n');
    expect(csv[0]).toBe('id,x,y,rotation,side');
    expect(csv).toContain('D1,-12.0000,12.0000,150.00,Bottom');
    expect(csv).toContain('R1,137.8000,84.8000,90.00,Top');

    const xml = fs.readFileSync(result.boardFile!, 'utf8');
    // Edge.Cuts rectangle → dimensions + closed <profile> (moveto, 3 lineto, close)
    expect(xml).toContain('<dimensions units="Millimeters" x="30" y="20" z="0.0" rotation="0.0"/>');
    expect(xml).toContain('<profile units="Millimeters" winding-rule="1">');
    expect(xml.match(/<integer>0<\/integer>/g)!.length).toBe(1); // one moveto
    expect(xml.match(/<integer>4<\/integer>/g)!.length).toBe(1); // one close
    expect(xml.match(/<integer>1<\/integer>/g)!.length).toBe(3); // 4 vertices, 3 lineto
    // 4 vertices + the first vertex repeated for OpenPnP's MOVETO fall-through
    expect(xml.match(/<double>/g)!.length).toBe(10); // (4 + 1) vertices × 2
    // paste pads: R1's two 0603 pads ride along, transformed into place
    expect(xml).toContain('<solderPastePads>');
    expect(xml).toContain(
      '<board-pad type="Paste" side="Top" name="R1-1">' +
        '\n         <location units="Millimeters" x="137.6" y="85.55" z="0.0" rotation="0.0"/>',
    );
    expect(xml).toContain('side="Bottom" name="D1-1"');
    // pad shapes are org.openpnp.model.Pad subclasses picked by the class= attribute
    expect(xml).toContain('<pad class="org.openpnp.model.Pad$RoundRectangle" units="Millimeters" width="0.8" height="0.75"/>'); // roundness 0 omitted
    expect(xml).toContain('name="FID1-"'); // the fiducial's round pad is a Circle
    expect(xml).toContain('<pad class="org.openpnp.model.Pad$Circle" units="Millimeters" radius="0.5"/>');
    // FID1 rides as a fiducial placement (no part-id) instead of being dropped
    expect(xml).toContain('<placement id="FID1" side="Top" type="Fiducial">');
    expect(xml).not.toContain('id="FID1" side="Top" part-id');
    expect(xml).toContain('<placement id="D1" side="Bottom" part-id="D_SOD-323-1N4148W">');
    expect(xml).toContain('<location units="Millimeters" x="-12" y="12" z="0.0" rotation="150"/>');
    expect(xml).toContain('<placement id="R1" side="Top" part-id="R_0603-1k">');
    expect(xml).not.toContain('id="C1"');
  });

  it('openpnp also writes packages.xml + parts.xml for the board part-ids', () => {
    const result = exportPlacement(board, { profileId: 'openpnp', outputDir: dir });
    expect(result.packagesFile).toBe(path.join(dir, 'fixture-packages.xml'));
    expect(result.partsFile).toBe(path.join(dir, 'fixture-parts.xml'));

    const packages = fs.readFileSync(result.packagesFile!, 'utf8');
    // body size from the measured fab outline; pads in the footprint frame
    expect(packages).toContain('<package id="R_0603">');
    expect(packages).toContain('<footprint units="Millimeters" body-width="2" body-height="1.2">');
    expect(packages).toContain(
      '<pad name="1" x="-0.75" y="0" width="0.8" height="0.75" rotation="0" roundness="0"/>',
    );
    // the fiducial's circular pad is 100% round
    expect(packages).toContain('<pad name="" x="0" y="0" width="1" height="1" rotation="0" roundness="100"/>');
    // H1 (np_thru_hole only) has no package; one package per unique footprint
    expect(packages).not.toContain('<package id="MountingHole_2.2mm">');

    const parts = fs.readFileSync(result.partsFile!, 'utf8');
    expect(parts).toContain(
      '<part id="R_0603-1k" height-units="Millimeters" height="0.0" package-id="R_0603" speed="1.0"/>',
    );
    // dashed values keep the right package reference
    expect(parts).toContain('<part id="USB_C-USB-C" height-units="Millimeters" height="0.0" package-id="USB_C" speed="1.0"/>');
  });

  it('re-export preserves edits made in OpenPnP; --fresh-board discards them', () => {
    const first = exportPlacement(board, { profileId: 'openpnp', outputDir: dir });
    // simulate the user's work in OpenPnP: D1 re-associated and marked Ignore
    const xmlPath = first.boardFile!;
    const edited = fs
      .readFileSync(xmlPath, 'utf8')
      .replace(
        'id="D1" side="Bottom" part-id="D_SOD-323-1N4148W"',
        'id="D1" side="Bottom" part-id="MY-DIODE" type="Ignore" enabled="false"',
      );
    fs.writeFileSync(xmlPath, edited, 'utf8');

    const second = exportPlacement(board, { profileId: 'openpnp', outputDir: dir });
    const merged = fs.readFileSync(xmlPath, 'utf8');
    expect(merged).toContain('id="D1" side="Bottom" part-id="MY-DIODE" type="Ignore" enabled="false"');
    expect(merged).toContain('<location units="Millimeters" x="-12" y="12" z="0.0" rotation="150"/>');
    expect(second.boardMerge).toEqual({
      preserved: 5, // D1, FID1, J1, R1, R2 all matched the previous file
      added: 0,
      keptExisting: [],
      dropped: [],
    });

    const third = exportPlacement(board, { profileId: 'openpnp', freshBoardXml: true, outputDir: dir });
    const fresh = fs.readFileSync(xmlPath, 'utf8');
    expect(fresh).toContain('part-id="D_SOD-323-1N4148W"');
    expect(fresh).not.toContain('MY-DIODE');
    expect(third.boardMerge).toBeUndefined();
  });
});

describe('OpenPnP board.xml', () => {
  const row = (partial: Partial<PlacementRow>): PlacementRow => ({
    ref: 'R1',
    value: '10k',
    footprint: 'Resistor_SMD:R_0603',
    x: 23.7,
    y: 23.5,
    rotation: 90,
    side: 'front',
    dnp: false,
    ...partial,
  });

  it('renders the native schema: root, placements, part-id, location', () => {
    const xml = renderOpenPnpBoardXml(
      [row({}), row({ ref: 'C1', value: '100n', footprint: 'Capacitor_SMD:C_0402', side: 'back', x: -10, y: 10, rotation: 180 })],
      { name: 'mod-ec', dimensions: { width: 30, height: 20 } },
    );
    expect(xml).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<openpnp-board name="mod-ec">\n` +
        `   <dimensions units="Millimeters" x="30" y="20" z="0.0" rotation="0.0"/>\n` +
        `   <placements>\n` +
        `      <placement id="R1" side="Top" part-id="R_0603-10k">\n` +
        `         <location units="Millimeters" x="23.7" y="23.5" z="0.0" rotation="90"/>\n` +
        `      </placement>\n` +
        `      <placement id="C1" side="Bottom" part-id="C_0402-100n">\n` +
        `         <location units="Millimeters" x="-10" y="10" z="0.0" rotation="180"/>\n` +
        `      </placement>\n` +
        `   </placements>\n` +
        `</openpnp-board>\n`,
    );
  });

  it('escapes XML entities in ids, values, and footprint names', () => {
    const xml = renderOpenPnpBoardXml(
      [row({ ref: 'J&1', value: '1k, "1%"', footprint: 'Connector:USB<C' })],
      { name: 'b&b' },
    );
    expect(xml).toContain('<placement id="J&amp;1" side="Top" part-id="USB&lt;C-1k, &quot;1%&quot;">');
    expect(xml).toContain('<openpnp-board name="b&amp;b">');
  });

  it('omits dimensions when the board has no measured extent', () => {
    const xml = renderOpenPnpBoardXml([row({})], { name: 'x' });
    expect(xml).not.toContain('<dimensions');
  });
});

describe('mergeOpenPnpBoardXml (re-export over an edited board)', () => {
  const row = (partial: Partial<PlacementRow>): PlacementRow => ({
    ref: 'R1',
    value: '10k',
    footprint: 'Resistor_SMD:R_0603',
    x: 23.7,
    y: 23.5,
    rotation: 90,
    side: 'front',
    dnp: false,
    ...partial,
  });
  const r1 = row({ ref: 'R1', x: 11, y: 22, rotation: 90, side: 'front' });
  const r2 = row({ ref: 'R2', value: '22k', x: 33, y: 44, rotation: 0, side: 'back' });

  // a board.xml as OpenPnP would have saved it after the user did work:
  // R1's part re-associated, type=Ignore, comments; R9 later deleted from
  // the board; FID1 added by hand and still on the board
  const edited = `<?xml version="1.0" encoding="UTF-8"?>
<openpnp-board name="fixture">
   <placements>
      <placement version="1.1" id="R1" side="Top" part-id="MY-RES-10K" type="Ignore" enabled="false" rank="2">
         <location units="Millimeters" x="99.9" y="88.8" z="0.0" rotation="45.0"/>
         <comments>do not place until rework</comments>
      </placement>
      <placement id="R9" side="Top" part-id="GONE">
         <location units="Millimeters" x="1" y="2" z="0.0" rotation="0.0"/>
      </placement>
      <placement id="FID1" side="Top" part-id="FID" type="Fiducial">
         <location units="Millimeters" x="5" y="5" z="0.0" rotation="0.0"/>
      </placement>
   </placements>
</openpnp-board>
`;

  it('keeps user attributes, refreshes geometry, drops dead refs, keeps board-still-known extras', () => {
    const result = mergeOpenPnpBoardXml([r1, r2], { name: 'fixture' }, edited, new Set(['R1', 'R2', 'FID1', 'J1']));
    expect(result.preserved).toBe(1); // R1
    expect(result.added).toBe(1); // R2
    expect(result.dropped).toEqual(['R9']);
    expect(result.keptExisting).toEqual(['FID1']);

    // R1: everything the user set survives verbatim...
    expect(result.xml).toContain(
      '<placement version="1.1" id="R1" side="Top" part-id="MY-RES-10K" type="Ignore" enabled="false" rank="2">',
    );
    expect(result.xml).toContain('<comments>do not place until rework</comments>');
    // ...but the geometry is fresh (was 99.9/88.8/45)
    expect(result.xml).toContain('<location units="Millimeters" x="11" y="22" z="0.0" rotation="90"/>');
    // R2 is new: derived defaults, bottom side from the board
    expect(result.xml).toContain('<placement id="R2" side="Bottom" part-id="R_0603-22k">');
    // FID1 rides over untouched; R9 is gone
    expect(result.xml).toContain('id="FID1"');
    expect(result.xml).not.toContain('id="R9"');
  });

  it('updates the side when a part flipped since the last export', () => {
    const result = mergeOpenPnpBoardXml(
      [r1, r2],
      { name: 'fixture' },
      edited.replace('id="R1" side="Top"', 'id="R1" side="Bottom"'),
      new Set(['R1', 'R2', 'FID1']),
    );
    expect(result.xml).toContain('id="R1" side="Top"');
  });

  it('refreshes the type when a ref became a fiducial', () => {
    const fidRow = row({ ref: 'FID1', x: 2, y: 12, rotation: 0, kind: 'fiducial' });
    const existing = `<?xml version="1.0" encoding="UTF-8"?>
<openpnp-board name="fixture">
   <placements>
      <placement id="FID1" side="Top" part-id="MY-MARK" type="Place">
         <location units="Millimeters" x="9" y="9" z="0.0" rotation="0.0"/>
      </placement>
   </placements>
</openpnp-board>
`;
    const result = mergeOpenPnpBoardXml([fidRow], { name: 'fixture' }, existing, new Set(['FID1']));
    expect(result.xml).toContain('type="Fiducial"');
    expect(result.xml).toContain('<location units="Millimeters" x="2" y="12" z="0.0" rotation="0"/>');
  });
});

describe('chainOutline', () => {
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2 });
  it('chains a closed rectangle regardless of segment order and direction', () => {
    const loop = chainOutline([
      seg(0, 0, 30, 0),
      seg(30, 20, 0, 20),
      seg(0, 20, 0, 0),
      seg(30, 0, 30, 20),
    ]);
    expect(loop).not.toBeNull();
    expect(loop!.length).toBe(4);
    expect(loop![0]).toEqual({ x: 0, y: 0 });
  });
  it('returns null for an open outline', () => {
    expect(chainOutline([seg(0, 0, 10, 0), seg(10, 0, 10, 10), seg(0, 10, 0, 0)])).toBeNull();
  });
});

describe('exportBom end-to-end', () => {
  it('joins the netlist beside the board for MPN and groups refs', () => {
    const net = loadNetlistBesideBoard(boardPath);
    expect(net).not.toBeNull();
    const result = exportBom(board, net, { profileId: 'jlcpcb', outputDir: dir });
    const lines = fs.readFileSync(result.file, 'utf8').trimEnd().split('\n');
    expect(lines).toEqual([
      'Comment,Designator,Footprint,LCSC Part #',
      '1N4148W,D1,Diode_SMD:D_SOD-323,',
      'USB-C,J1,Connector:USB_C,',
      '1k,"R1, R2",Resistor_SMD:R_0603,C22935',
    ]);
  });

  it('falls back to the placement family, then generic — never throws on family ids', () => {
    // family fallback resolves the JLC BOM shape
    const jlc = exportBom(board, null, { fallbackProfileId: 'jlcpcb', outputDir: dir });
    expect(path.basename(jlc.file)).toBe('fixture-bom.csv');
    expect(jlc.profile.id).toBe('jlcpcb');
    // openpnp/pcbway/seeed carry no BOM shape of their own → generic
    for (const family of ['openpnp', 'pcbway', 'seeed']) {
      const result = exportBom(board, null, { fallbackProfileId: family, outputDir: dir });
      expect(result.profile.id).toBe('generic');
    }
    // an explicit --bom-profile must still name a real BOM profile
    expect(() => exportBom(board, null, { profileId: 'bananas', outputDir: dir })).toThrow(
      /Unknown BOM profile 'bananas'/,
    );
  });

  it('degrades to board-only columns without a netlist', () => {
    fs.rmSync(path.join(dir, 'fixture.net'));
    const net = loadNetlistBesideBoard(boardPath);
    const result = exportBom(board, net, { profileId: 'jlcpcb', outputDir: dir });
    const lines = fs.readFileSync(result.file, 'utf8').trimEnd().split('\n');
    expect(lines[1]).toBe('1N4148W,D1,Diode_SMD:D_SOD-323,');
    expect(lines).toContain('1k,"R1, R2",Resistor_SMD:R_0603,');
    expect(result.netlist).toBeNull();
  });
});
