import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateAperture, parseApertureTemplate } from '../src/gerber_viewer/gerber/apertures.js';
import { parseCoordinate, parseGerber } from '../src/gerber_viewer/gerber/parse_gerber.js';
import type { FormatSpec } from '../src/gerber_viewer/gerber/types.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gerber');
const read = (name: string) => fs.readFileSync(path.join(fixtures, name), 'utf8');

describe('parseCoordinate', () => {
  const spec = (zeroMode: 'L' | 'T', i = 3, d = 6): FormatSpec => ({
    zeroMode,
    notation: 'A',
    integerDigits: i,
    decimalDigits: d,
  });

  it('scales leading-zero-omitted coordinates', () => {
    expect(parseCoordinate('1000000', spec('L'))).toBe(1);
    expect(parseCoordinate('-000005', spec('L'))).toBe(-0.000005);
    expect(parseCoordinate('5', spec('L'))).toBeCloseTo(0.000005, 9);
  });

  it('pads trailing-zero-omitted coordinates', () => {
    // T mode: written digits are the most significant; '5', '5000' and '500000'
    // all denote the same 9-digit raw value 500000000 (= 500)
    expect(parseCoordinate('5', spec('T'))).toBe(500);
    expect(parseCoordinate('5000', spec('T'))).toBe(500);
    expect(parseCoordinate('5025', spec('T'))).toBe(502.5);
  });

  it('accepts decimal-point coordinates', () => {
    expect(parseCoordinate('-1.25', spec('L'))).toBe(-1.25);
  });
});

describe('parseApertureTemplate', () => {
  it('parses circle/rect/obround/polygon with holes', () => {
    expect(parseApertureTemplate('C,0.5')).toEqual({ kind: 'circle', diameter: 0.5, hole: null });
    expect(parseApertureTemplate('C,0.5X0.2')).toEqual({
      kind: 'circle',
      diameter: 0.5,
      hole: { diameter: 0.2 },
    });
    expect(parseApertureTemplate('R,1X2')).toEqual({ kind: 'rect', width: 1, height: 2, hole: null });
    expect(parseApertureTemplate('O,2X1')).toEqual({ kind: 'obround', width: 2, height: 1, hole: null });
    expect(parseApertureTemplate('P,1.6X6X30')).toEqual({
      kind: 'polygon',
      outerDiameter: 1.6,
      vertices: 6,
      rotation: 30,
      hole: null,
    });
  });

  it('routes unknown names to macro templates', () => {
    expect(parseApertureTemplate('DONUT,2.4X1.0')).toEqual({
      kind: 'macro',
      name: 'DONUT',
      modifiers: [2.4, 1.0],
    });
  });
});

describe('parseGerber (traces fixture)', () => {
  const image = parseGerber(read('traces.gbr'), { name: 'traces.gbr' });

  it('reads units and format', () => {
    expect(image.units).toBe('mm');
    expect(image.format.integerDigits).toBe(3);
    expect(image.format.decimalDigits).toBe(6);
    expect(image.format.zeroMode).toBe('L');
  });

  it('defines four apertures', () => {
    expect([...image.apertures.keys()].sort((a, b) => a - b)).toEqual([10, 11, 12, 13]);
  });

  it('chains consecutive D01s into one trace', () => {
    const traces = image.ops.filter((op) => op.type === 'trace');
    expect(traces.length).toBe(1);
    const trace = traces[0]!;
    expect(trace.aperture).toBe(10);
    expect(trace.from).toEqual({ x: 1, y: 1 });
    expect(trace.segments.length).toBe(3);
    expect(trace.segments[0]).toEqual({ kind: 'line', to: { x: 3, y: 1 } });
    expect(trace.segments[1]).toEqual({ kind: 'line', to: { x: 3, y: 2 } });
  });

  it('resolves the multi-quadrant arc center from I/J', () => {
    const trace = image.ops.find((op) => op.type === 'trace') as Extract<(typeof image.ops)[number], { type: 'trace' }>;
    const arc = trace.segments[2]!;
    expect(arc.kind).toBe('arc');
    if (arc.kind === 'arc') {
      expect(arc.center).toEqual({ x: 3.5, y: 2 });
      expect(arc.to).toEqual({ x: 4, y: 2 });
      expect(arc.ccw).toBe(false); // G02
    }
  });

  it('records flashes with their apertures', () => {
    const flashes = image.ops.filter((op) => op.type === 'flash');
    expect(flashes).toHaveLength(2);
    expect(flashes[0]).toMatchObject({ aperture: 11, at: { x: 5, y: 3 } });
    expect(flashes[1]).toMatchObject({ aperture: 13, at: { x: 6, y: 3 } });
  });

  it('collects regions with dark and clear polarity', () => {
    const regions = image.ops.filter((op) => op.type === 'region');
    expect(regions).toHaveLength(2);
    expect(regions[0]!.polarity).toBe('dark');
    expect(regions[0]!.contours).toHaveLength(1);
    expect(regions[0]!.contours[0]!.segments).toHaveLength(3);
    expect(regions[1]!.polarity).toBe('clear');
    expect(regions[1]!.contours[0]!.start).toEqual({ x: 1.5, y: 4.2 });
  });
});

describe('parseGerber (edge + macro fixtures)', () => {
  it('parses a region-only outline without apertures', () => {
    const image = parseGerber(read('edge.gbr'));
    expect(image.ops).toHaveLength(1);
    const region = image.ops[0]!;
    expect(region.type).toBe('region');
    expect((region as { contours: { segments: unknown[] }[] }).contours[0]!.segments).toHaveLength(3);
  });

  it('evaluates aperture macros with variable arithmetic', () => {
    const image = parseGerber(read('macro.gbr'));
    const aperture = image.apertures.get(14);
    expect(aperture?.template.kind).toBe('macro');
    const evaluated = evaluateAperture(aperture!, image.macros);
    // $1 = 2.4 + 1.0 = 3.4 outer, $2 = 1.0 cut
    expect(evaluated.primitives).toHaveLength(2);
    expect(evaluated.primitives[0]).toMatchObject({ kind: 'circle', diameter: 3.4, exposure: true });
    expect(evaluated.primitives[1]).toMatchObject({ kind: 'circle', diameter: 1, exposure: false });
    expect(evaluated.warnings).toEqual([]);
  });
});

describe('parseGerber (synthetic edge cases)', () => {
  it('carries %TO.N/%TO.P object attributes onto ops and clears them on %TD', () => {
    const source = [
      '%FSLAX36Y36*%',
      '%MOMM*%',
      '%ADD10C,1*%',
      '%TO.N,"GND"*%',
      'D10*',
      'X1000000Y1000000D02*',
      'X2000000Y1000000D01*',
      '%TD*%',
      '%TO.P,U1,3*%',
      'X3000000Y2000000D03*',
      'M02*',
    ].join('\n');
    const parsed = parseGerber(source);
    const trace = parsed.ops[0] as { type: string; net?: string };
    expect(trace.type).toBe('trace');
    expect(trace.net).toBe('GND');
    const flash = parsed.ops[1] as { type: string; ref?: string; pin?: string; net?: string };
    expect(flash.type).toBe('flash');
    expect(flash.ref).toBe('U1');
    expect(flash.pin).toBe('3');
    expect(flash.net).toBeUndefined(); // %TD cleared the net before the flash
  });

  it('handles full-circle arcs in multi-quadrant mode', () => {
    const source = [
      '%FSLAX36Y36*%',
      '%MOMM*%',
      '%ADD10C,1*%',
      'G75*',
      'D10*',
      'X1000000Y1000000D02*',
      'G03X1000000Y1000000I500000J0D01*',
      'M02*',
    ].join('\n');
    const image = parseGerber(source);
    const trace = image.ops[0] as { type: string; segments: { kind: string; center: { x: number; y: number } }[] };
    expect(trace.type).toBe('trace');
    expect(trace.segments[0]!.kind).toBe('arc');
    expect(trace.segments[0]!.center).toEqual({ x: 1.5, y: 1 });
  });

  it('picks the valid center for single-quadrant arcs', () => {
    const source = [
      '%FSLAX36Y36*%',
      '%MOMM*%',
      '%ADD10C,1*%',
      'G74*',
      'D10*',
      'X1000000Y1000000D02*',
      'G02X1500000Y1500000I500000J0D01*',
      'M02*',
    ].join('\n');
    const image = parseGerber(source);
    const trace = image.ops[0] as { segments: { kind: string; center: { x: number; y: number } }[] };
    expect(trace.segments[0]!.kind).toBe('arc');
    expect(trace.segments[0]!.center).toEqual({ x: 1.5, y: 1 });
  });

  it('warns about unsupported constructs instead of throwing', () => {
    const source = [
      'G04 test*',
      '%FSLAX36Y36*%',
      '%MOMM*%',
      '%SR3X1I2.0J0*%',
      '%LRA30*%',
      '%ADD10C,1*%',
      'D10*',
      'X1000000Y1000000D02*',
      'X2000000Y1000000D01*',
      'M02*',
    ].join('\n');
    const image = parseGerber(source);
    expect(image.warnings.some((w) => w.includes('step-and-repeat'))).toBe(true);
    expect(image.warnings.some((w) => w.includes('%LRA30'))).toBe(true);
    expect(image.ops).toHaveLength(1);
  });
});
