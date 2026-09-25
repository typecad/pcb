import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ParsedArgs } from '../../parser.js';

const npxExecMock = vi.fn();
const generateMock = vi.fn();
const startWatchLoopMock = vi.fn();
const collectDepsMock = vi.fn();

vi.mock('../../../../utils/process_exec.js', () => ({
  npxExec: (...args: unknown[]) => npxExecMock(...args),
}));
vi.mock('../diagnostics.js', () => ({
  generateDiagnosticsReport: (...args: unknown[]) => generateMock(...args),
}));
vi.mock('../../watch.js', () => ({
  startWatchLoop: (...args: unknown[]) => startWatchLoopMock(...args),
  collectLocalDependencies: (...args: unknown[]) => collectDepsMock(...args),
}));

const { run } = await import('../build.js');

function parsedWith(args: ParsedArgs['args'], positional: string[] = []): ParsedArgs {
  return {
    command: 'build',
    subcommand: '',
    args,
    positional,
    passthrough: [],
    json: false,
    help: false,
    version: false,
  };
}

let entryPath: string;
let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-build-diag-'));
  entryPath = path.join(tmpDir, 'board.ts');
  fs.writeFileSync(entryPath, '// entry\n', 'utf8');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  npxExecMock.mockReset();
  generateMock
    .mockReset()
    .mockResolvedValue({ mdPath: 'build/board-diagnostics.md', jsonPath: 'build/board-diagnostics.json', report: {} });
  startWatchLoopMock.mockReset();
  collectDepsMock.mockReset().mockReturnValue([entryPath]);
});

describe('build --diagnostics', () => {
  it('generates the diagnostics report after a successful build', async () => {
    await run(parsedWith({ diagnostics: true }, [entryPath]));
    expect(npxExecMock).toHaveBeenCalledTimes(1);
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(generateMock).toHaveBeenCalledWith({
      entry: entryPath,
      skipErc: false,
      skipDrc: false,
      out: undefined,
    });
  });

  it('does not generate a report without the flag', async () => {
    await run(parsedWith({}, [entryPath]));
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('forwards skip flags and --out to the generator', async () => {
    await run(parsedWith({ diagnostics: true, 'skip-erc': true, 'skip-drc': true, out: 'report.md' }, [entryPath]));
    expect(generateMock).toHaveBeenCalledWith({
      entry: entryPath,
      skipErc: true,
      skipDrc: true,
      out: 'report.md',
    });
  });

  it('fails the build without running diagnostics when the entry is missing', async () => {
    await expect(run(parsedWith({ diagnostics: true }, ['./nope.ts']))).rejects.toThrow(/Entry file not found/);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('warns instead of failing when report generation throws (HAL best-effort contract)', async () => {
    generateMock.mockRejectedValue(new Error('unparseable netlist'));
    await run(parsedWith({ diagnostics: true }, [entryPath]));
    expect(generateMock).toHaveBeenCalledTimes(1);
  });
});

describe('build --watch', () => {
  it('builds once, then starts the watch loop over the dependency graph', async () => {
    await run(parsedWith({ watch: true }, [entryPath]));
    expect(npxExecMock).toHaveBeenCalledTimes(1);
    expect(collectDepsMock).toHaveBeenCalledWith(entryPath);
    expect(startWatchLoopMock).toHaveBeenCalledTimes(1);
    const [watchedEntry, onChange] = startWatchLoopMock.mock.calls[0]!;
    expect(watchedEntry).toBe(entryPath);
    expect(typeof onChange).toBe('function');
  });

  it('accepts -w, recovering a swallowed entry path as the build entry', async () => {
    await run(parsedWith({ w: entryPath }));
    expect(npxExecMock).toHaveBeenCalledWith(['tsx', entryPath], expect.anything());
    expect(startWatchLoopMock).toHaveBeenCalledTimes(1);
  });

  it('does not start watching without the flag', async () => {
    await run(parsedWith({}, [entryPath]));
    expect(startWatchLoopMock).not.toHaveBeenCalled();
  });

  it('keeps watching when the first build fails (the next save retries)', async () => {
    npxExecMock.mockImplementation(() => {
      throw new Error('compile error');
    });
    await expect(run(parsedWith({ watch: true }, [entryPath]))).resolves.toBeUndefined();
    expect(startWatchLoopMock).toHaveBeenCalledTimes(1);
  });

  it('rebuilds through the watcher callback and survives a failed rebuild', async () => {
    await run(parsedWith({ watch: true }, [entryPath]));
    const onChange = startWatchLoopMock.mock.calls[0]![1] as (file: string) => void;

    onChange(entryPath);
    await new Promise((resolve) => setImmediate(resolve));
    expect(npxExecMock).toHaveBeenCalledTimes(2);

    npxExecMock.mockImplementationOnce(() => {
      throw new Error('compile error');
    });
    expect(() => onChange(entryPath)).not.toThrow(); // swallowed, watcher lives on
  });
});
