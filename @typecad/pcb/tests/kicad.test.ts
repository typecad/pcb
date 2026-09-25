import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as cp from 'node:child_process';

const { mockJoin } = vi.hoisted(() => {
  const mockJoin = vi.fn((...parts: string[]) => parts.filter(Boolean).join('/').replace(/\/+/g, '/'));
  return { mockJoin };
});

vi.mock('node:path', () => ({ join: mockJoin, default: { join: mockJoin } }));
vi.mock('node:fs');
vi.mock('node:os');
vi.mock('node:child_process');

const { mockConfigGet } = vi.hoisted(() => ({ mockConfigGet: vi.fn() }));

vi.mock('../src/config.js', () => ({
  Config: vi.fn().mockImplementation(function () {
    return { get: mockConfigGet };
  }),
}));
vi.mock('../src/utils/errors.js', () => {
  class KiCadNotFoundError extends Error {
    constructor(msg?: string) {
      super(msg ?? 'KiCadNotFoundError');
      this.name = 'KiCadNotFoundError';
    }
  }
  return { KiCadNotFoundError };
});

const loggerMock = vi.hoisted(() => {
  const m = { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn(), success: vi.fn() };
  return { default: m, ...m };
});
vi.mock('../src/logging.js', () => loggerMock);

import { findExecutable, discoverKiCAD, KiCAD, getKicadCliPath } from '../src/kicad.js';
import { KiCadNotFoundError } from '../src/utils/errors.js';

describe('kicad.ts', () => {
  const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
  const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
  const mockExecSync = cp.execSync as ReturnType<typeof vi.fn>;
  const mockReaddirSync = fs.readdirSync as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    (KiCAD as any)._instance = null;
    mockPlatform.mockReturnValue('linux');
    vi.stubEnv('PATH', '/usr/bin:/usr/local/bin');
    vi.stubEnv('PATHEXT', '.EXE;.COM');
  });

  describe('findExecutable', () => {
    it('finds executable in PATH', () => {
      mockExistsSync.mockImplementation((p) => p === '/usr/bin/notepad');
      expect(findExecutable('notepad')).toBe('/usr/bin/notepad');
    });

    it('returns undefined when not found', () => {
      mockExistsSync.mockReturnValue(false);
      expect(findExecutable('nonexistent')).toBeUndefined();
    });

    it('handles PATHEXT on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      vi.stubEnv('PATH', '/usr/bin;/usr/local/bin');
      mockExistsSync.mockImplementation((p) => p === '/usr/bin/notepad.EXE');
      expect(findExecutable('notepad')).toBe('/usr/bin/notepad.EXE');
    });
  });

  describe('discoverKiCAD', () => {
    it('returns config paths when kicad_cli is set', () => {
      mockConfigGet.mockImplementation((key: string) => {
        if (key === 'kicad_cli') return '/custom/kicad-cli';
        if (key === 'kicad_path') return '/custom';
        return undefined;
      });
      const r = discoverKiCAD();
      expect(r.cliPath).toBe('/custom/kicad-cli');
      expect(r.path).toBe('/custom');
      expect(r.isFlatpak).toBe(false);
    });

    it('uses supported path when no config', () => {
      mockConfigGet.mockReturnValue(undefined);
      mockExistsSync.mockImplementation((p) => p === '/usr/share/kicad/' || p === '/usr/bin/kicad-cli');
      mockExecSync.mockImplementation(() => {
        throw new Error('no flatpak');
      });
      const r = discoverKiCAD();
      expect(r.path).toBe('/usr/share/kicad/');
      expect(r.isFlatpak).toBe(false);
      expect(r.cliPath).toBeDefined();
    });

    it('throws when only unsupported path exists', () => {
      mockConfigGet.mockReturnValue(undefined);
      mockExistsSync.mockImplementation((p) => p === 'C:/Program Files/KiCad/7.0/');
      mockExecSync.mockImplementation(() => {
        throw new Error('no flatpak');
      });
      expect(() => discoverKiCAD()).toThrow(KiCadNotFoundError);
    });

    it('throws when nothing found', () => {
      mockConfigGet.mockReturnValue(undefined);
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockImplementation(() => {
        throw new Error('no flatpak');
      });
      expect(() => discoverKiCAD()).toThrow(KiCadNotFoundError);
    });

    it('detects flatpak via use_flatpak config', () => {
      mockConfigGet.mockImplementation((key: string) => {
        if (key === 'use_flatpak') return 'true';
        return undefined;
      });
      mockExistsSync.mockImplementation(
        (p) => p === '/var/lib/flatpak/app/org.kicad.KiCad' || p === '/var/lib/flatpak/app/org.kicad.KiCad/current/',
      );
      const r = discoverKiCAD();
      expect(r.isFlatpak).toBe(true);
    });
  });

  describe('KiCAD class', () => {
    it('singleton', () => {
      const d = { path: '/t', cliPath: '/t/cli', isFlatpak: false };
      (KiCAD as any)._instance = new KiCAD(d);
      expect(KiCAD.instance).toBe((KiCAD as any)._instance);
    });

    it('resetInstance', () => {
      (KiCAD as any)._instance = new KiCAD({ path: '', cliPath: '', isFlatpak: false });
      KiCAD.resetInstance();
      expect((KiCAD as any)._instance).toBeNull();
    });

    it('static accessors', () => {
      (KiCAD as any)._instance = new KiCAD({ path: '/p', cliPath: '/c', isFlatpak: true });
      expect(KiCAD.path).toBe('/p');
      expect(KiCAD.cliPath).toBe('/c');
      expect(KiCAD.isFlatpak).toBe(true);
    });

    it('getLibraryPaths flatpak', () => {
      const k = new KiCAD({ path: '', cliPath: '', isFlatpak: true });
      const p = k.getLibraryPaths();
      expect(typeof p.symbols).toBe('string');
      expect(typeof p.footprints).toBe('string');
    });

    it('getLibraryPaths windows', () => {
      mockPlatform.mockReturnValue('win32');
      const k = new KiCAD({ path: 'C:/Kicad/', cliPath: '', isFlatpak: false });
      expect(k.getLibraryPaths().symbols).toBe('C:/Kicad/share/kicad/symbols');
    });

    it('getLibraryPaths linux', () => {
      const k = new KiCAD({ path: '/usr/', cliPath: '', isFlatpak: false });
      expect(k.getLibraryPaths().symbols).toBe('/usr/symbols');
    });

    it('getLibraryPaths linux empty path', () => {
      const k = new KiCAD({ path: '', cliPath: '', isFlatpak: false });
      expect(k.getLibraryPaths().symbols).toBe('');
    });

    it('isFlatpakInstallation', () => {
      expect(new KiCAD({ path: '', cliPath: '', isFlatpak: true }).isFlatpakInstallation()).toBe(true);
      expect(new KiCAD({ path: '', cliPath: '', isFlatpak: false }).isFlatpakInstallation()).toBe(false);
    });

    it('getSymbolsPath uses library symbols when it exists', () => {
      const k = new KiCAD({ path: '/p', cliPath: '', isFlatpak: false });
      mockExistsSync.mockReturnValue(true);
      expect(k.getSymbolsPath()).toContain('/p');
    });

    it('getSymbolsPath falls back to findSymbolsDirectory', () => {
      const k = new KiCAD({ path: '/base', cliPath: '', isFlatpak: false });
      mockExistsSync.mockImplementation((p) => p === '/base/share/kicad/symbols');
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);
      expect(k.getSymbolsPath()).toBe('/base/share/kicad/symbols');
    });

    it('findSymbolsDirectory returns undefined when nothing found', () => {
      const k = new KiCAD({ path: '/base', cliPath: '', isFlatpak: false });
      mockExistsSync.mockReturnValue(false);
      expect((k as any).findSymbolsDirectory()).toBeUndefined();
    });

    it('findSymbolsDirectory returns path when subpath exists', () => {
      const k = new KiCAD({ path: '/base', cliPath: '', isFlatpak: false });
      mockExistsSync.mockImplementation((p) => p === '/base/share/kicad/symbols');
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);
      expect((k as any).findSymbolsDirectory()).toBe('/base/share/kicad/symbols');
    });

    it('hasLocalSymbols returns true when .kicad_sym files exist', () => {
      const k = new KiCAD({ path: '/base', cliPath: '', isFlatpak: false });
      mockExistsSync.mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);
      mockReaddirSync.mockReturnValue(['file.kicad_sym'] as any);
      expect(k.hasLocalSymbols()).toBe(true);
    });

    it('hasLocalSymbols returns false when no .kicad_sym files', () => {
      const k = new KiCAD({ path: '/base', cliPath: '', isFlatpak: false });
      mockExistsSync.mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);
      mockReaddirSync.mockReturnValue(['file.txt'] as any);
      expect(k.hasLocalSymbols()).toBe(false);
    });

    it('hasLocalSymbols returns false when getSymbolsPath returns undefined', () => {
      const k = new KiCAD({ path: '/base', cliPath: '', isFlatpak: false });
      mockExistsSync.mockReturnValue(false);
      expect(k.hasLocalSymbols()).toBe(false);
    });

    it('hasLocalSymbols handles readdir errors', () => {
      const k = new KiCAD({ path: '/base', cliPath: '', isFlatpak: false });
      mockExistsSync.mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);
      mockReaddirSync.mockImplementation(() => {
        throw new Error('err');
      });
      expect(k.hasLocalSymbols()).toBe(false);
    });
  });

  describe('getLibraryPaths flatpak regression', () => {
    const mockArch = os.arch as ReturnType<typeof vi.fn>;

    it('falls back to flatpak runtime paths even when isFlatpak is false', () => {
      mockArch.mockReturnValue('x64');
      mockExistsSync.mockImplementation((p: string) => {
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols') return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols/x86_64') return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols/x86_64/stable/active/files/symbols')
          return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints') return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints/x86_64') return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints/x86_64/stable/active/files/footprints')
          return true;
        return false;
      });
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols/x86_64') return ['stable'];
        if (dir === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints/x86_64') return ['stable'];
        return [];
      });

      const k = new KiCAD({ path: '', cliPath: '', isFlatpak: false });
      const paths = k.getLibraryPaths();
      expect(paths.symbols).toBe(
        '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols/x86_64/stable/active/files/symbols',
      );
      expect(paths.footprints).toBe(
        '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints/x86_64/stable/active/files/footprints',
      );
    });

    it('prefers KiCAD.path over flatpak fallback when path is set', () => {
      mockArch.mockReturnValue('x64');
      mockExistsSync.mockImplementation((p: string) => {
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols') return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints') return true;
        if (p === '/usr/share/kicad/symbols') return true;
        return false;
      });
      mockReaddirSync.mockReturnValue(['stable']);

      const k = new KiCAD({ path: '/usr/share/kicad/', cliPath: '', isFlatpak: false });
      const paths = k.getLibraryPaths();
      expect(paths.symbols).toBe('/usr/share/kicad/symbols');
      expect(paths.footprints).toBe('/usr/share/kicad/footprints');
    });

    it('resolves flatpak paths using dynamic arch from os.arch()', () => {
      mockArch.mockReturnValue('arm64');
      mockExistsSync.mockImplementation((p: string) => {
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols') return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols/aarch64') return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols/aarch64/stable/active/files/symbols')
          return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints') return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints/aarch64') return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints/aarch64/stable/active/files/footprints')
          return true;
        return false;
      });
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols/aarch64') return ['stable'];
        if (dir === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints/aarch64') return ['stable'];
        return [];
      });

      const k = new KiCAD({ path: '', cliPath: '', isFlatpak: false });
      const paths = k.getLibraryPaths();
      expect(paths.symbols).toContain('aarch64');
      expect(paths.footprints).toContain('aarch64');
    });

    it('does not hardcode x86_64/stable — discovers branch dynamically', () => {
      mockArch.mockReturnValue('x64');
      mockExistsSync.mockImplementation((p: string) => {
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols') return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols/x86_64') return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols/x86_64/testing/active/files/symbols')
          return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints') return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints/x86_64') return true;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints/x86_64/testing/active/files/footprints')
          return true;
        return false;
      });
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir.includes('/x86_64')) return ['testing'];
        return [];
      });

      const k = new KiCAD({ path: '', cliPath: '', isFlatpak: false });
      const paths = k.getLibraryPaths();
      expect(paths.symbols).toContain('testing');
      expect(paths.symbols).not.toContain('stable');
      expect(paths.footprints).toContain('testing');
      expect(paths.footprints).not.toContain('stable');
    });

    it('isFlatpak=true uses flatpak runtime paths and falls back to path-based when runtimes missing', () => {
      mockArch.mockReturnValue('x64');
      mockExistsSync.mockImplementation((p: string) => {
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols') return false;
        if (p === '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints') return false;
        if (p === '/usr/share/kicad/symbols') return true;
        if (p === '/usr/share/kicad/footprints') return true;
        return false;
      });
      mockReaddirSync.mockReturnValue([]);

      const k = new KiCAD({ path: '/usr/share/kicad/', cliPath: '', isFlatpak: true });
      const paths = k.getLibraryPaths();
      expect(paths.symbols).toBe('/usr/share/kicad/symbols');
      expect(paths.footprints).toBe('/usr/share/kicad/footprints');
    });
  });

  describe('getKicadCliPath', () => {
    it('returns KiCAD.cliPath', () => {
      vi.spyOn(KiCAD, 'instance', 'get').mockReturnValue({ cliPath: '/cli' } as any);
      expect(getKicadCliPath()).toBe('/cli');
    });
  });
});
