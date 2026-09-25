import { describe, it, expect } from 'vitest';
import {
  pcbLineWithOffset,
  pcbCircleWithOffset,
  pcbRectWithOffset,
  pcbPolyWithOffset,
  pcbTextWithOffset,
  pcbTrackWithOffset,
} from '../src/pcb/pcb_graphics_delegation.js';
import { PcbInternalState } from '../src/pcb/pcb_state.js';
import { Schematic } from '../src/schematic.js';

function makeState(): PcbInternalState {
  return new PcbInternalState({ schematic: new Schematic('test') });
}

describe('offset delegation', () => {
  describe('pcbLineWithOffset', () => {
    it('should apply offset to line coordinates', () => {
      const state = makeState();
      state.pushOffset(10, 20);
      pcbLineWithOffset(state, { start: { x: 0, y: 0 }, end: { x: 5, y: 5 } });
      expect(state.grLines).toHaveLength(1);
      expect(state.grLines[0].start).toEqual({ x: 10, y: 20 });
      expect(state.grLines[0].end).toEqual({ x: 15, y: 25 });
    });
  });

  describe('pcbCircleWithOffset', () => {
    it('should apply offset to circle center', () => {
      const state = makeState();
      state.pushOffset(5, 10);
      pcbCircleWithOffset(state, { center: { x: 0, y: 0 }, radius: 5 });
      expect(state.grCircles[0].center).toEqual({ x: 5, y: 10 });
    });

    it('should apply offset to circle end point', () => {
      const state = makeState();
      state.pushOffset(5, 10);
      pcbCircleWithOffset(state, { center: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
      expect(state.grCircles[0].end).toEqual({ x: 15, y: 10 });
    });
  });

  describe('pcbRectWithOffset', () => {
    it('should apply offset to rect with x/y/width/height', () => {
      const state = makeState();
      state.pushOffset(10, 20);
      pcbRectWithOffset(state, { x: 0, y: 0, width: 10, height: 10 });
      expect(state.grRects[0].start).toEqual({ x: 10, y: 20 });
      expect(state.grRects[0].end).toEqual({ x: 20, y: 30 });
    });

    it('should apply offset to rect with start/end', () => {
      const state = makeState();
      state.pushOffset(5, 5);
      pcbRectWithOffset(state, { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } });
      expect(state.grRects[0].start).toEqual({ x: 5, y: 5 });
      expect(state.grRects[0].end).toEqual({ x: 15, y: 15 });
    });
  });

  describe('pcbPolyWithOffset', () => {
    it('should apply offset to all polygon points', () => {
      const state = makeState();
      state.pushOffset(10, 20);
      pcbPolyWithOffset(state, {
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
          { x: 10, y: 0 },
        ],
      });
      expect(state.grPolys[0].points).toEqual([
        { x: 10, y: 20 },
        { x: 15, y: 25 },
        { x: 20, y: 20 },
      ]);
    });
  });

  describe('pcbTextWithOffset', () => {
    it('should apply offset to text position', () => {
      const state = makeState();
      state.pushOffset(5, 10);
      pcbTextWithOffset(state, { text: 'Hello', x: 0, y: 0 });
      expect(state.grTexts[0].x).toBe(5);
      expect(state.grTexts[0].y).toBe(10);
    });
  });

  describe('pcbTrackWithOffset', () => {
    it('should apply offset to track coordinates', () => {
      const state = makeState();
      state.pushOffset(10, 20);
      const uuid = pcbTrackWithOffset(state, { x: 0, y: 0 }, { x: 5, y: 5 }, 0.25, 'F.Cu', false);
      expect(state.stagedOutlines).toHaveLength(1);
      const outline = state.stagedOutlines[0];
      expect(outline.elements[0].start).toEqual({ x: 10, y: 20 });
      expect(outline.elements[0].end).toEqual({ x: 15, y: 25 });
    });

    it('should return the track UUID', () => {
      const state = makeState();
      const uuid = pcbTrackWithOffset(state, { x: 0, y: 0 }, { x: 5, y: 5 }, 0.25, 'F.Cu', false, 'my-uuid');
      expect(uuid).toBe('my-uuid');
    });
  });

  describe('zero offset', () => {
    it('should pass coordinates unchanged with no offset', () => {
      const state = makeState();
      pcbLineWithOffset(state, { start: { x: 5, y: 10 }, end: { x: 15, y: 20 } });
      expect(state.grLines[0].start).toEqual({ x: 5, y: 10 });
      expect(state.grLines[0].end).toEqual({ x: 15, y: 20 });
    });
  });
});
