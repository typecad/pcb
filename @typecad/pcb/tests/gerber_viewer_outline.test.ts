// ---------------------------------------------------------------------------
// Board outline editing: clicking the Edge.Cuts ink selects the outline, E
// edits the rect, arrows nudge it, apply hands {original, rect} to the host
// bridge (stubbed here — the source-side .outline() literal rewrite is
// covered by the vscode package's layoutEdits suite, the semantic check by
// semanticVerify.test.ts).
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
// a rectangle Edge.Cuts outline at gerber y in [-50,-10] — board frame
// (y-down): x 5..55, y 10..50
const edgeImage = parseGerber(
  '%FSLAX36Y36*%\n%MOMM*%\n%ADD10C,0.05*%\nD10*\n' +
    'X5000000Y-10000000D02*\nX55000000Y-10000000D01*\n' +
    'X55000000Y-10000000D02*\nX55000000Y-50000000D01*\n' +
    'X55000000Y-50000000D02*\nX5000000Y-50000000D01*\n' +
    'X5000000Y-50000000D02*\nX5000000Y-10000000D01*\n' +
    'M02*\n',
);
const edgeInfo = detectLayer('demo-Edge_Cuts.gbr', edgeImage);
expect(edgeInfo.kind).toBe('edge');
const svg = renderSvg([{ info, image }, { info: edgeInfo, image: edgeImage }]);
const layoutComponents = [
  { ref: 'R1', x: 10, y: -20, rot: 0, w: 1.6, h: 0.8, side: 'front' as const, nets: ['VCC'] },
];

async function boot() {
  const html = buildViewerHtml(svg, [info, edgeInfo], { title: 'demo board', pcbaSvg: '<svg/>', layoutComponents });
  const errors: string[] = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://localhost/viewer.html',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.console.error = (...a: unknown[]) => errors.push(a.join(' '));
      const idCtm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } };
      w.SVGSVGElement.prototype.getScreenCTM = () => idCtm;
      type FakePoint = { x: number; y: number; matrixTransform(): { x: number; y: number } };
      w.SVGSVGElement.prototype.createSVGPoint = (): FakePoint => {
        const p = { x: 0, y: 0 };
        return {
          get x() { return p.x; },
          set x(v: number) { p.x = v; },
          get y() { return p.y; },
          set y(v: number) { p.y = v; },
          matrixTransform: () => ({ x: p.x, y: p.y }),
        };
      };
      // getBBox unions every path's d-attr numbers, aggregating GROUPS
      // (jsdom has no geometry engine; a group has no d of its own)
      const bboxOf = (el: Element): { x: number; y: number; width: number; height: number } => {
        const ds: string[] = [];
        if (el.tagName === 'path') {
          const d = el.getAttribute('d');
          if (d) ds.push(d);
        }
        el.querySelectorAll?.('path').forEach((p) => {
          const d = p.getAttribute('d');
          if (d) ds.push(d);
        });
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const d of ds) {
          const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
          for (let i = 0; i + 1 < nums.length; i += 2) {
            x0 = Math.min(x0, nums[i]!); x1 = Math.max(x1, nums[i]!);
            y0 = Math.min(y0, nums[i + 1]!); y1 = Math.max(y1, nums[i + 1]!);
          }
        }
        if (x0 === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
        return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      };
      w.SVGElement.prototype.getBBox = function (this: SVGElement) {
        return bboxOf(this);
      };
    },
  });
  const w = dom.window;
  const d = w.document;
  await new Promise((r) => setTimeout(r, 100));
  const vs = d.getElementById('view-mode')!;
  vs.value = 'layout';
  vs.dispatchEvent(new w.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 100));
  expect(errors).toEqual([]);
  return { w, d };
}

describe('board outline editing', () => {
  it('clicking an edge selects the outline; E edits the rect; apply hands original+rect to the host', async () => {
    const { w, d } = await boot();
    // click the first Edge.Cuts path
    const edgePath = d.querySelector('g[data-kind="edge"] path')!;
    edgePath.dispatchEvent(
      new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 30, clientY: 20 }),
    );
    expect((d.getElementById('layout-outline-edit') as SVGGElement | null)).toBeNull(); // selection alone previews nothing
    // E opens the outline panel with the authored rect (board frame)
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    expect(d.getElementById('ol-x')).toBeTruthy();
    expect((d.getElementById('ol-x') as HTMLInputElement).value).toBe('5.00');
    expect((d.getElementById('ol-y') as HTMLInputElement).value).toBe('10.00');
    expect((d.getElementById('ol-w') as HTMLInputElement).value).toBe('50.00');
    expect((d.getElementById('ol-h') as HTMLInputElement).value).toBe('40.00');
    // widen the board and apply the panel
    (d.getElementById('ol-w') as HTMLInputElement).value = '60';
    (d.getElementById('pp-apply') as HTMLButtonElement).click();
    // the dashed pending rect previews the new extent, authored ink dimmed
    const preview = d.querySelector('#layout-outline-edit rect') as SVGRectElement | null;
    expect(preview).toBeTruthy();
    expect(parseFloat(preview!.getAttribute('width')!)).toBeCloseTo(60, 3);
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(false);
    // undo reverts to the authored rect (preview gone, button re-locks)
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(d.querySelector('#layout-outline-edit rect')).toBeNull();
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(true);
    // redo, then apply and inspect the payload
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true }));
    let got: { outline?: { original: Record<string, number>; rect: Record<string, number> } } | null = null;
    (w as unknown as { typecadLayoutApply: unknown }).typecadLayoutApply = function (...args: unknown[]) {
      got = { outline: args[9] as { original: Record<string, number>; rect: Record<string, number> } };
      (args[args.length - 1] as (e: string | null) => void)(null);
    };
    (d.getElementById('layout-apply') as HTMLButtonElement).click();
    expect(got).not.toBeNull();
    expect(got!.outline!.original).toEqual({ x: 5, y: 10, w: 50, h: 40 });
    expect(got!.outline!.rect.w).toBe(60);
    // the applied edit retires
    expect(d.querySelector('#layout-outline-edit rect')).toBeNull();
  });

  it('arrows nudge the selected outline and Esc clears it', async () => {
    const { w, d } = await boot();
    const edgePath = d.querySelector('g[data-kind="edge"] path')!;
    edgePath.dispatchEvent(
      new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 30, clientY: 20 }),
    );
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(d.querySelector('#layout-outline-edit rect')).toBeTruthy();
    // the pending rect moved left by the grid step (0.5)
    const preview = d.querySelector('#layout-outline-edit rect') as SVGRectElement;
    expect(parseFloat(preview.getAttribute('x')!)).toBeCloseTo(4.5, 3);
    // Esc clears the pending edit entirely (the global Escape handler is a
    // window listener — dispatch there, like a real keypress bubbling up)
    w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(d.querySelector('#layout-outline-edit rect')).toBeNull();
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(true);
  });

  it('arrow up moves the outline up (board y decreases) and an open dialog live-updates', async () => {
    const { w, d } = await boot();
    const edgePath = d.querySelector('g[data-kind="edge"] path')!;
    edgePath.dispatchEvent(
      new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 30, clientY: 20 }),
    );
    // open the dialog BEFORE nudging — it must follow every nudge in place
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    expect((d.getElementById('ol-y') as HTMLInputElement).value).toBe('10.00');
    // ArrowUp: up on screen = board y decreases (the nudge table is
    // island-frame y-up, the outline rect is board-frame y-down)
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect((d.getElementById('ol-y') as HTMLInputElement).value).toBe('9.50');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect((d.getElementById('ol-y') as HTMLInputElement).value).toBe('10.00');
  });

  it('a pending pour fully outside the outline warns (KiCad fills nothing there)', async () => {
    const { w, d } = await boot();
    // the zone tool lives in the E properties panel (nothing selected)
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    (d.getElementById('zone-draw') as HTMLButtonElement).click();
    // draw below the authored outline (board y 10..50): the identity CTM
    // maps clientY straight to gerber -y, so corners land at board y 60..90
    const board = d.getElementById('board')!;
    for (const [x, y] of [[40, 60], [70, 60], [70, 90], [40, 90]] as const) {
      board.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: x, clientY: y }));
      board.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, button: 0, clientX: x, clientY: y }));
    }
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const warn = d.getElementById('layout-warn') as HTMLElement;
    expect(warn.style.display).not.toBe('none');
    expect(warn.textContent).toContain('OUTSIDE the board outline');
    // deleting the zone clears the warning
    (d.querySelector('#layout-zones path') as SVGPathElement).dispatchEvent(
      new w.MouseEvent('pointerdown', { bubbles: true, button: 0 }),
    );
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect((d.getElementById('layout-warn') as HTMLElement).style.display).toBe('none');
  });

  it('dialog apply with changed fields keeps the pending edit; fields equal to authored clear it', async () => {
    const { w, d } = await boot();
    const edgePath = d.querySelector('g[data-kind="edge"] path')!;
    edgePath.dispatchEvent(
      new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 30, clientY: 20 }),
    );
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    // widen and apply — the pending edit survives (fields differ from authored)
    (d.getElementById('ol-w') as HTMLInputElement).value = '60';
    (d.getElementById('pp-apply') as HTMLButtonElement).click();
    expect(d.querySelector('#layout-outline-edit rect')).toBeTruthy();
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(false);
    // reopen: fields show the PENDING rect (the dialog tracks the edit, not
    // the authored board); typing the authored width back and applying
    // resolves to no change — the pending edit clears instead of riding
    // apply & rebuild as original == rect
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    expect((d.getElementById('ol-w') as HTMLInputElement).value).toBe('60.00');
    (d.getElementById('ol-w') as HTMLInputElement).value = '50';
    (d.getElementById('pp-apply') as HTMLButtonElement).click();
    expect(d.querySelector('#layout-outline-edit rect')).toBeNull();
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(true);
  });
});
