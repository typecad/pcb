import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { computeAllSourceChanges } from '../src/kicad2typecad/apply_source.js';
import { KicadIRBuilder } from '../src/kicad2typecad/ir_builder.js';
import { SExprNode } from '../src/kicad2typecad/sexpr_tree.js';
import { SourceMatcher } from '../src/kicad2typecad/matcher.js';
import { SourceRewriter } from '../src/kicad2typecad/rewriter.js';
import { collectTypeScriptFiles } from '../src/kicad2typecad/source_analyzer.js';
import { kicadDataToTypeCAD } from '../src/kicad2typecad/cli.js';
import { boardIsBuildOutput } from '../src/utils/build_signature.js';

/**
 * The build must be a FIXED POINT of the import: a board the build just
 * wrote, imported back against the source it came from, changes nothing.
 * When it is not, any board→source sync (the viewer's absorb, `import
 * --watch`) rewrites source, the rewrite triggers a rebuild, and the cycle
 * repeats — the layout view's endless loop. Rotated and bottom-side parts
 * are where such transforms drift (a rotated footprint's labels once came
 * back mirrored), so the fixture is built from exactly those.
 */

let dir: string;
let prevCwd: string;
beforeEach(() => {
  prevCwd = process.cwd();
  // INSIDE the package (not os.tmpdir): the fixture source is really
  // executed, so its imports must resolve to this workspace's toolchain —
  // and the footprints' "Code" property must point at the fixture source
  // file, exactly like a real project, or the importer matches nothing.
  dir = fs.mkdtempSync(path.join(__dirname, '.fixedpoint-'));
  fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  process.chdir(dir);
});
afterEach(() => {
  process.chdir(prevCwd);
  fs.rmSync(dir, { recursive: true, force: true });
});

const PLACEMENTS = [
  { name: 'r1', ref: 'R1', x: 12, y: 8, rotation: 0, side: 'front' as const },
  { name: 'r2', ref: 'R2', x: 20.5, y: 14.25, rotation: 90, side: 'front' as const },
  { name: 'r3', ref: 'R3', x: 7.125, y: 3.5, rotation: 180, side: 'front' as const },
  { name: 'r4', ref: 'R4', x: 30, y: 6, rotation: 270, side: 'front' as const },
  { name: 'c1', ref: 'C1', x: 15, y: 20, rotation: 45, side: 'front' as const },
  { name: 'c2', ref: 'C2', x: 25, y: 22, rotation: 90, side: 'back' as const },
  { name: 'c3', ref: 'C3', x: 5, y: 25, rotation: 0, side: 'back' as const },
];

/** The project source, in the shape authors write it. It is EXECUTED by
 *  buildBoard(), so the board is genuinely the output of this very file. */
function writeSource(): string {
  const toolchain = path.relative(path.join(dir, 'src'), path.resolve(__dirname, '../src')).replace(/\\/g, '/');
  const lines = [
    `import { PCB } from '${toolchain}/pcb/pcb.js';`,
    `import { Resistor, Capacitor } from '${toolchain}/passives/index.js';`,
    "const typecad = new PCB('fp');",
  ];
  for (const p of PLACEMENTS) {
    const cls = p.ref.startsWith('R') ? 'Resistor' : 'Capacitor';
    lines.push(`const ${p.name} = new ${cls}({ reference: '${p.ref}', value: '${p.ref.startsWith('R') ? '1k' : '100nF'}' });`);
    lines.push(`${p.name}.pcb = { x: ${p.x}, y: ${p.y}, rotation: ${p.rotation}, side: '${p.side}' };`);
  }
  lines.push(`typecad.create(${PLACEMENTS.map((p) => p.name).join(', ')});`);
  const file = path.join(dir, 'src', 'board.ts');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

/** Run the project source (what `npm run build` does) and return the board. */
async function buildBoard(): Promise<string> {
  const file = path.join(dir, 'src', 'board.ts');
  if (!fs.existsSync(file)) writeSource();
  // a fresh module graph per build, like a fresh `npm run build` process —
  // and no cache-busting query string, which would leak into the footprints'
  // "Code" property (the source path) and make builds differ for the wrong reason
  vi.resetModules();
  await import(/* @vite-ignore */ file);
  return path.join(dir, 'build', 'fp.kicad_pcb');
}

/**
 * Everything one import cycle would change, as labels: the structural
 * categories (zones, outline, routing, text section, stackup, graphics) AND
 * the part-level ones the importer computes separately (placements, texts,
 * label layouts). `computeAllSourceChanges` alone does not look at placements,
 * which is what a fixed-point test must cover most.
 */
function pendingLabels(board: string): string[] {
  const ir = new KicadIRBuilder().build(SExprNode.parse(fs.readFileSync(board, 'utf8')));
  const sourceRoot = path.join(dir, 'src');
  const sourceFiles = collectTypeScriptFiles(sourceRoot);
  const matchResults = new SourceMatcher(sourceRoot).matchAll(ir.footprints);
  const rewriter = new SourceRewriter();
  const labels: string[] = [];
  for (const [category, result] of Object.entries(computeAllSourceChanges(ir, sourceFiles))) {
    for (const c of result.changes) labels.push(`${category}: ${c.label}`);
  }
  for (const c of rewriter.computeFootprintChanges(matchResults, sourceFiles)) labels.push(`placement: ${c.label}`);
  for (const c of rewriter.computeTextChanges(ir, sourceFiles)) labels.push(`text: ${c.label}`);
  for (const c of rewriter.computeLayoutChanges(matchResults, sourceFiles)) labels.push(`layout: ${c.label}`);
  return labels;
}

describe('build ⇄ import fixed point', () => {
  it("importing a board the build just wrote proposes no placement, text, zone, outline, routing or graphics changes", async () => {
    const board = await buildBoard();
    // Label layouts are excluded on purpose: a freshly built part has none in
    // source, and the importer legitimately MATERIALIZES the board's label
    // layout the first time it sees it. That is a one-time write, proven to
    // converge by the next test — not a drift the build causes.
    const drift = pendingLabels(board).filter((l) => !l.startsWith('layout:'));
    expect(drift, "the build's own output must not read as an edit to import").toEqual([]);
  });

  it('build → import → build reaches a fixed point within two cycles (the loop terminates)', async () => {
    // The user-visible loop is build → import → source write → build → …
    // It is only harmless if the source stops changing. Run the real cycle:
    // import the built board into source, rebuild FROM that source, repeat.
    const srcFile = path.join(dir, 'src', 'board.ts');
    let board = await buildBoard();
    const texts: string[] = [fs.readFileSync(srcFile, 'utf8')];
    for (let cycle = 0; cycle < 3; cycle++) {
      await kicadDataToTypeCAD(board, { apply: true, auto: true });
      texts.push(fs.readFileSync(srcFile, 'utf8'));
      board = await buildBoard();
    }
    // the first import may write (label layouts materialize); after that the
    // source is byte-stable — cycle 2 and 3 write nothing
    expect(texts[2]).toBe(texts[1]);
    expect(texts[3]).toBe(texts[2]);
    // and nothing — not even a layout — remains to import from the rebuilt board
    expect(pendingLabels(board)).toEqual([]);
  }, 60_000);

  it('negative control: the oracle sees a real placement difference (the test is not vacuous)', async () => {
    const board = await buildBoard();
    const file = path.join(dir, 'src', 'board.ts');
    // source now says R2 sits somewhere else than the board the build wrote
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('x: 20.5, y: 14.25', 'x: 21.5, y: 14.25'));
    const labels = pendingLabels(board);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.join('\n')).toMatch(/r2/);
  });

  it('rebuilding unchanged source reproduces the board byte-for-byte', async () => {
    const board = await buildBoard();
    const first = fs.readFileSync(board, 'utf8');
    const firstHash = JSON.parse(fs.readFileSync(path.join(dir, 'build', '.typecad-board.json'), 'utf8')).hashes['fp.kicad_pcb'];
    await buildBoard();
    const second = fs.readFileSync(board, 'utf8');
    // uuids/timestamps may legitimately differ between runs; what must not
    // differ is anything an import would read (placements, text, geometry)
    const strip = (s: string): string => s.replace(/\(uuid "[^"]*"\)/g, '(uuid)').replace(/\(tstamp [^)]*\)/g, '(tstamp)');
    expect(strip(second)).toBe(strip(first));
    expect(typeof firstHash).toBe('string');
  });

  it('signs every build, and the signature matches the file on disk', async () => {
    const board = await buildBoard();
    expect(boardIsBuildOutput(board)).toBe(true);
    fs.appendFileSync(board, '\n'); // an out-of-band save
    expect(boardIsBuildOutput(board)).toBe(false);
  });

  it('leaves no temp file behind in build/', async () => {
    await buildBoard();
    const leftovers = fs.readdirSync(path.join(dir, 'build')).filter((f) => f.includes('.tmp-'));
    expect(leftovers).toEqual([]);
  });
});
