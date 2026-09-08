import { describe, it, expect } from 'vitest';
import { pathExists, ensureDir } from '../../src/cli/docgen/utils/fs.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('pathExists', () => {
  it('returns true for existing file', async () => {
    const tmpFile = path.join(os.tmpdir(), `typecad-test-exists-${Date.now()}.txt`);
    await fs.writeFile(tmpFile, 'test');
    const result = await pathExists(tmpFile);
    expect(result).toBe(true);
    await fs.unlink(tmpFile);
  });

  it('returns false for non-existing file', async () => {
    const result = await pathExists('/nonexistent/path/to/file.txt');
    expect(result).toBe(false);
  });

  it('returns true for existing directory', async () => {
    const result = await pathExists(os.tmpdir());
    expect(result).toBe(true);
  });
});

describe('ensureDir', () => {
  it('creates nested directories', async () => {
    const basePath = path.join(os.tmpdir(), `typecad-test-dir-${Date.now()}`);
    const dirPath = path.join(basePath, 'nested', 'deep');
    await ensureDir(dirPath);
    const result = await pathExists(dirPath);
    expect(result).toBe(true);
    try {
      await fs.rm(basePath, { recursive: true });
    } catch {}
  });

  it('does not throw for existing directory', async () => {
    await expect(ensureDir(os.tmpdir())).resolves.not.toThrow();
  });
});
