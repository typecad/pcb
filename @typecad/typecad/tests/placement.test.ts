import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { Component, type ComponentInit } from '../src/component.js';
import { below, above, rightOf, leftOf, sameAs, board, PlacementValue, isPlacementValue } from '../src/placement.js';
import type { PlacementBuilder, BoardBounds, SameAsResult, PlacementNumber } from '../src/placement.js';
import { PcbInternalState } from '../src/pcb/pcb_state.js';
import { Schematic } from '../src/schematic.js';
import { PCB } from '../src/pcb/pcb.js';
import { clearFootprintBoundsCache, getFootprintBounds } from '../src/pcb/footprint_bounds.js';

const buildDir = './build';

class Resistor extends Component {
  constructor(init?: ComponentInit) {
    super({ footprint: 'Resistor_SMD:R_0603_1608Metric', ...init });
  }
}

function makeComponentAt(x: number, y: number, bounds?: { width: number; height: number }): Component {
  const c = new Component({ footprint: 'Test:TestFP', pcb: { x, y } });
  if (bounds) {
    vi.spyOn(c, 'bounds', 'get').mockReturnValue(bounds);
  } else {
    vi.spyOn(c, 'bounds', 'get').mockReturnValue(null);
  }
  return c;
}

describe('placement', () => {
  describe('below()', () => {
    it('without target: returns PlacementValue that resolves edge-to-edge', () => {
      const src = makeComponentAt(10, 20, { width: 4, height: 6 });
      const result = below(src).by(3);
      expect(isPlacementValue(result)).toBe(true);
      const pv = result as PlacementValue;
      expect(pv.resolveWithFootprint('Test:TargetFP')).toBe(20 + 3 + 3 + 0);
    });

    it('PlacementValue resolves with target bounds', () => {
      const src = makeComponentAt(10, 20, { width: 4, height: 6 });
      const result = below(src).by(3) as PlacementValue;
      expect(result.resolveWithFootprint('Test:TargetFP')).toBe(20 + 3 + 3 + 0);
    });

    it('with target component: resolves edge-to-edge against target bounds', () => {
      const src = makeComponentAt(10, 20, { width: 4, height: 6 });
      const tgt = makeComponentAt(0, 0, { width: 2, height: 4 });
      const result = below(src).by(3, tgt) as PlacementValue;
      expect(result.resolveWithFootprint('Test:FP')).toBe(20 + 3 + 3 + 2);
    });

    it('uses default gap of 2mm', () => {
      const c = makeComponentAt(10, 20, { width: 4, height: 6 });
      const result = (below(c).by() as PlacementValue).resolveWithFootprint('Test:FP');
      expect(result).toBe(20 + 3 + 2 + 0);
    });

    it('falls back to zero size when source bounds are null', () => {
      const c = makeComponentAt(10, 20);
      const result = (below(c).by(5) as PlacementValue).resolveWithFootprint('Test:FP');
      expect(result).toBe(20 + 0 + 5 + 0);
    });
  });

  describe('above()', () => {
    it('without target: returns PlacementValue', () => {
      const c = makeComponentAt(10, 20, { width: 4, height: 6 });
      const result = above(c).by(3);
      expect(isPlacementValue(result)).toBe(true);
    });

    it('with target component: resolves against target bounds', () => {
      const src = makeComponentAt(10, 20, { width: 4, height: 6 });
      const tgt = makeComponentAt(0, 0, { width: 2, height: 4 });
      const result = above(src).by(3, tgt) as PlacementValue;
      expect(result.resolveWithFootprint('Test:FP')).toBe(20 - 3 - 3 - 2);
    });

    it('resolves PlacementValue edge-to-edge', () => {
      const c = makeComponentAt(10, 20, { width: 4, height: 6 });
      const result = (above(c).by(3) as PlacementValue).resolveWithFootprint('Test:FP');
      expect(result).toBe(20 - 3 - 3 - 0);
    });

    it('uses default gap of 2mm', () => {
      const c = makeComponentAt(10, 20, { width: 4, height: 6 });
      const result = (above(c).by() as PlacementValue).resolveWithFootprint('Test:FP');
      expect(result).toBe(20 - 3 - 2 - 0);
    });

    it('falls back to zero size when bounds are null', () => {
      const c = makeComponentAt(10, 20);
      const result = (above(c).by(5) as PlacementValue).resolveWithFootprint('Test:FP');
      expect(result).toBe(20 - 0 - 5 - 0);
    });
  });

  describe('rightOf()', () => {
    it('without target: returns PlacementValue', () => {
      const c = makeComponentAt(10, 20, { width: 4, height: 6 });
      const result = rightOf(c).by(3);
      expect(isPlacementValue(result)).toBe(true);
    });

    it('with target component: resolves against target bounds', () => {
      const src = makeComponentAt(10, 20, { width: 4, height: 6 });
      const tgt = makeComponentAt(0, 0, { width: 8, height: 2 });
      const result = rightOf(src).by(3, tgt) as PlacementValue;
      expect(result.resolveWithFootprint('Test:FP')).toBe(10 + 2 + 3 + 4);
    });

    it('resolves PlacementValue edge-to-edge', () => {
      const c = makeComponentAt(10, 20, { width: 4, height: 6 });
      const result = (rightOf(c).by(3) as PlacementValue).resolveWithFootprint('Test:FP');
      expect(result).toBe(10 + 2 + 3 + 0);
    });

    it('uses default gap of 2mm', () => {
      const c = makeComponentAt(10, 20, { width: 4, height: 6 });
      const result = (rightOf(c).by() as PlacementValue).resolveWithFootprint('Test:FP');
      expect(result).toBe(10 + 2 + 2 + 0);
    });
  });

  describe('leftOf()', () => {
    it('without target: returns PlacementValue', () => {
      const c = makeComponentAt(10, 20, { width: 4, height: 6 });
      const result = leftOf(c).by(3);
      expect(isPlacementValue(result)).toBe(true);
    });

    it('with target component: resolves against target bounds', () => {
      const src = makeComponentAt(10, 20, { width: 4, height: 6 });
      const tgt = makeComponentAt(0, 0, { width: 8, height: 2 });
      const result = leftOf(src).by(3, tgt) as PlacementValue;
      expect(result.resolveWithFootprint('Test:FP')).toBe(10 - 2 - 3 - 4);
    });

    it('resolves PlacementValue edge-to-edge', () => {
      const c = makeComponentAt(10, 20, { width: 4, height: 6 });
      const result = (leftOf(c).by(3) as PlacementValue).resolveWithFootprint('Test:FP');
      expect(result).toBe(10 - 2 - 3 - 0);
    });

    it('uses default gap of 2mm', () => {
      const c = makeComponentAt(10, 20, { width: 4, height: 6 });
      const result = (leftOf(c).by() as PlacementValue).resolveWithFootprint('Test:FP');
      expect(result).toBe(10 - 2 - 2 - 0);
    });
  });

  describe('sameAs()', () => {
    it('resolves to the component position', () => {
      const c = makeComponentAt(15, 25);
      const result = sameAs(c);
      expect((result.x as PlacementValue).resolveWithFootprint('Test:FP')).toBe(15);
      expect((result.y as PlacementValue).resolveWithFootprint('Test:FP')).toBe(25);
    });

    it('reflects position changes at resolve time', () => {
      const c = makeComponentAt(15, 25);
      const result = sameAs(c);
      c.pcb.x = 50;
      expect((result.x as PlacementValue).resolveWithFootprint('Test:FP')).toBe(50);
    });
  });

  describe('board()', () => {
    it('returns zero bounds when no outlines defined', () => {
      const pcb = new PCB('test', { schematic: new Schematic('test') });
      const b = board(pcb);
      expect(b.width).toBe(0);
      expect(b.height).toBe(0);
      expect(b.center).toEqual({ x: 0, y: 0 });
    });

    it('computes bounds from outlines', () => {
      const pcb = new PCB('test', { schematic: new Schematic('test') });
      pcb.outline(10, 20, 30, 40);

      const b = board(pcb);
      expect(b.left).toBe(10);
      expect(b.top).toBe(20);
      expect(b.right).toBe(40);
      expect(b.bottom).toBe(60);
      expect(b.width).toBe(30);
      expect(b.height).toBe(40);
      expect(b.center).toEqual({ x: 25, y: 40 });
    });

    it('computes corner positions', () => {
      const pcb = new PCB('test', { schematic: new Schematic('test') });
      pcb.outline(10, 20, 30, 40);

      const b = board(pcb);
      expect(b.topLeft).toEqual({ x: 10, y: 20 });
      expect(b.topRight).toEqual({ x: 40, y: 20 });
      expect(b.bottomLeft).toEqual({ x: 10, y: 60 });
      expect(b.bottomRight).toEqual({ x: 40, y: 60 });
    });

    it('handles filleted corners', () => {
      const pcb = new PCB('test', { schematic: new Schematic('test') });
      pcb.outline(0, 0, 100, 100, 5);

      const b = board(pcb);
      expect(b.left).toBeCloseTo(0, 0);
      expect(b.top).toBeCloseTo(0, 0);
      expect(b.right).toBeCloseTo(100, 0);
      expect(b.bottom).toBeCloseTo(100, 0);
    });

    it('fromLeft returns PlacementValue for edge-to-edge margin', () => {
      const pcb = new PCB('test', { schematic: new Schematic('test') });
      pcb.outline(0, 0, 100, 80);
      const b = board(pcb);

      const pv = b.fromLeft(5);
      expect(isPlacementValue(pv)).toBe(true);
      expect(pv.resolveWithFootprint('Nonexistent:FP')).toBe(5 + 0);
    });

    it('fromRight returns PlacementValue for edge-to-edge margin', () => {
      const pcb = new PCB('test', { schematic: new Schematic('test') });
      pcb.outline(0, 0, 100, 80);
      const b = board(pcb);

      const pv = b.fromRight(5);
      expect(pv.resolveWithFootprint('Nonexistent:FP')).toBe(100 - 5 - 0);
    });

    it('fromTop returns PlacementValue for edge-to-edge margin', () => {
      const pcb = new PCB('test', { schematic: new Schematic('test') });
      pcb.outline(10, 20, 30, 40);
      const b = board(pcb);

      const pv = b.fromTop(3);
      expect(pv.resolveWithFootprint('Nonexistent:FP')).toBe(20 + 3 + 0);
    });

    it('fromBottom returns PlacementValue for edge-to-edge margin', () => {
      const pcb = new PCB('test', { schematic: new Schematic('test') });
      pcb.outline(10, 20, 30, 40);
      const b = board(pcb);

      const pv = b.fromBottom(3);
      expect(pv.resolveWithFootprint('Nonexistent:FP')).toBe(60 - 3 - 0);
    });

    it('from* methods use default margin of 2mm', () => {
      const pcb = new PCB('test', { schematic: new Schematic('test') });
      pcb.outline(0, 0, 100, 80);
      const b = board(pcb);

      expect((b.fromLeft() as PlacementValue).resolveWithFootprint('Nonexistent:FP')).toBe(2);
      expect((b.fromRight() as PlacementValue).resolveWithFootprint('Nonexistent:FP')).toBe(98);
      expect((b.fromTop() as PlacementValue).resolveWithFootprint('Nonexistent:FP')).toBe(2);
      expect((b.fromBottom() as PlacementValue).resolveWithFootprint('Nonexistent:FP')).toBe(78);
    });

    it('from* resolves with actual target bounds', () => {
      const pcb = new PCB('test', { schematic: new Schematic('test') });
      pcb.outline(0, 0, 100, 80);
      const b = board(pcb);

      const c = new Component({
        footprint: 'Test:FP',
        pcb: {
          x: b.fromRight(5),
          y: b.fromBottom(3),
        },
      });

      expect(typeof c.pcb.x).toBe('number');
      expect(typeof c.pcb.y).toBe('number');
    });
  });

  describe('integration: Component constructor resolves PlacementValue', () => {
    it('resolves below() PlacementValue during construction', () => {
      const src = new Component({ footprint: 'Test:SrcFP', pcb: { x: 10, y: 20 } });
      vi.spyOn(src, 'bounds', 'get').mockReturnValue({ width: 4, height: 6 });

      const tgt = new Component({
        footprint: 'Test:TgtFP',
        pcb: {
          x: sameAs(src).x,
          y: below(src).by(5),
        },
      });
      vi.spyOn(tgt, 'bounds', 'get').mockReturnValue({ width: 2, height: 4 });

      expect(typeof tgt.pcb.x).toBe('number');
      expect(typeof tgt.pcb.y).toBe('number');
      expect(tgt.pcb.x).toBe(10);
    });

    it('resolves rightOf() PlacementValue during construction', () => {
      const src = new Component({ footprint: 'Test:SrcFP', pcb: { x: 10, y: 20 } });
      vi.spyOn(src, 'bounds', 'get').mockReturnValue({ width: 4, height: 6 });

      const tgt = new Component({
        footprint: 'Test:TgtFP',
        pcb: {
          x: rightOf(src).by(3),
          y: sameAs(src).y,
        },
      });

      expect(typeof tgt.pcb.x).toBe('number');
      expect(tgt.pcb.y).toBe(20);
    });

    it('places component at board center', () => {
      const pcb = new PCB('test', { schematic: new Schematic('test') });
      pcb.outline(0, 0, 100, 80);

      const b = board(pcb);
      const c = makeComponentAt(b.center.x, b.center.y);

      expect(c.pcb.x).toBe(50);
      expect(c.pcb.y).toBe(40);
    });
  });
});

describe('PcbInternalState.getOutlineBounds', () => {
  function makeState(): PcbInternalState {
    return new PcbInternalState({ schematic: new Schematic('test') });
  }

  it('returns null when no outlines exist', () => {
    const state = makeState();
    expect(state.getOutlineBounds()).toBeNull();
  });

  it('computes bounds from a single outline', () => {
    const state = makeState();
    state.stagedOutlines.push({
      uuid: 'test',
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      filletRadius: 0,
      elements: [
        {
          type: 'line',
          uuid: 'a',
          layer: 'Edge.Cuts',
          strokeWidth: 0.05,
          start: { x: 10, y: 20 },
          end: { x: 40, y: 20 },
          locked: false,
        },
        {
          type: 'line',
          uuid: 'b',
          layer: 'Edge.Cuts',
          strokeWidth: 0.05,
          start: { x: 40, y: 20 },
          end: { x: 40, y: 60 },
          locked: false,
        },
        {
          type: 'line',
          uuid: 'c',
          layer: 'Edge.Cuts',
          strokeWidth: 0.05,
          start: { x: 40, y: 60 },
          end: { x: 10, y: 60 },
          locked: false,
        },
        {
          type: 'line',
          uuid: 'd',
          layer: 'Edge.Cuts',
          strokeWidth: 0.05,
          start: { x: 10, y: 60 },
          end: { x: 10, y: 20 },
          locked: false,
        },
      ],
    });

    const bounds = state.getOutlineBounds()!;
    expect(bounds.minX).toBe(10);
    expect(bounds.minY).toBe(20);
    expect(bounds.maxX).toBe(40);
    expect(bounds.maxY).toBe(60);
  });

  it('computes bounds across multiple outlines', () => {
    const state = makeState();
    state.outlines.push({
      uuid: 'a',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      filletRadius: 0,
      elements: [
        {
          type: 'line',
          uuid: 'a1',
          layer: 'Edge.Cuts',
          strokeWidth: 0.05,
          start: { x: 0, y: 0 },
          end: { x: 10, y: 10 },
          locked: false,
        },
      ],
    });
    state.stagedOutlines.push({
      uuid: 'b',
      x: 50,
      y: 50,
      width: 10,
      height: 10,
      filletRadius: 0,
      elements: [
        {
          type: 'line',
          uuid: 'b1',
          layer: 'Edge.Cuts',
          strokeWidth: 0.05,
          start: { x: 50, y: 50 },
          end: { x: 60, y: 60 },
          locked: false,
        },
      ],
    });

    const bounds = state.getOutlineBounds()!;
    expect(bounds.minX).toBe(0);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxX).toBe(60);
    expect(bounds.maxY).toBe(60);
  });

  it('handles arc elements', () => {
    const state = makeState();
    state.stagedOutlines.push({
      uuid: 'arc-test',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      filletRadius: 5,
      elements: [
        {
          type: 'arc',
          uuid: 'a1',
          layer: 'Edge.Cuts',
          strokeWidth: 0.05,
          start: { x: 5, y: 0 },
          mid: { x: 10, y: 5 },
          end: { x: 5, y: 10 },
        },
      ],
    });

    const bounds = state.getOutlineBounds()!;
    expect(bounds.minX).toBe(5);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxX).toBe(10);
    expect(bounds.maxY).toBe(10);
  });
});

describe('pcb placement assignment', () => {
  it('accepts placement values on late assignment and resolves them', () => {
    const pcb = new PCB('placement_late');
    pcb.outline(0, 0, 100, 50);
    const b = board(pcb);
    const r = new Resistor();
    // late assignment with deferred values — resolves to numbers
    r.pcb = { x: b.fromLeft(10), y: b.fromTop(5) };
    expect(typeof r.pcb.x).toBe('number');
    expect(typeof r.pcb.y).toBe('number');
    expect(r.pcb.x).toBeGreaterThan(0);
    expect(r.pcb.y).toBeGreaterThan(0);
    // numbers still work
    r.pcb = { x: 5, y: 6 };
    expect(r.pcb.x).toBe(5);
    expect(r.pcb.y).toBe(6);
    // field mutation still works (no setter on nested fields)
    r.pcb.x = 7;
    expect(r.pcb.x).toBe(7);
    // rotation preserved through assignment
    r.pcb = { x: 1, y: 2, rotation: 90, side: 'back' };
    expect(r.pcb.rotation).toBe(90);
    expect(r.pcb.side).toBe('back');
  });

  it('rejects non-finite resolved coordinates on assignment', () => {
    const r = new Resistor();
    expect(() => (r.pcb = { x: NaN, y: 1 } as any)).toThrow();
    expect(() => (r.pcb = { x: 1, y: Infinity } as any)).toThrow();
  });
});

describe('placement staleness (order-independence)', () => {
  const boardName = 'placement_live';

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

  it('below() follows a target that moves after assignment (re-resolved at create)', () => {
    const pcb = new PCB(boardName);
    const r1 = new Resistor({ pcb: { x: 10, y: 10 } });
    const r2 = new Resistor();
    r2.pcb = { x: sameAs(r1).x, y: below(r1).by(3) };
    // r1 moves AFTER r2 was positioned
    r1.pcb = { x: 40, y: 50 };
    pcb.create(r1, r2);
    expect(r2.pcb.x).toBeCloseTo(40, 5);
    expect(r2.pcb.y).toBeGreaterThan(50); // below r1's final position
  });

  it('board() called before outline() resolves against the final outline', () => {
    const pcb = new PCB(boardName);
    const b = board(pcb); // captured BEFORE the outline exists
    const mh = new Resistor();
    mh.pcb = { x: b.fromLeft(5), y: b.fromTop(5) };
    pcb.outline(100, 200, 45, 30); // outline defined after everything
    pcb.create(mh);
    // resolved against the real outline: left edge 100 + 5 + half-width
    expect(mh.pcb.x).toBeGreaterThan(100);
    expect(mh.pcb.x).toBeLessThan(112);
    expect(mh.pcb.y).toBeGreaterThan(200);
    expect(mh.pcb.y).toBeLessThan(208);
  });

  it('chained stacks settle regardless of assignment order', () => {
    const pcb = new PCB(boardName);
    const r1 = new Resistor({ pcb: { x: 10, y: 10 } });
    const r2 = new Resistor();
    const r3 = new Resistor();
    // r3 below r2 below r1 — assigned before r2 is positioned
    r3.pcb = { x: sameAs(r1).x, y: below(r2).by(2) };
    r2.pcb = { x: sameAs(r1).x, y: below(r1).by(2) };
    pcb.create(r1, r2, r3);
    // stack: r3 below r2, r2 below r1 — monotonic
    expect(r2.pcb.y).toBeGreaterThan(r1.pcb.y);
    expect(r3.pcb.y).toBeGreaterThan(r2.pcb.y);
  });

  it('manual moves after a placement assignment win over re-resolution', () => {
    const pcb = new PCB(boardName);
    const r1 = new Resistor({ pcb: { x: 10, y: 10 } });
    const r2 = new Resistor();
    r2.pcb = { x: sameAs(r1).x, y: below(r1).by(3) };
    r2.pcb.x = 99; // manual nudge on one axis
    r1.pcb = { x: 40, y: 50 };
    pcb.create(r1, r2);
    expect(r2.pcb.x).toBe(99); // manual value kept
    expect(r2.pcb.y).toBeGreaterThan(50); // expression re-resolved
  });
});

describe('placement input coercion', () => {
  it('accepts sameAs() and below() results directly as pcb coordinates', () => {
    const r1 = new Resistor({ pcb: { x: 10, y: 10 } });
    const r2 = new Resistor();
    r2.pcb = { x: sameAs(r1), y: below(r1) };
    expect(typeof r2.pcb.x).toBe('number');
    expect(r2.pcb.x).toBe(10);
    expect(r2.pcb.y).toBeGreaterThan(10); // below with default gap

    // deferred: moving r1 re-resolves r2 at create
    const pcb = new PCB('coerce_test');
    r1.pcb = { x: 30, y: 40 };
    pcb.create(r1, r2);
    expect(r2.pcb.x).toBe(30);
    expect(r2.pcb.y).toBeGreaterThan(40);
  });
});

describe('rotation-aware edge placement', () => {
  it('below() accounts for the target component being rotated', () => {
    const pcb = new PCB('rot_test');
    // source 4 wide x 6 tall at (10, 20), rotated 90° → occupied Y extent is width
    const src = makeComponentAt(10, 20, { width: 4, height: 6 });
    src.pcb = { x: 10, y: 20, rotation: 90 };
    const tgt = new Resistor();
    tgt.pcb = { x: sameAs(src).x, y: below(src).by(0.5), rotation: -90 };
    // src half-Y after 90° rotation = 4/2 = 2 (not 6/2 = 3)
    const tb = getFootprintBounds('Resistor_SMD:R_0603_1608Metric')!;
    // tgt rotated -90 → occupied half-Y is its half-width
    expect(tgt.pcb.y).toBeCloseTo(20 + 2 + 0.5 + tb.width / 2, 2);
  });

  it('rightOf() accounts for source rotation', () => {
    const src = makeComponentAt(10, 20, { width: 8, height: 3 });
    src.pcb = { x: 10, y: 20, rotation: 90 };
    const result = rightOf(src).by(1) as PlacementValue;
    // rotated 90°: occupied X extent is height (3), half = 1.5 (not 4)
    expect(result.resolveWithFootprint('Test:TargetFP')).toBe(10 + 1.5 + 1 + 0);
  });

  it('board.fromTop accounts for the placed component rotation', () => {
    const pcb = new PCB('rot_board');
    pcb.outline(0, 0, 100, 50);
    const b = board(pcb);
    const r = new Resistor();
    r.pcb = { x: b.fromLeft(2), y: b.fromTop(2), rotation: 90 };
    const tb = getFootprintBounds('Resistor_SMD:R_0603_1608Metric')!;
    // rotated 90° → occupied half-Y is the half-width
    expect(r.pcb.y).toBeCloseTo(2 + tb.width / 2, 2);
  });
});

describe('off-center footprint origin (rotation around at point)', () => {
  it('below() places the physical top edge at the gap for a rotated off-center target', () => {
    // TerminalBlock-like: courtyard x[-2, 9.63], y[-3.75, 3.75] — origin near
    // pin 1, body center 3.82mm off. Rotated -90° the body extends 9.63mm
    // up from the at point and only 2.0mm down.
    const src = makeComponentAt(10, 20, { width: 5.9, height: 5.9 });
    const placed = new Resistor();
    vi.spyOn(placed, 'bounds', 'get').mockReturnValue({
      minX: -2,
      minY: -3.75,
      maxX: 9.63,
      maxY: 3.75,
      width: 11.63,
      height: 7.5,
    } as any);
    placed.pcb = { x: 0, y: 0, rotation: -90 };
    // explicit-target path reads the target's (mockable) bounds
    const y = (below(src).by(0.1, placed) as PlacementValue).resolveWithFootprint('Test:FP');
    // src bottom = 20 + 5.9/2 = 22.95. KiCad -90° maps (x,y)->(-y,x), so the
    // rotated target's occupied y rel origin = old x range [-2, 9.63]: body
    // extends 9.63mm DOWN and 2.0mm up from the at point; top edge = -2.0
    expect(y).toBeCloseTo(22.95 + 0.1 + 2.0, 2);
    // assigning it lands the at point so the physical edge gap is exactly 0.1mm
    placed.pcb = { x: 10, y: below(src).by(0.1, placed), rotation: -90 };
    expect(placed.pcb.y).toBeCloseTo(22.95 + 0.1 + 2.0, 2);
  });

  it('rotated source edge accounts for its own off-center origin', () => {
    // source courtyard x[-2, 9.63] rotated -90: (x,y)->(-y,x) puts occupied y
    // rel origin at [-2, 9.63] — the body hangs 9.63mm BELOW the at point
    const src = new Resistor();
    vi.spyOn(src, 'bounds', 'get').mockReturnValue({
      minX: -2,
      minY: -3.75,
      maxX: 9.63,
      maxY: 3.75,
      width: 11.63,
      height: 7.5,
    } as any);
    src.pcb = { x: 10, y: 20, rotation: -90 };
    const y = (below(src).by(1) as PlacementValue).resolveWithFootprint('Test:FP');
    // src bottom = 20 + 9.63; target top (Test:FP unresolvable) = 0
    expect(y).toBeCloseTo(20 + 9.63 + 1, 2);
  });

  it('board.fromTop rotation math sanity (centered R_0603)', () => {
    const pcb = new PCB('offcenter_board');
    pcb.outline(0, 0, 100, 50);
    const b = board(pcb);
    const part = new Resistor();
    part.pcb = { x: b.fromLeft(2), y: b.fromTop(1), rotation: -90 };
    const tb = getFootprintBounds('Resistor_SMD:R_0603_1608Metric')!;
    // rotated -90 → occupied half-Y is half-width; origin-centered footprint
    expect(part.pcb.y).toBeCloseTo(1 + tb.width / 2, 2);
  });
});
