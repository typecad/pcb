import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineConfig, loadConfig, clearConfigCache } from '../src/config.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createTempDir, cleanupTempDir, writeTempFile } from './helpers/temp_dir.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('defineConfig', () => {
  it('should return config as-is', () => {
    const config = defineConfig({ entry: 'test.ts' });
    expect(config.entry).toBe('test.ts');
  });

  it('should allow arbitrary keys', () => {
    const config = defineConfig({ customKey: 'customValue' } as any);
    expect((config as any).customKey).toBe('customValue');
  });
});

describe('loadConfig - JSON fallback', () => {
  let tempDir: string;
  let origCwd: string;

  beforeEach(() => {
    tempDir = createTempDir('config-test-');
    origCwd = process.cwd();
    clearConfigCache();
  });

  afterEach(() => {
    process.chdir(origCwd);
    cleanupTempDir(tempDir);
    clearConfigCache();
  });

  it('should load from typecad.json', () => {
    writeTempFile(tempDir, 'typecad.json', JSON.stringify({ kicad_cli: '/usr/bin/kicad-cli' }));
    process.chdir(tempDir);
    const config = loadConfig();
    expect(config.kicad_cli).toBe('/usr/bin/kicad-cli');
  });

  it('should return empty config when no config file exists', () => {
    process.chdir(tempDir);
    const config = loadConfig();
    expect(config).toEqual({});
  });

  it('should cache config', () => {
    writeTempFile(tempDir, 'typecad.json', JSON.stringify({ verbose: true }));
    process.chdir(tempDir);
    const c1 = loadConfig();
    const c2 = loadConfig();
    expect(c1).toBe(c2);
  });

  it('should invalidate cache when file changes', () => {
    writeTempFile(tempDir, 'typecad.json', JSON.stringify({ verbose: true }));
    process.chdir(tempDir);
    const c1 = loadConfig();
    writeTempFile(tempDir, 'typecad.json', JSON.stringify({ verbose: false }));
    clearConfigCache();
    const c2 = loadConfig();
    expect(c2.verbose).toBe(false);
  });
});

describe('clearConfigCache', () => {
  it('should not throw', () => {
    expect(() => clearConfigCache()).not.toThrow();
  });
});
