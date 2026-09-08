import { describe, it, expect } from 'vitest';
import { parseMetadata } from '../../src/cli/docgen/utils/metadata.js';

describe('parseMetadata', () => {
  it('parses simple key-value pairs', () => {
    const result = parseMetadata('title: My Board\ncompany: Acme');
    expect(result.title).toBe('My Board');
    expect(result.company).toBe('Acme');
  });

  it('parses boolean values', () => {
    const result = parseMetadata('dark_mode: true\nverbose: false');
    expect(result.dark_mode).toBe(true);
    expect(result.verbose).toBe(false);
  });

  it('handles mixed case booleans', () => {
    const result = parseMetadata('dark_mode: TRUE\nverbose: False');
    expect(result.dark_mode).toBe(true);
    expect(result.verbose).toBe(false);
  });

  it('skips lines without colons', () => {
    const result = parseMetadata('no colon here\ntitle: Test');
    expect(result.title).toBe('Test');
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('skips empty values', () => {
    const result = parseMetadata('title:\ncompany: Test');
    expect(result.company).toBe('Test');
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('handles values with colons', () => {
    const result = parseMetadata('description: A:B:C');
    expect(result.description).toBe('A:B:C');
  });

  it('handles empty input', () => {
    const result = parseMetadata('');
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('trims whitespace from keys and values', () => {
    const result = parseMetadata('  title  :  My Board  ');
    expect(result.title).toBe('My Board');
  });
});
