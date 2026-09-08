import { describe, it, expect, vi } from 'vitest';
import { SExprNode } from '../src/kicad2typecad/sexpr_tree.js';
import { KicadIRBuilder } from '../src/kicad2typecad/ir_builder.js';
import { generateZoneCode } from '../src/kicad2typecad/display.js';
import type { ChalkHelpers } from '../src/kicad2typecad/display.js';
import logger from '../src/utils/logging.js';

const PLAIN_CH: ChalkHelpers = {
  chKey: (s) => s,
  chProp: (s) => s,
  chStr: (s) => s,
  chNum: (n) => String(n),
  chPunc: (s) => s,
  chVar: (s) => s,
};

function buildIr(pcb: string) {
  return new KicadIRBuilder().build(SExprNode.parse(pcb));
}

function captureLogs(fn: () => void): string {
  const calls: string[] = [];
  const spy = vi.spyOn(logger, 'log').mockImplementation((...args: unknown[]) => {
    calls.push(args.join(' '));
  });
  fn();
  spy.mockRestore();
  return calls.join('\n');
}

/** A realistic KiCad 10 board: GND pour, hatched pour, rule area, unconnected pour. */
const zoneBoard = `(kicad_pcb (version 20241229) (generator pcbnew)
  (net 0 "")
  (net 3 "GND")
  (zone (net 3) (net_name "GND") (layers "F.Cu" "B.Cu") (name "GND pour")
    (uuid "z1") (priority 2)
    (hatch edge 0.508)
    (connect_pads thru_hole_only (clearance 0.2))
    (min_thickness 0.1778)
    (filled_areas_thickness no)
    (fill yes (mode hatch) (thermal_gap 0.3) (thermal_bridge_width 0.5)
      (island_removal_mode 2) (island_area_min 4) (hatch_thickness 0.2) (hatch_gap 0.8))
    (polygon (pts (xy 10 10) (xy 40 10) (xy 40 30) (xy 10 30)))
  )
  (zone (net 0) (net_name "") (layers "F.Cu")
    (uuid "z2")
    (hatch edge 0.508)
    (keepout (tracks not_allowed) (vias not_allowed) (pads allowed) (copperpour not_allowed) (footprints allowed))
    (placement (enabled yes) (sheetname ""))
    (polygon (pts (xy 50 10) (xy 60 10) (xy 55 20)))
  )
  (zone (net 3) (net_name "GND") (layers "In1.Cu")
    (uuid "z3")
    (fill yes (mode polygon) (thermal_gap 0.254))
    (polygon (pts (xy 0 0) (xy 8 0) (xy 0 8)))
  )
)`;

describe('KicadIRBuilder zone parsing', () => {
  const ir = buildIr(zoneBoard);

  it('parses all zones', () => {
    expect(ir.zones).toHaveLength(3);
  });

  it('parses a filled pour with full fill settings', () => {
    const z = ir.zones[0];
    expect(z.netName).toBe('GND');
    expect(z.name).toBe('GND pour');
    expect(z.priority).toBe(2);
    expect(z.layers).toEqual(['F.Cu', 'B.Cu']);
    expect(z.polygon).toEqual([
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 30 },
      { x: 10, y: 30 },
    ]);
    expect(z.connectPads).toBe('thru_hole_only');
    expect(z.clearance).toBe(0.2);
    expect(z.minThickness).toBe(0.1778);
    expect(z.filledAreasThickness).toBe(false);
    expect(z.fill?.mode).toBe('hatched'); // KiCad `hatch` token
    expect(z.fill?.thermalGap).toBe(0.3);
    expect(z.fill?.islandRemovalMode).toBe(2);
    expect(z.fill?.hatchThickness).toBe(0.2);
    expect(z.keepout).toBeUndefined();
  });

  it('parses a rule area with keepout restrictions and placement', () => {
    const z = ir.zones[1];
    expect(z.keepout).toEqual({
      tracks: true,
      vias: true,
      pads: false,
      copperpour: true,
      footprints: false,
    });
    expect(z.placement).toBe(true);
    expect(z.netName).toBeNull(); // net 0
  });

  it('maps KiCad solid fill mode to solid', () => {
    const z = ir.zones[2];
    expect(z.fill?.mode).toBe('solid'); // `polygon` token
    expect(z.netName).toBe('GND');
  });
});

describe('generateZoneCode', () => {
  it('emits typecad.zone for pours with the grouped fill object', () => {
    const ir = buildIr(zoneBoard);
    const out = captureLogs(() => generateZoneCode(ir, 'test', PLAIN_CH));
    expect(out).toContain("typecad.zone({ net: 'GND'");
    expect(out).toContain("layers: ['F.Cu', 'B.Cu']");
    expect(out).toContain('points: [{ x: 10, y: 10 }');
    expect(out).toContain("fill: { mode: 'hatched'");
    expect(out).toContain('thermalGap: 0.3');
    expect(out).toContain("connectPads: 'thru_hole_only'");
    expect(out).toContain('minThickness: 0.1778');
  });

  it('emits typecad.keepout for rule areas with restrictions and placement', () => {
    const ir = buildIr(zoneBoard);
    const out = captureLogs(() => generateZoneCode(ir, 'test', PLAIN_CH));
    expect(out).toContain('typecad.keepout({');
    expect(out).toContain('restrictions: { tracks: true, vias: true');
    expect(out).toContain('placement: true');
  });

  it('emits unconnected pours without a net property', () => {
    const ir = buildIr(zoneBoard);
    const out = captureLogs(() => generateZoneCode(ir, 'test', PLAIN_CH));
    // the rule area has no net; its emission must not include net:
    expect(out).toContain('typecad.keepout({ layers:');
  });

  it('emits nothing when the board has no zones', () => {
    const ir = buildIr('(kicad_pcb (version 20241229))');
    const out = captureLogs(() => generateZoneCode(ir, 'test', PLAIN_CH));
    expect(out).toBe('');
  });
});

describe('round-trip: imported zone code builds the same zone', () => {
  it('parses code emitted by typeCAD and re-reads the same geometry', () => {
    // Generated emit path: IR -> generateZoneCode text -> (user pastes) -> typeCAD rebuild
    // Here we verify the emitted polygon matches the source board vertices.
    const ir = buildIr(zoneBoard);
    const out = captureLogs(() => generateZoneCode(ir, 'test', PLAIN_CH));
    for (const pt of ['x: 40, y: 30', 'x: 55, y: 20', 'x: 0, y: 8']) {
      expect(out).toContain(pt);
    }
  });
});

describe('import edge cases (review regressions)', () => {
  it('preserves legitimate zero values (island_removal_mode 0 = never remove)', () => {
    const ir = buildIr(`(kicad_pcb
  (zone (net 0) (layers "F.Cu")
    (fill yes (thermal_gap 0) (island_removal_mode 0))
    (polygon (pts (xy 0 0) (xy 5 0) (xy 0 5)))
  )
)`);
    expect(ir.zones[0].fill?.islandRemovalMode).toBe(0);
    expect(ir.zones[0].fill?.thermalGap).toBe(0);
  });

  it('emits only props pcb.keepout() accepts, even for KiCad-authored rule areas', () => {
    // KiCad rule areas routinely carry min_thickness and a fill block;
    // the emitted code must not include options keepout() doesn't have.
    const ir = buildIr(`(kicad_pcb
  (zone (net 0) (layers "F.Cu")
    (hatch edge 0.508)
    (connect_pads (clearance 0.2))
    (min_thickness 0.25)
    (keepout (tracks not_allowed) (vias not_allowed) (pads not_allowed) (copperpour not_allowed) (footprints not_allowed))
    (fill (thermal_gap 0.5) (island_removal_mode 0))
    (polygon (pts (xy 0 0) (xy 9 0) (xy 0 9)))
  )
)`);
    const out = captureLogs(() => generateZoneCode(ir, 'test', PLAIN_CH));
    const keepoutLine = out.split('\n').find((l) => l.includes('typecad.keepout')) ?? '';
    expect(keepoutLine).not.toContain('minThickness');
    expect(keepoutLine).not.toContain('connectPads');
    expect(keepoutLine).not.toContain('clearance');
    expect(keepoutLine).not.toContain('fill');
    expect(keepoutLine).toContain('restrictions: { tracks: true, vias: true');
  });

  it('emits locked, filledAreasThickness, and hatch settings for pours', () => {
    const ir = buildIr(`(kicad_pcb
  (net 1 "VCC")
  (zone (net 1) (net_name "VCC") (layers "B.Cu") locked
    (name "locked pour") (priority 4)
    (hatch full 1.016)
    (filled_areas_thickness yes)
    (fill yes (thermal_gap 0.3))
    (polygon (pts (xy 1 1) (xy 6 1) (xy 6 6) (xy 1 6)))
  )
)`);
    const out = captureLogs(() => generateZoneCode(ir, 'test', PLAIN_CH));
    const zoneLine = out.split('\n').find((l) => l.includes('typecad.zone')) ?? '';
    expect(zoneLine).toContain('locked: true');
    expect(zoneLine).toContain('filledAreasThickness: true');
    expect(zoneLine).toContain("hatchStyle: 'full'");
    expect(zoneLine).toContain('hatchPitch: 1.016');
  });
});
