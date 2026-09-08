import { describe, it, expect } from 'vitest';
import {
  pointOnLineSegment,
  subtractOverlapsFromSegment,
  segmentFullyOnExistingSameNetTrack,
} from '../src/pcb/pcb_routing_core.js';
import type { IGrLine, IOutline } from '../src/pcb/pcb_interfaces.js';

describe('pointOnLineSegment', () => {
  const line: IGrLine = {
    type: 'line',
    uuid: 'u1',
    layer: 'F.Cu',
    strokeWidth: 0.2,
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
  };

  it('returns true for a point exactly on the segment', () => {
    expect(pointOnLineSegment({ x: 5, y: 0 }, line, 0.2)).toBe(true);
  });

  it('returns true for a point near the segment within tolerance', () => {
    expect(pointOnLineSegment({ x: 5, y: 0.05 }, line, 0.2)).toBe(true);
  });

  it('returns false for a point far from the segment', () => {
    expect(pointOnLineSegment({ x: 5, y: 5 }, line, 0.2)).toBe(false);
  });

  it('returns false for a point outside bounding box', () => {
    expect(pointOnLineSegment({ x: 20, y: 0 }, line, 0.2)).toBe(false);
  });

  it('handles degenerate (zero-length) segment', () => {
    const degenerate: IGrLine = {
      type: 'line',
      uuid: 'u2',
      layer: 'F.Cu',
      strokeWidth: 0.2,
      start: { x: 5, y: 5 },
      end: { x: 5, y: 5 },
    };
    expect(pointOnLineSegment({ x: 5, y: 5 }, degenerate, 0.2)).toBe(true);
    expect(pointOnLineSegment({ x: 10, y: 10 }, degenerate, 0.2)).toBe(false);
  });

  it('handles vertical segment', () => {
    const vLine: IGrLine = {
      type: 'line',
      uuid: 'u3',
      layer: 'F.Cu',
      strokeWidth: 0.2,
      start: { x: 0, y: 0 },
      end: { x: 0, y: 10 },
    };
    expect(pointOnLineSegment({ x: 0, y: 5 }, vLine, 0.2)).toBe(true);
    expect(pointOnLineSegment({ x: 1, y: 5 }, vLine, 0.2)).toBe(false);
  });

  it('handles diagonal segment', () => {
    const dLine: IGrLine = {
      type: 'line',
      uuid: 'u4',
      layer: 'F.Cu',
      strokeWidth: 0.2,
      start: { x: 0, y: 0 },
      end: { x: 10, y: 10 },
    };
    expect(pointOnLineSegment({ x: 5, y: 5 }, dLine, 0.2)).toBe(true);
    expect(pointOnLineSegment({ x: 5, y: 6 }, dLine, 0.2)).toBe(false);
  });
});

describe('subtractOverlapsFromSegment', () => {
  it('returns full segment when no existing lines match', () => {
    const result = subtractOverlapsFromSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 'F.Cu', 'GND', 0.2, []);
    expect(result).toHaveLength(1);
    expect(result[0].start).toEqual({ x: 0, y: 0 });
    expect(result[0].end).toEqual({ x: 10, y: 0 });
  });

  it('returns full segment when net is undefined', () => {
    const result = subtractOverlapsFromSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 'F.Cu', undefined, 0.2, []);
    expect(result).toHaveLength(1);
  });

  it('removes middle portion overlapped by existing line', () => {
    const existing: IGrLine[] = [
      {
        type: 'line',
        uuid: 'u1',
        layer: 'F.Cu',
        strokeWidth: 0.2,
        net: 'GND',
        start: { x: 3, y: 0 },
        end: { x: 7, y: 0 },
      },
    ];
    const result = subtractOverlapsFromSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 'F.Cu', 'GND', 0.2, existing);
    expect(result).toHaveLength(2);
    expect(result[0].end.x).toBeCloseTo(3);
    expect(result[1].start.x).toBeCloseTo(7);
  });

  it('filters lines by layer and net', () => {
    const existing: IGrLine[] = [
      {
        type: 'line',
        uuid: 'u1',
        layer: 'B.Cu',
        strokeWidth: 0.2,
        net: 'GND',
        start: { x: 3, y: 0 },
        end: { x: 7, y: 0 },
      },
    ];
    const result = subtractOverlapsFromSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 'F.Cu', 'GND', 0.2, existing);
    expect(result).toHaveLength(1);
  });

  it('returns empty when whole segment is covered', () => {
    const existing: IGrLine[] = [
      {
        type: 'line',
        uuid: 'u1',
        layer: 'F.Cu',
        strokeWidth: 0.2,
        net: 'GND',
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
      },
    ];
    const result = subtractOverlapsFromSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 'F.Cu', 'GND', 0.2, existing);
    expect(result).toHaveLength(0);
  });

  it('handles overlapping lines by merging intervals', () => {
    const existing: IGrLine[] = [
      {
        type: 'line',
        uuid: 'u1',
        layer: 'F.Cu',
        strokeWidth: 0.2,
        net: 'GND',
        start: { x: 2, y: 0 },
        end: { x: 5, y: 0 },
      },
      {
        type: 'line',
        uuid: 'u2',
        layer: 'F.Cu',
        strokeWidth: 0.2,
        net: 'GND',
        start: { x: 4, y: 0 },
        end: { x: 8, y: 0 },
      },
    ];
    const result = subtractOverlapsFromSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 'F.Cu', 'GND', 0.2, existing);
    expect(result).toHaveLength(2);
    expect(result[0].end.x).toBeCloseTo(2);
    expect(result[1].start.x).toBeCloseTo(8);
  });

  it('ignores non-collinear lines', () => {
    const existing: IGrLine[] = [
      {
        type: 'line',
        uuid: 'u1',
        layer: 'F.Cu',
        strokeWidth: 0.2,
        net: 'GND',
        start: { x: 3, y: 1 },
        end: { x: 7, y: 1 },
      },
    ];
    const result = subtractOverlapsFromSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 'F.Cu', 'GND', 0.2, existing);
    expect(result).toHaveLength(1);
  });
});

describe('segmentFullyOnExistingSameNetTrack', () => {
  it('returns false when net is undefined', () => {
    expect(segmentFullyOnExistingSameNetTrack({ x: 0, y: 0 }, { x: 10, y: 0 }, 'F.Cu', undefined, 0.2, [], [])).toBe(
      false,
    );
  });

  it('returns true when segment lies on existing line', () => {
    const existingLines: IGrLine[] = [
      {
        type: 'line',
        uuid: 'u1',
        layer: 'F.Cu',
        strokeWidth: 0.2,
        net: 'GND',
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
      },
    ];
    expect(
      segmentFullyOnExistingSameNetTrack({ x: 2, y: 0 }, { x: 8, y: 0 }, 'F.Cu', 'GND', 0.2, existingLines, []),
    ).toBe(true);
  });

  it('returns true when segment lies on staged outline line', () => {
    const stagedOutlines: IOutline[] = [
      {
        uuid: 'o1',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        filletRadius: 0,
        elements: [
          {
            type: 'line',
            uuid: 'u1',
            layer: 'F.Cu',
            strokeWidth: 0.2,
            net: 'GND',
            start: { x: 0, y: 0 },
            end: { x: 10, y: 0 },
          },
        ],
      },
    ];
    expect(
      segmentFullyOnExistingSameNetTrack({ x: 2, y: 0 }, { x: 8, y: 0 }, 'F.Cu', 'GND', 0.2, [], stagedOutlines),
    ).toBe(true);
  });

  it('returns false when segment is not on any matching line', () => {
    const existingLines: IGrLine[] = [
      {
        type: 'line',
        uuid: 'u1',
        layer: 'F.Cu',
        strokeWidth: 0.2,
        net: 'VCC',
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
      },
    ];
    expect(
      segmentFullyOnExistingSameNetTrack({ x: 2, y: 0 }, { x: 8, y: 0 }, 'F.Cu', 'GND', 0.2, existingLines, []),
    ).toBe(false);
  });

  it('returns false when no lines exist', () => {
    expect(segmentFullyOnExistingSameNetTrack({ x: 0, y: 0 }, { x: 10, y: 0 }, 'F.Cu', 'GND', 0.2, [], [])).toBe(false);
  });
});
