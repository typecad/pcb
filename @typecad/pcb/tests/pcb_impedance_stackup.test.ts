import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { serialize } from '../src/sexpr/index.js';
import { buildStackup, resolveStackupGeometry, copperLayerNames } from '../src/pcb/pcb_stackup.js';
import {
  impedanceOfWidth,
  widthForImpedance,
  widthForImpedanceWithinTolerance,
  stackupImpedanceGeometry,
} from '../src/pcb/pcb_impedance.js';
import { PCB } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';
import { detectInnerCopperLayers } from '../src/gitdiff/utils/file-utils.js';
import { extractStackup } from '../src/cli/docgen/utils/pcbLayerRenderer.js';

const buildDir = './build';

describe('stackup per-layer overrides', () => {
  it('applies thickness/material/epsilon_r to a named dielectric', () => {
    const node = buildStackup(4, 1.6, 35, {
      layers: { 'dielectric 2': { thickness: 0.5, epsilon_r: 4.3, material: 'Rogers 4350B' } },
    });
    const out = serialize(node);
    expect(out).toContain('(layer "dielectric 2"');
    expect(out).toContain('0.5');
    expect(out).toContain('4.3');
    expect(out).toContain('Rogers 4350B');
  });

  it('keeps the board total thickness when a dielectric is overridden', () => {
    const geometry = resolveStackupGeometry(4, 1.6, 35, {
      'dielectric 2': { thickness: 0.5 },
    });
    const dielectricTotal = geometry.dielectrics.reduce((a, d) => a + d.thicknessMm, 0);
    const copperTotal = geometry.copperThicknessMm.reduce((a, b) => a + b, 0);
    expect(dielectricTotal + copperTotal + 2 * geometry.maskThicknessMm).toBeCloseTo(1.6, 2);
  });

  it('matches the JLCPCB preset geometry when no overrides are given', () => {
    const geometry = resolveStackupGeometry(4, 1.6, 35);
    expect(geometry.dielectrics.map((d) => d.type)).toEqual(['prepreg', 'core', 'prepreg']);
    expect(geometry.dielectrics.every((d) => d.material === 'FR4' && d.epsilonR === 4.5)).toBe(true);
    const total =
      geometry.dielectrics.reduce((a, d) => a + d.thicknessMm, 0) +
      geometry.copperThicknessMm.reduce((a, b) => a + b, 0) +
      2 * geometry.maskThicknessMm;
    expect(total).toBeCloseTo(1.6, 2);
  });

  it('rejects unknown names and non-positive thicknesses', () => {
    expect(() => buildStackup(4, 1.6, 35, { layers: { 'dielectric 9': { thickness: 0.2 } } })).toThrow(RangeError);
    expect(() => buildStackup(4, 1.6, 35, { layers: { 'In1.Cu': { thickness: -0.1 } } })).toThrow(RangeError);
    // not a layer of a 2-layer board
    expect(() => buildStackup(2, 1.6, 35, { layers: { 'In1.Cu': { thickness: 0.2 } } })).toThrow(RangeError);
  });

  it('rejects overrides that leave no room for the remaining dielectrics', () => {
    expect(() => buildStackup(4, 1.6, 35, { layers: { 'dielectric 1': { thickness: 1.55 } } })).toThrow(/leave only/);
  });
});

describe('impedance width calculation', () => {
  const pcb = new PCB('impedance_board', { layers: 4 });

  it('computes a realistic 50Ω microstrip width on F.Cu', () => {
    const w = pcb.impedanceWidth('F.Cu', 50);
    expect(w).toBeGreaterThan(0.1);
    expect(w).toBeLessThan(1.0);
    // round-trip: the computed width lands within 10% of the target
    const geom = stackupImpedanceGeometry(pcb.stackupGeometry, 'F.Cu')!;
    expect(impedanceOfWidth(w, geom)).toBeGreaterThan(45);
    expect(impedanceOfWidth(w, geom)).toBeLessThan(55);
  });

  it('computes a realistic 50Ω stripline width on an inner layer', () => {
    const geom = stackupImpedanceGeometry(pcb.stackupGeometry, 'In1.Cu')!;
    expect(geom.model).toBe('stripline');
    const w = widthForImpedance(50, geom);
    const z = impedanceOfWidth(w, geom);
    expect(z).toBeGreaterThan(45);
    expect(z).toBeLessThan(55);
  });

  it('yields narrower traces for higher dielectric constants', () => {
    const low = widthForImpedance(50, { model: 'microstrip', copperThicknessMm: 0.035, epsilonR: 3.8, hMm: 0.21 });
    const high = widthForImpedance(50, { model: 'microstrip', copperThicknessMm: 0.035, epsilonR: 4.8, hMm: 0.21 });
    expect(high).toBeLessThan(low);
  });

  it('rejects unknown layers and unreachable targets', () => {
    expect(() => pcb.impedanceWidth('In9.Cu', 50)).toThrow(RangeError);
    expect(() => pcb.impedanceWidth('F.Cu', 1)).toThrow(RangeError);
    expect(() => pcb.impedanceWidth('F.Cu', 0)).toThrow(RangeError);
  });

  it('honors stackup overrides in the geometry', () => {
    const tuned = new PCB('impedance_tuned', { layers: 4 });
    tuned.stackup(4, { layers: { 'dielectric 1': { thickness: 0.1, epsilon_r: 3.0 } } });
    const wDefault = pcb.impedanceWidth('F.Cu', 50);
    const wTuned = tuned.impedanceWidth('F.Cu', 50);
    // thinner, lower-εr dielectric → narrower 50Ω trace
    expect(wTuned).toBeLessThan(wDefault);
  });

  it('snaps to a fabrication grid within the tolerance band', () => {
    const geom = stackupImpedanceGeometry(pcb.stackupGeometry, 'F.Cu')!;
    const exact = widthForImpedance(50, geom);
    const snapped = widthForImpedanceWithinTolerance(50, 5, geom);

    // grid-multiple (0.01mm) and within 50±5Ω
    expect(Math.round(snapped * 100) / 100).toBe(snapped);
    expect(Math.abs(snapped - exact)).toBeLessThanOrEqual(0.011);
    const z = impedanceOfWidth(snapped, geom);
    expect(Math.abs(z - 50)).toBeLessThanOrEqual(5);
  });

  it('returns the exact width when tolerance is zero', () => {
    const geom = stackupImpedanceGeometry(pcb.stackupGeometry, 'F.Cu')!;
    expect(widthForImpedanceWithinTolerance(50, 0, geom)).toBe(widthForImpedance(50, geom));
  });

  it('rejects invalid tolerances and grids', () => {
    const geom = stackupImpedanceGeometry(pcb.stackupGeometry, 'F.Cu')!;
    expect(() => widthForImpedanceWithinTolerance(50, -1, geom)).toThrow(RangeError);
    expect(() => widthForImpedanceWithinTolerance(50, 5, geom, 0)).toThrow(RangeError);
  });

  it('impedanceWidth accepts the optional tolerance', () => {
    const w = pcb.impedanceWidth('F.Cu', 50, 5);
    const geom = stackupImpedanceGeometry(pcb.stackupGeometry, 'F.Cu')!;
    expect(Math.abs(impedanceOfWidth(w, geom) - 50)).toBeLessThanOrEqual(5);
  });
});

describe('impedance-constrained routing', () => {
  class Connector extends Component {
    constructor() {
      super('Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical');
    }
  }

  const boardName = 'impedance_route';

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

  it('widens autorouted traces to meet the impedance target', () => {
    const pcb = new PCB(boardName, { layers: 4 });
    pcb.outline(0, 0, 50, 40);
    const c1 = new Connector();
    const c2 = new Connector();
    c1.pcb.x = 10;
    c1.pcb.y = 10;
    c2.pcb.x = 30;
    c2.pcb.y = 15;
    pcb.add(c1, c2);
    const net = pcb.net(c1.pin(1), c2.pin(1));

    const expectedWidth = pcb.impedanceWidth('F.Cu', 50);
    const result = pcb.route(net, { impedance: { target: 50, tolerance: 5 } } as any);
    pcb.waitForPendingAutoroutes();

    expect(result.success).toBe(true);
    const widths: number[] = [];
    for (const track of Array.from(result)) {
      for (const el of track.getElements()) {
        const width = (el.details as { width?: number } | undefined)?.width;
        if (typeof width === 'number') widths.push(width);
      }
    }
    expect(widths.length).toBeGreaterThan(0);
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(expectedWidth - 0.0015);
  });
});

describe('renderers handle inner copper layers', () => {
  function writeTempBoard(content: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-render-'));
    const file = path.join(dir, 'board.kicad_pcb');
    fs.writeFileSync(file, content, 'utf8');
    return file;
  }

  const fourLayerBoard = [
    '(kicad_pcb (version 20241229)',
    '  (layers',
    '    (0 "F.Cu" signal) (1 "In1.Cu" signal) (2 "In2.Cu" signal) (31 "B.Cu" signal)',
    '  )',
    '  (setup',
    '    (stackup',
    '      (layer "F.Cu" (type "copper") (thickness 0.035))',
    '      (layer "dielectric 1" (type "prepreg") (thickness 0.21) (material "FR4") (epsilon_r 4.5))',
    '      (layer "In1.Cu" (type "copper") (thickness 0.035))',
    '      (layer "dielectric 2" (type "core") (thickness 1.065) (material "FR4") (epsilon_r 4.5))',
    '      (layer "In2.Cu" (type "copper") (thickness 0.035))',
    '      (layer "dielectric 3" (type "prepreg") (thickness 0.21) (material "FR4") (epsilon_r 4.5))',
    '      (layer "B.Cu" (type "copper") (thickness 0.035))',
    '    )',
    '  )',
    ')',
  ].join('\n');

  it('gitdiff detectInnerCopperLayers finds inner layers of a 4-layer board', () => {
    const file = writeTempBoard(fourLayerBoard);
    expect(detectInnerCopperLayers(file)).toEqual(['In1.Cu', 'In2.Cu']);
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  it('docgen extractStackup parses inner copper entries with materials', async () => {
    const file = writeTempBoard(fourLayerBoard);
    const result = await extractStackup(file, true);
    expect(result.success).toBe(true);
    const layers = result.data?.layers ?? [];
    const names = layers.map((l) => l.name);
    for (const expected of [...copperLayerNames(4), 'dielectric 1', 'dielectric 2', 'dielectric 3']) {
      expect(names).toContain(expected);
    }
    const in1 = layers.find((l) => l.name === 'In1.Cu');
    expect(in1?.type).toBe('copper');
    expect(in1?.thickness).toBeCloseTo(0.035, 4);
    const core = layers.find((l) => l.name === 'dielectric 2');
    expect(core?.material).toBe('FR4');
    expect(core?.epsilon_r).toBeCloseTo(4.5, 3);
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });
});
