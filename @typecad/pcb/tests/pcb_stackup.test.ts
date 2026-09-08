import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { serialize } from '../src/sexpr/index.js';
import {
  buildStackup,
  buildLayersNode,
  copperLayerDeclarations,
  copperLayerNames,
  validateLayerCount,
  MAX_COPPER_LAYERS,
} from '../src/pcb/pcb_stackup.js';
import { PCB } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';

const buildDir = './build';

describe('validateLayerCount', () => {
  it('accepts 2–32', () => {
    expect(() => validateLayerCount(2)).not.toThrow();
    expect(() => validateLayerCount(4)).not.toThrow();
    expect(() => validateLayerCount(MAX_COPPER_LAYERS)).not.toThrow();
  });

  it('rejects below 2 and above 32', () => {
    expect(() => validateLayerCount(1)).toThrow(RangeError);
    expect(() => validateLayerCount(33)).toThrow(RangeError);
    expect(() => validateLayerCount(0)).toThrow(RangeError);
  });

  it('rejects non-integers', () => {
    expect(() => validateLayerCount(2.5)).toThrow(RangeError);
    expect(() => validateLayerCount(NaN)).toThrow(RangeError);
  });
});

describe('copperLayerNames', () => {
  it('names 2-layer as F.Cu/B.Cu', () => {
    expect(copperLayerNames(2)).toEqual(['F.Cu', 'B.Cu']);
  });

  it('names 4-layer with inner coppers', () => {
    expect(copperLayerNames(4)).toEqual(['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']);
  });

  it('names 6-layer', () => {
    expect(copperLayerNames(6)).toEqual(['F.Cu', 'In1.Cu', 'In2.Cu', 'In3.Cu', 'In4.Cu', 'B.Cu']);
  });
});

describe('copperLayerDeclarations', () => {
  it('uses compact IDs for 2-layer (F.Cu=0, B.Cu=2)', () => {
    const decls = copperLayerDeclarations(2);
    expect(decls).toEqual([
      { id: 0, name: 'F.Cu' },
      { id: 2, name: 'B.Cu' },
    ]);
  });

  it('uses canonical IDs for 4-layer (In1=1, In2=2, B.Cu=31)', () => {
    const decls = copperLayerDeclarations(4);
    expect(decls).toEqual([
      { id: 0, name: 'F.Cu' },
      { id: 1, name: 'In1.Cu' },
      { id: 2, name: 'In2.Cu' },
      { id: 31, name: 'B.Cu' },
    ]);
  });
});

describe('buildStackup', () => {
  it('produces a 2-layer stackup matching the one_hz fixture structure', () => {
    const node = buildStackup(2, 1.6, 35);
    const out = serialize(node, { pretty: false });
    // top → bottom order
    expect(out).toContain('(layer "F.SilkS"');
    expect(out).toContain('(layer "F.Paste"');
    expect(out).toContain('(layer "F.Mask"');
    expect(out).toContain('(layer "F.Cu"');
    expect(out).toContain('(layer "dielectric 1"');
    expect(out).toContain('(layer "B.Cu"');
    expect(out).toContain('(layer "B.Mask"');
    expect(out).toContain('(layer "B.Paste"');
    expect(out).toContain('(layer "B.SilkS"');
    // materials
    expect(out).toContain('(type "copper")');
    expect(out).toContain('(thickness 0.035)');
    expect(out).toContain('(type "Top Solder Mask")');
    expect(out).toContain('(material "Dry Film")');
    expect(out).toContain('(epsilon_r 3.3)');
    // stackup-level
    expect(out).toContain('(copper_finish "None")');
    expect(out).toContain('(dielectric_constraints no)');
  });

  it('2-layer dielectric thickness sums with copper+mask to board total', () => {
    const node = buildStackup(2, 1.6, 35);
    const out = serialize(node, { pretty: false });
    // core thickness should be 1.6 - 2*0.035 - 2*0.01 = 1.51
    expect(out).toContain('(thickness 1.51)');
  });

  it('produces 4 copper + 3 dielectric layers for a 4-layer board', () => {
    const node = buildStackup(4, 1.6, 35);
    const out = serialize(node, { pretty: false });
    expect(out).toContain('(layer "In1.Cu"');
    expect(out).toContain('(layer "In2.Cu"');
    expect(out).toContain('(layer "dielectric 1"');
    expect(out).toContain('(layer "dielectric 2"');
    expect(out).toContain('(layer "dielectric 3"');
  });

  it('4-layer dielectric types alternate prepreg/core/prepreg', () => {
    const node = buildStackup(4, 1.6, 35);
    const out = serialize(node, { pretty: false });
    // dielectric 1 (outer) = prepreg, dielectric 2 (middle) = core, dielectric 3 (outer) = prepreg
    const d1Idx = out.indexOf('dielectric 1');
    const d2Idx = out.indexOf('dielectric 2');
    const d3Idx = out.indexOf('dielectric 3');
    const segment1 = out.slice(d1Idx, d2Idx);
    const segment2 = out.slice(d2Idx, d3Idx);
    const segment3 = out.slice(d3Idx);
    expect(segment1).toContain('(type "prepreg")');
    expect(segment2).toContain('(type "core")');
    expect(segment3).toContain('(type "prepreg")');
  });

  it('honors copper_finish override', () => {
    const node = buildStackup(2, 1.6, 35, { copper_finish: 'ENIG' });
    expect(serialize(node, { pretty: false })).toContain('(copper_finish "ENIG")');
  });

  it('honors dielectric_constraints override', () => {
    const node = buildStackup(2, 1.6, 35, { dielectric_constraints: true });
    expect(serialize(node, { pretty: false })).toContain('(dielectric_constraints yes)');
  });
});

describe('buildLayersNode', () => {
  it('2-layer declares F.Cu, B.Cu, and standard technical layers', () => {
    const node = buildLayersNode(2);
    const out = serialize(node, { pretty: false });
    expect(out).toContain('(0 "F.Cu" signal)');
    expect(out).toContain('(2 "B.Cu" signal)');
    expect(out).toContain('"F.Mask"');
    expect(out).toContain('"Edge.Cuts"');
    expect(out).toContain('"F.SilkS"');
  });

  it('4-layer declares inner coppers', () => {
    const node = buildLayersNode(4);
    const out = serialize(node, { pretty: false });
    expect(out).toContain('(0 "F.Cu" signal)');
    expect(out).toContain('(1 "In1.Cu" signal)');
    expect(out).toContain('(2 "In2.Cu" signal)');
    expect(out).toContain('(31 "B.Cu" signal)');
  });
});

describe('PCB create() with stackup', () => {
  const boardName = 'stackup_create';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName}.${ext}`);
      } catch {
        /* ignore */
      }
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

  it('writes a 4-layer stackup and matching layers block to the .kicad_pcb', () => {
    const pcb = new PCB(boardName);
    pcb.stackup(4);

    const c = new Component('test:pad');
    c.reference = 'R1';
    c.pins = [c.pin(1)];
    c.pcb = { x: 10, y: 10 } as any;
    vi.spyOn(c, 'footprint_lib').mockReturnValue(
      '(footprint (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu"))) ' as any,
    );
    pcb.add(c);
    pcb.create(c);

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    // stackup present with inner layers
    expect(board).toContain('(stackup');
    expect(board).toContain('(layer "In1.Cu"');
    expect(board).toContain('(layer "In2.Cu"');
    // layers declaration block matches
    expect(board).toContain('(1 "In1.Cu" signal)');
    expect(board).toContain('(2 "In2.Cu" signal)');
    expect(board).toContain('(31 "B.Cu" signal)');
    // copper finish default
    expect(board).toContain('(copper_finish "None")');
  });

  it('wires pcb.thickness into (general (thickness ...))', () => {
    const pcb = new PCB(boardName, { thickness: 2.0 });
    pcb.stackup(2);
    const c = new Component('test:pad');
    c.reference = 'R1';
    c.pins = [c.pin(1)];
    c.pcb = { x: 10, y: 10 } as any;
    vi.spyOn(c, 'footprint_lib').mockReturnValue(
      '(footprint (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu"))) ' as any,
    );
    pcb.add(c);
    pcb.create(c);

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(board).toContain('(thickness 2)');
  });

  it('does not emit a stackup when pcb.stackup() is not called', () => {
    const pcb = new PCB(boardName);
    const c = new Component('test:pad');
    c.reference = 'R1';
    c.pins = [c.pin(1)];
    c.pcb = { x: 10, y: 10 } as any;
    vi.spyOn(c, 'footprint_lib').mockReturnValue(
      '(footprint (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu"))) ' as any,
    );
    pcb.add(c);
    pcb.create(c);

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(board).not.toContain('(stackup');
  });

  it('PCB.stackup validates layer count', () => {
    const pcb = new PCB(boardName);
    expect(() => pcb.stackup(1)).toThrow(RangeError);
    expect(() => pcb.stackup(33)).toThrow(RangeError);
  });
});
