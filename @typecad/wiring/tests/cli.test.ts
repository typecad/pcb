import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgv, CliUsageError } from '../src/cli/cli.js';
import { resolveEntry } from '../src/cli/run.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));

describe('parseArgv', () => {
  it('returns defaults for no arguments', () => {
    const options = parseArgv([]);
    expect(options.command).toBe('generate');
    expect(options.entry).toBeUndefined();
    expect(options.out).toBeUndefined();
    expect(options.bom).toBeUndefined();
    expect(options.json).toBe(false);
    expect(options.help).toBe(false);
    expect(options.version).toBe(false);
  });

  it('accepts a positional entry file', () => {
    expect(parseArgv(['wiring.ts']).entry).toBe('wiring.ts');
  });

  it('parses validate, init and bom subcommands', () => {
    expect(parseArgv(['validate', 'wiring.ts']).command).toBe('validate');
    expect(parseArgv(['validate', 'wiring.ts']).entry).toBe('wiring.ts');
    expect(parseArgv(['init']).command).toBe('init');
    expect(parseArgv(['init', 'my/wiring.ts']).entry).toBe('my/wiring.ts');
    expect(parseArgv(['bom', 'wiring.ts']).command).toBe('bom');
    expect(parseArgv(['bom', '--grouped']).bomGrouped).toBe(true);
  });

  it('parses --out and -o in both forms', () => {
    expect(parseArgv(['--out', 'build']).out).toBe('build');
    expect(parseArgv(['-o', 'build']).out).toBe('build');
    expect(parseArgv(['--out=build']).out).toBe('build');
  });

  it('parses --bom as boolean and --bom=file as an explicit path', () => {
    expect(parseArgv(['--bom']).bom).toBe(true);
    expect(parseArgv(['--bom=my.csv']).bom).toBe('my.csv');
  });

  it('parses --bom=grouped as grouped BOM mode', () => {
    const options = parseArgv(['--bom=grouped']);
    expect(options.bom).toBe(true);
    expect(options.bomGrouped).toBe(true);
  });

  it('parses --strict, --watch, --force, --quiet and --grouped flags', () => {
    expect(parseArgv(['--strict']).strict).toBe(true);
    expect(parseArgv(['--watch']).watch).toBe(true);
    expect(parseArgv(['-w']).watch).toBe(true);
    expect(parseArgv(['--force']).force).toBe(true);
    expect(parseArgv(['--quiet']).quiet).toBe(true);
    expect(parseArgv(['-q']).quiet).toBe(true);
    expect(parseArgv(['--grouped']).bomGrouped).toBe(true);
  });

  it('parses --cutlist as boolean and --cutlist=file as an explicit path', () => {
    expect(parseArgv(['--cutlist']).cutlist).toBe(true);
    expect(parseArgv(['--cutlist=wires.csv']).cutlist).toBe('wires.csv');
  });

  it('parses --format and validates the value', () => {
    expect(parseArgv(['--format', 'svg']).format).toBe('svg');
    expect(parseArgv(['-f', 'PNG']).format).toBe('png');
    expect(parseArgv(['--format=pdf']).format).toBe('pdf');
    expect(parseArgv(['--format', 'dot']).format).toBe('dot');
    expect(() => parseArgv(['--format', 'jpg'])).toThrow(/Unsupported format/);
    expect(() => parseArgv(['-f'])).toThrow(/requires a format value/);
  });

  it('rejects unknown flags', () => {
    expect(() => parseArgv(['--nope'])).toThrow(CliUsageError);
    expect(() => parseArgv(['--nope'])).toThrow(/Unknown option/);
  });

  it('rejects --out without a value', () => {
    expect(() => parseArgv(['--out'])).toThrow(/requires a directory/);
    expect(() => parseArgv(['-o'])).toThrow(/requires a directory/);
  });

  it('rejects multiple positional arguments', () => {
    expect(() => parseArgv(['a.ts', 'b.ts'])).toThrow(/Unexpected argument/);
  });
});

describe('resolveEntry', () => {
  const tmpDir = path.join(testDir, '.tmp', 'cli');

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'marker.txt'), 'x');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('accepts an explicit existing path', () => {
    const entry = resolveEntry({ entry: path.join(tmpDir, 'marker.txt') });
    expect(entry).toBe(path.resolve(path.join(tmpDir, 'marker.txt')));
  });

  it('throws for an explicit missing path', () => {
    expect(() =>
      resolveEntry({ entry: 'does-not-exist.ts' })
    ).toThrow(/Entry file not found/);
  });

  it('throws with the probed candidates when no entry is given', () => {
    // Probe from an empty directory so no default candidate can exist
    const previousCwd = process.cwd();
    const emptyDir = fs.mkdtempSync(path.join(tmpDir, 'empty-'));
    process.chdir(emptyDir);
    try {
      expect(() =>
        resolveEntry({})
      ).toThrow(/wiring\.ts/);
    } finally {
      process.chdir(previousCwd);
    }
  });
});
