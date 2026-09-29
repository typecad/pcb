import { describe, it, expect } from 'vitest';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateDiffs } from '../../src/gitdiff/core/diff-generator.js';
import { annotateLayerSvgs } from '../../src/gitdiff/core/svg-diff-annotator.js';
import {
  computeSvgBBox,
  cropSvgToBBox,
  renderLayerSvgCached,
} from '../../src/gitdiff/utils/file-utils.js';
import { canonicalLayerName } from '../../src/gerber_export/layers.js';

const fixturesDir = path.join(import.meta.dirname!, 'fixtures');
const board = path.join(fixturesDir, 'one_hz.kicad_pcb');

// the report needs the assembled viewer template (build output) or the raw
// template + compiled viewer JS to assemble in memory — skip the e2e where
// neither exists (CI without a prior build)
const viewerTemplateAvailable = (() => {
  const pkgRoot = path.join(import.meta.dirname!, '..', '..');
  return (
    fsSync.existsSync(path.join(pkgRoot, 'src', 'gitdiff', 'diff-viewer.html')) ||
    (fsSync.existsSync(path.join(pkgRoot, 'src', 'gitdiff', 'viewer', 'diff-viewer.html')) &&
      fsSync.existsSync(path.join(pkgRoot, 'dist', 'gitdiff', 'viewer', 'diff-viewer.js')))
  );
})();

/** Copy the fixture and move one F.Cu trace's endpoint by 1mm. */
async function modifiedBoard(dir: string): Promise<string> {
  const source = await fs.readFile(board, 'utf8');
  // the fixture writes segments one node per line: (start X Y)\n\t\t(end X Y)
  const m = /\(start ([\d.]+) ([\d.]+)\)\s*\n\s*\(end ([\d.]+) ([\d.]+)\)/.exec(source);
  if (!m) throw new Error('fixture has no segment to move');
  const movedEnd = `${Number.parseFloat(m[3]!) + 1} ${m[4]}`;
  const moved = source.replace(m[0], m[0].replace(`${m[3]} ${m[4]}`, movedEnd));
  const file = path.join(dir, 'modified.kicad_pcb');
  await fs.writeFile(file, moved, 'utf8');
  return file;
}

describe('gitdiff native layer renders', () => {
  it('renders a layer as self-contained SVG (inline flashes, no symbols)', async () => {
    const svg = await renderLayerSvgCached('F.Cu', board);
    expect(svg).toMatch(/^<svg xmlns=/);
    // inline mode: pads are concrete absolute-coordinate shapes
    expect(svg).not.toContain('<use ');
    expect(svg).not.toContain('<defs>');
    expect(svg).toMatch(/<circle cx="[^"]+" cy="[^"]+" r="[^"]+"\/>|<polygon points=/);
    // ids are per-layer prefixed (the report embeds one SVG per layer)
    expect(svg).toContain('id="gd-f-cu-panzoom"');
  });

  it('colors layers with the typeCAD theme by default (explicit --theme wins)', async () => {
    // no theme: house palette — typeCAD front copper is rgb(48, 222, 102)
    const front = await renderLayerSvgCached('F.Cu', board);
    expect(front).toContain('rgb(48, 222, 102)');
    const back = await renderLayerSvgCached('B.Cu', board);
    expect(back).toContain('rgb(29, 167, 88)'); // back copper
    // explicit theme overrides the default
    const kicad = await renderLayerSvgCached('F.Cu', board, 'KiCad Default');
    expect(kicad).toContain('rgb(200, 52, 52)'); // kicad-2020 front copper
  });

  it('accepts GUI layer spellings and mirrors back-side layers', async () => {
    const silk = await renderLayerSvgCached('F.Silkscreen', board);
    expect(silk).toContain('data-kind="silkscreen"');
    const back = await renderLayerSvgCached('B.Cu', board);
    expect(back).toContain('scale(-1,1)');
    const front = await renderLayerSvgCached('F.Cu', board);
    expect(front).not.toContain('scale(-1,1)');
  });

  it('computeSvgBBox includes polygon vertices', () => {
    const bbox = computeSvgBBox('<svg><polygon points="10 20, 30 40"/></svg>');
    expect(bbox).not.toBeNull();
    expect(bbox!.minX).toBeCloseTo(8); // 10 - default 2 padding
    expect(bbox!.maxY).toBeCloseTo(42); // 40 + 2
  });

  it('cropSvgToBBox negates y for flipped native renders (and x for mirrored)', () => {
    // native render: content in leaf space under a scale(1,-1) group —
    // screen space is the negated y of the leaf coordinates
    const native =
      '<svg viewBox="0 0 100 100"><g id="p"><g id="f" transform="scale(1,-1)">' +
      '<path d="M 10 -10 L 30 -40"/></g></g></svg>';
    const cropped = cropSvgToBBox(native, { minX: 8, minY: -42, maxX: 32, maxY: -8 });
    // screen content y = -leaf y ∈ [8, 42] → viewBox must start at -maxY = 8
    expect(cropped).toMatch(/viewBox="8\.0000 8\.0000 24\.0000 34\.0000"/);

    const mirrored =
      '<svg viewBox="0 0 100 100"><g id="p"><g transform="scale(-1,1)"><g id="f" transform="scale(1,-1)">' +
      '<path d="M 10 -10 L 30 -40"/></g></g></g></svg>';
    const croppedM = cropSvgToBBox(mirrored, { minX: 8, minY: -42, maxX: 32, maxY: -8 });
    expect(croppedM).toMatch(/viewBox="-32\.0000 8\.0000 24\.0000 34\.0000"/);

    // kicad-cli style (no flip group): leaf space is screen space, unchanged
    const plain = '<svg viewBox="0 0 100 100"><path d="M 10 10 L 30 40"/></svg>';
    const croppedP = cropSvgToBBox(plain, { minX: 8, minY: 8, maxX: 32, maxY: 42 });
    expect(croppedP).toMatch(/viewBox="8\.0000 8\.0000 24\.0000 34\.0000"/);
  });

  it('diffs moved pads (inline flashes keep annotations position-sensitive)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitdiff-pad-'));
    try {
      // minimal boards differing in one pad position
      const mk = (x: number): string =>
        `(kicad_pcb (version 20250114)\n` +
        `  (footprint "lib:x" (at 10 10)\n` +
        `    (property "Reference" "R1" (at 0 0 0) (layer "F.Cu"))\n` +
        `    (pad "1" thru_hole circle (at ${x} 0 0) (size 1 1) (drill 0.5) (layers "*.Cu" "*.Mask") (net 1 "A"))\n` +
        `    (pad "2" thru_hole circle (at 3 0 0) (size 1 1) (drill 0.5) (layers "*.Cu" "*.Mask") (net 1 "A"))\n` +
        `  )\n` +
        `)\n`;
      const a = path.join(dir, 'a.kicad_pcb');
      const b = path.join(dir, 'b.kicad_pcb');
      await fs.writeFile(a, mk(0), 'utf8');
      await fs.writeFile(b, mk(1.5), 'utf8'); // pad 1 moved 1.5mm

      const orig = await renderLayerSvgCached('F.Cu', a);
      const mod = await renderLayerSvgCached('F.Cu', b);
      const ann = annotateLayerSvgs(orig, mod);
      expect(ann).not.toBeNull();
      // the moved pad: one circle flagged removed in the original view, one
      // flagged added in the modified view; the untouched pad dims out of
      // the diff-only view on BOTH sides
      expect(ann!.annotatedOriginal).toMatch(/<circle class="[^"]*diff-removed/);
      expect(ann!.annotatedModified).toMatch(/<circle class="[^"]*diff-added/);
      expect(ann!.annotatedOriginal).toMatch(/<circle class="[^"]*diff-hidden/);
      expect(ann!.annotatedModified).toMatch(/<circle class="[^"]*diff-hidden/);
      expect(ann!.annotatedOriginal.match(/diff-removed/g)).toHaveLength(1);
      expect(ann!.annotatedModified.match(/diff-added/g)).toHaveLength(1);
      expect(ann!.annotatedModified.match(/diff-hidden/g)).toHaveLength(1);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe('canonicalLayerName', () => {
  it('maps GUI spellings to canonical short names', () => {
    expect(canonicalLayerName('F.Silkscreen')).toBe('F.SilkS');
    expect(canonicalLayerName('B.Courtyard')).toBe('B.CrtYd');
    expect(canonicalLayerName('F.Adhesive')).toBe('F.Adhes');
    expect(canonicalLayerName('User.Drawings')).toBe('Dwgs.User');
    expect(canonicalLayerName('User.Eco2')).toBe('Eco2.User');
  });

  it('passes canonical names through untouched', () => {
    expect(canonicalLayerName('F.Cu')).toBe('F.Cu');
    expect(canonicalLayerName('F.SilkS')).toBe('F.SilkS');
  });
});

describe('generateDiffs (native, no kicad-cli)', () => {
  it.skipIf(!viewerTemplateAvailable)(
    'produces an annotated diff report for a moved trace', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitdiff-native-'));
    try {
      const original = path.join(dir, 'original.kicad_pcb');
      await fs.copyFile(board, original);
      const modified = await modifiedBoard(dir);
      const outHtml = path.join(dir, 'diff.html');

      const htmlPath = await generateDiffs({
        originalFile: original,
        modifiedFile: modified,
        fullMode: false,
        outputHtmlPath: outHtml,
      });
      expect(htmlPath).toBe(outHtml);

      const html = await fs.readFile(outHtml, 'utf8');
      // the moved F.Cu trace is flagged and annotated
      expect(html).toContain('diff-added');
      expect(html).toContain('diff-removed');
      // layer imagery is self-contained native SVG
      expect(html).not.toContain('<use ');
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, 120_000);
});
