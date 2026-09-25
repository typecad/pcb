import { describe, it, expect } from 'vitest';
import { allLayers, standardLayers } from '../../src/gitdiff/constants.js';

describe('typecad-gitdiff', () => {
  it('should export allLayers with expected layers', () => {
    expect(allLayers).toContain('F.Cu');
    expect(allLayers).toContain('B.Cu');
    expect(allLayers).toContain('Edge.Cuts');
  });

  it('should export standardLayers as subset of allLayers', () => {
    for (const layer of standardLayers) {
      expect(allLayers).toContain(layer);
    }
  });

  it('should exclude User layers from standardLayers', () => {
    const userLayers = standardLayers.filter((l) => l.startsWith('User.'));
    expect(userLayers).toHaveLength(0);
  });
});
