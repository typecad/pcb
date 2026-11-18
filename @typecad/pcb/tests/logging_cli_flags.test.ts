import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('logger and the CLI flags', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    delete process.env.TYPECAD_QUIET;
    delete process.env.TYPECAD_SILENT;
    delete process.env.TYPECAD_DEBUG;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...saved };
  });

  it('--quiet silences log but never the machine-readable out()', async () => {
    const logger = (await import('../src/utils/logging.js')).default;
    logger.configureFromFlags({ quiet: true });
    expect(process.env.TYPECAD_QUIET).toBe('1');
    logger.log('chatter');
    expect(console.log).not.toHaveBeenCalled();
    logger.out('{"ok":true}');
    expect(console.log).toHaveBeenCalledWith('{"ok":true}');
  });

  it('out() survives TYPECAD_SILENT too', async () => {
    process.env.TYPECAD_SILENT = '1';
    const logger = (await import('../src/utils/logging.js')).default;
    logger.out('{"ok":true}');
    expect(console.log).toHaveBeenCalledWith('{"ok":true}');
  });

  it('--verbose turns on debug output', async () => {
    const logger = (await import('../src/utils/logging.js')).default;
    logger.debug('hidden');
    expect(console.log).not.toHaveBeenCalled();
    logger.configureFromFlags({ verbose: true });
    expect(process.env.TYPECAD_DEBUG).toBe('1');
    logger.debug('shown');
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it('leaves the environment alone without flags', async () => {
    const logger = (await import('../src/utils/logging.js')).default;
    logger.configureFromFlags({});
    expect(process.env.TYPECAD_QUIET).toBeUndefined();
    expect(process.env.TYPECAD_DEBUG).toBeUndefined();
  });
});
