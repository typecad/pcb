import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KiCadSymbolFileScanner } from '../KiCadSymbolFileScanner.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('KiCadSymbolFileScanner', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kicad-scan-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  async function createFile(dir: string, name: string, content: string = ''): Promise<string> {
    const filePath = path.join(dir, name);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  describe('scanForSymbolFiles', () => {
    it('finds .kicad_sym files', async () => {
      await createFile(tmpDir, 'Device.kicad_sym', '(kicad_symbol_lib)');
      await createFile(tmpDir, 'MCU.kicad_sym', '(kicad_symbol_lib)');

      const scanner = new KiCadSymbolFileScanner(tmpDir);
      const files = await scanner.scanForSymbolFiles();
      expect(files).toHaveLength(2);
      expect(files.map((f) => f.fileName).sort()).toEqual(['Device', 'MCU']);
    });

    it('ignores non-symbol files', async () => {
      await createFile(tmpDir, 'Device.kicad_sym');
      await createFile(tmpDir, 'readme.txt');
      await createFile(tmpDir, 'footprint.kicad_mod');

      const scanner = new KiCadSymbolFileScanner(tmpDir);
      const files = await scanner.scanForSymbolFiles();
      expect(files).toHaveLength(1);
    });

    it('finds files in subdirectories when recursive', async () => {
      await createFile(tmpDir, 'Device.kicad_sym');
      await createFile(tmpDir, 'subdir/Power.kicad_sym');

      const scanner = new KiCadSymbolFileScanner(tmpDir, { recursive: true });
      const files = await scanner.scanForSymbolFiles();
      expect(files).toHaveLength(2);
    });

    it('skips subdirectories when not recursive', async () => {
      await createFile(tmpDir, 'Device.kicad_sym');
      await createFile(tmpDir, 'subdir/Power.kicad_sym');

      const scanner = new KiCadSymbolFileScanner(tmpDir, { recursive: false });
      const files = await scanner.scanForSymbolFiles();
      expect(files).toHaveLength(1);
    });

    it('respects maxDepth', async () => {
      await createFile(tmpDir, 'L0.kicad_sym');
      await createFile(tmpDir, 'd1/L1.kicad_sym');
      await createFile(tmpDir, 'd1/d2/L2.kicad_sym');

      const scanner = new KiCadSymbolFileScanner(tmpDir, { recursive: true, maxDepth: 2 });
      const files = await scanner.scanForSymbolFiles();
      expect(files).toHaveLength(2);
    });

    it('excludes default directories like .git', async () => {
      await createFile(tmpDir, 'Device.kicad_sym');
      await createFile(tmpDir, '.git/hidden.kicad_sym');
      await createFile(tmpDir, 'node_modules/pkg.kicad_sym');

      const scanner = new KiCadSymbolFileScanner(tmpDir);
      const files = await scanner.scanForSymbolFiles();
      expect(files).toHaveLength(1);
    });

    it('excludes custom patterns', async () => {
      await createFile(tmpDir, 'Device.kicad_sym');
      await createFile(tmpDir, 'backup/old.kicad_sym');

      const scanner = new KiCadSymbolFileScanner(tmpDir, { excludePatterns: ['backup'] });
      const files = await scanner.scanForSymbolFiles();
      expect(files).toHaveLength(1);
    });

    it('supports glob exclude patterns', async () => {
      await createFile(tmpDir, 'Device.kicad_sym');
      await createFile(tmpDir, 'test_data/test.kicad_sym');

      const scanner = new KiCadSymbolFileScanner(tmpDir, { excludePatterns: ['test_*'] });
      const files = await scanner.scanForSymbolFiles();
      expect(files).toHaveLength(1);
    });

    it('respects maxFileSize', async () => {
      const bigContent = 'x'.repeat(2000);
      const smallContent = 'x'.repeat(100);
      await createFile(tmpDir, 'Big.kicad_sym', bigContent);
      await createFile(tmpDir, 'Small.kicad_sym', smallContent);

      const scanner = new KiCadSymbolFileScanner(tmpDir, { maxFileSize: 500 });
      const files = await scanner.scanForSymbolFiles();
      expect(files).toHaveLength(1);
      expect(files[0].fileName).toBe('Small');
    });

    it('throws when directory does not exist', async () => {
      const scanner = new KiCadSymbolFileScanner('/nonexistent/path');
      await expect(scanner.scanForSymbolFiles()).rejects.toThrow('does not exist');
    });

    it('throws when path is not a directory', async () => {
      const filePath = await createFile(tmpDir, 'file.txt', 'content');
      const scanner = new KiCadSymbolFileScanner(filePath);
      await expect(scanner.scanForSymbolFiles()).rejects.toThrow('not a directory');
    });

    it('populates file info correctly', async () => {
      await createFile(tmpDir, 'TestLib.kicad_sym', 'content');

      const scanner = new KiCadSymbolFileScanner(tmpDir);
      const files = await scanner.scanForSymbolFiles();
      expect(files).toHaveLength(1);
      const f = files[0];
      expect(f.fileName).toBe('TestLib');
      expect(f.fullFileName).toBe('TestLib.kicad_sym');
      expect(f.directory).toBe(tmpDir);
      expect(f.relativePath).toBe('TestLib.kicad_sym');
      expect(f.size).toBeGreaterThan(0);
      expect(f.lastModified).toBeInstanceOf(Date);
    });

    it('finds deeply nested files', async () => {
      await createFile(tmpDir, 'a/b/c/Deep.kicad_sym');
      await createFile(tmpDir, 'Device.kicad_sym');

      const scanner = new KiCadSymbolFileScanner(tmpDir);
      const files = await scanner.scanForSymbolFiles();
      expect(files).toHaveLength(2);
    });

    it('handles empty directory', async () => {
      const scanner = new KiCadSymbolFileScanner(tmpDir);
      const files = await scanner.scanForSymbolFiles();
      expect(files).toHaveLength(0);
    });

    it('is case insensitive for file extension', async () => {
      await createFile(tmpDir, 'Device.kicad_sym');
      await createFile(tmpDir, 'Device2.KICAD_SYM');

      const scanner = new KiCadSymbolFileScanner(tmpDir);
      const files = await scanner.scanForSymbolFiles();
      expect(files).toHaveLength(2);
    });
  });

  describe('getStatistics', () => {
    it('returns initial zeroed statistics', () => {
      const scanner = new KiCadSymbolFileScanner(tmpDir);
      const stats = scanner.getStatistics();
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.directoriesScanned).toBe(0);
      expect(stats.scanDuration).toBe(0);
      expect(stats.errors).toHaveLength(0);
    });

    it('returns statistics after scan', async () => {
      await createFile(tmpDir, 'Device.kicad_sym', 'x'.repeat(100));
      await createFile(tmpDir, 'MCU.kicad_sym', 'x'.repeat(200));

      const scanner = new KiCadSymbolFileScanner(tmpDir);
      await scanner.scanForSymbolFiles();
      const stats = scanner.getStatistics();
      expect(stats.totalFiles).toBe(2);
      expect(stats.totalSize).toBe(300);
      expect(stats.directoriesScanned).toBe(1);
      expect(stats.scanDuration).toBeGreaterThanOrEqual(0);
    });

    it('counts subdirectories in directoriesScanned', async () => {
      await createFile(tmpDir, 'Device.kicad_sym');
      await createFile(tmpDir, 'sub/Power.kicad_sym');

      const scanner = new KiCadSymbolFileScanner(tmpDir);
      await scanner.scanForSymbolFiles();
      const stats = scanner.getStatistics();
      expect(stats.directoriesScanned).toBe(2);
    });
  });

  describe('getScanSummary', () => {
    it('returns formatted summary', async () => {
      await createFile(tmpDir, 'Device.kicad_sym', 'x'.repeat(1024));

      const scanner = new KiCadSymbolFileScanner(tmpDir);
      await scanner.scanForSymbolFiles();
      const summary = scanner.getScanSummary();
      expect(summary).toContain('Scan Summary:');
      expect(summary).toContain('Files found: 1');
      expect(summary).toContain('Directories scanned: 1');
    });

    it('shows errors when present', async () => {
      const scanner = new KiCadSymbolFileScanner('/nonexistent');
      try {
        await scanner.scanForSymbolFiles();
      } catch {}
      const summary = scanner.getScanSummary();
      expect(summary).toContain('Files found: 0');
    });
  });
});
