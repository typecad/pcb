import { describe, it, expect } from 'vitest';
import zip from '../../src/kipm/helpers/zip.js';

describe('zip', () => {
  it('should combine keys and values from arrays', () => {
    const result = zip(['a', 'b', 'c'], ['1', '2', '3']);
    expect(result).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('should handle shorter keys array', () => {
    const result = zip(['a', 'b'], ['1', '2', '3']);
    expect(result).toEqual({ a: '1', b: '2' });
  });

  it('should handle shorter values array', () => {
    const result = zip(['a', 'b', 'c'], ['1', '2']);
    expect(result).toEqual({ a: '1', b: '2' });
  });

  it('should return empty object for empty arrays', () => {
    expect(zip([], [])).toEqual({});
    expect(zip([], ['1', '2'])).toEqual({});
    expect(zip(['a', 'b'], [])).toEqual({});
  });
});
