import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import type { ParsedArgs } from '../src/cli/typecad/parser.js';

const mockFs = {
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
};

vi.mock('node:fs', () => {
  return { __esModule: true, ...mockFs, default: mockFs };
});

vi.mock('../src/kicad_commands.js', () => ({
  executeKiCADCommand: vi.fn(),
}));

vi.mock('../src/utils/logging.js', () => ({
  default: {
    log: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

function makeParsed(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    command: 'export',
    subcommand: 'gerbers',
    args: {},
    positional: [],
    passthrough: [],
    json: false,
    help: false,
    version: false,
    ...overrides,
  };
}

describe('export command', () => {
  let executeKiCADCommand: vi.Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    const kicadCmd = await import('../src/kicad_commands.js');
    executeKiCADCommand = kicadCmd.executeKiCADCommand as vi.Mock;
    executeKiCADCommand.mockResolvedValue('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupFsMock(pcbFile: string | null, outputDirFiles: string[] = []) {
    mockFs.existsSync.mockImplementation((p: string) => {
      if (pcbFile && p === path.resolve(pcbFile)) return true;
      if (typeof p === 'string' && p.endsWith('build') && pcbFile) return true;
      if (typeof p === 'string' && (p.endsWith('gerbers') || p.endsWith('fab'))) return true;
      return false;
    });
    mockFs.readdirSync.mockImplementation(((p: string) => {
      if (typeof p === 'string' && p.endsWith('build') && pcbFile) {
        return [path.basename(pcbFile)];
      }
      if (typeof p === 'string' && (p.endsWith('gerbers') || p.endsWith('fab'))) {
        return outputDirFiles;
      }
      return [];
    }) as any);
    mockFs.mkdirSync.mockImplementation(() => undefined as any);
  }

  describe('unknown subcommand', () => {
    it('should exit with error for unknown subcommand', async () => {
      const { run } = await import('../src/cli/typecad/commands/export.js');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('EXIT');
      }) as never);

      await expect(run(makeParsed({ subcommand: 'bom' }))).rejects.toThrow('EXIT');
      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });

    it('should output JSON error for unknown subcommand with --json', async () => {
      const logger = (await import('../src/utils/logging.js')).default;
      const { run } = await import('../src/cli/typecad/commands/export.js');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('EXIT');
      }) as never);

      await expect(run(makeParsed({ subcommand: 'bom', json: true }))).rejects.toThrow('EXIT');
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('"UNKNOWN_SUBCOMMAND"'));
      mockExit.mockRestore();
    });
  });

  describe('no subcommand', () => {
    it('should show export help when no subcommand given', async () => {
      const { run } = await import('../src/cli/typecad/commands/export.js');
      const helpModule = await import('../src/cli/typecad/help.js');
      const showExportHelpSpy = vi.spyOn(helpModule, 'showExportHelp').mockImplementation(() => {});

      await run(makeParsed({ subcommand: '' }));

      expect(showExportHelpSpy).toHaveBeenCalled();
      showExportHelpSpy.mockRestore();
    });
  });

  describe('export gerbers', () => {
    it('should throw if PCB file not found', async () => {
      const { run } = await import('../src/cli/typecad/commands/export.js');
      mockFs.existsSync.mockReturnValue(false);

      await expect(run(makeParsed({ subcommand: 'gerbers', positional: ['nonexistent.kicad_pcb'] }))).rejects.toThrow(
        'PCB file not found: nonexistent.kicad_pcb',
      );
    });

    it('should throw if no PCB in ./build/ and no path given', async () => {
      const { run } = await import('../src/cli/typecad/commands/export.js');
      mockFs.existsSync.mockReturnValue(false);

      await expect(run(makeParsed({ subcommand: 'gerbers' }))).rejects.toThrow('No .kicad_pcb file found in ./build/');
    });

    it('should call executeKiCADCommand with gerbers args', async () => {
      setupFsMock('/project/build/board.kicad_pcb', ['board-F_Cu.gbr', 'board-B_Cu.gbr']);

      const { run } = await import('../src/cli/typecad/commands/export.js');
      await run(
        makeParsed({
          subcommand: 'gerbers',
          positional: ['/project/build/board.kicad_pcb'],
        }),
      );

      expect(executeKiCADCommand).toHaveBeenCalledWith('pcb', expect.arrayContaining(['export', 'gerbers']), {
        stdio: 'inherit',
      });

      const callArgs = executeKiCADCommand.mock.calls[0][1] as string[];
      expect(callArgs.find((a) => a.endsWith('board.kicad_pcb'))).toBeDefined();
    });

    it('should pass passthrough args to kicad-cli', async () => {
      setupFsMock('/project/build/board.kicad_pcb', ['board-F_Cu.gbr']);

      const { run } = await import('../src/cli/typecad/commands/export.js');
      await run(
        makeParsed({
          subcommand: 'gerbers',
          positional: ['/project/build/board.kicad_pcb'],
          passthrough: ['--exclude-drawing-sheet'],
        }),
      );

      const callArgs = executeKiCADCommand.mock.calls[0][1] as string[];
      expect(callArgs).toContain('--exclude-drawing-sheet');
    });

    it('should use --output flag for output directory', async () => {
      setupFsMock('/project/build/board.kicad_pcb', ['board-F_Cu.gbr']);

      const { run } = await import('../src/cli/typecad/commands/export.js');
      await run(
        makeParsed({
          subcommand: 'gerbers',
          positional: ['/project/build/board.kicad_pcb'],
          args: { output: './fab' },
        }),
      );

      const callArgs = executeKiCADCommand.mock.calls[0][1] as string[];
      expect(callArgs).toContain(path.resolve('./fab'));
    });

    it('should use -o flag for output directory', async () => {
      setupFsMock('/project/build/board.kicad_pcb', ['board-F_Cu.gbr']);

      const { run } = await import('../src/cli/typecad/commands/export.js');
      await run(
        makeParsed({
          subcommand: 'gerbers',
          positional: ['/project/build/board.kicad_pcb'],
          args: { o: './fab' },
        }),
      );

      const callArgs = executeKiCADCommand.mock.calls[0][1] as string[];
      expect(callArgs).toContain(path.resolve('./fab'));
    });

    it('should default output to ./build/gerbers/', async () => {
      setupFsMock('/project/build/board.kicad_pcb', []);

      const { run } = await import('../src/cli/typecad/commands/export.js');
      await run(
        makeParsed({
          subcommand: 'gerbers',
          positional: ['/project/build/board.kicad_pcb'],
        }),
      );

      const callArgs = executeKiCADCommand.mock.calls[0][1] as string[];
      const outputIdx = callArgs.indexOf('--output');
      expect(outputIdx).toBeGreaterThan(-1);
      expect(callArgs[outputIdx + 1]).toMatch(/[\\/]build[\\/]gerbers$/);
    });

    it('should output JSON with file list when --json flag set', async () => {
      setupFsMock('/project/build/board.kicad_pcb', ['board-F_Cu.gbr', 'board-B_Cu.gbr']);

      const logger = (await import('../src/utils/logging.js')).default;
      const { run } = await import('../src/cli/typecad/commands/export.js');

      await run(
        makeParsed({
          subcommand: 'gerbers',
          positional: ['/project/build/board.kicad_pcb'],
          json: true,
        }),
      );

      const loggedCall = vi
        .mocked(logger.log)
        .mock.calls.find((c) => typeof c[0] === 'string' && c[0].includes('"files"'));
      expect(loggedCall).toBeDefined();
      if (loggedCall) {
        const parsed = JSON.parse(loggedCall[0] as string);
        expect(parsed.files).toEqual(['board-F_Cu.gbr', 'board-B_Cu.gbr']);
      }
    });
  });

  describe('export drill', () => {
    it('should throw if PCB file not found', async () => {
      const { run } = await import('../src/cli/typecad/commands/export.js');
      mockFs.existsSync.mockReturnValue(false);

      await expect(run(makeParsed({ subcommand: 'drill', positional: ['nonexistent.kicad_pcb'] }))).rejects.toThrow(
        'PCB file not found: nonexistent.kicad_pcb',
      );
    });

    it('should call executeKiCADCommand with drill args', async () => {
      setupFsMock('/project/build/board.kicad_pcb', ['board.drl']);

      const { run } = await import('../src/cli/typecad/commands/export.js');
      await run(
        makeParsed({
          subcommand: 'drill',
          positional: ['/project/build/board.kicad_pcb'],
        }),
      );

      expect(executeKiCADCommand).toHaveBeenCalledWith('pcb', expect.arrayContaining(['export', 'drill']), {
        stdio: 'inherit',
      });
    });

    it('should pass passthrough args to kicad-cli for drill', async () => {
      setupFsMock('/project/build/board.kicad_pcb', ['board.drl']);

      const { run } = await import('../src/cli/typecad/commands/export.js');
      await run(
        makeParsed({
          subcommand: 'drill',
          positional: ['/project/build/board.kicad_pcb'],
          passthrough: ['--use-drill-file-origin'],
        }),
      );

      const callArgs = executeKiCADCommand.mock.calls[0][1] as string[];
      expect(callArgs).toContain('--use-drill-file-origin');
    });

    it('should output JSON with drill file list when --json flag set', async () => {
      setupFsMock('/project/build/board.kicad_pcb', ['board.drl', 'board-NPTH.drl']);

      const logger = (await import('../src/utils/logging.js')).default;
      const { run } = await import('../src/cli/typecad/commands/export.js');

      await run(
        makeParsed({
          subcommand: 'drill',
          positional: ['/project/build/board.kicad_pcb'],
          json: true,
        }),
      );

      const loggedCall = vi
        .mocked(logger.log)
        .mock.calls.find((c) => typeof c[0] === 'string' && c[0].includes('"files"'));
      expect(loggedCall).toBeDefined();
      if (loggedCall) {
        const parsed = JSON.parse(loggedCall[0] as string);
        expect(parsed.files).toEqual(['board.drl', 'board-NPTH.drl']);
      }
    });

    it('should not call pcb export gerbers for drill subcommand', async () => {
      setupFsMock('/project/build/board.kicad_pcb', ['board.drl']);

      const { run } = await import('../src/cli/typecad/commands/export.js');
      await run(
        makeParsed({
          subcommand: 'drill',
          positional: ['/project/build/board.kicad_pcb'],
        }),
      );

      expect(executeKiCADCommand).toHaveBeenCalledTimes(1);
      const callArgs = executeKiCADCommand.mock.calls[0][1] as string[];
      expect(callArgs).not.toContain('gerbers');
      expect(callArgs).toContain('drill');
    });
  });
});
