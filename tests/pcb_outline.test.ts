import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { PCB } from '../src/pcb/pcb.js';
import { getPcbState } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';

const buildDir = './build';

function makeFootprintedComponent(ref: string, x: number, y: number): Component {
  const c = new Component('test:pad');
  c.reference = ref;
  c.pins = [c.pin(1)];
  c.pcb = { x, y } as any;
  vi.spyOn(c, 'footprint_lib').mockReturnValue(
    '(footprint (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu"))) ' as any,
  );
  return c;
}

describe('outlinePolygon', () => {
  it('stages a single gr_poly element on Edge.Cuts', () => {
    const pcb = new PCB('op');
    pcb.outlinePolygon([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 50, y: 100 },
      { x: 0, y: 80 },
    ]);
    const staged = getPcbState(pcb).stagedOutlines;
    expect(staged).toHaveLength(1);
    expect(staged[0].elements).toHaveLength(1);
    const el = staged[0].elements[0];
    expect(el.type).toBe('poly');
    expect(el.layer).toBe('Edge.Cuts');
    expect((el as any).points).toHaveLength(5);
  });

  it('rejects fewer than 3 points', () => {
    const pcb = new PCB('op');
    expect(() =>
      pcb.outlinePolygon([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toThrow(RangeError);
    expect(() => pcb.outlinePolygon([])).toThrow(RangeError);
  });
});

describe('outlineCircle', () => {
  it('stages a gr_circle element on Edge.Cuts with center and end (radius)', () => {
    const pcb = new PCB('oc');
    pcb.outlineCircle(50, 50, 30);
    const el = getPcbState(pcb).stagedOutlines[0].elements[0];
    expect(el.type).toBe('circle');
    expect(el.layer).toBe('Edge.Cuts');
    expect((el as any).center).toEqual({ x: 50, y: 50 });
    expect((el as any).end).toEqual({ x: 80, y: 50 }); // center + radius on X
  });

  it('rejects non-positive radius', () => {
    const pcb = new PCB('oc');
    expect(() => pcb.outlineCircle(0, 0, 0)).toThrow(RangeError);
    expect(() => pcb.outlineCircle(0, 0, -5)).toThrow(RangeError);
  });
});

describe('cutout / cutoutCircle', () => {
  it('cutout stages a polygon on Edge.Cuts', () => {
    const pcb = new PCB('ct');
    pcb.cutout([
      { x: 20, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 40 },
      { x: 20, y: 40 },
    ]);
    const el = getPcbState(pcb).stagedOutlines[0].elements[0];
    expect(el.type).toBe('poly');
    expect(el.layer).toBe('Edge.Cuts');
  });

  it('cutoutCircle stages a circle on Edge.Cuts', () => {
    const pcb = new PCB('ct');
    pcb.cutoutCircle(25, 25, 3);
    const el = getPcbState(pcb).stagedOutlines[0].elements[0];
    expect(el.type).toBe('circle');
    expect((el as any).center).toEqual({ x: 25, y: 25 });
  });
});

describe('outlinePath builder', () => {
  it('accumulates line and arc segments and closes the chain', () => {
    const pcb = new PCB('opb');
    pcb.outlinePath(0, 0).lineTo(100, 0).arcTo(100, 80, { x: 150, y: 40 }).lineTo(0, 80).close();
    const elements = getPcbState(pcb).stagedOutlines[0].elements;
    // 3 explicit segments + 1 auto-close line = 4
    expect(elements).toHaveLength(4);
    expect(elements[0].type).toBe('line');
    expect(elements[1].type).toBe('arc');
    expect(elements[2].type).toBe('line');
    expect(elements[3].type).toBe('line'); // auto-close
    // last segment ends at start
    const last = elements[3] as any;
    expect(last.end).toEqual({ x: 0, y: 0 });
  });

  it('does not add a closing line when already at start', () => {
    const pcb = new PCB('opb2');
    pcb.outlinePath(0, 0).lineTo(10, 0).lineTo(10, 10).lineTo(0, 0).close();
    const elements = getPcbState(pcb).stagedOutlines[0].elements;
    expect(elements).toHaveLength(3); // no auto-close needed
  });

  it('throws if modified after close', () => {
    const pcb = new PCB('opb3');
    const p = pcb.outlinePath(0, 0).lineTo(10, 0);
    p.close();
    expect(() => p.lineTo(20, 0)).toThrow();
  });
});

describe('getOutlineBounds with new shapes', () => {
  it('circle bounds are center ± radius', () => {
    const pcb = new PCB('ob');
    pcb.outlineCircle(50, 60, 40);
    const b = pcb.board;
    expect(b.center.x).toBeCloseTo(50, 5);
    expect(b.center.y).toBeCloseTo(60, 5);
    expect(b.width).toBeCloseTo(80, 5);
    expect(b.height).toBeCloseTo(80, 5);
  });

  it('polygon bounds are the min/max of points', () => {
    const pcb = new PCB('ob2');
    pcb.outlinePolygon([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 100 },
      { x: 10, y: 100 },
    ]);
    const b = pcb.board;
    expect(b.left).toBeCloseTo(10, 5);
    expect(b.right).toBeCloseTo(110, 5);
    expect(b.width).toBeCloseTo(100, 5);
    expect(b.height).toBeCloseTo(80, 5);
  });
});

describe('PCB create() with arbitrary outlines', () => {
  const boardName = 'outline_create';

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

  it('writes a polygon outline as gr_poly on Edge.Cuts', () => {
    const pcb = new PCB(boardName);
    pcb.outlinePolygon([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 0, y: 50 },
    ]);
    const c = makeFootprintedComponent('R1', 10, 10);
    pcb.add(c);
    pcb.create(c);

    const b = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(b).toContain('(gr_poly');
    expect(b).toContain('(layer "Edge.Cuts")');
    expect(b).toContain('(xy 0 0)');
    expect(b).toContain('(xy 50 50)');
  });

  it('writes a circular board as gr_circle on Edge.Cuts', () => {
    const pcb = new PCB(boardName);
    pcb.outlineCircle(50, 50, 50);
    const c = makeFootprintedComponent('R1', 50, 50);
    pcb.add(c);
    pcb.create(c);

    const b = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(b).toContain('(gr_circle');
    expect(b).toContain('(center 50 50)');
    expect(b).toContain('(layer "Edge.Cuts")');
  });

  it('writes outline + cutout as two separate Edge.Cuts contours', () => {
    const pcb = new PCB(boardName);
    pcb.outline(0, 0, 100, 100);
    pcb.cutoutCircle(20, 20, 3);
    const c = makeFootprintedComponent('R1', 50, 50);
    pcb.add(c);
    pcb.create(c);

    const b = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    // outer rectangle: 4 gr_line segments on Edge.Cuts
    const edgeCutsCount = (b.match(/\(layer "Edge\.Cuts"\)/g) || []).length;
    expect(edgeCutsCount).toBeGreaterThanOrEqual(5); // 4 rect lines + 1 cutout circle
    expect(b).toContain('(gr_circle');
    expect(b).toContain('(center 20 20)');
  });

  it('writes a path-built outline as gr_line + gr_arc on Edge.Cuts', () => {
    const pcb = new PCB(boardName);
    pcb.outlinePath(0, 0).lineTo(80, 0).arcTo(80, 80, { x: 120, y: 40 }).lineTo(0, 80).close();
    const c = makeFootprintedComponent('R1', 40, 40);
    pcb.add(c);
    pcb.create(c);

    const b = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(b).toContain('(gr_line');
    expect(b).toContain('(gr_arc');
    expect(b).toContain('(mid 120 40)');
  });
});
