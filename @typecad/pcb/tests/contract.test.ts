import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTempDir, cleanupTempDir, writeTempFile, readTempFile } from './helpers/temp_dir.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFile: vi.fn(),
}));

vi.mock('../src/kicad.js', () => ({
  KiCAD: {
    instance: { cliPath: 'kicad-cli', path: '/kicad', isFlatpak: false },
    cliPath: 'kicad-cli',
    path: '/kicad',
    isFlatpak: false,
  },
  discoverKiCAD: vi.fn(),
  kicad_cli_path: 'kicad-cli',
}));

describe('Contract', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir('contract-test-');
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  async function importContract() {
    return await import('../src/contract.js');
  }

  it('should be importable without errors', async () => {
    const mod = await importContract();
    expect(mod.exportContract).toBeDefined();
    expect(mod.HwContract).toBeUndefined();
  });

  it('should export all required types', async () => {
    const mod = await importContract();
    expect(mod).toHaveProperty('exportContract');
  });
});
