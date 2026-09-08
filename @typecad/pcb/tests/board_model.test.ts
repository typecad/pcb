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

// Geometry notes (KiCad y-down, footprint rotation CCW on screen):
//   R1 at (10,20) rot 90: pad1 local (-0.75,0) → (10,20.75); pad2 (0.75,0) → (10,19.25)
//   U1 at (30,20) rot 0:  pad1 (-1,0)→(29,20) GND; pad2 (1,0)→(31,20) SIG; pad3 (0,1)→(30,21) VCC
//   R2 at (5,5) rot 0:    pad1 (0,0)→(5,5) VCC (no copper — unrouted net)
// SIG routes R1.2 → via → B.Cu → via → U1.2 across three segments.
// GND connects only through its board-wide pour (plus one stray segment).
// VCC has two pins and no copper at all.
const PCB = `(kicad_pcb
  (version 20260206)
  (net 0 "")
  (net 1 "GND")
  (net 2 "SIG")
  (net 3 "VCC")
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
  )  (footprint "Mech:STANDOFF" (layer "B.Cu")
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
  (footprint "Resistor_SMD:R_0402" (layer "F.Cu")
    (at 5 5)
    (property "Reference" "R2" (at 0 0 0))
    (property "Value" "1k" (at 0 0 0))
    (pad "1" smd rect (at 0 0) (size 0.5 0.5) (layers "F.Cu") (net 3 "VCC") (pintype passive))
    (pad "2" smd rect (at 1 0) (size 0.5 0.5) (layers "F.Cu") (net 0 ""))
  )
  (footprint "Package_SO:SOIC-8" (layer "F.Cu")
    (at 30 20)
    (property "Reference" "U1" (at 0 0 0))
    (property "Value" "OPAMP" (at 0 0 0))
    (pad "1" smd rect (at -1 0) (size 0.6 0.6) (layers "F.Cu") (net 1 "GND") (pintype passive))
    (pad "2" smd rect (at 1 0) (size 0.6 0.6) (layers "F.Cu") (net 2 "SIG") (pintype passive))
    (pad "3" smd rect (at 0 1) (size 0.6 0.6) (layers "F.Cu") (net 3 "VCC") (pintype passive))
  )
  (via (at 12 22) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1 "GND"))
  (via (at 20 19.25) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 2 "SIG"))
  (via (at 20 20) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 2 "SIG"))
  (zone (net 1) (net_name "GND") (layers "F.Cu" "B.Cu") (fill yes (mode hatch))
    (polygon (pts (xy 0 0) (xy 50 0) (xy 50 30) (xy 0 30))))
  (zone (layers "F.Cu") (keepout (tracks not_allowed) (vias not_allowed))
    (polygon (pts (xy 40 10) (xy 45 10) (xy 45 15) (xy 40 15))))
  (segment (start 10 20.75) (end 12 20.75) (width 0.25) (layer "F.Cu") (net 1 "GND"))
  (segment (start 10 19.25) (end 20 19.25) (width 0.25) (layer "F.Cu") (net 2 "SIG"))
  (segment (start 20 19.25) (end 20 20) (width 0.25) (layer "B.Cu") (net 2 "SIG"))
  (segment (start 20 20) (end 31 20) (width 0.25) (layer "F.Cu") (net 2 "SIG"))
  (gr_line (start 0 0) (end 50 0) (layer "Edge.Cuts") (width 0.05))
  (gr_line (start 0 0) (end 0 30) (layer "Edge.Cuts") (width 0.05))
)`;

describe('buildBoardModel', () => {
  const file = writeTempPcb(PCB);
  const model = buildBoardModel(file);

  it('parses components with references, values, footprints, sides', () => {
    expect(model.components.map((c) => c.reference).sort()).toEqual(['H1', 'H2', 'L1', 'R1', 'R2', 'U1']);
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
    expect(findComponent(model, 'H2')!.dimensions).toEqual({ width: 2.95, height: 2.95 });
  });

  it('falls back to silkscreen geometry when no Fab outline exists', () => {
    expect(findComponent(model, 'L1')!.dimensions).toEqual({ width: 3, height: 3 });
  });

  it('falls back to pad extents when the footprint has no graphics', () => {
    expect(findComponent(model, 'H1')!.dimensions).toEqual({ width: 2, height: 2 });
  });

  it('recovers the source variable from the Code property', () => {
    expect(findComponent(model, 'R1')!.variable).toBe('r1');
  });

  it('aggregates net membership across pads, vias, zones, and segments', () => {
    const gnd = findNet(model, 'GND')!;
    expect(gnd.pins).toEqual(['R1.1', 'U1.1']);
    expect(gnd.vias).toHaveLength(1);
    expect(gnd.zones[0].layers).toEqual(['F.Cu', 'B.Cu']);
    expect(model.summary.tracks).toBe(4);
    expect(findNet(model, 'SIG')!.pins).toEqual(['R1.2', 'U1.2']);
  });

  it('reports a via-bridged route as fully routed with length and layers', () => {
    const sig = findNet(model, 'SIG')!;
    expect(sig.route).toMatchObject({
      routed: true,
      pinsTotal: 2,
      pinsConnected: 2,
      segments: 3,
      length: 21.75,
      layers: ['F.Cu', 'B.Cu'],
      pourAssisted: false,
    });
    expect(sig.route!.disconnectedGroups).toEqual([]);
  });

  it('recognizes pour-assisted connectivity on a ground plane', () => {
    const gnd = findNet(model, 'GND')!;
    expect(gnd.route).toMatchObject({
      routed: true,
      pinsConnected: 2,
      pourAssisted: true,
      segments: 1,
    });
  });

  it('flags nets with no copper as unrouted with disconnected pin groups', () => {
    const vcc = findNet(model, 'VCC')!;
    expect(vcc.route).toMatchObject({ routed: false, pinsTotal: 2, pinsConnected: 1, segments: 0 });
    expect(vcc.route!.disconnectedGroups).toEqual([['U1.3']]);
  });

  it('classifies zones into pours and keepouts', () => {
    const pours = model.zones.filter((z) => !z.keepout);
    const keepouts = model.zones.filter((z) => z.keepout);
    expect(pours).toHaveLength(1);
    expect(pours[0].netName).toBe('GND');
    expect(pours[0].filled).toBe(true);
    expect(pours[0].fillMode).toBe('hatch');
    expect(pours[0].layers).toEqual(['F.Cu', 'B.Cu']);
    expect(keepouts).toHaveLength(1);
    expect(keepouts[0].netName).toBeNull();
    expect(keepouts[0].layers).toEqual(['F.Cu']);
    expect(keepouts[0].bbox).toEqual({ x: 40, y: 10, width: 5, height: 5 });
    expect(model.summary.keepouts).toBe(1);
  });

  it('lists unconnected electrical pads and single-pin nets', () => {
    const pads = unconnectedPads(model);
    expect(pads.map((p) => `${p.reference}.${p.pad}`).sort()).toEqual(['H1.1', 'L1.1', 'L1.2', 'R2.2']);
    expect(singlePinNets(model)).toEqual([]);
  });

  it('computes the board outline from Edge.Cuts', () => {
    expect(model.summary.board).toEqual({ minX: 0, minY: 0, maxX: 50, maxY: 30 });
  });
});

// A board as kicad-cli --save-board reserializes it: zones carry
// `(net "GND")` instead of `(net 1) (net_name "GND")`, and the fill
// geometry exists as (filled_polygon) nodes alongside the declared outline.
const RESAVED_PCB = `(kicad_pcb
  (version 20241229)
  (net 0 "")
  (net 1 "GND")
  (footprint "Device:R" (layer "F.Cu")
    (at 10 10)
    (property "Reference" "R9" (at 0 0 0))
    (property "Value" "1k" (at 0 0 0))
    (pad "1" smd rect (at -1 0) (size 1 1) (layers "F.Cu") (net 1 "GND"))
    (pad "2" smd rect (at 1 0) (size 1 1) (layers "F.Cu") (net 1 "GND"))
  )
  (zone
    (net "GND")
    (layers "F.Cu" "B.Cu")
    (hatch edge 0.508)
    (fill yes (mode hatch))
    (polygon (pts (xy 0 0) (xy 30 0) (xy 30 20) (xy 0 20)))
    (filled_polygon (layer "F.Cu") (pts (xy 0.2 0.2) (xy 29.8 0.2) (xy 29.8 19.8) (xy 0.2 19.8)))
    (filled_polygon (layer "B.Cu") (pts (xy 0.2 0.2) (xy 29.8 0.2) (xy 29.8 19.8) (xy 0.2 19.8)))
  )
  (zone
    (layers "F.Cu")
    (keepout (tracks not_allowed) (vias not_allowed))
    (polygon (pts (xy 40 5) (xy 45 5) (xy 45 10) (xy 40 10)))
  )
)`;

describe('buildBoardModel on kicad-cli resaved boards', () => {
  const model = buildBoardModel(writeTempPcb(RESAVED_PCB));

  it('recognizes the resaved (net "NAME") zone form as a pour with that net', () => {
    const pours = model.zones.filter((z) => !z.keepout);
    expect(pours).toHaveLength(1);
    expect(pours[0].netName).toBe('GND');
    expect(pours[0].netCode).toBe(1);
    expect(pours[0].layers).toEqual(['F.Cu', 'B.Cu']);
    expect(model.zones.filter((z) => z.keepout)).toHaveLength(1);
  });

  it('reports materialized fills from (filled_polygon) nodes', () => {
    expect(model.zones.filter((z) => !z.keepout)[0].materialized).toBe(true);
    expect(model.zones.filter((z) => z.keepout)[0].materialized).toBe(false);
  });

  it('uses the declared outline for the bbox, not clipped fill fragments', () => {
    const pour = model.zones.filter((z) => !z.keepout)[0];
    expect(pour.bbox).toEqual({ x: 0, y: 0, width: 30, height: 20 });
  });

  it('still resolves pour connectivity through resaved zones', () => {
    const gnd = findNet(model, 'GND')!;
    expect(gnd.route).toMatchObject({ routed: true, pinsConnected: 2, pourAssisted: true });
  });
});
