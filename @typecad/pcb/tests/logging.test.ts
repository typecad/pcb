import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logging', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Note: The logging module reads TYPECAD_DEBUG and TYPECAD_QUIET at import time,
  // so these tests verify behavior under the current environment rather than
  // dynamically changing env vars (which won't affect the cached values).

  it('warn should always output', async () => {
    const { warn } = await import('../src/utils/logging.js');
    warn('warning message');
    expect(console.warn).toHaveBeenCalled();
  });

  it('error should always output', async () => {
    const { error } = await import('../src/utils/logging.js');
    error('error message');
    expect(console.error).toHaveBeenCalled();
  });

  it('logger should export all four methods', async () => {
    const logger = (await import('../src/utils/logging.js')).default;
    expect(logger.debug).toBeTypeOf('function');
    expect(logger.info).toBeTypeOf('function');
    expect(logger.warn).toBeTypeOf('function');
    expect(logger.error).toBeTypeOf('function');
  });
});
