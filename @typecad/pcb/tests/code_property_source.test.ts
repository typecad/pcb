import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatSourceInfoForProperty } from '../src/pcb/pcb_utils.js';
import { decodeCodeMetadata } from '../src/kicad2typecad/codec.js';

let tmp: string;
let previousCwd: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'code-meta-'));
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  previousCwd = process.cwd();
  process.chdir(tmp);
});

afterEach(() => {
  process.chdir(previousCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
});

function decoded(file: string | undefined, line: number | undefined, variable?: string) {
  const encoded = formatSourceInfoForProperty({ file, line, variable }, 'uuid-1');
  expect(encoded).toBeDefined();
  return decodeCodeMetadata(encoded!) as { n?: string; f?: string; l?: number };
}

describe('formatSourceInfoForProperty (Code property source metadata)', () => {
  it('carries file/line for NAMED components — reverse cross-probe depends on it', () => {
    const meta = decoded(path.join(tmp, 'src', 'board.ts'), 16, 'u1');
    expect(meta.n).toBe('u1');
    expect(meta.f).toBe('src/board.ts');
    expect(meta.l).toBe(16);
  });

  it('normalizes file:// URLs and Windows separators to a POSIX project-relative path', () => {
    const url = 'file:///' + path.join(tmp, 'src', 'board.ts').split(path.sep).join('/');
    expect(decoded(url, 3).f).toBe('src/board.ts');
  });

  it('keeps the full normalized path for sources outside the build cwd', () => {
    const outside = path.resolve(tmp, '..', 'elsewhere', 'lib.ts');
    const meta = decoded(outside, 9);
    expect(meta.f).toContain('elsewhere/lib.ts');
  });

  it('still carries file/line for anonymous components (round-trip matching)', () => {
    const meta = decoded(path.join(tmp, 'src', 'anon.ts'), 40);
    expect(meta.n).toBeUndefined();
    expect(meta.f).toBe('src/anon.ts');
    expect(meta.l).toBe(40);
  });
});
