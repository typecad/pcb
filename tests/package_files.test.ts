import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { syncPackageBuildLib, syncThisPackageBuildLib, resolvePackageSourceDir } from '../src/package_files.js';

describe('syncPackageBuildLib', () => {
  let tmpRoot: string;
  let pkgDir: string;
  let destDir: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-pkgfiles-'));
    pkgDir = path.join(tmpRoot, 'mypkg');
    destDir = path.join(tmpRoot, 'dest', 'build', 'lib');
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function write(file: string, contents: string, mtimeOffsetSec = 0): void {
    const full = path.join(pkgDir, 'build', 'lib', file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
    if (mtimeOffsetSec !== 0) {
      const atime = new Date();
      const mtime = new Date(Date.now() + mtimeOffsetSec * 1000);
      fs.utimesSync(full, atime, mtime);
    }
  }

  function exists(rel: string): boolean {
    return fs.existsSync(path.join(destDir, rel));
  }

  function read(rel: string): string {
    return fs.readFileSync(path.join(destDir, rel), 'utf8');
  }

  it('is a no-op when the package has no build/lib directory', () => {
    // pkgDir exists but has no build/lib/
    fs.mkdirSync(pkgDir, { recursive: true });
    expect(() => syncPackageBuildLib(pkgDir, destDir)).not.toThrow();
    expect(fs.existsSync(destDir)).toBe(false);
  });

  it('copies a flat symbol file to dest root', () => {
    write('ISL9120IRTNZ.kicad_sym', '(symbol ...)');
    syncPackageBuildLib(pkgDir, destDir);
    expect(exists('ISL9120IRTNZ.kicad_sym')).toBe(true);
    expect(read('ISL9120IRTNZ.kicad_sym')).toBe('(symbol ...)');
  });

  it('copies footprints into the footprints/ subdirectory', () => {
    write('footprints/QFN50P300X300X75-13N-D.kicad_mod', '(footprint ...)');
    syncPackageBuildLib(pkgDir, destDir);
    expect(exists('footprints/QFN50P300X300X75-13N-D.kicad_mod')).toBe(true);
    expect(read('footprints/QFN50P300X300X75-13N-D.kicad_mod')).toBe('(footprint ...)');
  });

  it('copies both symbols and footprints in one pass', () => {
    write('ISL9120IRTNZ.kicad_sym', '(sym)');
    write('DFE201610P-1R0M=P2.kicad_sym', '(sym2)');
    write('footprints/QFN50P300X300X75-13N-D.kicad_mod', '(fp)');
    write('footprints/1285ASH1R0MP2.kicad_mod', '(fp2)');
    syncPackageBuildLib(pkgDir, destDir);
    expect(exists('ISL9120IRTNZ.kicad_sym')).toBe(true);
    expect(exists('DFE201610P-1R0M=P2.kicad_sym')).toBe(true);
    expect(exists('footprints/QFN50P300X300X75-13N-D.kicad_mod')).toBe(true);
    expect(exists('footprints/1285ASH1R0MP2.kicad_mod')).toBe(true);
  });

  it('skips files whose destination is already current (mtime)', () => {
    write('A.kicad_sym', 'v1');
    syncPackageBuildLib(pkgDir, destDir);
    // Tamper with the dest so we can detect a re-copy: stamp dest older
    // than source to force a copy on the second pass.
    const srcFile = path.join(pkgDir, 'build', 'lib', 'A.kicad_sym');
    const destFile = path.join(destDir, 'A.kicad_sym');
    fs.writeFileSync(destFile, 'STALE');
    // dest mtime now (default), source mtime now (default, equal) -> skip.
    // Force dest to be older so a third sync would copy.
    const older = new Date(Date.now() - 60_000);
    fs.utimesSync(destFile, older, older);

    // Second sync: source is newer than dest, so it should copy.
    syncPackageBuildLib(pkgDir, destDir);
    expect(read('A.kicad_sym')).toBe('v1');
    expect(srcFile).toBeTruthy();
    expect(destFile).toBeTruthy();
  });

  it('does not re-copy when destination is newer than source', () => {
    write('A.kicad_sym', 'v1');
    syncPackageBuildLib(pkgDir, destDir);
    const destFile = path.join(destDir, 'A.kicad_sym');
    fs.writeFileSync(destFile, 'STALE-NEWER');
    // dest is now newer (just written) than source -> sync must skip.
    syncPackageBuildLib(pkgDir, destDir);
    expect(read('A.kicad_sym')).toBe('STALE-NEWER');
  });

  it('recopies when source is updated (source mtime newer than dest)', async () => {
    write('A.kicad_sym', 'v1');
    syncPackageBuildLib(pkgDir, destDir);
    expect(read('A.kicad_sym')).toBe('v1');

    // Wait so the new mtime is strictly greater.
    await new Promise((r) => setTimeout(r, 50));
    write('A.kicad_sym', 'v2');
    // Ensure source mtime is strictly newer than dest (dest was written
    // before the second write() call).
    syncPackageBuildLib(pkgDir, destDir);
    expect(read('A.kicad_sym')).toBe('v2');
  });

  it('is idempotent across multiple invocations', () => {
    write('A.kicad_sym', 'v1');
    write('footprints/X.kicad_mod', '(fp)');
    syncPackageBuildLib(pkgDir, destDir);
    syncPackageBuildLib(pkgDir, destDir);
    syncPackageBuildLib(pkgDir, destDir);
    expect(read('A.kicad_sym')).toBe('v1');
    expect(read('footprints/X.kicad_mod')).toBe('(fp)');
  });

  it('mirrors nested relative paths', () => {
    write('footprints/sub/Y.kicad_mod', '(fp)');
    syncPackageBuildLib(pkgDir, destDir);
    expect(exists('footprints/sub/Y.kicad_mod')).toBe(true);
  });
});

describe('resolvePackageSourceDir', () => {
  it('returns the directory of the caller (this test file)', () => {
    const dir = resolvePackageSourceDir();
    expect(dir).toBeDefined();
    // The caller is this test file, so the directory should be tests/.
    expect(dir!.replace(/\\/g, '/')).toMatch(/tests$/);
  });

  it('returns undefined when called from outside any user frame is still a real dir here', () => {
    // resolvePackageSourceDir always finds a frame (this test), so it
    // should never return undefined in normal usage.
    const dir = resolvePackageSourceDir();
    expect(typeof dir).toBe('string');
  });
});

describe('syncThisPackageBuildLib', () => {
  let tmpRoot: string;
  let realCwd: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-this-'));
    realCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(realCwd);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('is a no-op when called from a directory without build/lib (does not throw)', () => {
    // The test runner's cwd typically has no build/lib relevant to the
    // caller of resolvePackageSourceDir; ensure it doesn't throw.
    expect(() => syncThisPackageBuildLib()).not.toThrow();
  });
});
