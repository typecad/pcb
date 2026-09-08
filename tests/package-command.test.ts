import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  __esModule: true,
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
}));

vi.mock('../src/kicad.js', () => ({
  findExecutable: vi.fn(() => '/usr/bin/npm'),
}));

vi.mock('../src/utils/logging.js', () => ({
  __esModule: true,
  default: {
    log: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockCheckbox = vi.fn();
vi.mock('@inquirer/prompts', () => ({
  checkbox: mockCheckbox,
}));

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import type { ParsedArgs } from '../src/cli/typecad/parser.js';

async function importCommand() {
  const mod = await import('../src/cli/typecad/commands/package.js');
  return mod;
}

function makeParsed(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    command: 'package',
    subcommand: '',
    args: {},
    positional: [],
    passthrough: [],
    json: false,
    help: false,
    version: false,
    ...overrides,
  };
}

const NPM_RESPONSE = {
  objects: [
    { package: { name: '@typecad/graphviz', version: '1.0.0', description: 'Graphviz support' } },
    { package: { name: '@typecad/wiring', version: '2.0.0', description: 'Wiring helpers' } },
    { package: { name: '@typecad/passives', version: '3.0.0', description: 'Passive components' } },
  ],
  total: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(NPM_RESPONSE),
  });
});

describe('package command', () => {
  it('should output JSON when --json flag is set', async () => {
    const { run } = await importCommand();
    const parsed = makeParsed({ json: true });

    await run(parsed);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://registry.npmjs.org/-/v1/search?text=scope:typecad+keywords:typecad-package&size=250',
    );
  });

  it('should throw on npm registry error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const { run } = await importCommand();
    const parsed = makeParsed({ json: true });

    await expect(run(parsed)).rejects.toThrow('npm registry returned 500');
  });

  it('should show message when no packages found', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ objects: [], total: 0 }),
    });

    const { run } = await importCommand();
    const parsed = makeParsed();
    const logger = (await import('../src/utils/logging.js')).default;

    await run(parsed);

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('No typeCAD packages found'));
  });

  it('should do nothing when no packages are selected', async () => {
    mockCheckbox.mockResolvedValue([]);

    const { run } = await importCommand();
    const parsed = makeParsed();

    await run(parsed);

    expect(mockCheckbox).toHaveBeenCalled();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('should install selected packages', async () => {
    mockCheckbox.mockResolvedValue(['@typecad/graphviz', '@typecad/wiring']);

    const { run } = await importCommand();
    const parsed = makeParsed();

    await run(parsed);

    expect(execFileSync).toHaveBeenCalled();
  });

  it('should handle fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));

    const { run } = await importCommand();
    const parsed = makeParsed();

    await expect(run(parsed)).rejects.toThrow('network error');
  });

  it('should detect installed packages and pass disabled state', async () => {
    const pkgJson = JSON.stringify({
      dependencies: { '@typecad/graphviz': '^1.0.0' },
    });
    vi.mocked(fs.readFileSync).mockReturnValue(pkgJson);
    vi.mocked(fs.existsSync).mockReturnValue(true);

    mockCheckbox.mockResolvedValue([]);

    const { run } = await importCommand();
    const parsed = makeParsed();

    await run(parsed);

    const checkboxCall = mockCheckbox.mock.calls[0][0];
    const graphvizChoice = checkboxCall.choices.find((c: { value: string }) => c.value === '@typecad/graphviz');
    expect(graphvizChoice.disabled).toBe('already installed');
  });

  it('should show update indicator for different installed version', async () => {
    const pkgJson = JSON.stringify({
      dependencies: { '@typecad/graphviz': '^0.5.0' },
    });
    vi.mocked(fs.readFileSync).mockReturnValue(pkgJson);
    vi.mocked(fs.existsSync).mockReturnValue(true);

    mockCheckbox.mockResolvedValue([]);

    const { run } = await importCommand();
    const parsed = makeParsed();

    await run(parsed);

    const checkboxCall = mockCheckbox.mock.calls[0][0];
    const graphvizChoice = checkboxCall.choices.find((c: { value: string }) => c.value === '@typecad/graphviz');
    expect(graphvizChoice.disabled).toBeUndefined();
    expect(graphvizChoice.name).toContain('update');
  });

  it('should work without a package.json in the tree', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    mockCheckbox.mockResolvedValue(['@typecad/wiring']);

    const { run } = await importCommand();
    const parsed = makeParsed();

    await run(parsed);

    expect(mockCheckbox).toHaveBeenCalled();
  });
});
