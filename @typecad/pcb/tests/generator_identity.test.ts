import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GENERATOR_NAME, generatorVersion } from '../src/utils/generator_identity.js';
import { renderSchematic } from '../src/renderers/schematic_templates.js';
import { PCB } from '../src/pcb/pcb.js';
import { Resistor } from '../src/passives/index.js';
import { SExprNode } from '../src/kicad2typecad/sexpr_tree.js';
import { KicadIRBuilder } from '../src/kicad2typecad/ir_builder.js';

/**
 * Generator identity: every file typeCAD emits is marked `typeCAD/pcb` with
 * the real package version, and a rebuild re-stamps a board even when a
 * kicad-cli resave rewrote the marker to `pcbnew`.
 */

describe('generator identity', () => {
  it('the version is auto-numbered from package.json', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8')) as {
      version: string;
    };
    expect(generatorVersion()).toBe(manifest.version);
    expect(generatorVersion()).not.toBe('0.0.0-dev');
  });

  it('schematics carry the identity', () => {
    const out = renderSchematic({ uuid: 'u', lib_symbols: [], wires: [], labels: [], symbols: [] });
    expect(out).toContain(`(generator "${GENERATOR_NAME}")`);
    expect(out).toContain(`(generator_version "${generatorVersion()}")`);
  });

  it('built boards carry the identity', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-gen-'));
    const prevCwd = process.cwd();
    try {
      process.chdir(dir);
      fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
      const pcb = new PCB('gentest');
      const r1 = new Resistor({ reference: 'R1', value: '1k', pcb: { x: 1, y: 1 } });
      pcb.create(r1);
      const boardFile = path.join(dir, 'build', 'gentest.kicad_pcb');
      expect(fs.existsSync(boardFile)).toBe(true);
      const board = fs.readFileSync(boardFile, 'utf-8');
      expect(board).toContain(`(generator "${GENERATOR_NAME}")`);
      expect(board).toContain(`(generator_version "${generatorVersion()}")`);
      expect(board).not.toContain('(generator "pcbnew")');
      expect(board).not.toContain('(generator "typecad")');
    } finally {
      process.chdir(prevCwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a rebuild re-stamps a board that kicad-cli rewrote as pcbnew', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-restamp-'));
    const prevCwd = process.cwd();
    try {
      process.chdir(dir);
      fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
      const pcb = new PCB('restamp');
      const r1 = new Resistor({ reference: 'R1', value: '1k', pcb: { x: 1, y: 1 } });
      pcb.create(r1);

      // kicad-cli resave: identity rewritten to pcbnew/10.0, content kept
      const boardFile = path.join(dir, 'build', 'restamp.kicad_pcb');
      const original = fs.readFileSync(boardFile, 'utf-8');
      const resaved = original
        .replace(/\(generator "[^"]*"\)/, '(generator "pcbnew")')
        .replace(/\(generator_version "[^"]*"\)/, '(generator_version "10.0")');
      fs.writeFileSync(boardFile, resaved);
      expect(fs.readFileSync(boardFile, 'utf-8')).toContain('(generator "pcbnew")');

      // rebuild from the same source — our identity must be restored
      const pcb2 = new PCB('restamp');
      const r2 = new Resistor({ reference: 'R1', value: '1k', pcb: { x: 1, y: 1 } });
      pcb2.create(r2);
      const rebuilt = fs.readFileSync(boardFile, 'utf-8');
      expect(rebuilt).toContain(`(generator "${GENERATOR_NAME}")`);
      expect(rebuilt).toContain(`(generator_version "${generatorVersion()}")`);
      expect(rebuilt).not.toContain('pcbnew');
      // sanity: the board is still valid and parseable
      const ir = new KicadIRBuilder().build(SExprNode.parse(rebuilt));
      expect(ir.footprints).toHaveLength(1);
    } finally {
      process.chdir(prevCwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
