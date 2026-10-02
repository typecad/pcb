import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { kicadDataToTypeCAD } from '../src/kicad2typecad/cli.js';
import { computeAllSourceChanges } from '../src/kicad2typecad/apply_source.js';
import { KicadIRBuilder } from '../src/kicad2typecad/ir_builder.js';
import { SExprNode } from '../src/kicad2typecad/sexpr_tree.js';
import { analyzeFile } from '../src/kicad2typecad/source_analyzer.js';
import { fingerprintIR } from '../src/kicad2typecad/safety.js';
import type { KicadIR } from '../src/kicad2typecad/types.js';

/**
 * Hardening suite: the import pipeline proves itself on every run.
 *  - dry-run never writes
 *  - burn-in: apply converges and is byte-idempotent
 *  - golden corpus: the repo's real boards parse; rd_skeleton's board and
 *    source are exactly in sync
 *  - fuzz: randomized boards × randomized source styles always parse after
 *    apply, converge, and stay byte-stable
 */

function buildIr(pcb: string): KicadIR {
  return new KicadIRBuilder().build(SExprNode.parse(pcb));
}

describe('hardening: --dry-run writes nothing', () => {
  it('previews changes without modifying source', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-dryrun-'));
    try {
      fs.mkdirSync(path.join(root, 'build'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      const board = `(kicad_pcb (version 20260206) (generator pcbnew)
        (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts"))
        (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu")
          (at 5 5 0)
          (property "Reference" "R1" (at 0 -1.43) (layer "F.SilkS")
            (effects (font (size 1 1) (thickness 0.15)))))
      )`;
      fs.writeFileSync(path.join(root, 'build', 'b.kicad_pcb'), board);
      const sourcePath = path.join(root, 'src', 'board.ts');
      const original = [
        "import { PCB, Resistor } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        'typecad.outline(0, 0, 10, 10);',
        "const r1 = new Resistor({ reference: 'R1' });",
        'r1.pcb = { x: 1, y: 1 };',
        'typecad.create(r1);',
      ].join('\n');
      fs.writeFileSync(sourcePath, original);

      await kicadDataToTypeCAD(path.join(root, 'build', 'b.kicad_pcb'), { apply: true, dryRun: true });

      expect(fs.readFileSync(sourcePath, 'utf-8')).toBe(original);
      // and no snapshot was taken either
      expect(fs.existsSync(path.join(root, '.typecad-import'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('hardening: burn-in (convergence + byte idempotency)', () => {
  it('two auto cycles leave a parseable, fully converged, byte-stable file', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-burnin-'));
    try {
      fs.mkdirSync(path.join(root, 'build'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      const board = `(kicad_pcb (version 20260206) (generator pcbnew)
        (net 0 "")
        (gr_rect (start 0 0) (end 20 20) (layer "Edge.Cuts"))
        (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu")
          (at 8 9 90)
          (property "Reference" "R1" (at 0 -1.43) (layer "F.SilkS")
            (effects (font (size 1 1) (thickness 0.15)))))
        (segment (start 1 1) (end 8 9) (width 0.3) (layer "F.Cu") (net "A"))
        (via (at 8 9) (size 0.6) (drill 0.3) (net "A"))
        (gr_text "hi" (at 2 2 0) (layer "F.SilkS") (effects (font (size 1 1))))
      )`;
      fs.writeFileSync(path.join(root, 'build', 'b.kicad_pcb'), board);
      const sourcePath = path.join(root, 'src', 'board.ts');
      fs.writeFileSync(
        sourcePath,
        [
          "import { PCB, Resistor } from '@typecad/pcb';",
          "const typecad = new PCB('t');",
          'typecad.outline(0, 0, 20, 20);',
          "const r1 = new Resistor({ reference: 'R1' });",
          'r1.pcb = { x: 1, y: 1 };',
          'typecad.create(r1);',
        ].join('\n'),
      );

      const boardPath = path.join(root, 'build', 'b.kicad_pcb');
      await kicadDataToTypeCAD(boardPath, { apply: true, auto: true });
      expect(analyzeFile(sourcePath)).not.toBeNull();

      const afterFirst = fs.readFileSync(sourcePath, 'utf-8');
      await kicadDataToTypeCAD(boardPath, { apply: true, auto: true });

      // fully converged: nothing pending in any category
      const ir = buildIr(fs.readFileSync(boardPath, 'utf-8'));
      const pending = computeAllSourceChanges(ir, [sourcePath]);
      for (const [name, result] of Object.entries(pending)) {
        expect(result.changes, `${name} should be converged`).toEqual([]);
      }
      // byte idempotent
      expect(fs.readFileSync(sourcePath, 'utf-8')).toBe(afterFirst);
      // the applied content is real: position, text, track
      expect(afterFirst).toContain('x: 8, y: 9');
      expect(afterFirst).toContain('"hi"');
      expect(afterFirst).toContain('track_A');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30000);
});

describe('hardening: golden corpus (repo boards)', () => {
  const hwRoot = path.resolve(__dirname, '../../../rd_skeleton/hw/build');

  const boards = [
    'mod-ec.kicad_pcb',
    'simple_board.kicad_pcb',
    'typecad_project.kicad_pcb',
    'rd_skeleton.kicad_pcb',
    'upgrade_test.kicad_pcb',
  ];

  for (const board of boards) {
    it(`${board}: parses into a non-trivial IR`, () => {
      const file = path.join(hwRoot, board);
      if (!fs.existsSync(file)) return; // corpus is repo-local; skip elsewhere
      const ir = buildIr(fs.readFileSync(file, 'utf-8'));
      expect(ir.footprints.length + ir.segments.length + ir.zones.length).toBeGreaterThan(0);
      // fingerprint must be computable and stable within this process
      expect(fingerprintIR(ir)).toMatch(/^[0-9a-f]{16}$/);
    });
  }

  it('rd_skeleton mod-ec: board and committed source are exactly in sync', () => {
    const boardFile = path.join(hwRoot, 'mod-ec.kicad_pcb');
    const srcDir = path.resolve(__dirname, '../../../rd_skeleton/hw/src');
    if (!fs.existsSync(boardFile) || !fs.existsSync(srcDir)) return;

    const ir = buildIr(fs.readFileSync(boardFile, 'utf-8'));
    const sourceFiles = [
      path.join(srcDir, 'mod-ec.ts'),
      path.join(srcDir, 'simple.ts'),
      path.join(srcDir, 'ATtiny3227_M.ts'),
    ].filter((f) => fs.existsSync(f));
    const pending = computeAllSourceChanges(ir, sourceFiles);
    for (const [name, result] of Object.entries(pending)) {
      // A freshly committed repo is in sync; any pending change here means a
      // regression desynchronized the write-back.
      expect(result.changes, `${name} should be in sync with the committed board`).toEqual([]);
    }
  });
});

// === fuzz: randomized boards × randomized source styles ===

/** Deterministic PRNG (mulberry32) so failures reproduce from the seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FuzzCase {
  board: string;
  source: string;
}

function generateCase(rand: () => number): FuzzCase {
  const rint = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const rnum = (lo: number, hi: number, dp = 2) => Number((lo + rand() * (hi - lo)).toFixed(dp));

  const outline = { w: rint(15, 40), h: rint(15, 40) };
  const netName = rand() < 0.5 ? 'VCC' : 'SIG_A';
  const segCount = rint(1, 3);
  const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  let cx = rnum(1, 5);
  let cy = rnum(1, 5);
  for (let i = 0; i < segCount; i++) {
    const nx = Number((cx + rnum(1, 8)).toFixed(2));
    const ny = Number((cy + rnum(1, 8)).toFixed(2));
    segs.push({ x1: cx, y1: cy, x2: nx, y2: ny });
    cx = nx;
    cy = ny;
  }
  const viaAtEnd = rand() < 0.5 && segs.length > 0;

  const labels = ['GND', 'GND', 'X', 'X', 'PROBE', 'V1'].slice(0, rint(1, 4));
  const labelPos = labels.map(() => ({ x: rnum(1, outline.w - 1), y: rnum(1, outline.h - 1) }));

  const board = `(kicad_pcb (version 20260206) (generator pcbnew)
    (net 0 "")
    (gr_rect (start 0 0) (end ${outline.w} ${outline.h}) (layer "Edge.Cuts"))
    ${segs.map((s) => `(segment (start ${s.x1} ${s.y1}) (end ${s.x2} ${s.y2}) (width 0.3) (layer "F.Cu") (net "${netName}"))`).join('\n    ')}
    ${viaAtEnd ? `(via (at ${cx} ${cy}) (size 0.6) (drill 0.3) (net "${netName}"))` : ''}
    ${labels.map((l, i) => `(gr_text "${l}" (at ${labelPos[i].x} ${labelPos[i].y} 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))`).join('\n    ')}
  )`;

  // source style knobs
  const receiver = rand() < 0.5 ? 'typecad' : 'board';
  const doubleQuotes = rand() < 0.5;
  const q = (s: string) => (doubleQuotes ? `"${s}"` : `'${s}'`);
  const multiline = rand() < 0.5;
  const customTrackVar = rand() < 0.5 ? 'routes' : null;

  const zoneLines = multiline
    ? [
        `${receiver}.zone({`,
        `  net: ${q('GND')},`,
        `  layers: [${q('F.Cu')}],`,
        `  x: 0, y: 0, width: ${outline.w}, height: ${outline.h},`,
        `  minThickness: 0.254,`,
        '});',
      ]
    : [
        `${receiver}.zone({ net: ${q('GND')}, layers: [${q('F.Cu')}], x: 0, y: 0, width: ${outline.w}, height: ${outline.h}, minThickness: 0.254 });`,
      ];

  const trackVar = customTrackVar ?? 'track_VCC';
  const source = [
    `import { PCB, TrackBuilder } from '@typecad/pcb';`,
    `const ${receiver} = new PCB('fz');`,
    `${receiver}.outline(0, 0, ${outline.w}, ${outline.h});`,
    ...zoneLines,
    ...(segs.length > 0
      ? [
          `let ${trackVar}: TrackBuilder[] = [];`,
          `${trackVar}.push(${receiver}.track({ net: ${q(netName)} }).from({ x: ${segs[0].x1}, y: ${segs[0].y1} }, ${q('F.Cu')}, 0.3)${segs
            .map((s) => `.to({ x: ${s.x2}, y: ${s.y2}, layer: ${q('F.Cu')}, width: 0.3 })`)
            .join('')});`,
          `${receiver}.create(...${trackVar});`,
        ]
      : [`${receiver}.create();`]),
  ].join('\n');

  return { board, source };
}

describe('hardening: fuzz (seeded)', () => {
  const SEEDS = 24;

  it('every generated case: parse after apply, converge, byte-idempotent', async () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rand = rng(seed * 7919);
      const cases = [generateCase(rand), generateCase(rand)];
      for (const [caseIdx, { board, source }] of cases.entries()) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), `typecad-fuzz-${seed}-${caseIdx}-`));
        try {
          fs.mkdirSync(path.join(root, 'build'), { recursive: true });
          fs.mkdirSync(path.join(root, 'src'), { recursive: true });
          const boardPath = path.join(root, 'build', 'b.kicad_pcb');
          fs.writeFileSync(boardPath, board);
          const sourcePath = path.join(root, 'src', 'board.ts');
          fs.writeFileSync(sourcePath, source);

          await kicadDataToTypeCAD(boardPath, { apply: true, auto: true });

          // 1. source still parses
          const analysis = analyzeFile(sourcePath);
          expect(analysis, `seed ${seed}/${caseIdx}: source unparseable after apply`).not.toBeNull();

          // 2. converged
          const ir = buildIr(fs.readFileSync(boardPath, 'utf-8'));
          const pending = computeAllSourceChanges(ir, [sourcePath]);
          for (const [name, result] of Object.entries(pending)) {
            expect(result.changes, `seed ${seed}/${caseIdx}: ${name} not converged`).toEqual([]);
          }

          // 3. byte-idempotent
          const afterFirst = fs.readFileSync(sourcePath, 'utf-8');
          await kicadDataToTypeCAD(boardPath, { apply: true, auto: true });
          expect(fs.readFileSync(sourcePath, 'utf-8'), `seed ${seed}/${caseIdx}: not byte-idempotent`).toBe(afterFirst);
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
        }
      }
    }
  }, 120000);
});
