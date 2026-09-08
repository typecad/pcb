import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTempDir, cleanupTempDir } from './helpers/temp_dir.js';

describe('pcb_board_loader', () => {
  let tempDir: string;
  let origCwd: string;

  beforeEach(() => {
    tempDir = createTempDir('board-loader-test-');
    origCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(origCwd);
    cleanupTempDir(tempDir);
  });

  it('should return empty array when no board file exists', async () => {
    process.chdir(tempDir);
    const { loadExistingBoardElements } = await import('../src/pcb/pcb_board_loader.js');
    const elements = loadExistingBoardElements('nonexistent');
    expect(elements).toEqual([]);
  });

  it('should return empty array for malformed content', async () => {
    process.chdir(tempDir);
    const buildDir = path.join(tempDir, 'build');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'test.kicad_pcb'), 'this is not valid sexpr');
    const { loadExistingBoardElements } = await import('../src/pcb/pcb_board_loader.js');
    const elements = loadExistingBoardElements('test');
    expect(elements).toEqual([]);
  });

  it('should return elements for valid kicad_pcb', async () => {
    process.chdir(tempDir);
    const buildDir = path.join(tempDir, 'build');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(
      path.join(buildDir, 'test.kicad_pcb'),
      '(kicad_pcb (version 20221018) (generator pcbnew)\n  (net 0 "")\n  (net 1 "VCC")\n)',
    );
    const { loadExistingBoardElements } = await import('../src/pcb/pcb_board_loader.js');
    const elements = loadExistingBoardElements('test');
    expect(elements).toBeDefined();
    expect(Array.isArray(elements)).toBe(true);
  });
});
