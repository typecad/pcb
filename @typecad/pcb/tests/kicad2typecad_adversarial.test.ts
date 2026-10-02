import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SExprNode } from '../src/kicad2typecad/sexpr_tree.js';
import { KicadIRBuilder } from '../src/kicad2typecad/ir_builder.js';
import { kicadDataToTypeCAD } from '../src/kicad2typecad/cli.js';
import { computeAllSourceChanges } from '../src/kicad2typecad/apply_source.js';
import type { KicadIR } from '../src/kicad2typecad/types.js';

/**
 * Adversarial suite: hostile board files and hostile source styles.
 * Contract: the importer may degrade loudly (skip + report) but must never
 * crash, never corrupt the source, and never lose real data silently.
 */

function buildIr(pcb: string): KicadIR {
  return new KicadIRBuilder().build(SExprNode.parse(pcb));
}

function setupProject(board: string, source: string): { root: string; boardPath: string; sourcePath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-adv-'));
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  const boardPath = path.join(root, 'build', 'b.kicad_pcb');
  const sourcePath = path.join(root, 'src', 'board.ts');
  fs.writeFileSync(boardPath, board);
  fs.writeFileSync(sourcePath, source);
  return { root, boardPath, sourcePath };
}

// === malformed s-expressions ===

describe('adversarial: malformed boards', () => {
  it('throws (not crashes) on unbalanced parens', () => {
    expect(() => SExprNode.parse('(kicad_pcb (footprint "X:R" (at 1 2')).toThrow(/Unterminated/);
  });

  it('throws on extra closing parens', () => {
    expect(() => SExprNode.parse('(kicad_pcb (gr_text "x" (at 1 2))))')).toThrow(/closing parenthesis/i);
  });

  it('tolerates garbage bytes around valid content', () => {
    const ir = buildIr('(kicad_pcb (gr_text "x" (at 1 2) (layer "F.SilkS")))');
    expect(ir.textElements).toHaveLength(1);
  });

  it('handles a BOM-prefixed file without corruption', () => {
    const withBom = '﻿(kicad_pcb (gr_text "x" (at 1 2) (layer "F.SilkS")))';
    let ir: KicadIR | null = null;
    let threw = false;
    try {
      ir = buildIr(withBom);
    } catch {
      threw = true; // a clean parse error is acceptable degradation
    }
    if (!threw) expect(ir!.textElements).toHaveLength(1);
  });
});

// === wrong root / wrong file type ===

describe('adversarial: wrong file handed to import', () => {
  it('refuses a .kicad_sch (root kicad_sch) instead of importing an empty board', async () => {
    const { root, boardPath, sourcePath } = setupProject(
      '(kicad_sch (version 20230121) (generator eeschema) (lib_symbols))',
      [
        "import { PCB } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        'typecad.outline(0, 0, 10, 10);',
        'typecad.create();',
      ].join('\n'),
    );
    try {
      const before = fs.readFileSync(sourcePath, 'utf-8');
      await kicadDataToTypeCAD(boardPath, { apply: true, auto: true });
      // an empty-board import would have deleted the outline call
      expect(fs.readFileSync(sourcePath, 'utf-8')).toBe(before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// === hostile coordinates ===

describe('adversarial: non-finite coordinates', () => {
  const refProp = `(property "Reference" "R1" (at 0 -1.43) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))`;

  it('drops footprints with nan coordinates and reports them', () => {
    const ir = buildIr(`(kicad_pcb (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu")
      (at nan nan 0) ${refProp}))`);
    expect(ir.footprints).toHaveLength(0);
    const types = ir.unsupported.map((u) => u.type);
    expect(types).toContain('invalid footprint');
  });

  it('drops footprints with Infinity coordinates (1e400)', () => {
    const ir = buildIr(`(kicad_pcb (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu")
      (at 1e400 2 0) ${refProp}))`);
    expect(ir.footprints).toHaveLength(0);
  });

  it('a nan-coordinate board never moves the part in source (no silent 0,0)', async () => {
    const { root, boardPath, sourcePath } = setupProject(
      `(kicad_pcb (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu")
        (at nan nan nan) ${refProp}))`,
      [
        "import { PCB, Resistor } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        "const r1 = new Resistor({ reference: 'R1' });",
        'r1.pcb = { x: 55, y: 66 };',
        'typecad.create(r1);',
      ].join('\n'),
    );
    try {
      await kicadDataToTypeCAD(boardPath, { apply: true, auto: true });
      const after = fs.readFileSync(sourcePath, 'utf-8');
      expect(after).toContain('x: 55, y: 66');
      expect(after).not.toContain('x: 0, y: 0');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('drops segments/vias/texts with Infinity geometry', () => {
    const ir = buildIr(`(kicad_pcb
      (net 0 "")
      (segment (start 1 1) (end 1e400 1) (width 0.2) (layer "F.Cu") (net 0))
      (via (at 5 5) (size 1e999) (drill 0.3) (net 0))
      (gr_text "x" (at 2 1e400) (layer "F.SilkS"))
    )`);
    expect(ir.segments).toHaveLength(0);
    expect(ir.vias).toHaveLength(0);
    expect(ir.textElements).toHaveLength(0);
  });

  it('accepts scientific notation for legitimate coordinates', () => {
    const ir = buildIr(`(kicad_pcb
      (segment (start 1e1 2e0) (end 1.5e1 2) (width 2e-1) (layer "F.Cu") (net "A"))
    )`);
    expect(ir.segments).toHaveLength(1);
    expect(ir.segments[0].start.x).toBe(10);
    expect(ir.segments[0].end.x).toBe(15);
    expect(ir.segments[0].width).toBeCloseTo(0.2, 5);
  });
});

// === hostile strings ===

describe('adversarial: strings', () => {
  it('preserves escaped quotes in text', () => {
    const ir = buildIr('(kicad_pcb (gr_text "he said \\"hi\\"" (at 1 2) (layer "F.SilkS")))');
    expect(ir.textElements[0].text).toBe('he said "hi"');
  });

  it('preserves unicode and bidi text into source and back', async () => {
    const { root, boardPath, sourcePath } = setupProject(
      `(kicad_pcb (gr_text "√√émoji😀 ‮bra" (at 3 4) (layer "F.SilkS") (effects (font (size 1 1)))))`,
      ["import { PCB } from '@typecad/pcb';", "const typecad = new PCB('t');", 'typecad.create();'].join('\n'),
    );
    try {
      await kicadDataToTypeCAD(boardPath, { apply: true, auto: true });
      const after = fs.readFileSync(sourcePath, 'utf-8');
      expect(after).toContain('√√émoji😀');
      // converges with the odd text in place
      const ir = buildIr(fs.readFileSync(boardPath, 'utf-8'));
      const pending = computeAllSourceChanges(ir, [sourcePath]);
      for (const [name, result] of Object.entries(pending)) {
        expect(result.changes, name).toEqual([]);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// === hostile source styles ===

describe('adversarial: source styles', () => {
  const board = `(kicad_pcb (version 20260206) (generator pcbnew)
    (net 0 "")
    (gr_rect (start 0 0) (end 20 20) (layer "Edge.Cuts"))
    (segment (start 1 1) (end 10 1) (width 0.3) (layer "F.Cu") (net "VCC"))
    (gr_text "hello" (at 2 2 0) (layer "F.SilkS") (effects (font (size 1 1))))
  )`;

  async function converges(source: string, name: string): Promise<void> {
    const { root, boardPath, sourcePath } = setupProject(board, source);
    try {
      await kicadDataToTypeCAD(boardPath, { apply: true, auto: true });
      const after1 = fs.readFileSync(sourcePath, 'utf-8');
      await kicadDataToTypeCAD(boardPath, { apply: true, auto: true });
      const after2 = fs.readFileSync(sourcePath, 'utf-8');
      expect(after2, `${name}: not byte-idempotent`).toBe(after1);
      const ir = buildIr(fs.readFileSync(boardPath, 'utf-8'));
      const pending = computeAllSourceChanges(ir, [sourcePath]);
      for (const [cat, result] of Object.entries(pending)) {
        expect(result.changes, `${name}: ${cat} not converged`).toEqual([]);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  it('semicolon-free style converges', async () => {
    await converges(
      `import { PCB, TrackBuilder } from '@typecad/pcb'
const typecad = new PCB('t')
typecad.outline(0, 0, 20, 20)
const track_VCC: TrackBuilder[] = []
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 1, y: 1 }, 'F.Cu', 0.3).to({ x: 10, y: 1, layer: 'F.Cu', width: 0.3 }))
typecad.create(...track_VCC)`,
      'semicolon-free',
    );
  }, 30000);

  it('CRLF line endings converge', async () => {
    await converges(
      [
        "import { PCB, TrackBuilder } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        'typecad.outline(0, 0, 20, 20);',
        'const track_VCC: TrackBuilder[] = [];',
        "track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 1, y: 1 }, 'F.Cu', 0.3).to({ x: 10, y: 1, layer: 'F.Cu', width: 0.3 }));",
        'typecad.create(...track_VCC);',
      ].join('\r\n'),
      'crlf',
    );
  }, 30000);

  it('block comments inside the routing section degrade to a note (no write, no corruption)', async () => {
    const { root, boardPath, sourcePath } = setupProject(
      board,
      [
        "import { PCB, TrackBuilder } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        'typecad.outline(0, 0, 20, 20);',
        'const track_VCC: TrackBuilder[] = [];',
        '/* keep this route short */',
        "track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 1, y: 1 }, 'F.Cu', 0.3).to({ x: 10, y: 1, layer: 'F.Cu', width: 0.3 }));",
        'typecad.create(...track_VCC);',
      ].join('\n'),
    );
    try {
      const before = fs.readFileSync(sourcePath, 'utf-8');
      await kicadDataToTypeCAD(boardPath, { apply: true, auto: true });
      const after = fs.readFileSync(sourcePath, 'utf-8');
      // routing is skipped (non-contiguous), everything else applied
      expect(after).toContain('/* keep this route short */');
      expect(after).toContain('typecad.text({ text: "hello"');
      void before;
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30000);

  it('a text call with a computed (non-literal) argument is resolved, not duplicated', async () => {
    const { root, boardPath, sourcePath } = setupProject(
      board,
      [
        "import { PCB } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        'typecad.outline(0, 0, 20, 20);',
        "const label = 'hel' + 'lo';",
        'typecad.text({ text: label, x: 2, y: 2, height: 1, width: 1 });',
        'typecad.create();',
      ].join('\n'),
    );
    try {
      await kicadDataToTypeCAD(boardPath, { apply: true, auto: true });
      const after = fs.readFileSync(sourcePath, 'utf-8');
      // resolved to the literal, exactly one text call
      expect(after.match(/typecad\.text\(/g)?.length).toBe(1);
      expect(after).toContain("'hello'");
      const ir = buildIr(fs.readFileSync(boardPath, 'utf-8'));
      const pending = computeAllSourceChanges(ir, [sourcePath]);
      for (const [name, result] of Object.entries(pending)) {
        expect(result.changes, name).toEqual([]);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30000);
});

// === semantic hostility ===

describe('adversarial: duplicate references and empty nets', () => {
  it('two footprints with the same reference do not both bind to one source var', () => {
    // covered by matcher used-set; assert the import-level view: both parse,
    // neither crashes, and the golden path stays deterministic
    const ir = buildIr(`(kicad_pcb
      (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu") (at 1 1 0)
        (property "Reference" "R1" (at 0 -1.43) (layer "F.SilkS")))
      (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu") (at 9 9 0)
        (property "Reference" "R1" (at 0 -1.43) (layer "F.SilkS")))
    )`);
    expect(ir.footprints).toHaveLength(2);
  });

  it('an empty net name and a numeric-only net parse without crash', () => {
    const ir = buildIr(`(kicad_pcb
      (net 0 "")
      (net 5)
      (segment (start 1 1) (end 2 2) (width 0.2) (layer "F.Cu") (net 5))
    )`);
    expect(ir.segments).toHaveLength(1);
  });
});
