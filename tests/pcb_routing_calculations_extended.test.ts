import { describe, it, expect } from 'vitest';
import {
  PCB_CONSTANTS,
  calculateViaCurrentCapacity,
  calculateMinTraceWidth,
  calculateMinViaSize,
  calculateBoardBounds,
} from '../src/pcb/pcb_routing_calculations.js';
import { Component } from '../src/component.js';

describe('PCB_CONSTANTS', () => {
  it('should have expected constant values', () => {
    expect(PCB_CONSTANTS.DEFAULT_TRACK_WIDTH).toBe(0.2);
    expect(PCB_CONSTANTS.DEFAULT_CLEARANCE).toBe(0.1);
    expect(PCB_CONSTANTS.DEFAULT_COPPER_THICKNESS_UM).toBe(35);
    expect(PCB_CONSTANTS.DEFAULT_VIA_SIZE).toBe(0.6);
    expect(PCB_CONSTANTS.DEFAULT_VIA_DRILL).toBe(0.3);
    expect(PCB_CONSTANTS.DEFAULT_TEMP_RISE).toBe(10);
  });
});

describe('calculateViaCurrentCapacity', () => {
  it('should return positive current for valid via', () => {
    const current = calculateViaCurrentCapacity(0.6, 0.3);
    expect(current).toBeGreaterThan(0);
  });

  it('should increase with larger drill', () => {
    const small = calculateViaCurrentCapacity(0.6, 0.3);
    const large = calculateViaCurrentCapacity(0.8, 0.5);
    expect(large).toBeGreaterThan(small);
  });

  it('should increase with higher temp rise', () => {
    const low = calculateViaCurrentCapacity(0.6, 0.3, 35, 1.6, 10);
    const high = calculateViaCurrentCapacity(0.6, 0.3, 35, 1.6, 30);
    expect(high).toBeGreaterThan(low);
  });

  it('should increase with thicker copper', () => {
    const thin = calculateViaCurrentCapacity(0.6, 0.3, 17.5);
    const thick = calculateViaCurrentCapacity(0.6, 0.3, 70);
    expect(thick).toBeGreaterThan(thin);
  });

  it('should use default thickness when not provided', () => {
    const explicit = calculateViaCurrentCapacity(0.6, 0.3, 35);
    const implicit = calculateViaCurrentCapacity(0.6, 0.3);
    expect(explicit).toBeCloseTo(implicit, 6);
  });
});

describe('calculateMinTraceWidth', () => {
  it('should return positive width for positive current', () => {
    const width = calculateMinTraceWidth(1, 'F.Cu', 10, 35);
    expect(width).toBeGreaterThan(0);
  });

  it('should increase with higher current', () => {
    const low = calculateMinTraceWidth(0.5, 'F.Cu', 10, 35);
    const high = calculateMinTraceWidth(2, 'F.Cu', 10, 35);
    expect(high).toBeGreaterThan(low);
  });

  it('should be wider for internal layers', () => {
    const external = calculateMinTraceWidth(1, 'F.Cu', 10, 35);
    const internal = calculateMinTraceWidth(1, 'In1.Cu', 10, 35);
    expect(internal).toBeGreaterThan(external);
  });

  it('should be wider for thinner copper', () => {
    const thick = calculateMinTraceWidth(1, 'F.Cu', 10, 70);
    const thin = calculateMinTraceWidth(1, 'F.Cu', 10, 17.5);
    expect(thin).toBeGreaterThan(thick);
  });

  it('should decrease with higher temp rise', () => {
    const low = calculateMinTraceWidth(1, 'F.Cu', 10, 35);
    const high = calculateMinTraceWidth(1, 'F.Cu', 30, 35);
    expect(high).toBeLessThan(low);
  });
});

describe('calculateMinViaSize', () => {
  it('should return size larger than drill', () => {
    const result = calculateMinViaSize(1, 35);
    expect(result.size).toBeGreaterThan(result.drill);
  });

  it('should increase with higher current', () => {
    const low = calculateMinViaSize(0.5, 35);
    const high = calculateMinViaSize(2, 35);
    expect(high.drill).toBeGreaterThan(low.drill);
    expect(high.size).toBeGreaterThan(low.size);
  });

  it('should use default thickness', () => {
    const explicit = calculateMinViaSize(1, 35);
    const implicit = calculateMinViaSize(1);
    expect(explicit.drill).toBeCloseTo(implicit.drill, 6);
  });
});

describe('calculateBoardBounds', () => {
  function makeComp(x: number, y: number): Component {
    const c = new Component({
      reference: `C${x}_${y}`,
      footprint: 'Resistor_SMD:R_0603_1608Metric',
    });
    c.pcb = { x, y, rotation: 0, side: 'front' as const };
    return c;
  }

  it('should return fallback bounds for empty input', () => {
    const bounds = calculateBoardBounds([]);
    expect(bounds).toEqual({ minX: -50, maxX: 50, minY: -50, maxY: 50 });
  });

  it('should compute bounds from component positions', () => {
    const comps = [makeComp(10, 20), makeComp(30, 40)];
    const bounds = calculateBoardBounds(comps);
    expect(bounds.minX).toBeLessThanOrEqual(10);
    expect(bounds.maxX).toBeGreaterThanOrEqual(30);
    expect(bounds.minY).toBeLessThanOrEqual(20);
    expect(bounds.maxY).toBeGreaterThanOrEqual(40);
  });

  it('should prefer outlines over components', () => {
    const comps = [makeComp(100, 100)];
    const outlines = [{ x: 0, y: 0, width: 50, height: 50 }];
    const bounds = calculateBoardBounds(comps, outlines);
    expect(bounds.minX).toBe(0);
    expect(bounds.maxX).toBe(50);
  });

  it('should add padding around components', () => {
    const comps = [makeComp(50, 50)];
    const bounds = calculateBoardBounds(comps);
    expect(bounds.minX).toBeLessThan(50);
    expect(bounds.maxX).toBeGreaterThan(50);
  });

  it('should skip DNP components', () => {
    const dnp = new Component({
      reference: 'R_DNP',
      footprint: 'Resistor_SMD:R_0603_1608Metric',
      dnp: true,
    });
    dnp.pcb = { x: 999, y: 999, rotation: 0, side: 'front' as const };
    const bounds = calculateBoardBounds([dnp]);
    expect(bounds).toEqual({ minX: -50, maxX: 50, minY: -50, maxY: 50 });
  });

  it('should skip via components', () => {
    const via = Component.via({ x: 500, y: 500 });
    const bounds = calculateBoardBounds([via]);
    expect(bounds).toEqual({ minX: -50, maxX: 50, minY: -50, maxY: 50 });
  });

  it('should include staged components', () => {
    const comp1 = makeComp(10, 10);
    const comp2 = makeComp(90, 90);
    const bounds = calculateBoardBounds([comp1], undefined, [comp2]);
    expect(bounds.maxX).toBeGreaterThanOrEqual(90);
  });
});
