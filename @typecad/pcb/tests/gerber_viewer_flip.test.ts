// ---------------------------------------------------------------------------
// Shift+F — flip the selected part to the other side, driven end-to-end on
// the real generated page in jsdom. The gesture mirrors the footprint ink
// about the part's local X axis (the writer's back-side transform), rips the
// part's nets' autorouter copper, enables apply, and undoes cleanly. The
// apply payload's `side` rewrite is covered by the vscode package's
// layoutEdits/syncApply suites; here we pin the page half.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildViewerHtml } from '../src/gerber_viewer/render/viewer_html.js';
import { renderSvg } from '../src/gerber_viewer/render/svg.js';
import { detectLayer } from '../src/gerber_viewer/detect_layer.js';
import { parseGerber } from '../src/gerber_viewer/gerber/parse_gerber.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gerber');
const read = (name: string) => fs.readFileSync(path.join(fixtures, name), 'utf8');

const image = parseGerber(read('traces.gbr'));
const info = detectLayer('demo-F_Cu.gbr', image);
// a fab-layer stroke at gerber (10, -23): R1's reference label claims it as
// its glyphs — the label rides compTrStr, which carries the flip reflection
const fabImage = parseGerber(
  '%FSLAX36Y36*%\n%MOMM*%\n%ADD10C,0.12*%\nD10*\nX10000000Y-23000000D02*\nX10500000Y-23000000D01*\nM02*\n',
);
const fabInfo = detectLayer('demo-F_Fab.gbr', fabImage);
const svg = renderSvg([{ info, image }, { info: fabInfo, image: fabImage }]);
const layoutComponents = [
  {
    ref: 'R1',
    x: 10,
    y: -20,
    rot: 0,
    w: 1.6,
    h: 0.8,
    side: 'front' as const,
    nets: ['VCC'],
    pads: [
      { x: 9.5, y: -20 },
      { x: 10.5, y: -20 },
    ],
    labels: [
      {
        kind: 'reference' as const,
        text: 'R1',
        x: 10.5,
        y: -23,
        rot: 0,
        side: 'front' as const,
        h: 1,
        w: 1,
        thickness: 0.15,
        justify: { horizontal: 'center' as const },
      },
    ],
  },
];

async function boot() {
  const html = buildViewerHtml(svg, [info], { title: 'demo board', pcbaSvg: '<svg/>', layoutComponents });
  const errors: string[] = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://localhost/viewer.html',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.console.error = (...a: unknown[]) => errors.push(a.join(' '));
      const idCtm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } };
      w.SVGSVGElement.prototype.getScreenCTM = () => idCtm;
      w.SVGSVGElement.prototype.createSVGPoint = () => ({
        x: 0,
        y: 0,
        matrixTransform: () => ({ x: 0, y: 0 }),
      });
      w.SVGElement.prototype.getBBox = function (this: SVGElement) {
        const d = this.getAttribute?.('d');
        if (!d) return { x: 0, y: 0, width: 0, height: 0 };
        const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
        if (!nums.length) return { x: 0, y: 0, width: 0, height: 0 };
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i + 1 < nums.length; i += 2) {
          x0 = Math.min(x0, nums[i]!); x1 = Math.max(x1, nums[i]!);
          y0 = Math.min(y0, nums[i + 1]!); y1 = Math.max(y1, nums[i + 1]!);
        }
        return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      };
    },
  });
  const w = dom.window;
  const d = w.document;
  await new Promise((r) => setTimeout(r, 100));
  const viewSelect = d.querySelector('select')!;
  viewSelect.value = 'layout';
  viewSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 100));
  expect(errors).toEqual([]);
  return { w, d };
}

describe('Shift+F flips the selection to the other side', () => {
  /** R1's reference-label glyphs — the ink that visibly mirrors on flip */
  const labelPath = (d: Document) =>
    d.querySelector('g[data-kind="fab"] path[data-text]') as SVGPathElement | null;

  it('mirrors the pending ink, enables apply, and undoes cleanly', async () => {
    const { w, d } = await boot();
    expect(labelPath(d)).toBeTruthy();
    // press R1 (the layout-overlay handle selects the part)
    const g = d.querySelector('#layout-overlay [data-ref="R1"]')!;
    g.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 50, clientY: 50 }));
    // plain f is fit — it must NOT flip; Shift+F (key 'F') does
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'f', bubbles: true }));
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(true);
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'F', bubbles: true }));
    // the apply button wakes: a pending flip is an applyable edit
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(false);
    // the part's label rides compTrStr, which now carries the reflection
    expect(labelPath(d)!.getAttribute('transform')).toContain('scale(1,-1)');
    // undo restores the authored pose and re-disables the button
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(true);
    expect(labelPath(d)!.getAttribute('transform') ?? '').not.toContain('scale(1,-1)');
    // redo re-flips
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true }));
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(false);
    expect(labelPath(d)!.getAttribute('transform')).toContain('scale(1,-1)');
  });

  it('the E panel shows the effective side and its select flips through the same machinery', async () => {
    const { w, d } = await boot();
    const g = d.querySelector('#layout-overlay [data-ref="R1"]')!;
    g.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 50, clientY: 50 }));
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    const side = d.getElementById('pp-side') as HTMLSelectElement | null;
    expect(side).toBeTruthy();
    expect(side!.value).toBe('front');
    // flip from the panel
    side!.value = 'back';
    (d.getElementById('pp-apply') as HTMLButtonElement).click();
    // the pending flip is visible on the part's ink (the handle rect is
    // invariant under the mirror — the label ink is what mirrors)
    expect(labelPath(d)!.getAttribute('transform')).toContain('scale(1,-1)');
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(false);
  });

  it('a flip with no move still arms apply and rides the next apply (flip-only entry)', async () => {
    const { w, d } = await boot();
    const g = d.querySelector('#layout-overlay [data-ref="R1"]')!;
    g.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 50, clientY: 50 }));
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'F', bubbles: true }));
    // no layoutMoves entry would exist for a pure flip — the button must
    // still wake (the payload carries the zero-delta side entry)
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(false);
  });
});
