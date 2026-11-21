import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectEntryFile } from '../pipeline.js';
import { clearConfigCache } from '../../../config.js';

let tmp: string;
let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-entry-'));
  fs.mkdirSync(path.join(tmp, 'src'));
  process.chdir(tmp);
  clearConfigCache();
});

afterEach(() => {
  process.chdir(prevCwd);
  clearConfigCache();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('detectEntryFile (no typecad.conf.ts)', () => {
  it('picks the lone source file', () => {
    fs.writeFileSync(path.join(tmp, 'src', 'board.ts'), '');
    expect(detectEntryFile()).toBe('./src/board.ts');
  });

  it('ignores the machine-owned _sync.ts sidecar the layout view adds', () => {
    // a project without a config stopped building after its first layout
    // apply: the sidecar made src/ hold two files and auto-detect gave up
    fs.writeFileSync(path.join(tmp, 'src', 'board.ts'), '');
    fs.writeFileSync(path.join(tmp, 'src', '_sync.ts'), '');
    fs.writeFileSync(path.join(tmp, 'src', '_sync.left.ts'), '');
    expect(detectEntryFile()).toBe('./src/board.ts');
  });

  it('still refuses to guess between two real sources', () => {
    fs.writeFileSync(path.join(tmp, 'src', 'a.ts'), '');
    fs.writeFileSync(path.join(tmp, 'src', 'b.ts'), '');
    expect(detectEntryFile()).toBeNull();
  });
});
