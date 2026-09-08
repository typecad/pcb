import { describe, it, expect } from 'vitest';
import {
  calculateViaCurrentCapacity,
  calculateMinTraceWidth,
  calculateBoardBounds,
  PCB_CONSTANTS,
} from '../src/pcb/pcb_routing_calculations.js';

describe('PCB_CONSTANTS', () => {
  it('should have expected constant values', () => {
    expect(PCB_CONSTANTS.DEFAULT_TRACK_WIDTH).toBe(0.2);
    expect(PCB_CONSTANTS.DEFAULT_CLEARANCE).toBe(0.1);
    expect(PCB_CONSTANTS.DEFAULT_COPPER_THICKNESS_UM).toBe(35);
    expect(PCB_CONSTANTS.MILS_PER_OZ).toBeCloseTo(1.378, 3);
    expect(PCB_CONSTANTS.DEFAULT_TEMP_RISE).toBe(10);
    expect(PCB_CONSTANTS.DEFAULT_VIA_SIZE).toBe(0.6);
    expect(PCB_CONSTANTS.DEFAULT_VIA_DRILL).toBe(0.3);
    expect(PCB_CONSTANTS.SCHEMATIC_GRID_UNIT).toBe(2.54);
  });
});

describe('calculateViaCurrentCapacity', () => {
  it('should return positive current for standard via', () => {
    const current = calculateViaCurrentCapacity(0.6, 0.3);
    expect(current).toBeGreaterThan(0);
  });

  it('should return higher current for larger via', () => {
    const small = calculateViaCurrentCapacity(0.6, 0.3);
    const large = calculateViaCurrentCapacity(1.0, 0.6);
    expect(large).toBeGreaterThan(small);
  });

  it('should return higher current with higher temperature rise', () => {
    const low = calculateViaCurrentCapacity(0.6, 0.3, 35, undefined, 10);
    const high = calculateViaCurrentCapacity(0.6, 0.3, 35, undefined, 30);
    expect(high).toBeGreaterThan(low);
  });

  it('should return higher current with thicker copper', () => {
    const thin = calculateViaCurrentCapacity(0.6, 0.3, 17.5);
    const thick = calculateViaCurrentCapacity(0.6, 0.3, 70);
    expect(thick).toBeGreaterThan(thin);
  });

  it('should use default thickness when not provided', () => {
    const withDefault = calculateViaCurrentCapacity(0.6, 0.3);
    const explicit = calculateViaCurrentCapacity(0.6, 0.3, 35);
    expect(withDefault).toBeCloseTo(explicit, 10);
  });
});

describe('calculateMinTraceWidth', () => {
  it('should return positive width for any positive current', () => {
    const width = calculateMinTraceWidth(0.5, 'F.Cu', 10, 35);
    expect(width).toBeGreaterThan(0);
  });

  it('should require wider trace for higher current', () => {
    const low = calculateMinTraceWidth(0.5, 'F.Cu', 10, 35);
    const high = calculateMinTraceWidth(2.0, 'F.Cu', 10, 35);
    expect(high).toBeGreaterThan(low);
  });

  it('should require wider trace on internal layers vs external', () => {
    const external = calculateMinTraceWidth(1.0, 'F.Cu', 10, 35);
    const internal = calculateMinTraceWidth(1.0, 'In1.Cu', 10, 35);
    expect(internal).toBeGreaterThan(external);
  });

  it('should require narrower trace with thicker copper', () => {
    const thin = calculateMinTraceWidth(1.0, 'F.Cu', 10, 17.5);
    const thick = calculateMinTraceWidth(1.0, 'F.Cu', 10, 70);
    expect(thick).toBeLessThan(thin);
  });

  it('should require narrower trace with higher allowed temp rise', () => {
    const strict = calculateMinTraceWidth(1.0, 'F.Cu', 10, 35);
    const relaxed = calculateMinTraceWidth(1.0, 'F.Cu', 30, 35);
    expect(relaxed).toBeLessThan(strict);
  });

  it('should work for B.Cu (same as F.Cu)', () => {
    const front = calculateMinTraceWidth(1.0, 'F.Cu', 10, 35);
    const back = calculateMinTraceWidth(1.0, 'B.Cu', 10, 35);
    expect(back).toBeCloseTo(front, 10);
  });
});

describe('calculateBoardBounds', () => {
  it('should return fallback bounds for empty components', () => {
    const bounds = calculateBoardBounds([], []);
    expect(bounds.minX).toBe(-50);
    expect(bounds.maxX).toBe(50);
    expect(bounds.minY).toBe(-50);
    expect(bounds.maxY).toBe(50);
  });

  it('should compute bounds from components', () => {
    const components = [
      { pcb: { x: 10, y: 20 }, footprint_bounds: { minX: 9, maxX: 11, minY: 19, maxY: 21 } },
      { pcb: { x: 50, y: 60 }, footprint_bounds: { minX: 49, maxX: 51, minY: 59, maxY: 61 } },
    ] as any[];
    const bounds = calculateBoardBounds(components, []);
    expect(bounds.minX).toBeLessThan(10);
    expect(bounds.maxX).toBeGreaterThan(50);
    expect(bounds.minY).toBeLessThan(20);
    expect(bounds.maxY).toBeGreaterThan(60);
  });
});
