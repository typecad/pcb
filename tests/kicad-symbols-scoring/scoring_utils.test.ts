import { describe, it, expect } from 'vitest';
import { levenshteinDistance, isFuzzyMatch } from '../../src/kicad-symbols/scoring/scoring_utils.js';

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('should return correct distance for single insert', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });

  it('should return correct distance for single delete', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });

  it('should return correct distance for single substitution', () => {
    expect(levenshteinDistance('cat', 'car')).toBe(1);
  });

  it('should return correct distance for empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', 'abc')).toBe(3);
  });

  it('should handle completely different strings', () => {
    expect(levenshteinDistance('abcdef', 'ghijkl')).toBe(6);
  });

  it('should handle case-sensitive comparison', () => {
    expect(levenshteinDistance('Hello', 'hello')).toBe(1);
  });
});

describe('isFuzzyMatch', () => {
  it('should return true for exact match', () => {
    expect(isFuzzyMatch('hello', 'hello')).toBe(true);
  });

  it('should return false for short strings (length < 4)', () => {
    expect(isFuzzyMatch('ab', 'ab')).toBe(true); // exact match
    expect(isFuzzyMatch('ab', 'ac')).toBe(false); // not exact, short
    expect(isFuzzyMatch('abc', 'abcd')).toBe(false); // one is short
  });

  it('should handle manufacturer variations', () => {
    expect(isFuzzyMatch('sensiron', 'sensirion')).toBe(true);
    expect(isFuzzyMatch('sensirion', 'sensiron')).toBe(true);
    expect(isFuzzyMatch('microchip', 'microchip technology')).toBe(true);
    expect(isFuzzyMatch('microchip technology', 'microchip')).toBe(true);
    expect(isFuzzyMatch('infineon', 'infineon technologies')).toBe(true);
  });

  it('should handle fuzzy matches within Levenshtein distance', () => {
    expect(isFuzzyMatch('resistr', 'resistor')).toBe(true); // 1 edit
    expect(isFuzzyMatch('capacitor', 'capacitorr')).toBe(true); // 1 edit
    expect(isFuzzyMatch('capacitor', 'capacitorrr')).toBe(true); // 2 edits <= 2 threshold
    expect(isFuzzyMatch('abcdefgh', 'abcdefxyz')).toBe(false); // 3 edits > 2 threshold
  });

  it('should return false for long mismatches', () => {
    expect(isFuzzyMatch('abcdefgh', 'ijklmnop')).toBe(false);
  });

  it('should handle case differences via Levenshtein', () => {
    expect(isFuzzyMatch('RESISTOR', 'resistor')).toBe(false); // case diff = 8 edits > threshold
    expect(isFuzzyMatch('abcd', 'abce')).toBe(true); // 1 edit <= threshold
  });

  it('should handle empty strings', () => {
    expect(isFuzzyMatch('', '')).toBe(true);
    expect(isFuzzyMatch('', 'hello')).toBe(false);
  });
});
