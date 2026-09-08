import { describe, it, expect } from 'vitest';
import { PcbInternalState } from '../src/pcb/pcb_state.js';
import { Schematic } from '../src/schematic.js';

function makeState(): PcbInternalState {
  return new PcbInternalState({ schematic: new Schematic('test') });
}

describe('PcbInternalState', () => {
  describe('constructor', () => {
    it('should initialize with zero offset', () => {
      const state = makeState();
      expect(state.currentOffset).toEqual({ x: 0, y: 0 });
    });

    it('should start with empty offset stack', () => {
      const state = makeState();
      expect(state.offsetStack).toEqual([]);
    });

    it('should start with empty component arrays', () => {
      const state = makeState();
      expect(state.components).toEqual([]);
      expect(state.stagedComponents).toEqual([]);
    });

    it('should start with empty graphics arrays', () => {
      const state = makeState();
      expect(state.grTexts).toEqual([]);
      expect(state.grLines).toEqual([]);
      expect(state.grCircles).toEqual([]);
      expect(state.grRects).toEqual([]);
      expect(state.grPolys).toEqual([]);
      expect(state.zones).toEqual([]);
      expect(state.keepoutZones).toEqual([]);
      expect(state.outlines).toEqual([]);
      expect(state.stagedOutlines).toEqual([]);
    });
  });

  describe('pushOffset', () => {
    it('should accumulate offset', () => {
      const state = makeState();
      state.pushOffset(10, 20);
      expect(state.currentOffset).toEqual({ x: 10, y: 20 });
    });

    it('should stack multiple offsets', () => {
      const state = makeState();
      state.pushOffset(10, 20);
      state.pushOffset(5, 5);
      expect(state.currentOffset).toEqual({ x: 15, y: 25 });
    });

    it('should push previous offset onto stack', () => {
      const state = makeState();
      state.pushOffset(10, 20);
      expect(state.offsetStack).toHaveLength(1);
      expect(state.offsetStack[0]).toEqual({ x: 0, y: 0 });
    });
  });

  describe('popOffset', () => {
    it('should restore previous offset', () => {
      const state = makeState();
      state.pushOffset(10, 20);
      state.popOffset();
      expect(state.currentOffset).toEqual({ x: 0, y: 0 });
    });

    it('should handle nested push/pop', () => {
      const state = makeState();
      state.pushOffset(10, 20);
      state.pushOffset(5, 5);
      state.popOffset();
      expect(state.currentOffset).toEqual({ x: 10, y: 20 });
      state.popOffset();
      expect(state.currentOffset).toEqual({ x: 0, y: 0 });
    });

    it('should reset to (0,0) when popping empty stack', () => {
      const state = makeState();
      state.pushOffset(10, 20);
      state.popOffset();
      state.popOffset();
      expect(state.currentOffset).toEqual({ x: 0, y: 0 });
    });

    it('should handle popOffset with no prior push', () => {
      const state = makeState();
      state.popOffset();
      expect(state.currentOffset).toEqual({ x: 0, y: 0 });
    });
  });

  describe('getOffset', () => {
    it('should return a copy of the current offset', () => {
      const state = makeState();
      state.pushOffset(10, 20);
      const offset = state.getOffset();
      expect(offset).toEqual({ x: 10, y: 20 });
      offset.x = 999;
      expect(state.currentOffset.x).toBe(10);
    });
  });
});
