import { describe, it, expect, vi } from 'vitest';
import { clearSourceCache } from '../src/utils/source_inspector.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('source_inspector utilities', () => {
  it('should export clearSourceCache without error', () => {
    expect(() => clearSourceCache()).not.toThrow();
  });
});
