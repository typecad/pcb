import { describe, it, expect } from 'vitest';
import { allLayers, standardLayers } from '../../src/gitdiff/constants.js';

describe('gitdiff constants', () => {
  it('allLayers should be a non-empty array', () => {
    expect(Array.isArray(allLayers)).toBe(true);
    expect(allLayers.length).toBeGreaterThan(0);
  });

  it('standardLayers should be a subset of allLayers', () => {
    expect(Array.isArray(standardLayers)).toBe(true);
    for (const layer of standardLayers) {
      expect(allLayers).toContain(layer);
    }
  });

  it('should contain standard copper layers', () => {
    expect(allLayers).toContain('F.Cu');
    expect(allLayers).toContain('B.Cu');
  });

  it('should contain silkscreen layers', () => {
    expect(allLayers).toContain('F.Silkscreen');
    expect(allLayers).toContain('B.Silkscreen');
  });
});
