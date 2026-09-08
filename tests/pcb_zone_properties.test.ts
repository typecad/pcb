import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { serialize, s } from '../src/sexpr/index.js';
import { PCB } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';
import { zone, keepout } from '../src/pcb/pcb_zones.js';
import { pcbZoneWithOffset, pcbKeepoutWithOffset } from '../src/pcb/pcb_graphics_delegation.js';
import { PcbInternalState } from '../src/pcb/pcb_state.js';

const buildDir = './build';

/** L-shaped pour: 6 vertices, not expressible as a rectangle. */
const L_SHAPE = [
  { x: 10, y: 10 },
  { x: 20, y: 10 },
  { x: 20, y: 14 },
  { x: 14, y: 14 },
  { x: 14, y: 20 },
  { x: 10, y: 20 },
];

function padComponent(): Component {
  const c = new Component('test:pad');
  c.reference = 'R1';
  c.pins = [c.pin(1)];
  c.pcb = { x: 30, y: 30 } as any;
  vi.spyOn(c, 'footprint_lib').mockReturnValue(
    '(footprint (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu")))' as any,
  );
  return c;
}

describe('zone() polygon geometry', () => {
  it('accepts an explicit points polygon and computes its bounding box', () => {
    const state = new PcbInternalState({});
    zone(state, { net: 'GND', layers: ['F.Cu'], points: L_SHAPE });

    expect(state.zones).toHaveLength(1);
    expect(state.zones[0].polygon).toEqual(L_SHAPE);
    // bounding box fields stay consistent for obstacle building
    expect(state.zones[0].x).toBe(10);
    expect(state.zones[0].y).toBe(10);
    expect(state.zones[0].width).toBe(10);
    expect(state.zones[0].height).toBe(10);
  });

  it('still accepts the rectangle form', () => {
    const state = new PcbInternalState({});
    zone(state, { net: 'GND', layers: ['F.Cu'], x: 1, y: 2, width: 3, height: 4 });
    expect(state.zones[0].polygon).toEqual([
      { x: 1, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 6 },
      { x: 1, y: 6 },
    ]);
  });

  it('rejects polygons with fewer than 3 vertices', () => {
    const state = new PcbInternalState({});
    zone(state, {
      net: 'GND',
      layers: ['F.Cu'],
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    });
    expect(state.zones).toHaveLength(0);
  });

  it('rejects providing both points and a rectangle', () => {
    const state = new PcbInternalState({});
    zone(state, { net: 'GND', layers: ['F.Cu'], points: L_SHAPE, x: 0, y: 0, width: 5, height: 5 });
    expect(state.zones).toHaveLength(0);
  });

  it('allows an unconnected pour (no net) — KiCad net 0', () => {
    const state = new PcbInternalState({});
    zone(state, { layers: ['F.Cu'], x: 0, y: 0, width: 5, height: 5 });
    expect(state.zones).toHaveLength(1);
    expect(state.zones[0].net).toBeUndefined();
  });

  it('rejects providing neither points nor a full rectangle', () => {
    const state = new PcbInternalState({});
    zone(state, { net: 'GND', layers: ['F.Cu'], x: 0, width: 5 } as any);
    expect(state.zones).toHaveLength(0);
  });

  it('shifts polygon zones by the active offset', () => {
    const state = new PcbInternalState({});
    state.pushOffset(10, 5);
    pcbZoneWithOffset(state, {
      net: 'GND',
      layers: ['F.Cu'],
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 2 },
      ],
    });

    expect(state.zones[0].polygon).toEqual([
      { x: 10, y: 5 },
      { x: 12, y: 5 },
      { x: 10, y: 7 },
    ]);
  });
});

describe('zone() property defaults', () => {
  it('defaults islandRemovalMode to 2 (documented behavior, now actual)', () => {
    const state = new PcbInternalState({});
    zone(state, { net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 5, height: 5 });
    expect(state.zones[0].islandRemovalMode).toBe(2);
  });
});

describe('zone() grouped fill object', () => {
  it('accepts the fill settings as a nested object', () => {
    const state = new PcbInternalState({});
    zone(state, {
      net: 'GND',
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 5,
      height: 5,
      fill: {
        mode: 'hatched',
        arcSegments: 24,
        thermalGap: 0.4,
        thermalBridgeWidth: 0.7,
        smoothing: 'fillet',
        smoothingRadius: 0.6,
        islandRemovalMode: 0,
        hatchThickness: 0.15,
        hatchGap: 0.9,
        hatchOrientation: 45,
        hatchBorderAlgorithm: 'min_thickness',
      },
    });

    const z = state.zones[0];
    expect(z.fillMode).toBe('hatched');
    expect(z.fillArcSegments).toBe(24);
    expect(z.thermalGap).toBe(0.4);
    expect(z.thermalBridgeWidth).toBe(0.7);
    expect(z.smoothing).toBe('fillet');
    expect(z.smoothingRadius).toBe(0.6);
    expect(z.islandRemovalMode).toBe(0);
    expect(z.hatchThickness).toBe(0.15);
    expect(z.hatchGap).toBe(0.9);
    expect(z.hatchOrientation).toBe(45);
    expect(z.hatchBorderAlgorithm).toBe('min_thickness');
  });

  it('nested values override the flat options, which still work alone', () => {
    const state = new PcbInternalState({});
    zone(state, {
      net: 'GND',
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 5,
      height: 5,
      thermalGap: 0.254, // flat value...
      fill: { thermalGap: 0.9 }, // ...overridden by the grouped object
    });
    expect(state.zones[0].thermalGap).toBe(0.9);

    const state2 = new PcbInternalState({});
    zone(state2, { net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 5, height: 5, thermalGap: 0.31 });
    expect(state2.zones[0].thermalGap).toBe(0.31);
  });

  it('fill: false creates an unfilled zone outline; fill: {} keeps defaults', () => {
    const state = new PcbInternalState({});
    zone(state, { net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 5, height: 5, fill: false });
    expect(state.zones[0].filled).toBe(false);

    const state2 = new PcbInternalState({});
    zone(state2, { net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 5, height: 5, fill: {} });
    expect(state2.zones[0].filled).toBe(true);
    expect(state2.zones[0].fillMode).toBe('solid');
    expect(state2.zones[0].thermalGap).toBe(0.254);
  });

  it('serializes a nested fill object through create()', () => {
    const boardName2 = 'zone_fillobj';
    const pcb = new PCB(boardName2);
    const c = padComponent();
    pcb.add(c);
    pcb.zone({
      net: 'GND',
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 5,
      height: 5,
      fill: { mode: 'hatched', hatchThickness: 0.2, islandRemovalMode: 1 },
    });
    pcb.create(c);
    const board = fs.readFileSync(`${buildDir}/${boardName2}.kicad_pcb`, 'utf8');
    expect(board).toContain('(mode hatch)');
    expect(board).toContain('(hatch_thickness 0.2)');
    expect(board).toContain('(island_removal_mode 1)');
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName2}.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });
});

describe('keepout() rule-area options', () => {
  it('accepts polygon geometry and placement', () => {
    const state = new PcbInternalState({});
    keepout(state, {
      layers: ['F.Cu'],
      points: L_SHAPE,
      placement: true,
      restrictions: { tracks: true, vias: true, pads: false, copperpour: false, footprints: false },
    });

    expect(state.keepoutZones).toHaveLength(1);
    const k = state.keepoutZones[0];
    expect(k.polygon).toEqual(L_SHAPE);
    expect(k.placement).toBe(true);
    expect(k.width).toBe(10); // bbox of the L
  });

  it('shifts polygon keepouts by the active offset', () => {
    const state = new PcbInternalState({});
    state.pushOffset(-5, 3);
    pcbKeepoutWithOffset(state, {
      layers: ['F.Cu'],
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 2 },
      ],
      restrictions: { tracks: true },
    });
    expect(state.keepoutZones[0].polygon).toEqual([
      { x: -5, y: 3 },
      { x: -3, y: 3 },
      { x: -5, y: 5 },
    ]);
  });
});

describe('zone serialization (create integration)', () => {
  const boardName = 'zone_props';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName}.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });

  it('writes filled_areas_thickness, island removal default, polygon zones, and rule-area options', () => {
    // fill_zones: false — these assertions cover typeCAD's own serialization;
    // materialization re-saves through kicad-cli, whose formatter drops
    // filled_areas_thickness and rewrites zone heads
    const pcb = new PCB(boardName, { fill_zones: false });
    const c = padComponent();
    pcb.add(c);

    // L-shaped polygon pour tied to the component's net
    pcb.zone({
      pin: c.pin(1),
      layers: ['F.Cu'],
      points: L_SHAPE,
      filledAreasThickness: false,
      islandAreaMin: 3,
    });

    // polygon rule area with placement enabled
    pcb.keepout({
      layers: ['F.Cu'],
      points: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 0, y: 8 },
      ],
      placement: true,
    });

    pcb.create(c);

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');

    // filledAreasThickness now reaches the file (was silently dropped before)
    expect(board).toContain('(filled_areas_thickness no)');
    // islandRemovalMode default is emitted
    expect(board).toContain('(island_removal_mode 2)');
    expect(board).toContain('(island_area_min 3)');

    // the L-shaped polygon is written vertex-for-vertex (the serializer
    // pretty-prints zone heads on their own line, so anchor on coordinates)
    for (const pt of L_SHAPE) {
      expect(board).toContain(`(xy ${pt.x} ${pt.y})`);
    }
    // the polygon zone is a pour on F.Cu (not a keepout)
    expect(board).toMatch(/zone\s*\(net 0\)[^k]*\(layers "F\.Cu"\)/);

    // rule-area options reach the file; custom_rule must never be emitted
    // (KiCad 10's zone parser rejects it)
    expect(board).toContain('(enabled yes)');
    expect(board).toContain('(sheetname "")');
    expect(board).not.toContain('custom_rule');
    expect(board).toContain('(keepout (tracks not_allowed) (vias not_allowed)');
  });

  it('serializes hatched fill with the KiCad token (mode hatch)', () => {
    const pcb = new PCB(boardName + '_h');
    const c = padComponent();
    pcb.add(c);
    pcb.zone({
      net: 'GND',
      layers: ['B.Cu'],
      x: 0,
      y: 0,
      width: 5,
      height: 5,
      fillMode: 'hatched',
      hatchThickness: 0.3,
      hatchGap: 0.5,
    });
    pcb.create(c);
    const board = fs.readFileSync(`${buildDir}/${boardName}_h.kicad_pcb`, 'utf8');
    // KiCad's parser expects `hatch` (or `segment`/`polygon`), never `hatched`
    expect(board).toContain('(mode hatch)');
    expect(board).not.toContain('hatched');
    expect(board).toContain('(hatch_thickness 0.3)');
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName}_h.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });

  it('emits filled_areas_thickness yes when set true, and omits it when unset', () => {
    // fill_zones: false — assert on typeCAD's serialization, not the kicad-cli resave
    const pcb = new PCB(boardName, { fill_zones: false });
    const c = padComponent();
    pcb.add(c);
    pcb.zone({ net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 5, height: 5, filledAreasThickness: true });
    pcb.create(c);
    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(board).toContain('(filled_areas_thickness yes)');

    const pcb2 = new PCB(boardName + '_b', { fill_zones: false });
    const c2 = padComponent();
    pcb2.add(c2);
    pcb2.zone({ net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 5, height: 5 });
    pcb2.create(c2);
    const board2 = fs.readFileSync(`${buildDir}/${boardName}_b.kicad_pcb`, 'utf8');
    expect(board2).not.toContain('filled_areas_thickness');
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName}_b.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });

  it('serializes a polygon zone node with the given vertices', () => {
    // unit-level check of the s-expression shape for a points-based zone
    const state = new PcbInternalState({});
    zone(state, { net: 'GND', layers: ['B.Cu'], points: L_SHAPE, filledAreasThickness: true });
    const z = state.zones[0];
    const node = s('polygon', s('pts', ...z.polygon.map((p) => s('xy', p.x, p.y))));
    const out = serialize(node);
    for (const pt of L_SHAPE) {
      expect(out).toContain(`(xy ${pt.x} ${pt.y})`);
    }
    expect(z.layers).toEqual(['B.Cu']);
    expect(z.filledAreasThickness).toBe(true);
  });
});

describe('hatchWidth alias (KiCad dialog naming)', () => {
  it('accepts hatchWidth in the fill object and serializes as hatch_thickness', () => {
    const state = new PcbInternalState({});
    zone(state, {
      net: 'GND',
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 5,
      height: 5,
      fill: { mode: 'hatched', hatchWidth: 0.25 },
    });
    expect(state.zones[0].hatchThickness).toBe(0.25);
  });

  it('accepts the flat hatchWidth and prefers hatchThickness at the same level', () => {
    const state = new PcbInternalState({});
    zone(state, { net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 5, height: 5, hatchWidth: 0.3 });
    expect(state.zones[0].hatchThickness).toBe(0.3);

    const state2 = new PcbInternalState({});
    zone(state2, {
      net: 'GND',
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 5,
      height: 5,
      fill: { hatchThickness: 0.2, hatchWidth: 0.9 },
    });
    expect(state2.zones[0].hatchThickness).toBe(0.2);
  });

  it('reaches the board file as (hatch_thickness ...)', () => {
    const boardName3 = 'zone_hw';
    const pcb = new PCB(boardName3);
    const c = padComponent();
    pcb.add(c);
    pcb.zone({
      net: 'GND',
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 5,
      height: 5,
      fill: { mode: 'hatched', hatchWidth: 0.25 },
    });
    pcb.create(c);
    const board = fs.readFileSync(`${buildDir}/${boardName3}.kicad_pcb`, 'utf8');
    expect(board).toContain('(hatch_thickness 0.25)');
    expect(board).not.toContain('hatchWidth');
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName3}.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });
});

describe('bounds geometry (pcb.board passthrough)', () => {
  const boardName = 'zone_bounds';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
  });
  afterEach(() => {
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName}.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });

  it('zone/keepout/rect accept a bounds rectangle identical to the rect form', () => {
    const bounds = { left: 10, top: 20, width: 30, height: 15 };
    const a = new PcbInternalState({});
    zone(a, { net: 'GND', layers: ['F.Cu'], bounds });
    const b = new PcbInternalState({});
    zone(b, { net: 'GND', layers: ['F.Cu'], x: 10, y: 20, width: 30, height: 15 });
    expect(a.zones[0].polygon).toEqual(b.zones[0].polygon);
    expect(a.zones[0].width).toBe(30);

    const ka = new PcbInternalState({});
    keepout(ka, { layers: ['F.Cu'], bounds });
    expect(ka.keepoutZones[0].width).toBe(30);
  });

  it('zone accepts pcb.board directly and tracks the outline', () => {
    const pcb = new PCB(boardName);
    pcb.outline(127.38, 85.9, 45, 30);
    const c = padComponent();
    pcb.add(c);
    pcb.zone({ net: 'GND', bounds: pcb.board, layers: ['F.Cu', 'B.Cu'] });
    pcb.create(c);
    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    // full-outline pour: vertices at the outline corners
    expect(board).toMatch(/\(xy 127\.38 85\.9\)/);
    expect(board).toMatch(/\(xy 172\.38 115\.9\)/);
  });

  it('rejects bounds combined with x/y', () => {
    const state = new PcbInternalState({});
    zone(state, { net: 'GND', layers: ['F.Cu'], bounds: { left: 0, top: 0, width: 5, height: 5 }, x: 1 } as any);
    expect(state.zones).toHaveLength(0);
  });
});
