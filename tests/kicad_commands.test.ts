import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { KiCAD } from '../src/kicad.js';
import { KiCadCommandError } from '../src/utils/errors.js';

vi.mock('node:child_process', () => {
  return {
    execFile: vi.fn(),
    execFileSync: vi.fn(),
  };
});

function makeExecFileMock(returnValue: any) {
  return (...args: any[]) => {
    const cb = args.find((a) => typeof a === 'function');
    if (cb) {
      cb(null, returnValue);
    }
  };
}

function makeExecFileErrorMock(error: Error) {
  return (...args: any[]) => {
    const cb = args.find((a) => typeof a === 'function');
    if (cb) {
      cb(error);
    }
  };
}

describe('KiCAD Commands', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('executeKiCADCommand', () => {
    it('should execute command with flatpak when isFlatpak is true', async () => {
      vi.spyOn(KiCAD, 'isFlatpak', 'get').mockReturnValue(true);
      vi.spyOn(KiCAD, 'cliPath', 'get').mockReturnValue('kicad-cli');

      const { execFile } = await import('node:child_process');
      vi.mocked(execFile).mockImplementation(makeExecFileMock({ stdout: 'success' }));

      const { executeKiCADCommand } = await import('../src/kicad_commands.js');
      const result = await executeKiCADCommand('pcb', ['drc', 'test.kicad_pcb']);
      expect(result).toBe('success');
      expect(execFile).toHaveBeenCalledWith(
        'flatpak',
        ['run', '--command=kicad-cli', 'org.kicad.KiCad', 'pcb', 'drc', resolve('test.kicad_pcb')],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('should execute command without flatpak when isFlatpak is false', async () => {
      vi.spyOn(KiCAD, 'isFlatpak', 'get').mockReturnValue(false);
      vi.spyOn(KiCAD, 'cliPath', 'get').mockReturnValue('kicad-cli');

      const { execFile } = await import('node:child_process');
      vi.mocked(execFile).mockImplementation(makeExecFileMock({ stdout: 'success' }));

      const { executeKiCADCommand } = await import('../src/kicad_commands.js');
      const result = await executeKiCADCommand('pcb', ['drc', 'test.kicad_pcb']);
      expect(result).toBe('success');
      expect(execFile).toHaveBeenCalledWith(
        'kicad-cli',
        ['pcb', 'drc', 'test.kicad_pcb'],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('should handle command execution errors', async () => {
      vi.spyOn(KiCAD, 'isFlatpak', 'get').mockReturnValue(false);
      vi.spyOn(KiCAD, 'cliPath', 'get').mockReturnValue('kicad-cli');

      const { execFile } = await import('node:child_process');
      vi.mocked(execFile).mockImplementation(makeExecFileErrorMock(new Error('Command failed')));

      const { executeKiCADCommand } = await import('../src/kicad_commands.js');
      await expect(executeKiCADCommand('pcb', ['drc', 'test.kicad_pcb'])).rejects.toThrow(KiCadCommandError);
    });

    it('should handle inherit stdio option', async () => {
      vi.spyOn(KiCAD, 'isFlatpak', 'get').mockReturnValue(false);
      vi.spyOn(KiCAD, 'cliPath', 'get').mockReturnValue('kicad-cli');

      const { execFileSync } = await import('node:child_process');
      vi.mocked(execFileSync).mockReturnValue('');

      const { executeKiCADCommand } = await import('../src/kicad_commands.js');
      const result = await executeKiCADCommand('pcb', ['drc', 'test.kicad_pcb'], { stdio: 'inherit' });
      expect(result).toBe('');
      expect(execFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          stdio: 'inherit',
        }),
      );
    });
  });

  describe('executeKiCADCommandSync', () => {
    it('should execute command synchronously', async () => {
      vi.spyOn(KiCAD, 'isFlatpak', 'get').mockReturnValue(false);
      vi.spyOn(KiCAD, 'cliPath', 'get').mockReturnValue('kicad-cli');

      const { execFileSync } = await import('node:child_process');
      vi.mocked(execFileSync).mockReturnValue('sync success');

      const { executeKiCADCommandSync } = await import('../src/kicad_commands.js');
      const result = executeKiCADCommandSync('pcb', ['drc', 'test.kicad_pcb']);
      expect(result).toBe('sync success');
    });

    it('should handle synchronous command errors', async () => {
      vi.spyOn(KiCAD, 'isFlatpak', 'get').mockReturnValue(false);
      vi.spyOn(KiCAD, 'cliPath', 'get').mockReturnValue('kicad-cli');

      const { execFileSync } = await import('node:child_process');
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Sync command failed');
      });

      const { executeKiCADCommandSync } = await import('../src/kicad_commands.js');
      expect(() => executeKiCADCommandSync('pcb', ['drc', 'test.kicad_pcb'])).toThrow(KiCadCommandError);
    });
  });

  describe('High-level commands', () => {
    it('should run DRC command', async () => {
      vi.spyOn(KiCAD, 'isFlatpak', 'get').mockReturnValue(false);
      vi.spyOn(KiCAD, 'cliPath', 'get').mockReturnValue('kicad-cli');

      const { execFile } = await import('node:child_process');
      vi.mocked(execFile).mockImplementation(makeExecFileMock({ stdout: 'DRC success' }));

      const { runDRC } = await import('../src/kicad_commands.js');
      const result = await runDRC('test.kicad_pcb');
      expect(result).toBe('DRC success');
    });

    it('should run ERC command', async () => {
      vi.spyOn(KiCAD, 'isFlatpak', 'get').mockReturnValue(false);
      vi.spyOn(KiCAD, 'cliPath', 'get').mockReturnValue('kicad-cli');

      const { execFile } = await import('node:child_process');
      vi.mocked(execFile).mockImplementation(makeExecFileMock({ stdout: 'ERC success' }));

      const { runERC } = await import('../src/kicad_commands.js');
      const result = await runERC('test.kicad_sch');
      expect(result).toBe('ERC success');
    });

    it('should run footprint upgrade command', async () => {
      vi.spyOn(KiCAD, 'isFlatpak', 'get').mockReturnValue(false);
      vi.spyOn(KiCAD, 'cliPath', 'get').mockReturnValue('kicad-cli');

      const { execFile } = await import('node:child_process');
      vi.mocked(execFile).mockImplementation(makeExecFileMock({ stdout: 'Upgrade success' }));

      const { upgradeFootprint } = await import('../src/kicad_commands.js');
      const result = await upgradeFootprint('test.kicad_mod');
      expect(result).toBe('Upgrade success');
    });

    it('should export PCB to gerber format', async () => {
      vi.spyOn(KiCAD, 'isFlatpak', 'get').mockReturnValue(false);
      vi.spyOn(KiCAD, 'cliPath', 'get').mockReturnValue('kicad-cli');

      const { execFile } = await import('node:child_process');
      vi.mocked(execFile).mockImplementation(makeExecFileMock({ stdout: 'Export success' }));

      const { exportPCB } = await import('../src/kicad_commands.js');
      const result = await exportPCB('test.kicad_pcb', 'output.gerber', 'gerber');
      expect(result).toBe('Export success');
    });

    it('should export schematic to PDF format', async () => {
      vi.spyOn(KiCAD, 'isFlatpak', 'get').mockReturnValue(false);
      vi.spyOn(KiCAD, 'cliPath', 'get').mockReturnValue('kicad-cli');

      const { execFile } = await import('node:child_process');
      vi.mocked(execFile).mockImplementation(makeExecFileMock({ stdout: 'Export success' }));

      const { exportSchematic } = await import('../src/kicad_commands.js');
      const result = await exportSchematic('test.kicad_sch', 'output.pdf', 'pdf');
      expect(result).toBe('Export success');
    });
  });
});
