import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildBoardModel,
  findComponent,
  findNet,
  unconnectedPads,
  singlePinNets,
} from '../src/cli/typecad/board_model.js';
import { encodeCodeMetadata } from '../src/kicad2typecad/codec.js';

function writeTempPcb(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-board-model-'));
  const file = path.join(dir, 'board.kicad_pcb');
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

const codeProp = (variable: string) => encodeCodeMetadata({ v: 1, u: '', n: variable });

// R1: Fab outline -0.8..0.8 × -0.4..0.4 plus a larger silkscreen line that
// must NOT win; placed at 90° — dimensions stay in the local frame.
// R2: no Fab, only silkscreen → silkscreen bbox.
// R3: no graphics at all → pad extents.
const PCB = `(kicad_pcb
  (version 20260206)
  (net 0 "")
  (net 1 "GND")
  (net 2 "SIG")
  (footprint "Resistor_SMD:R_0603" (layer "F.Cu")
    (at 10 20 90)
    (property "Reference" "R1" (at 0 0 0))
    (property "Value" "10k" (at 0 0 0))
    (property "Code" "${codeProp('r1')}" (at 0 0 0))
    (fp_line (start -0.8 -0.4) (end 0.8 0.4) (layer "F.Fab") (width 0.1))
    (fp_line (start -2 -1) (end 2 1) (layer "F.SilkS") (width 0.12))
    (pad "1" smd rect (at -0.75 0 180) (size 0.8 0.75) (layers "F.Cu") (net 1 "GND") (pintype passive))
    (pad "2" smd rect (at 0.75 0 180) (size 0.8 0.75) (layers "F.Cu") (net 2 "SIG") (pintype passive))
  )
  (footprint "Device:L" (layer "F.Cu")
    (at 30 40)
    (property "Reference" "L1" (at 0 0 0))
    (property "Value" "4.7uH" (at 0 0 0))
    (fp_line (start -1.5 -1.5) (end 1.5 1.5) (layer "F.SilkS") (width 0.12))
    (pad "1" smd rect (at -1 0) (size 1 1) (layers "F.Cu") (net 0 ""))
    (pad "2" smd rect (at 1 0) (size 1 1) (layers "F.Cu") (net 0 ""))
  )
  (footprint "Mech:STANDOFF" (layer "B.Cu")
    (at 50 60)
    (property "Reference" "H1" (at 0 0 0))
    (property "Value" "ST-3" (at 0 0 0))
    (pad "1" thru_hole circle (at -1.5 -1.5) (size 2 2) (drill 1) (layers "*.Cu") (net 0 ""))
  )
  (footprint "MountingHole:MountingHole_2.7mm" (layer "F.Cu")
    (at 5 5)
    (property "Reference" "H2" (at 0 0 0))
    (property "Value" "MH" (at 0 0 0))
    (fp_circle (center 0 0) (end 1.475 0) (layer "F.Fab") (width 0.05))
    (pad "" np_thru_hole circle (at 0 0) (size 2.7 2.7) (drill 2.7) (layers "*.Cu" "*.Mask") (net 0 ""))
  )
  (via (at 12 22) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1 "GND"))
  (zone (net 1) (net_name "GND") (layers "F.Cu" "B.Cu")
    (polygon (pts (xy 0 0) (xy 50 0) (xy 50 30) (xy 0 30))))
  (segment (start 10 20) (end 12 22) (width 0.25) (layer "F.Cu") (net 1 "GND"))
  (gr_line (start 0 0) (end 50 0) (layer "Edge.Cuts") (width 0.05))
  (gr_line (start 0 0) (end 0 30) (layer "Edge.Cuts") (width 0.05))
)`;

describe('buildBoardModel', () => {
  const file = writeTempPcb(PCB);
  const model = buildBoardModel(file);

  it('parses components with references, values, footprints, sides', () => {
    expect(model.components.map((c) => c.reference).sort()).toEqual(['H1', 'H2', 'L1', 'R1']);
    const r1 = findComponent(model, 'R1')!;
    expect(r1.value).toBe('10k');
    expect(r1.footprint).toBe('Resistor_SMD:R_0603');
    expect(r1.side).toBe('front');
    expect(r1.at).toEqual({ x: 10, y: 20, rotation: 90 });
    expect(findComponent(model, 'H1')!.side).toBe('back');
  });

  it('derives dimensions from the fabrication outline, ignoring silkscreen and placement rotation', () => {
    expect(findComponent(model, 'R1')!.dimensions).toEqual({ width: 1.6, height: 0.8 });
  });

  it('computes the full circle bounding box from center + circumference point', () => {
    // radius 1.475 → 2.95 × 2.95 (mounting-hole style footprints)
    expect(findComponent(model, 'H2')!.dimensions).toEqual({ width: 2.95, height: 2.95 });
  });

  it('falls back to silkscreen geometry when no Fab outline exists', () => {
    expect(findComponent(model, 'L1')!.dimensions).toEqual({ width: 3, height: 3 });
  });

  it('falls back to pad extents when the footprint has no graphics', () => {
    // single pad at (-1.5,-1.5) size 2×2 → extents -2.5..-0.5
    expect(findComponent(model, 'H1')!.dimensions).toEqual({ width: 2, height: 2 });
  });

  it('recovers the source variable from the Code property', () => {
    expect(findComponent(model, 'R1')!.variable).toBe('r1');
  });

  it('aggregates net membership across pads, vias, zones, and segments', () => {
    const gnd = findNet(model, 'GND')!;
    expect(gnd.pins).toEqual(['R1.1']);
    expect(gnd.vias).toHaveLength(1);
    expect(gnd.zones[0].layers).toEqual(['F.Cu', 'B.Cu']);
    expect(model.summary.tracks).toBe(1);
    const sig = findNet(model, 'SIG')!;
    expect(sig.pins).toEqual(['R1.2']);
  });

  it('lists unconnected electrical pads and single-pin nets', () => {
    const pads = unconnectedPads(model);
    // L1 pads and H1 thru_hole pad have no net; H2's np_thru_hole is excluded
    expect(pads.map((p) => `${p.reference}.${p.pad}`).sort()).toEqual(['H1.1', 'L1.1', 'L1.2']);
    expect(singlePinNets(model).map((n) => n.name)).toEqual(['GND', 'SIG']);
  });

  it('computes the board outline from Edge.Cuts', () => {
    expect(model.summary.board).toEqual({ minX: 0, minY: 0, maxX: 50, maxY: 30 });
  });
});
