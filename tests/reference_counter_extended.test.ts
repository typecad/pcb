import { describe, it, expect, beforeEach } from 'vitest';
import { ReferenceCounter } from '../src/utils/reference_counter.js';

describe('ReferenceCounter edge cases', () => {
  let counter: ReferenceCounter;

  beforeEach(() => {
    counter = new ReferenceCounter();
  });

  it('should handle single-letter prefixes', () => {
    expect(counter.getNextReference('R')).toBe('R1');
    expect(counter.getNextReference('C')).toBe('C1');
    expect(counter.getNextReference('U')).toBe('U1');
  });

  it('should handle multi-character prefixes', () => {
    expect(counter.getNextReference('IC')).toBe('IC1');
    expect(counter.getNextReference('LED')).toBe('LED1');
  });

  it('should reject duplicate references', () => {
    expect(counter.setReference('R1')).toBe(true);
    expect(counter.setReference('R1')).toBe(false);
  });

  it('should auto-increment past manually set references', () => {
    counter.setReference('R50');
    expect(counter.getNextReference('R')).toBe('R51');
    expect(counter.getNextReference('r')).toBe('r52');
  });

  it('should track multiple prefixes independently', () => {
    counter.setReference('R1');
    counter.setReference('C1');
    counter.setReference('U1');
    expect(counter.getNextReference('R')).toBe('R2');
    expect(counter.getNextReference('C')).toBe('C2');
    expect(counter.getNextReference('U')).toBe('U2');
  });

  it('should handle case-insensitive prefix matching across setReference and getNextReference', () => {
    counter.setReference('R5');
    // Case-insensitive: 'R' and 'r' share the same counter
    expect(counter.getNextReference('R')).toBe('R6');
    expect(counter.getNextReference('r')).toBe('r7');
  });

  it('should handle reset correctly', () => {
    counter.setReference('R1');
    counter.getNextReference('C');
    counter.reset();
    expect(counter.getNextReference('R')).toBe('R1');
    expect(counter.getNextReference('C')).toBe('C1');
  });

  it('should skip already-used references', () => {
    counter.setReference('R1');
    counter.setReference('R2');
    counter.reset();
    // After reset, nothing is used
    expect(counter.getNextReference('R')).toBe('R1');
  });
});
