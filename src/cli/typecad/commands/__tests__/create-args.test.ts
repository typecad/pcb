import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ParsedArgs } from '../../parser.js';

const mainMock = vi.fn();

vi.mock('../../../create-typecad/index.js', () => ({
  main: (...args: unknown[]) => mainMock(...args),
}));

const { run } = await import('../create.js');

function parsedWith(args: ParsedArgs['args']): ParsedArgs {
  return {
    command: 'create',
    subcommand: '',
    args,
    positional: [],
    passthrough: [],
    json: false,
    help: false,
    version: false,
  };
}

describe('create command arg shaping', () => {
  beforeEach(() => {
    mainMock.mockReset();
  });

  it('leaves absent hal/git flags absent so main() prompts for them', async () => {
    // Regression: assigning `undefined` still creates the key, which main()
    // read as an explicitly answered prompt — after the name prompt the
    // firmware/git questions were silently skipped.
    await run(parsedWith({}));
    const passed = mainMock.mock.calls[0]![0] as Record<string, unknown>;
    expect('hal' in passed).toBe(false);
    expect('git' in passed).toBe(false);
  });

  it('passes explicit hal/git flags through as booleans', async () => {
    await run(parsedWith({ hal: 'true', git: 'false' }));
    const passed = mainMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(passed.hal).toBe(true);
    expect(passed.git).toBe(false);
  });

  it('never passes a string where main() expects a boolean', async () => {
    await run(parsedWith({ hal: 'false' }));
    const passed = mainMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(typeof passed.hal).toBe('boolean');
  });
});
