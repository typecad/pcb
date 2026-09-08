import { describe, it, expect } from 'vitest';
import { pcbLine, pcbCircle, pcbRect, pcbPoly, pcbText } from '../src/pcb/pcb_graphics.js';
import { PcbInternalState } from '../src/pcb/pcb_state.js';
import { Schematic } from '../src/schematic.js';

function makeState(): PcbInternalState {
  return new PcbInternalState({ schematic: new Schematic('test') });
}

describe('pcbLine', () => {
  it('should add a line to state.grLines', () => {
    const state = makeState();
    pcbLine(state, { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } });
    expect(state.grLines).toHaveLength(1);
    const line = state.grLines[0];
    expect(line.type).toBe('line');
    expect(line.start).toEqual({ x: 0, y: 0 });
    expect(line.end).toEqual({ x: 10, y: 10 });
  });

  it('should apply defaults', () => {
    const state = makeState();
    pcbLine(state, { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } });
    const line = state.grLines[0];
    expect(line.layer).toBe('F.SilkS');
    expect(line.strokeWidth).toBe(0.15);
    expect(line.locked).toBe(false);
  });

  it('should apply custom options', () => {
    const state = makeState();
    pcbLine(state, {
      start: { x: 0, y: 0 },
      end: { x: 10, y: 10 },
      layer: 'Edge.Cuts',
      width: 0.1,
      locked: true,
    });
    const line = state.grLines[0];
    expect(line.layer).toBe('Edge.Cuts');
    expect(line.strokeWidth).toBe(0.1);
    expect(line.locked).toBe(true);
  });

  it('should generate a unique UUID', () => {
    const state = makeState();
    pcbLine(state, { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } });
    pcbLine(state, { start: { x: 2, y: 2 }, end: { x: 3, y: 3 } });
    expect(state.grLines[0].uuid).not.toBe(state.grLines[1].uuid);
  });
});

describe('pcbCircle', () => {
  it('should create a circle with radius', () => {
    const state = makeState();
    pcbCircle(state, { center: { x: 50, y: 50 }, radius: 10 });
    expect(state.grCircles).toHaveLength(1);
    expect(state.grCircles[0].center).toEqual({ x: 50, y: 50 });
    expect(state.grCircles[0].end).toEqual({ x: 60, y: 50 });
  });

  it('should create a circle with end point', () => {
    const state = makeState();
    pcbCircle(state, { center: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
    expect(state.grCircles).toHaveLength(1);
    expect(state.grCircles[0].end).toEqual({ x: 10, y: 0 });
  });

  it('should not add circle when neither radius nor end provided', () => {
    const state = makeState();
    pcbCircle(state, { center: { x: 0, y: 0 } });
    expect(state.grCircles).toHaveLength(0);
  });

  it('should apply defaults', () => {
    const state = makeState();
    pcbCircle(state, { center: { x: 0, y: 0 }, radius: 5 });
    const circle = state.grCircles[0];
    expect(circle.layer).toBe('F.SilkS');
    expect(circle.fill).toBe(false);
  });
});

describe('pcbRect', () => {
  it('should create a rect with x/y/width/height', () => {
    const state = makeState();
    pcbRect(state, { x: 10, y: 20, width: 30, height: 40 });
    expect(state.grRects).toHaveLength(1);
    expect(state.grRects[0].start).toEqual({ x: 10, y: 20 });
    expect(state.grRects[0].end).toEqual({ x: 40, y: 60 });
  });

  it('should create a rect with start/end', () => {
    const state = makeState();
    pcbRect(state, { start: { x: 0, y: 0 }, end: { x: 100, y: 80 } });
    expect(state.grRects).toHaveLength(1);
    expect(state.grRects[0].start).toEqual({ x: 0, y: 0 });
    expect(state.grRects[0].end).toEqual({ x: 100, y: 80 });
  });

  it('should not add rect when neither complete set of params provided', () => {
    const state = makeState();
    pcbRect(state, { x: 10, y: 20 });
    expect(state.grRects).toHaveLength(0);
  });

  it('should apply defaults', () => {
    const state = makeState();
    pcbRect(state, { x: 0, y: 0, width: 10, height: 10 });
    const rect = state.grRects[0];
    expect(rect.layer).toBe('F.SilkS');
    expect(rect.fill).toBe(false);
    expect(rect.locked).toBe(false);
  });
});

describe('pcbPoly', () => {
  it('should create a polygon with 3+ points', () => {
    const state = makeState();
    pcbPoly(state, {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ],
    });
    expect(state.grPolys).toHaveLength(1);
    expect(state.grPolys[0].points).toHaveLength(3);
  });

  it('should not add polygon with fewer than 3 points', () => {
    const state = makeState();
    pcbPoly(state, {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    expect(state.grPolys).toHaveLength(0);
  });

  it('should not add polygon with no points', () => {
    const state = makeState();
    pcbPoly(state, { points: [] });
    expect(state.grPolys).toHaveLength(0);
  });

  it('should not add polygon with null points', () => {
    const state = makeState();
    pcbPoly(state, { points: null as any });
    expect(state.grPolys).toHaveLength(0);
  });
});

describe('pcbText', () => {
  it('should add text to state.grTexts', () => {
    const state = makeState();
    pcbText(state, { text: 'Hello', x: 10, y: 20 });
    expect(state.grTexts).toHaveLength(1);
    expect(state.grTexts[0].text).toBe('Hello');
    expect(state.grTexts[0].x).toBe(10);
    expect(state.grTexts[0].y).toBe(20);
  });

  it('should apply defaults', () => {
    const state = makeState();
    pcbText(state, { text: 'Test', x: 0, y: 0 });
    const t = state.grTexts[0];
    expect(t.layer).toBe('F.SilkS');
    expect(t.width).toBe(1.27);
    expect(t.height).toBe(1.27);
    expect(t.rotation).toBe(0);
  });

  it('should apply custom options', () => {
    const state = makeState();
    pcbText(state, {
      text: 'Test',
      x: 0,
      y: 0,
      layer: 'B.SilkS',
      rotation: 90,
      bold: true,
      italic: true,
    });
    const t = state.grTexts[0];
    expect(t.layer).toBe('B.SilkS');
    expect(t.rotation).toBe(90);
    expect(t.bold).toBe(true);
    expect(t.italic).toBe(true);
  });
});
