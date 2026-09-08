import { describe, it, expect } from 'vitest';
import { ReferenceCounter } from '../src/utils/reference_counter.js';

describe('ReferenceCounter', () => {
  const counter = new ReferenceCounter();

  it('should generate next reference with prefix', () => {
    const ref1 = counter.getNextReference('R');
    const ref2 = counter.getNextReference('R');
    expect(ref1).toBe('R1');
    expect(ref2).toBe('R2');
  });

  it('should handle different prefixes', () => {
    const rRef = counter.getNextReference('R');
    const uRef = counter.getNextReference('U');
    const cRef = counter.getNextReference('C');
    expect(rRef).toBe('R3');
    expect(uRef).toBe('U1');
    expect(cRef).toBe('C1');
  });

  it('should set existing reference', () => {
    expect(counter.setReference('R100')).toBe(true);
    expect(counter.setReference('U10')).toBe(true);
    expect(counter.setReference('R100')).toBe(false); // Already used
  });

  it('should handle numeric suffixes correctly', () => {
    counter.setReference('X1');
    const nextRef = counter.getNextReference('X');
    expect(nextRef).toBe('X2');
  });
});
