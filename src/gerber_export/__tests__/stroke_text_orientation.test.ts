// Text orientation regression — ported from gerber_spec/tools/text_probe_*.
// Plots an isolated-text board (angles × italic × justify × mirror ×
// two-line) through the native exporter and compares each case's ink box
// against the committed kicad-cli golden. Catches glyph Y-flips, dead
// justify flags, and rotation bugs that stroke-count parity cannot see:
// fonts differ (Hershey vs newstroke), so only the ANCHOR-side edge of each
// axis must match tightly (a flip breaks both edges; width divergence moves
// only the far edge).
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { plotGraphicsLayersFromSource } from '../index.js';

const GOLDEN = path.resolve(
  __dirname,
  '../../../../../gerber_spec/tools/text_probe_golden/text_probe-F_Silkscreen.gto',
);

const BOARD = `(kicad_pcb (version 20241229)
  (net 0 "")
  (general (thickness 1.6))
  (gr_text "Jg" (at 100 40 0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3))))
  (gr_text "Jg" (at 100 52 90) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3))))
  (gr_text "Jg" (at 100 64 180) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3))))
  (gr_text "Jg" (at 100 76 270) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3))))
  (gr_text "Jg" (at 100 88 0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3) (italic yes))))
  (gr_text "Jg" (at 100 100 90) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3) (italic yes))))
  (gr_text "Jg" (at 100 112 0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3)) (justify left)))
  (gr_text "Jg" (at 100 124 0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3)) (justify right)))
  (gr_text "Jg" (at 100 136 0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3)) (justify top)))
  (gr_text "Jg" (at 100 148 0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3)) (justify bottom)))
  (gr_text "Jg" (at 100 160 0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3)) (justify mirror)))
  (gr_text "Ja\\ngb" (at 100 172 0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3))))
  (gr_text "Ja\\ngb" (at 100 184 90) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3))))
  (gr_text "Jg" (at 100 196 0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.6)) (justify left)))
  (gr_text "JgJgJg" (at 100 208 0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3)) (justify left)))
  (gr_text "Jg" (at 100 220 0) (layer "F.SilkS") (effects (font (size 3 3) (thickness 0.3)) (justify left)))
  (gr_text "Jg" (at 100 232 0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.6)) (justify right)))
  (gr_text "JgJgJg" (at 100 244 0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.3)) (justify right)))
)`;

const LABELS = [
  'Jg ang0', 'Jg ang90', 'Jg ang180', 'Jg ang270', 'Jg ang0 italic', 'Jg ang90 italic',
  'Jg left', 'Jg right', 'Jg top', 'Jg bottom', 'Jg mirror', '2-line ang0', '2-line ang90',
  'Jg left th0.6', 'JgJgJg left', 'Jg sy3 left', 'Jg right th0.6', 'JgJgJg right',
];

interface Box { minX: number; maxX: number; minY: number; maxY: number }

function strokeSegs(file: string): Array<Array<[number, number]>> {
  const text = readFileSync(file, 'utf8');
  const contours: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> | null = null;
  for (const mm of text.matchAll(/X(-?[\d.]+)Y(-?[\d.]+)D0(1|2)\*/g)) {
    const nx = parseFloat(mm[1]) / 1e6;
    const ny = parseFloat(mm[2]) / 1e6;
    if (mm[3] === '2') {
      if (cur && cur.length > 0) contours.push(cur);
      cur = [];
    } else {
      if (!cur) cur = [];
      cur.push([nx, ny]);
    }
  }
  if (cur && cur.length > 0) contours.push(cur);
  return contours;
}

function inkBox(contours: Array<Array<[number, number]>>, ax: number, ay: number, span: number): Box | null {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
  for (const c of contours) {
    for (const [px, py] of c) {
      if (Math.abs(px - ax) > span || Math.abs(py - ay) > span) continue;
      n++;
      minX = Math.min(minX, px - ax); maxX = Math.max(maxX, px - ax);
      minY = Math.min(minY, py - ay); maxY = Math.max(maxY, py - ay);
    }
  }
  return n ? { minX, maxX, minY, maxY } : null;
}

describe('stroke text orientation vs kicad-cli golden', () => {
  it('matches per-case ink boxes (18 isolated-text cases)', () => {
    expect(() => readFileSync(GOLDEN)).not.toThrow();
    const dir = mkdtempSync(path.join(tmpdir(), 'text-probe-'));
    plotGraphicsLayersFromSource(BOARD, path.join(dir, 'text_probe.kicad_pcb'), { outDir: dir });

    const gold = strokeSegs(GOLDEN);
    const natv = strokeSegs(path.join(dir, 'text_probe-F_Silkscreen.gto'));

    const problems: string[] = [];
    for (let i = 0; i < LABELS.length; i++) {
      const ax = 100;
      const ay = -(40 + i * 12);
      const g = inkBox(gold, ax, ay);
      const n = inkBox(natv, ax, ay);
      // at least one edge per axis must match tightly: a Y-flip breaks both
      // edges of the flipped axis; font-width divergence moves only the far
      // edge (Hershey is narrower than newstroke)
      const xTol = g ? Math.max(0.9, (g.maxX - g.minX) * 0.5) : 0.9;
      const near = (a: number, b: number, tol: number) => Math.abs(a - b) < tol;
      const ok = g && n &&
        (near(g.minY, n.minY, 0.3) || near(g.maxY, n.maxY, 0.3)) &&
        (near(g.minX, n.minX, xTol) || near(g.maxX, n.maxX, xTol));
      if (!ok) {
        problems.push(
          `${LABELS[i]}: golden [${g ? `${g.minX.toFixed(2)}..${g.maxX.toFixed(2)}, ${g.minY.toFixed(2)}..${g.maxY.toFixed(2)}` : 'none'}] ` +
          `native [${n ? `${n.minX.toFixed(2)}..${n.maxX.toFixed(2)}, ${n.minY.toFixed(2)}..${n.maxY.toFixed(2)}` : 'none'}]`,
        );
      }
    }
    expect(problems.length ? problems.join('\n') : '').toBe('');
  }, 30000);
});
