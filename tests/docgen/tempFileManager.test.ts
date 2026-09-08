import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as fsSync from 'fs';
import { TempFileManager } from '../../src/cli/docgen/utils/tempFileManager.js';

describe('TempFileManager', () => {
  let manager: TempFileManager;
  let tempBase: string;

  beforeEach(() => {
    tempBase = path.join(os.tmpdir(), `typecad-test-${Date.now()}`);
    manager = new TempFileManager(tempBase);
  });

  afterEach(async () => {
    try {
      await manager.cleanupAll();
    } catch {}
  });

  it('creates a temp file path with extension', () => {
    const filePath = manager.createTempFilePath('.svg');
    expect(filePath).toContain(tempBase);
    expect(filePath).toMatch(/\.svg$/);
  });

  it('creates a temp directory', () => {
    const dirPath = manager.createTempDir('test-dir');
    expect(dirPath).toContain('test-dir');
    expect(fsSync.existsSync(dirPath)).toBe(true);
  });

  it('writes temp file synchronously', () => {
    const filePath = manager.writeTempFile('hello', '.txt');
    const content = fsSync.readFileSync(filePath, 'utf-8');
    expect(content).toBe('hello');
  });

  it('writes temp file asynchronously', async () => {
    const filePath = await manager.writeTempFileAsync('hello async', '.txt');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('hello async');
  });

  it('cleans up a single file asynchronously', async () => {
    const filePath = await manager.writeTempFileAsync('temp', '.txt');
    await manager.cleanupFileAsync(filePath);
    await expect(fs.stat(filePath)).rejects.toThrow();
  });

  it('cleans up all files and directories', async () => {
    const file1 = await manager.writeTempFileAsync('a', '.txt');
    const file2 = await manager.writeTempFileAsync('b', '.txt');
    const dir = manager.createTempDir('subdir');

    await manager.cleanupAll();

    await expect(fs.stat(file1)).rejects.toThrow();
    await expect(fs.stat(file2)).rejects.toThrow();
    await expect(fs.stat(dir)).rejects.toThrow();
  });

  it('tracks existing files', async () => {
    const filePath = path.join(tempBase, 'tracked.txt');
    await fs.writeFile(filePath, 'test');
    manager.trackFile(filePath);

    await manager.cleanupAll();
    await expect(fs.stat(filePath)).rejects.toThrow();
  });

  it('createTempFilePath with subDir creates nested directory', () => {
    const filePath = manager.createTempFilePath('.svg', 'nested');
    expect(filePath).toContain('nested');
  });
});
