import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Schematic } from '../src/schematic.js';
import { Resistor } from '../src/passives/chip.js';

let prevEnv: string | undefined;
let outDir: string;

beforeEach(() => {
  prevEnv = process.env.TYPECAD_BUILD_DIR;
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-build-dir-'));
  process.env.TYPECAD_BUILD_DIR = outDir;
});

afterEach(() => {
  if (prevEnv === undefined) delete process.env.TYPECAD_BUILD_DIR;
  else process.env.TYPECAD_BUILD_DIR = prevEnv;
  fs.rmSync(outDir, { recursive: true, force: true });
});

describe('TYPECAD_BUILD_DIR redirects library writes', () => {
  it('Schematic.create writes the netlist into the override directory', () => {
    const schematic = new Schematic('outdir_probe');
    const r1 = new Resistor({ value: '1 kOhm', size: '0805' });
    schematic.add(r1);
    schematic.create();

    const netPath = path.join(outDir, 'outdir_probe.net');
    expect(fs.existsSync(netPath)).toBe(true);
    expect(fs.readFileSync(netPath, 'utf8')).toContain('(ref "R1")');
    // nothing leaked into the default location
    expect(fs.existsSync(path.join(process.cwd(), 'build', 'outdir_probe.net'))).toBe(false);
  });

  it('the BOM follows the override too', () => {
    const schematic = new Schematic('outdir_bom');
    schematic.add(new Resistor({ value: '1 kOhm', size: '0805' }));
    schematic.create();
    expect(schematic.bom()).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'outdir_bom.csv'))).toBe(true);
  });
});
