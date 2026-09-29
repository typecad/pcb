// ---------------------------------------------------------------------------
// The layout view's E properties panel, driven end-to-end. The panel code is
// a JS string inside the viewer HTML — wiring mistakes (a sync hook that
// never fires, a rebuild that steals focus) parse fine and only misbehave on
// a live page. These tests boot the real generated viewer in jsdom, switch
// to the layout view, and click: an OPEN panel must follow whatever element
// the next press lands on (part, trace, via) and reset when the selection
// clears — E once, then click around.
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
// a fab-layer stroke at gerber (6.5..7, -7.5): the island text below
// claims it as its glyphs, giving the text a pressable DOM target
const fabImage = parseGerber(
  '%FSLAX36Y36*%\n%MOMM*%\n%ADD10C,0.12*%\nD10*\nX6500000Y-7500000D02*\nX7000000Y-7500000D01*\n' +
    // second stroke at the R1 label anchor — claimed by the reference label
    'X10000000Y-23000000D02*\nX11000000Y-23000000D01*\nM02*\n',
);
const fabInfo = detectLayer('demo-F_Fab.gbr', fabImage);
const svg = renderSvg([
  { info, image },
  { info: fabInfo, image: fabImage },
]);
const layoutComponents = [
  {
    ref: 'R1',
    x: 10,
    y: -20,
    rot: 0,
    w: 1.6,
    h: 0.8,
    side: 'front' as const,
    nets: [],
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
  { ref: 'U1', x: 30, y: -40, rot: 90, w: 4, h: 4, side: 'front' as const, nets: [] },
];
const layoutTexts = [
  {
    text: 'hello silk',
    x: 6.5,
    y: -7.5,
    rot: 0,
    side: 'front' as const,
    h: 1.2,
    w: 1.1,
    thickness: 0.18,
    justify: { horizontal: 'center' as const, vertical: 'middle' as const },
  },
];
const padLabels = [
  { ref: 'R1', pin: '1', net: 'VCC', x: 9.5, y: -20, w: 0.8, h: 0.9, layers: ['F.Cu'] },
  { ref: 'R1', pin: '2', net: 'GND', x: 10.5, y: -20, w: 0.8, h: 0.9, layers: ['F.Cu'] },
];
const rules = {
  minTrackWidthMm: 0.2,
  netClasses: { PWR: { width: 0.5, viaSize: 0.8, viaDrill: 0.4, clearance: 0.3 } },
  netClassPatterns: [{ pattern: '^VCC$', class: 'PWR' }],
};

/** The booted page: layout view active, ready to poke at. */
interface BootedPage {
  window: import('jsdom').DOMWindow;
  pressPart(ref: string): void;
  pressText(): void;
  pressLabel(): void;
  dragText(dx: number, dy: number): void;
  pressBoard(x: number, y: number): void;
  releaseBoard(x: number, y: number): void;
  key(k: string, mods?: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }): void;
  panel(): HTMLElement;
  header(): string;
}

async function boot(): Promise<BootedPage> {
  const html = buildViewerHtml(svg, [info, fabInfo], {
    title: 'demo board',
    pcbaSvg: '<svg/>',
    layoutComponents,
    layoutTexts,
    padLabels,
    rules,
  });
  const errors: string[] = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://localhost/viewer.html',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.console.error = (...a: unknown[]) => errors.push(a.join(' '));
      // jsdom has no SVG geometry: an identity CTM keeps the page's
      // client→view coordinate math running (values are arbitrary but
      // consistent, which is all the selection logic needs)
      const idCtm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } };
      type FakePoint = { x: number; y: number; matrixTransform(): { x: number; y: number } };
      w.SVGSVGElement.prototype.getScreenCTM = () => idCtm;
      w.SVGSVGElement.prototype.createSVGPoint = (): FakePoint => {
        const p = { x: 0, y: 0 };
        return { get x() { return p.x; }, set x(v: number) { p.x = v; }, get y() { return p.y; }, set y(v: number) { p.y = v; }, matrixTransform: () => ({ x: p.x, y: p.y }) };
      };
      // the text-claiming code paths read path bounds; a numeric scan of
      // the d attribute gives the exact bbox for the M/L strokes in play
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
  const pressText = () =>
    d.querySelector('g[data-kind="fab"] path[data-text]')!.dispatchEvent(
      new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 6, clientY: 6 }),
    );
  // the second layout-texts entry is R1's reference label (data-text="1")
  const pressLabel = () =>
    d.querySelector<SVGPathElement>('g[data-kind="fab"] path[data-text="1"]')!.dispatchEvent(
      new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 23 }),
    );
  return {
    window: w,
    pressPart(ref) {
      const g = d.querySelector(`#layout-overlay [data-ref="${ref}"]`)!;
      g.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 50, clientY: 50 }));
    },
    pressText,
    pressLabel,
    pressBoard(x, y) {
      d.getElementById('board')!.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y }));
    },
    releaseBoard(x, y) {
      w.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, button: 0, clientX: x, clientY: y }));
    },
    key(k: string, mods: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}) {
      d.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, ...mods }));
    },
    dragText(dx, dy) {
      // second press on the already-selected text arms the drag; a
      // move+up pair commits a position-only layoutTextMoves entry
      pressText();
      w.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 6 + dx, clientY: 6 + dy }));
      w.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 6 + dx, clientY: 6 + dy }));
    },
    panel: () => d.getElementById('props-pop')!,
    header: () => d.querySelector('#props-pop b')?.textContent ?? '',
  };
}

describe('layout view properties panel (E) follows the selection', () => {
  it('opens on E for the selected part and focuses its ref field', async () => {
    const page = await boot();
    page.pressPart('R1');
    page.key('e');
    expect(page.panel().style.display).toBe('block');
    expect(page.header()).toBe('R1');
    expect(page.window.document.activeElement?.id).toBe('pp-ref');
  });

  it('switches to whatever part is clicked while open, without stealing focus', async () => {
    const page = await boot();
    page.pressPart('R1');
    page.key('e');
    expect(page.header()).toBe('R1');
    page.pressPart('U1');
    expect(page.header()).toBe('U1');
    // focus stays on the canvas — an auto-refresh must not park the caret
    // in a field (the canvas keys: R rotate, X route, Del remove)
    expect(page.window.document.activeElement?.id).not.toBe('pp-ref');
  });

  it('follows a clicked trace and returns to a clicked part', async () => {
    const page = await boot();
    page.pressPart('R1');
    page.key('e');
    // (1,1) sits within the click reach of the fixture's trace ink — the
    // capture-phase selector picks the segment, exactly like a near-trace
    // press in the browser
    page.pressBoard(1, 1);
    expect(page.header()).toContain('trace');
    expect(page.panel().querySelector('#tp-w')).not.toBeNull();
    page.pressPart('U1');
    expect(page.header()).toBe('U1');
    expect(page.panel().querySelector('#pp-apply')).not.toBeNull();
  });

  it('resets to the hint when the selection clears (Escape, empty space)', async () => {
    const page = await boot();
    page.pressPart('R1');
    page.key('e');
    page.key('Escape');
    expect(page.panel().textContent).toContain('select a part, trace, via, or text first');
    // panel stays open through the clear, then follows a fresh selection
    page.pressPart('R1');
    expect(page.header()).toBe('R1');
    // (900,900) is away from all ink — a plain empty-space click
    page.pressBoard(900, 900);
    page.releaseBoard(900, 900);
    expect(page.panel().textContent).toContain('select a part, trace, via, or text first');
  });

  it('refreshes placement in place after an R rotation', async () => {
    const page = await boot();
    page.pressPart('U1');
    page.key('e');
    expect(page.panel().querySelector<HTMLSelectElement>('#pp-rot')!.value).toBe('0');
    page.key('r');
    expect(page.panel().querySelector<HTMLSelectElement>('#pp-rot')!.value).toBe('90');
  });

  it('toggles closed on a second E', async () => {
    const page = await boot();
    page.pressPart('R1');
    page.key('e');
    expect(page.panel().style.display).toBe('block');
    page.key('e');
    expect(page.panel().style.display).toBe('none');
  });

  it('lists every part property: side, pin->net map, net class', async () => {
    const page = await boot();
    page.pressPart('R1');
    page.key('e');
    const hints = [...page.panel().querySelectorAll('.whint')].map((h) => h.textContent ?? '');
    // size + side + the pad manifest's pin->net map, then the named class
    // claiming VCC (the catch-all Default never earns the line)
    expect(hints[0]).toContain('1.6 × 0.8 mm');
    expect(hints[0]).toContain('front side');
    expect(hints[0]).toContain('1 VCC');
    expect(hints[0]).toContain('2 GND');
    expect(hints[1]).toContain('net class PWR');
    expect(hints[1]).toContain('w 0.5 mm');
  });

  it('edits a board text: content and placement through the text machinery', async () => {
    const page = await boot();
    page.pressText();
    page.key('e');
    expect(page.header()).toBe('text');
    const content = page.panel().querySelector<HTMLInputElement>('#tx-text')!;
    const x = page.panel().querySelector<HTMLInputElement>('#tx-x')!;
    expect(content.value).toBe('hello silk');
    expect(x.value).toBe('6.50');
    // content + placement edits ride layoutTextMoves; x snaps to the grid
    content.value = 'hello world';
    x.value = '12.25';
    page.panel().querySelector<HTMLElement>('#tx-apply')!.click();
    expect(page.panel().style.display).toBe('none');
    // the next open shows the applied state, not the authored one
    page.pressText();
    page.key('e');
    expect(page.panel().querySelector<HTMLInputElement>('#tx-text')!.value).toBe('hello world');
    expect(page.panel().querySelector<HTMLInputElement>('#tx-x')!.value).toBe('12.50');
    // R rotates the grabbed text and the open panel tracks it in place
    page.key('r');
    expect(page.panel().querySelector<HTMLSelectElement>('#tx-rot')!.value).toBe('90');
  });

  it('edits text style: size, justification, italic — with a live preview', async () => {
    const page = await boot();
    page.pressText();
    page.key('e');
    // the island's authored style pre-fills every field
    const q = <T extends HTMLElement>(sel: string) => page.panel().querySelector<T>(sel)!;
    expect(q<HTMLInputElement>('#tx-h').value).toBe('1.2');
    expect(q<HTMLInputElement>('#tx-w').value).toBe('1.1');
    expect(q<HTMLInputElement>('#tx-th').value).toBe('0.18');
    expect(q<HTMLSelectElement>('#tx-jh').value).toBe('center');
    expect(q<HTMLInputElement>('#tx-it').checked).toBe(false);
    // size + justification + italic edits apply like any other
    q<HTMLInputElement>('#tx-h').value = '2';
    q<HTMLSelectElement>('#tx-jh').value = 'left';
    q<HTMLInputElement>('#tx-it').checked = true;
    q<HTMLElement>('#tx-apply').click();
    expect(page.panel().style.display).toBe('none');
    // a style edit swaps the stroke glyphs for a preview <text> at the new
    // size/slant, anchored per the new justification
    const preview = page.window.document.querySelector<SVGElement>('.layout-text-preview')!;
    expect(preview).not.toBeNull();
    expect(preview.getAttribute('font-size')).toBe('2.00');
    expect(preview.getAttribute('font-style')).toBe('italic');
    expect(preview.getAttribute('text-anchor')).toBe('start');
    // the next open shows the applied style
    page.pressText();
    page.key('e');
    expect(q<HTMLInputElement>('#tx-h').value).toBe('2');
    expect(q<HTMLSelectElement>('#tx-jh').value).toBe('left');
    expect(q<HTMLInputElement>('#tx-it').checked).toBe(true);
  });

  it('a position-only text edit keeps the real glyphs (no preview, no style on the wire)', async () => {
    const page = await boot();
    page.pressText(); // select
    page.dragText(3, 2); // drag commits a move with no style/content
    page.key('e');
    expect(page.header()).toBe('text');
    expect(page.panel().querySelector<HTMLInputElement>('#tx-x')!.value).not.toBe('6.50');
    expect(page.window.document.querySelector('.layout-text-preview')).toBeNull();
  });

  it('posts the style diff over the apply bridge — only what changed', async () => {
    const page = await boot();
    let captured: unknown[] = [];
    (page.window as unknown as Record<string, unknown>).typecadLayoutApply = (
      _moves: unknown,
      texts: unknown[],
      _values: unknown,
      _labels: unknown,
      _renames: unknown,
      _routes: unknown,
      _deletes: unknown,
      cb: (err: string | null, fast: boolean) => void,
    ) => {
      captured = texts;
      cb(null, false);
    };
    page.pressText();
    page.key('e');
    const q = <T extends HTMLElement>(sel: string) => page.panel().querySelector<T>(sel)!;
    q<HTMLInputElement>('#tx-h').value = '2';
    q<HTMLSelectElement>('#tx-jv').value = 'top';
    q<HTMLInputElement>('#tx-jm').checked = true;
    q<HTMLInputElement>('#tx-it').checked = true;
    q<HTMLElement>('#tx-apply').click();
    page.window.document.getElementById('layout-apply')!.click();
    expect(captured).toHaveLength(1);
    const sent = captured[0] as {
      text0: string;
      style?: { h?: number; w?: number; italic?: boolean; justify?: { vertical?: string; mirror?: boolean } };
    };
    expect(sent.text0).toBe('hello silk');
    expect(sent.style).toBeDefined();
    expect(sent.style!.h).toBe(2);
    expect(sent.style!.italic).toBe(true);
    expect(sent.style!.justify).toEqual({ horizontal: 'center', vertical: 'top', mirror: true });
    // unchanged keys (width, thickness, bold) never travel
    expect(sent.style!.w).toBeUndefined();
  });

  it('edits a part label: content renames the part, style rides the label apply', async () => {
    const page = await boot();
    page.pressLabel();
    page.key('e');
    expect(page.header()).toBe('reference label · R1');
    const q = <T extends HTMLElement>(sel: string) => page.panel().querySelector<T>(sel)!;
    // authored style prefills; content field present (renames the part)
    expect(q<HTMLInputElement>('#tx-text').value).toBe('R1');
    expect(q<HTMLInputElement>('#tx-h').value).toBe('1');
    expect(q<HTMLInputElement>('#tx-th').value).toBe('0.15');
    // rename + size edit
    q<HTMLInputElement>('#tx-text').value = 'R9';
    q<HTMLInputElement>('#tx-h').value = '1.5';
    q<HTMLElement>('#tx-apply').click();
    expect(page.panel().style.display).toBe('none');
    // the rename rides layoutRefEdits: the part panel shows it too
    page.pressPart('R1');
    page.key('e');
    expect(q<HTMLInputElement>('#pp-ref').value).toBe('R9');
    page.key('e');
    // the label panel shows the applied state, and the style diff posts
    let capturedLabels: unknown[] = [];
    (page.window as unknown as Record<string, unknown>).typecadLayoutApply = (
      _moves: unknown,
      _texts: unknown,
      _values: unknown,
      labels: unknown[],
      _renames: unknown,
      _routes: unknown,
      _deletes: unknown,
      cb: (err: string | null, fast: boolean) => void,
    ) => {
      capturedLabels = labels;
      cb(null, false);
    };
    page.pressLabel();
    page.key('e');
    expect(q<HTMLInputElement>('#tx-text').value).toBe('R9');
    expect(q<HTMLInputElement>('#tx-h').value).toBe('1.5');
    page.window.document.getElementById('layout-apply')!.click();
    const sent = capturedLabels[0] as {
      ref: string;
      kind: string;
      style?: { h?: number; w?: number };
    };
    expect(sent.ref).toBe('R1');
    expect(sent.kind).toBe('reference');
    expect(sent.style).toBeDefined();
    expect(sent.style!.h).toBe(1.5);
    expect(sent.style!.w).toBeUndefined(); // unchanged key never travels
  });
});

describe('delete → undo leaves no stuck highlight', () => {
  it('Ctrl+Z restores the ink without resurrecting the selection overlay', async () => {
    const page = await boot();
    const w = page.window;
    const overlay = () => !!w.document.querySelector('.route-sel');
    const ink = () => w.document.querySelectorAll("g[data-kind='copper'] line").length;
    const before = ink();
    // select a trace segment, delete it
    page.pressBoard(1, 1);
    expect(overlay()).toBe(true);
    page.key('Delete');
    expect(overlay()).toBe(false);
    expect(ink()).toBe(before - 1);
    // undo: ink back, overlay gone — and it must stay clearable
    page.key('z', { ctrlKey: true });
    expect(ink()).toBe(before);
    expect(overlay()).toBe(false);
    // redo + undo again (the redo path once crashed on a missing snapshot
    // field) — the whole cycle stays clean
    page.key('y', { ctrlKey: true });
    expect(ink()).toBe(before - 1);
    page.key('z', { ctrlKey: true });
    expect(ink()).toBe(before);
    expect(overlay()).toBe(false);
    // empty-space click and Escape keep working, and a fresh selection
    // still draws its overlay
    page.pressBoard(900, 900);
    page.releaseBoard(900, 900);
    expect(overlay()).toBe(false);
    page.pressBoard(1, 1);
    expect(overlay()).toBe(true);
    page.key('Escape');
    expect(overlay()).toBe(false);
  });
});

describe('arrow keys nudge traces and vias', () => {
  it('moves a selected segment by a grid step, stretching same-layer neighbors', async () => {
    const page = await boot();
    const w = page.window;
    page.pressBoard(1, 1); // select the trace segment near (1,1)
    const seg = () => w.document.querySelector("g[data-kind='copper'] line");
    const before = {
      x1: parseFloat(seg()!.getAttribute('x1')!),
      y1: parseFloat(seg()!.getAttribute('y1')!),
      x2: parseFloat(seg()!.getAttribute('x2')!),
      y2: parseFloat(seg()!.getAttribute('y2')!),
    };
    page.key('ArrowRight');
    const after = {
      x1: parseFloat(seg()!.getAttribute('x1')!),
      x2: parseFloat(seg()!.getAttribute('x2')!),
    };
    expect(after.x1).toBeCloseTo(before.x1 + 0.5, 3); // grid step 0.5
    expect(after.x2).toBeCloseTo(before.x2 + 0.5, 3);
    // the selection overlay follows the moved ink
    expect(w.document.querySelector('.route-sel')).not.toBeNull();
    // Ctrl+Z restores the original geometry
    page.key('z', { ctrlKey: true });
    const undone = parseFloat(seg()!.getAttribute('x1')!);
    expect(undone).toBeCloseTo(before.x1, 3);
  });

  it('still moves a part when only a part is selected', async () => {
    const page = await boot();
    const w = page.window;
    page.pressPart('R1');
    const g = () => w.document.querySelector('#layout-overlay [data-ref="R1"]')!;
    const x0 = parseFloat(g()!.getAttribute('transform')!.match(/translate\(([-\d.]+),/)![1]!);
    page.key('ArrowLeft');
    const x1 = parseFloat(g()!.getAttribute('transform')!.match(/translate\(([-\d.]+),/)![1]!);
    expect(x1).toBeCloseTo(x0 - 0.5, 3);
  });
});

describe('via selection ring and drill hole', () => {
  it('the ring hugs the barrel in board units; the hole rides selection state', async () => {
    const page = await boot();
    const w = page.window;
    // synthesize a committed session via exactly as routeCommit builds it
    const cu = w.document.querySelector("g[data-kind='copper']")!;
    const SVG = 'http://www.w3.org/2000/svg';
    const barrel = w.document.createElementNS(SVG, 'circle');
    barrel.setAttribute('cx', '5');
    barrel.setAttribute('cy', '5');
    barrel.setAttribute('r', '0.3'); // 0.6 mm barrel
    barrel.setAttribute('data-route', '1');
    barrel.setAttribute('data-net', 'led_a');
    cu.appendChild(barrel);
    const hole = w.document.createElementNS(SVG, 'circle');
    hole.setAttribute('cx', '5');
    hole.setAttribute('cy', '5');
    hole.setAttribute('r', '0.15');
    hole.setAttribute('class', 'cut');
    hole.setAttribute('pointer-events', 'none');
    cu.appendChild(hole);
    barrel.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 5, clientY: 5 }));
    expect(barrel.classList.contains('route-via-sel')).toBe(true);
    // ring width scales with the barrel (0.6 mm * 0.18), not a fixed px value
    expect(parseFloat(barrel.getAttribute('stroke-width')!)).toBeCloseTo(0.108, 3);
    page.key('Escape');
    expect(barrel.classList.contains('route-via-sel')).toBe(false);
    expect(barrel.getAttribute('stroke-width')).toBeNull();
    expect(w.document.querySelector('.cut')).not.toBeNull();
  });
});

describe('editing session ink never re-materializes phantom traces', () => {
  // route a trace from the fixture ink, commit it, then rewrite it and
  // capture the apply bridge payload — the session entry must carry the
  // NEW geometry and the old-position twin must not exist
  const routeAndCommit = (page: BootedPage) => {
    page.pressBoard(1, 1); // arm from the fixture trace
    page.key('x');
    const board = page.window.document.getElementById('board')!;
    const w = page.window;
    board.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 4, clientY: 4 }));
    board.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, clientX: 4, clientY: 4 }));
    return [...page.window.document.querySelectorAll('line[data-seg="1"][data-route="1"]')];
  };
  const captureRoutes = (page: BootedPage) => {
    const sent: unknown[] = [];
    (page.window as unknown as Record<string, unknown>).typecadLayoutApply = (
      _m: unknown, _t: unknown, _v: unknown, _l: unknown, _r: unknown,
      routes: unknown[], _d: unknown, cb: (e: string | null, f: boolean) => void,
    ) => {
      sent.push(...routes);
      cb(null, false);
    };
    page.window.document.getElementById('layout-apply')!.click();
    return sent as Array<{ pieces: Array<{ pts: Array<{ x: number; y: number }> }> }>;
  };
  const flatPts = (r: { pieces: Array<{ pts: Array<{ x: number; y: number }> }> }) =>
    r.pieces.map((p) => p.pts.map((q) => `${q.x},${q.y}`).join(' ')).join(' | ');

  it('nudging a session route updates its entry — no old-position twin', async () => {
    const page = await boot();
    const hits = routeAndCommit(page);
    expect(hits.length).toBeGreaterThan(0);
    hits[0]!.dispatchEvent(new page.window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 2, clientY: 2 }));
    page.key('ArrowRight');
    const routes = captureRoutes(page);
    const geoms = routes.map(flatPts);
    // the session entry moved (+0.5 on x); the pre-nudge geometry is gone
    expect(geoms.some((g) => g.includes('1.5,-1'))).toBe(true);
    expect(geoms.some((g) => g.split(' ').some((pt) => pt === '1,-1' || pt === '1,1'))).toBe(false);
  });

  it('undoing the nudge restores the entry to its authored geometry', async () => {
    const page = await boot();
    const hits = routeAndCommit(page);
    hits[0]!.dispatchEvent(new page.window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 2, clientY: 2 }));
    page.key('ArrowRight');
    page.key('z', { ctrlKey: true });
    const routes = captureRoutes(page);
    const geoms = routes.map(flatPts);
    expect(geoms.some((g) => g.split(' ').some((pt) => pt === '1,-1' || pt === '1,1'))).toBe(true);
    expect(geoms.some((g) => g.includes('1.5,-1'))).toBe(false);
  });

  it('dragging (D) a session route reconciles the same way', async () => {
    const page = await boot();
    const hits = routeAndCommit(page);
    const w = page.window;
    // hover on the session ink, slide it (body-level so the hover target resolves)
    w.document.body.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 2, clientY: 2 }));
    page.key('d');
    w.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 4, clientY: 6 }));
    w.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 4, clientY: 6 }));
    const routes = captureRoutes(page);
    const geoms = routes.map(flatPts);
    // the phantom invariant: the authored geometry appears AT MOST once —
    // a completed slide reconciles it away, a reverted slide (clearance)
    // leaves it untouched — never BOTH the old and new shapes
    expect(geoms.filter((g) => g === '1,-1 1,1 4,4').length).toBeLessThanOrEqual(1);
    const sessionShaped = geoms.filter((g) => g.startsWith('1,-1'));
    expect(sessionShaped.length).toBeLessThanOrEqual(1);
  });
});
