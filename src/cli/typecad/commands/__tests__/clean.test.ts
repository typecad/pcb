import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ParsedArgs } from '../../parser.js';

const { run } = await import('../clean.js');

function parsedWith(args: ParsedArgs['args']): ParsedArgs {
  return {
    command: 'clean',
    subcommand: '',
    args,
    positional: [],
    passthrough: [],
    json: false,
    help: false,
    version: false,
  };
}

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-clean-'));
  prevEnv = process.env.TYPECAD_BUILD_DIR;
});

afterEach(() => {
  if (prevEnv === undefined) delete process.env.TYPECAD_BUILD_DIR;
  else process.env.TYPECAD_BUILD_DIR = prevEnv;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function makeBuildDir(like = true): string {
  const dir = path.join(tmpRoot, 'build');
  fs.mkdirSync(path.join(dir, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(dir, like ? 'board.kicad_pcb' : 'notes.txt'), 'x', 'utf8');
  fs.writeFileSync(path.join(dir, 'nested', like ? 'deep.net' : 'deep.txt'), 'x', 'utf8');
  process.env.TYPECAD_BUILD_DIR = dir;
  return dir;
}

describe('clean command', () => {
  it('removes a generated build directory recursively', async () => {
    const dir = makeBuildDir();
    await run(parsedWith({}));
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('is a no-op when there is nothing to clean', async () => {
    process.env.TYPECAD_BUILD_DIR = path.join(tmpRoot, 'absent');
    await run(parsedWith({}));
    expect(fs.existsSync(path.join(tmpRoot, 'absent'))).toBe(false);
  });

  it('refuses a directory without KiCAD build artifacts', async () => {
    const dir = makeBuildDir(false);
    await expect(run(parsedWith({}))).rejects.toThrow(/does not look like a typeCAD build directory/i);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('accepts a directory whose only KiCAD artifacts are nested', async () => {
    const dir = path.join(tmpRoot, 'nested-only');
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sub', 'board.net'), 'x', 'utf8');
    process.env.TYPECAD_BUILD_DIR = dir;
    await run(parsedWith({}));
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('removes a non-build directory with --force', async () => {
    const dir = makeBuildDir(false);
    await run(parsedWith({ force: true }));
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('refuses to remove the working directory itself', async () => {
    process.env.TYPECAD_BUILD_DIR = process.cwd();
    await expect(run(parsedWith({ force: true }))).rejects.toThrow(/Refusing to remove/i);
  });
});
