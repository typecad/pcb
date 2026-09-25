import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getBuildDir } from '../../../utils/constants.js';
import { applyOutDirFlag, findBuildFile, findBuildFiles } from '../pipeline.js';
import { normalizeBareFileInvocation, parseArgv } from '../parser.js';

let prevEnv: string | undefined;
let tmpRoot: string;

beforeEach(() => {
  prevEnv = process.env.TYPECAD_BUILD_DIR;
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-outdir-'));
});

afterEach(() => {
  if (prevEnv === undefined) delete process.env.TYPECAD_BUILD_DIR;
  else process.env.TYPECAD_BUILD_DIR = prevEnv;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('getBuildDir', () => {
  it('defaults to ./build and honors TYPECAD_BUILD_DIR', () => {
    expect(getBuildDir()).toBe('./build');
    process.env.TYPECAD_BUILD_DIR = path.join(tmpRoot, 'out');
    expect(getBuildDir()).toBe(path.join(tmpRoot, 'out'));
  });
});

describe('applyOutDirFlag', () => {
  it('resolves --outDir (and --out-dir) against cwd into the env override', () => {
    applyOutDirFlag({ outDir: 'dist' });
    expect(process.env.TYPECAD_BUILD_DIR).toBe(path.resolve('dist'));

    applyOutDirFlag({ 'out-dir': path.join(tmpRoot, 'o2') });
    expect(process.env.TYPECAD_BUILD_DIR).toBe(path.join(tmpRoot, 'o2'));
  });

  it('ignores absent or boolean flags', () => {
    delete process.env.TYPECAD_BUILD_DIR;
    applyOutDirFlag({});
    applyOutDirFlag({ outDir: true });
    expect(process.env.TYPECAD_BUILD_DIR).toBeUndefined();
  });
});

describe('artifact discovery honors the override', () => {
  it('finds artifacts in the custom build dir', () => {
    const out = path.join(tmpRoot, 'out');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'board.net'), '(export)', 'utf8');
    process.env.TYPECAD_BUILD_DIR = out;

    expect(findBuildFiles('.net')).toEqual([path.join(out, 'board.net')]);
    expect(findBuildFile('.net')).toBe(path.join(out, 'board.net'));
    expect(findBuildFile('.kicad_pcb')).toBeNull();
  });
});

describe('normalizeBareFileInvocation', () => {
  it('rewrites a bare TypeScript path into a build invocation', () => {
    const parsed = parseArgv(['node', 'typecad-pcb', 'src/main.ts', '--watch', '--outDir', 'out']);
    const normalized = normalizeBareFileInvocation(parsed);
    expect(normalized.command).toBe('build');
    expect(normalized.positional).toEqual(['src/main.ts']);
    expect(normalized.args['watch']).toBe(true);
    expect(normalized.args['outDir']).toBe('out');
  });

  it('leaves real commands and flag-only invocations alone', () => {
    expect(normalizeBareFileInvocation(parseArgv(['node', 'typecad-pcb', 'build', 'main.ts'])).command).toBe('build');
    expect(normalizeBareFileInvocation(parseArgv(['node', 'typecad-pcb', 'clean'])).command).toBe('clean');
    expect(normalizeBareFileInvocation(parseArgv(['node', 'typecad-pcb', '--version'])).command).toBe('');
    expect(normalizeBareFileInvocation(parseArgv(['node', 'typecad-pcb', 'frobnicate'])).command).toBe('frobnicate');
  });
});
