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

type BootOverrides = Partial<Parameters<typeof buildViewerHtml>[2]>;

async function boot(overrides: BootOverrides = {}): Promise<BootedPage> {
  const html = buildViewerHtml(svg, [info, fabInfo], {
    title: 'demo board',
    pcbaSvg: '<svg/>',
    layoutComponents,
    layoutTexts,
    padLabels,
    rules,
    ...overrides,
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

  it('a Tab-selected text draws the overlay selection box — and yields it to the next selection', async () => {
    const page = await boot();
    const w = page.window;
    const d = w.document;
    // hover R1's reference label (anchor gerber (10.5, -23); identity CTM +
    // the y-flip put it at client (10.5, 23)). A reference cycles regardless
    // of its layer rail state — that is the buried-designator road in
    w.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 10.5, clientY: 23 }));
    page.key('Tab');
    // the selection owns a box at the text's live anchor, sized by the ink
    // estimate (rot 0: run = 2 chars * w 1 * 0.62 + 0.3 margin, cross = h
    // 1 * 1.15 + 0.3)
    const box = d.getElementById('layout-text-sel-box');
    expect(box).not.toBeNull();
    expect(+box!.getAttribute('x')!).toBeCloseTo(10.5 - 1.54 / 2, 2);
    expect(+box!.getAttribute('y')!).toBeCloseTo(-23 - 1.45 / 2, 2);
    expect(+box!.getAttribute('width')!).toBeCloseTo(1.54, 2);
    expect(+box!.getAttribute('height')!).toBeCloseTo(1.45, 2);
    // the claimed glyphs carry the recolor too (the box augments, not replaces)
    expect(d.querySelectorAll('#yflip path.layout-text-sel').length).toBeGreaterThan(0);
    // a part press replaces the selection — the text's box and recolor die
    page.pressPart('R1');
    expect(d.getElementById('layout-text-sel-box')).toBeNull();
    expect(d.querySelectorAll('#yflip path.layout-text-sel').length).toBe(0);
    // and Tab brings the text (box and all) back
    w.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 10.5, clientY: 23 }));
    page.key('Tab');
    expect(d.getElementById('layout-text-sel-box')).not.toBeNull();
  });

  it("cycles a part's reference designator from over the BODY — no ink, no layer, no anchor reach needed", async () => {
    const page = await boot();
    const w = page.window;
    const d = w.document;
    // hover mid-body of R1 (gerber (10, -20)): the label anchor (10.5, -23)
    // is outside the anchor disc's reach and the fab layer is off, so the
    // STACK finds nothing — the part candidate is what carries its label in
    w.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 20 }));
    page.key('Tab');
    // jsdom has no elementFromPoint: the geometric fallback finds the part
    expect((d.getElementById('status')?.textContent ?? '')).toBe('R1 — Tab cycles');
    page.key('Tab');
    expect(d.getElementById('status')?.textContent ?? '').toBe('text "R1" — drag to move, E edits, Tab cycles');
    const box = d.getElementById('layout-text-sel-box');
    expect(box).not.toBeNull();
    // the box centers on the label's anchor with the ink-estimate extents
    expect(+box!.getAttribute('x')! + +box!.getAttribute('width')! / 2).toBeCloseTo(10.5, 2);
    expect(+box!.getAttribute('y')! + +box!.getAttribute('height')! / 2).toBeCloseTo(-23, 2);
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
    (page.window as unknown as Record<string, unknown>).typecadLayoutApply = (...args: unknown[]) => {
      captured = args[1] as unknown[];
      (args[args.length - 1] as (err: string | null, fast: boolean) => void)(null, false);
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

  it('Delete on a selected part rips its ink and rides the apply as a part deletion', async () => {
    const page = await boot();
    let capturedParts: string[] | null = null;
    (page.window as unknown as Record<string, unknown>).typecadLayoutApply = (...args: unknown[]) => {
      capturedParts = args[7] as string[];
      (args[args.length - 1] as (err: string | null, fast: boolean) => void)(null, false);
    };
    const handle = page.window.document.querySelector('#layout-overlay [data-ref="R1"]')!;
    page.pressPart('R1');
    page.key('Delete');
    // the ink is gone now (ripped, reversible) and the apply carries it
    expect(handle.getAttribute('display')).toBe('none');
    page.window.document.getElementById('layout-apply')!.click();
    expect(capturedParts).toEqual(['R1']);
    // undo brings the part back and drops it from the pending deletions —
    // with nothing else pending, the apply button gates off entirely
    page.key('z', { ctrlKey: true });
    expect(handle.getAttribute('display')).not.toBe('none');
    expect((page.window.document.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(true);
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
    (page.window as unknown as Record<string, unknown>).typecadLayoutApply = (...args: unknown[]) => {
      capturedLabels = args[3] as unknown[];
      (args[args.length - 1] as (err: string | null, fast: boolean) => void)(null, false);
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
    // zero stroke width: the .cut rule paints stroke !important, and the
    // inherited 1mm default read as a dark ring around fresh vias
    hole.setAttribute('stroke-width', '0');
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

describe('a segment delete that sweeps an endpoint via leaves no white ring', () => {
  it('the selected via\u2019s on-top mirror dies with the barrel', async () => {
    const page = await boot();
    const w = page.window;
    const d = w.document;
    // select the fixture's trace segment first — the via will sit on its
    // endpoint, and a press there would otherwise pick the via instead
    page.pressBoard(1, 1);
    const seg = d.querySelector("g[data-kind='copper'] line")!;
    const ex = parseFloat(seg.getAttribute('x1')!);
    const ey = parseFloat(seg.getAttribute('y1')!);
    // a genuine session via ON that endpoint: V arms (the arm starts
    // position-less — a move pins it), the click places (floating here —
    // the fixture segment carries no net — which is legal), and
    // viaInkAndEntry gives it a routedTrack entry exactly like a live one
    // session via ink renders y-flipped (cy = -click y): aim the arm and
    // click at the endpoint's MIRROR so the barrel's ink lands on it
    d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: ex, clientY: -ey }));
    page.key('v');
    d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: ex, clientY: -ey }));
    page.pressBoard(ex, -ey);
    page.releaseBoard(ex, -ey);
    const barrel = d.querySelector("g[data-kind='copper'] circle[data-route]");
    expect(barrel).not.toBeNull();
    // grow the selection once (U — E owns the props panel): the endpoint
    // via rides it and its on-top mirror ring (#via-sel-top, the ring that
    // paints above part graphics) appears — the ring that used to orphan
    page.key('u');
    const rings = () => d.querySelectorAll('#via-sel-top circle');
    expect(rings().length).toBe(1);
    // delete the segment: its endpoint via goes with it — the mirror ring
    // must not linger as a white circle where the barrel was. The Delete
    // handler's own viaHiSync is conditional on viaSel SURVIVING segDelete,
    // which the endpoint sweep empties — the orphan case exactly
    page.key('Delete');
    expect(rings().length).toBe(0);
    expect(d.querySelectorAll('circle[data-route]').length).toBe(0);
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
    (page.window as unknown as Record<string, unknown>).typecadLayoutApply = (...args: unknown[]) => {
      sent.push(...(args[5] as unknown[]));
      (args[args.length - 1] as (e: string | null, f: boolean) => void)(null, false);
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

describe('routing rubber band — the ratsnest follows the walk end', () => {
  // a two-pad net: routing from one pad, the band ties the cursor end to
  // the FAR pad (not the start), follows every mousemove, vanishes on
  // arrival, and the pad-to-pad wire returns when the route cancels
  const twoPadBoot = async () => {
    const html = buildViewerHtml(svg, [info, fabInfo], {
      title: 'demo board',
      pcbaSvg: '<svg/>',
      // island comps are authored in the GERBER frame (y-up), exactly as
      // the layout extractor emits them — the ratsnest group renders that
      // frame directly inside #yflip
      layoutComponents: [
        { ref: 'R1', x: 10, y: 20, rot: 0, w: 1.6, h: 0.8, side: 'front' as const, nets: ['led_a'], pads: [{ x: 9.5, y: 20, net: 'led_a' }] },
        { ref: 'U1', x: 30, y: 40, rot: 0, w: 4, h: 4, side: 'front' as const, nets: ['led_a'], pads: [{ x: 30, y: 40, net: 'led_a' }] },
      ],
      padLabels: [
        { ref: 'R1', pin: '1', net: 'led_a', x: 9.5, y: -20, w: 0.8, h: 0.9, layers: ['F.Cu'] },
        { ref: 'U1', pin: '1', net: 'led_a', x: 30, y: -40, w: 0.8, h: 0.9, layers: ['F.Cu'] },
      ],
    });
    const errors: string[] = [];
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://localhost/viewer.html',
      pretendToBeVisual: true,
      beforeParse(w) {
        w.console.error = (...a: unknown[]) => errors.push(a.join(' '));
        const idCtm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } };
        type FakePoint = { x: number; y: number; matrixTransform(): { x: number; y: number } };
        w.SVGSVGElement.prototype.getScreenCTM = () => idCtm;
        w.SVGSVGElement.prototype.createSVGPoint = (): FakePoint => {
          const p = { x: 0, y: 0 };
          return { get x() { return p.x; }, set x(v: number) { p.x = v; }, get y() { return p.y; }, set y(v: number) { p.y = v; }, matrixTransform: () => ({ x: p.x, y: p.y }) };
        };
        w.SVGElement.prototype.getBBox = function (this: SVGElement) { return { x: 0, y: 0, width: 0, height: 0 }; };
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
    const mouse = (el: Element, type: string, x: number, y: number) =>
      el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
    const key = (k: string) => d.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
    const band = () => d.getElementById('rats-live');
    const bandPath = () => band()?.querySelector('path') ?? null;
    return { w, d, mouse, key, band, bandPath, board: () => d.getElementById('board')! };
  };

  it('ties the walk end to the far pad and follows the cursor', async () => {
    const t = await twoPadBoot();
    // gerber y-flip: client (9.5,-20) = the R1 pad at gerber (9.5,20)
    t.mouse(t.d.querySelector('#layout-overlay [data-ref="R1"]')!, 'pointerdown', 9.5, -20);
    t.key('x');
    expect(t.band()).not.toBeNull();
    t.mouse(t.board(), 'mousemove', 18, -28);
    const path = t.bandPath();
    expect(path).not.toBeNull();
    const start = /^M ([\d.-]+) ([\d.-]+)/.exec(path!.getAttribute('d')!)!;
    const end = /([\d.-]+) ([\d.-]+)$/.exec(path!.getAttribute('d')!)!;
    // walk end in the gerber frame the band renders: client (18,-28) is
    // gerber (18, 28) — drawn AS-IS, never mirrored
    expect(+start[1]!).toBeCloseTo(18, 2);
    expect(+start[2]!).toBeCloseTo(28, 2);
    expect(+end[1]!).toBeCloseTo(30, 2); // the far pad, not the start pad
    expect(+end[2]!).toBeCloseTo(40, 2);
    // moves with the cursor
    t.mouse(t.board(), 'mousemove', 22, -32);
    expect(t.bandPath()!.getAttribute('d')).not.toBe(path!.getAttribute('d'));
    // arrival: hovering the target pad drops the band
    t.mouse(t.board(), 'mousemove', 30, -40);
    expect(t.band()!.children.length).toBe(0);
    // moving off brings it back
    t.mouse(t.board(), 'mousemove', 20, -30);
    expect(t.band()!.children.length).toBe(1);
    // cancel: the band goes and the pad-to-pad wire returns
    t.key('Escape');
    expect(t.band()).toBeNull();
    expect(t.d.querySelectorAll('#ratsnest > path').length).toBe(1);
  });
});

describe('ratsnest connectivity — broken routes wire, complete routes do not', () => {
  // the regression the user hit: a route that exists but broke in the
  // middle left both pads "wired" (each sat on ink) and drew NOTHING;
  // deleting every segment was the only way to get a wire back
  const netBoot = async (routeD: string | null) => {
    const copperInk = routeD
      ? `<path d="${routeD}" data-w="0.3" data-net="led_a" fill="none"/>`
      : '';
    // the copper group carries layer attrs before data-kind — anchor on
    // the tag itself, inject right inside it
    const localSvg = svg.replace(/(<g [^>]*data-kind="copper"[^>]*>)/, `$1${copperInk}`);
    const html = buildViewerHtml(localSvg, [info], {
      title: 'demo board',
      pcbaSvg: '<svg/>',
      layoutComponents: [
        { ref: 'R1', x: 1, y: 1, rot: 0, w: 1.6, h: 0.8, side: 'front' as const, nets: ['led_a'], pads: [{ x: 1, y: 1, net: 'led_a' }] },
        { ref: 'U1', x: 5, y: 1, rot: 0, w: 4, h: 4, side: 'front' as const, nets: ['led_a'], pads: [{ x: 5, y: 1, net: 'led_a' }] },
      ],
    });
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://localhost/viewer.html',
      pretendToBeVisual: true,
      beforeParse(w) {
        const idCtm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } };
        type FakePoint = { x: number; y: number; matrixTransform(): { x: number; y: number } };
        w.SVGSVGElement.prototype.getScreenCTM = () => idCtm;
        w.SVGSVGElement.prototype.createSVGPoint = (): FakePoint => {
          const p = { x: 0, y: 0 };
          return { get x() { return p.x; }, set x(v: number) { p.x = v; }, get y() { return p.y; }, set y(v: number) { p.y = v; }, matrixTransform: () => ({ x: p.x, y: p.y }) };
        };
        w.SVGElement.prototype.getBBox = function (this: SVGElement) { return { x: 0, y: 0, width: 0, height: 0 }; };
      },
    });
    const w = dom.window;
    const d = w.document;
    await new Promise((r) => setTimeout(r, 100));
    const viewSelect = d.querySelector('select')!;
    viewSelect.value = 'layout';
    viewSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    return { w, d, wires: () => d.querySelectorAll('#ratsnest > path').length };
  };

  it('no copper: one wire pad-to-pad', async () => {
    const t = await netBoot(null);
    expect(t.wires()).toBe(1);
  });

  it('complete route: both pads one component, no wire', async () => {
    const t = await netBoot('M 1 1 L 5 1');
    expect(t.wires()).toBe(0);
  });

  it('route BROKEN in the middle: the two sides are separate components — the wire returns', async () => {
    // two sub-tracks: each reaches a pad, but a gap between x=2 and x=4
    // leaves the net electrically open
    const t = await netBoot('M 1 1 L 2 1 M 4 1 L 5 1');
    expect(t.wires()).toBe(1);
  });

  it('stub off one pad: the far pad still owes its wire — from the DANGLING END', async () => {
    // closest-point wiring: the wire runs (2,1) -> (5,5), the stub's open
    // end to the far pad — not pad-center (1,1) to pad-center
    const t = await netBoot('M 1 1 L 2 1');
    expect(t.wires()).toBe(1);
    const d = t.d.querySelector('#ratsnest > path')!.getAttribute('d')!;
    const start = /^M ([\d.-]+) ([\d.-]+)/.exec(d)!;
    const end = /([\d.-]+) ([\d.-]+)$/.exec(d)!;
    expect(+start[1]!).toBeCloseTo(2, 2);
    expect(+start[2]!).toBeCloseTo(1, 2);
    expect(+end[1]!).toBeCloseTo(5, 2); // U1's pad sits at (5,1)
    expect(+end[2]!).toBeCloseTo(1, 2);
  });
});

describe('net-class editing in the E panel', () => {
  it('changed dimensions become pending class edits and ride the apply payload', async () => {
    const page = await boot();
    const w = page.window;
    const d = w.document;
    page.key('e'); // nothing selected: the creation panel hosts the classes
    const nameSel = d.getElementById('nc-name') as HTMLSelectElement;
    expect(nameSel).toBeTruthy();
    expect(nameSel.value).toBe('PWR');
    const width = d.getElementById('nc-width') as HTMLInputElement;
    expect(parseFloat(width.value)).toBeCloseTo(0.5, 3); // the class's authored width
    width.value = '0.8';
    (d.getElementById('nc-apply') as HTMLButtonElement).click();
    const status = d.getElementById('status') as HTMLElement;
    expect(status.textContent).toContain('net class PWR edited (track_width)');
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(false);
    // the apply payload's classEdits argument (index 15) carries the edit
    let got: Array<Record<string, unknown>> = [];
    (w as unknown as Record<string, unknown>).typecadLayoutApply = function (...args: unknown[]) {
      got = args[15] as Array<Record<string, unknown>>;
      (args[args.length - 1] as (e: string | null) => void)(null);
    };
    (d.getElementById('layout-apply') as HTMLButtonElement).click();
    expect(got).toHaveLength(1);
    expect(got[0]!.name).toBe('PWR');
    expect((got[0] as { values: Record<string, number> }).values.track_width).toBeCloseTo(0.8, 5);
    // undo retires the pending edit
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('un-applied board edits do not survive a reload', () => {
  // board changes live only in the current page: nothing restores after a
  // reload, and a legacy pending store from an older version is scrubbed so
  // no ghost edits ever come back
  const bootWithLegacyStore = async (payload: Record<string, unknown>) => {
    const html = buildViewerHtml(svg, [info, fabInfo], {
      title: 'demo board',
      pcbaSvg: '<svg/>',
      layoutComponents,
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
        w.localStorage.setItem('typecadPending:demo board:viewer.html', JSON.stringify(payload));
        const idCtm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } };
        type FakePoint = { x: number; y: number; matrixTransform(): { x: number; y: number } };
        w.SVGSVGElement.prototype.getScreenCTM = () => idCtm;
        w.SVGSVGElement.prototype.createSVGPoint = (): FakePoint => {
          const p = { x: 0, y: 0 };
          return { get x() { return p.x; }, set x(v: number) { p.x = v; }, get y() { return p.y; }, set y(v: number) { p.y = v; }, matrixTransform: () => ({ x: p.x, y: p.y }) };
        };
        w.SVGElement.prototype.getBBox = function (this: SVGElement) { return { x: 0, y: 0, width: 0, height: 0 }; };
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
  };

  it('a stored payload neither restores nor lingers', async () => {
    const stale = { net: 'led_a', x1: 8.991, y1: 0.188, x2: 9.014, y2: 0.21, layer: 'F.Cu' };
    const { w, d } = await bootWithLegacyStore({ routes: [], deletes: [stale], partDeletes: [] });
    // the legacy key is scrubbed on load
    expect(w.localStorage.getItem('typecadPending:demo board:viewer.html')).toBeNull();
    // nothing restored: the apply button stays disarmed and no edit count appears
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(true);
    expect((d.getElementById('status') as HTMLElement).textContent || '').not.toContain('restored');
  });
});

describe('a gesture\'s own deletes ride the apply (no door prune)', () => {
  // regression: the apply-door prune treated a gesture's deletes — whose
  // ink the gesture itself had just removed — as dead state and dropped
  // them; the source kept the copper and both the old and new routes
  // appeared after apply
  it('delete a trace, draw a replacement: payload carries BOTH the delete and the route', async () => {
    const page = await boot();
    const w = page.window;
    page.pressBoard(1, 1); // select the trace segment
    page.key('Delete');
    const board = w.document.getElementById('board')!;
    board.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 4, clientY: 4 }));
    page.key('x');
    board.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 }));
    board.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, clientX: 5, clientY: 5 }));
    let routes = 0;
    let deletes = 0;
    (w as unknown as Record<string, unknown>).typecadLayoutApply = (
      _m: unknown, _t: unknown, _v: unknown, _l: unknown, _r: unknown,
      rt: unknown[], de: unknown[], _z: unknown, _o: unknown, cb: (e: string | null, f: boolean) => void,
    ) => {
      routes = rt.length;
      deletes = de.length;
      cb(null, false);
    };
    w.document.getElementById('layout-apply')!.click();
    expect(routes).toBe(1);
    expect(deletes).toBeGreaterThanOrEqual(1);
  });
});

describe('collapsible sidebar with a compact layer rail', () => {
  it('collapses to the toggle rail, swaps to the compact list, mirrors selection, persists', async () => {
    const page = await boot();
    const w = page.window;
    const d = w.document;
    const sidebar = d.getElementById('sidebar')!;
    const toggle = d.getElementById('sidebar-toggle')!;
    expect(sidebar.classList.contains('collapsed')).toBe(false);
    toggle.click();
    expect(sidebar.classList.contains('collapsed')).toBe(true);
    expect(d.getElementById('layers')!.style.display).toBe('none');
    expect(d.getElementById('layers-compact')!.style.display).toBe('');
    // the rail is wide enough for the stacked checkbox+chip column (an
    // 18px rail clipped the swatches to slivers); padding-top clears the
    // absolutely-positioned toggle
    const cssAll = [...d.querySelectorAll('style')].map((st) => st.textContent ?? '').join('\n');
    expect(cssAll).toMatch(/#sidebar\.collapsed \{ width: 34px/);
    expect(cssAll).toMatch(/#sidebar\.collapsed #layers-compact \{ display: flex; padding: 56px 2px 6px; \}/);
    // the compact rail inherits the full list's selection and edits BOTH
    const compactCb = d.querySelector('#layers-compact .layer-vis') as HTMLInputElement;
    const id = compactCb.closest('.layer-row')!.getAttribute('data-layer-id')!;
    const fullCb = d.querySelector(`#layers .layer-row[data-layer-id="${id}"] .layer-vis`) as HTMLInputElement;
    const was = fullCb.checked;
    compactCb.checked = !was;
    compactCb.dispatchEvent(new w.Event('change', { bubbles: true }));
    expect(fullCb.checked).toBe(compactCb.checked);
    // the svg group followed
    const group = d.querySelector(`#board [data-layer-id="${id}"]`)!;
    expect(group.getAttribute('display')).toBe(compactCb.checked ? null : 'none');
    // re-expand + persistence
    toggle.click();
    expect(sidebar.classList.contains('collapsed')).toBe(false);
    expect(w.localStorage.getItem('gerber-viewer:sidebar:v1')).toBe('open');
  });
});

describe('viewer prefs: no warn borders, collapsible rail, snap persistence', () => {
  it('overlapping parts get NO yellow border — the text list is the only warning', async () => {
    const page = await boot();
    const w = page.window;
    page.pressPart('R1');
    // drag R1 onto U1 (30,-40) to force an overlap
    const g = w.document.querySelector('#layout-overlay [data-ref="R1"]')!;
    w.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 30, clientY: 40 }));
    w.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 30, clientY: 40 }));
    // the warn class must never land on a part
    expect(w.document.querySelectorAll('.layout-comp.layout-warn').length).toBe(0);
    expect(w.document.querySelectorAll('.layout-comp > title').length).toBe(0);
  });

  it('the compact rail stays visible when collapsed (it sat inside the hidden body)', async () => {
    const page = await boot();
    const w = page.window;
    w.document.getElementById('sidebar-toggle')!.click();
    const rail = w.document.getElementById('layers-compact')!;
    expect(w.document.getElementById('sidebar')!.classList.contains('collapsed')).toBe(true);
    expect(rail.querySelectorAll('.layer-vis').length).toBeGreaterThan(0);
    expect(rail.style.display).toBe('');
    // the body is hidden but must not swallow the rail
    expect(rail.parentElement!.id).toBe('sidebar');
  });

  it('the grid feature is gone — snap stays, at one fixed step', async () => {
    const page = await boot();
    const w = page.window;
    // no sidebar items, no visible-grid element ever, no ladder select
    expect(w.document.getElementById('layout-grid')).toBeNull();
    expect(w.document.getElementById('layout-grid-show')).toBeNull();
    expect(w.document.querySelector('#layout-grid-g')).toBeNull();
    // snap on/off survives a reload (the store carries it without the grid)
    const snap = w.document.getElementById('layout-snap') as HTMLInputElement;
    expect(snap.checked).toBe(true);
    snap.checked = false;
    snap.dispatchEvent(new w.Event('change', { bubbles: true }));
    const step = w.document.getElementById('layout-snap-step') as HTMLSelectElement;
    expect(step.value).toBe('0.5');
    step.value = '0.25';
    step.dispatchEvent(new w.Event('change', { bubbles: true }));
    const store = w.localStorage.getItem('gerber-viewer:v1:demo board')!;
    expect(store).toContain('"snap":false');
    expect(store).toContain('"step":0.25');
    expect(store).not.toContain('__grid');
    // simulate the rebuild: a fresh page whose localStorage holds the store
    // BEFORE scripts run (the restore executes during page init)
    const errors2: string[] = [];
    const dom2 = new JSDOM(buildViewerHtml(svg, [info, fabInfo], {
      title: 'demo board', pcbaSvg: '<svg/>', layoutComponents, padLabels, rules,
    }), {
      runScripts: 'dangerously',
      url: 'https://localhost/viewer.html',
      pretendToBeVisual: true,
      beforeParse(w2) {
        w2.console.error = (...a: unknown[]) => errors2.push(a.join(' '));
        w2.localStorage.setItem('gerber-viewer:v1:demo board', store);
        const idCtm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } };
        type FakePoint = { x: number; y: number; matrixTransform(): { x: number; y: number } };
        w2.SVGSVGElement.prototype.getScreenCTM = () => idCtm;
        w2.SVGSVGElement.prototype.createSVGPoint = (): FakePoint => {
          const p = { x: 0, y: 0 };
          return { get x() { return p.x; }, set x(v: number) { p.x = v; }, get y() { return p.y; }, set y(v: number) { p.y = v; }, matrixTransform: () => ({ x: p.x, y: p.y }) };
        };
        w2.SVGElement.prototype.getBBox = function (this: SVGElement) { return { x: 0, y: 0, width: 0, height: 0 }; };
      },
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(errors2).toEqual([]);
    const step2 = dom2.window.document.getElementById('layout-snap-step') as HTMLSelectElement;
    expect(step2.value).toBe('0.25');
    expect((dom2.window.document.getElementById('layout-snap') as HTMLInputElement).checked).toBe(false);
  });

});

describe('KiCad M-to-move (no drag-by-surprise, no dblclick source jump)', () => {
  const grabBoot = async () => {
    const page = await boot();
    const w = page.window;
    const board = w.document.getElementById('board')!;
    const part = () => w.document.querySelector('#layout-overlay [data-ref="R1"]')!;
    // events dispatch from the board/part (real targets), y-flipped
    const select = () => part()!.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: -20 }));
    const d = w.document;
    const mouse = (el: Element, type: string, x: number, y: number) =>
      el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
    return { ...page, board, select, part, d, mouse };
  };

  it('a press-drag without M moves nothing; M grabs, the cursor moves it, click drops', async () => {
    const t = await grabBoot();
    t.select();
    // bare press-drag: the part must NOT move (events from the board node)
    t.board.dispatchEvent(new t.window.MouseEvent('pointermove', { bubbles: true, clientX: 16, clientY: -26 }));
    t.board.dispatchEvent(new t.window.MouseEvent('pointerup', { bubbles: true, clientX: 16, clientY: -26 }));
    expect(t.part().getAttribute('transform')).toBe('translate(10,-20) rotate(0)');
    // M grabs
    t.key('m');
    expect(t.d.getElementById('status')!.textContent).toContain('moving R1');
    // the cursor moves it
    t.mouse(t.board, 'mousemove', 16, -26);
    expect(t.part().getAttribute('transform')).toBe('translate(16,-26) rotate(0)');
    // click drops and commits
    t.board.dispatchEvent(new t.window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 16, clientY: -26 }));
    expect(t.part().getAttribute('transform')).toBe('translate(16,-26) rotate(0)');
    // undo returns the pre-move position
    t.key('z', { ctrlKey: true });
    expect(t.part().getAttribute('transform')).toBe('translate(10,-20) rotate(0)');
  });

  it('Esc during a grab reverts the move', async () => {
    const t = await grabBoot();
    t.select();
    t.key('m');
    t.mouse(t.board, 'mousemove', 16, -26);
    t.key('Escape');
    expect(t.part().getAttribute('transform')).toBe('translate(10,-20) rotate(0)');
  });
});

describe('sidebar geometry: inner scrolling, toolbar always visible', () => {
  it('bounds the sidebar so #layers and the toolbar stay inside the viewport', async () => {
    const page = await boot();
    const w = page.window;
    const d = w.document;
    // the height-bounding rules exist (jsdom does no real layout, so this
    // pins the CSS contract the browser executes)
    const css = [...d.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
    expect(css).toMatch(/#sidebar \{[^}]*min-height: 0; overflow: hidden/);
    expect(css).toMatch(/#sidebar-body \{[^}]*min-height: 0/);
    expect(css).toMatch(/#layers-compact \{[^}]*min-height: 0; overflow-y: auto/);
    expect(css).toMatch(/html, body \{[^}]*overflow: hidden/);
    // #layers and the toolbar remain direct flex children in the scroll
    // chain: #layers scrolls, the toolbar is a sibling below it (never
    // pushed off-viewport by list growth)
    expect(d.getElementById('layers')).not.toBeNull();
    expect(d.getElementById('toolbar')).not.toBeNull();
    // collapse: the compact rail is OUTSIDE #sidebar-body (which hides),
    // a direct child of #sidebar so it can scroll on its own
    w.document.getElementById('sidebar-toggle')!.click();
    expect(w.document.getElementById('layers-compact')!.parentElement!.id).toBe('sidebar');
  });
});

describe('Flip Board toggle', () => {
  it('mirrors stack+viewBox, corrects the pan window, mirrors outside overlays, restores on second click', async () => {
    const page = await boot();
    const w = page.window;
    const d = w.document;
    const btn = d.getElementById('btn-flip')!;
    expect(btn.textContent).toBe('Flip Board');
    const flip = d.querySelector('#view-gerber #yflip') as SVGGraphicsElement;
    const svg = d.getElementById('board') as unknown as SVGSVGElement;
    const pz = d.getElementById('panzoom')!;
    const drcGroup = d.getElementById('drc')!;
    const baseT = flip.getAttribute('transform');
    const baseVb = svg.getAttribute('viewBox')!;
    const baseTz = pz.getAttribute('transform')!;
    expect(baseT).toBe('scale(1,-1)');

    btn.click(); // flip
    expect(flip.getAttribute('transform')).toBe('scale(-1,-1)');
    const flippedVb = svg.getAttribute('viewBox')!;
    const [bx, by, bw, bh] = baseVb.split(/\s+/).map(Number);
    const [fx, fy, fw, fh] = flippedVb.split(/\s+/).map(Number);
    expect(fw).toBe(bw);
    expect(fh).toBe(bh);
    expect(fy).toBe(by);
    expect(fx).toBeCloseTo(-(bx + bw), 6);
    expect(btn.classList.contains('armed')).toBe(true);
    // overlays outside the y-flip track the mirror (pure geometry)
    expect(drcGroup.getAttribute('transform')).toBe('scale(-1,1)');
    // the flipped converter at the fit viewport: the same screen point reads
    // x-negated, y unchanged (the mirror is x-only — the y-flip is present
    // in both states)
    const move = (x: number, y: number) =>
      d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
    move(5, 6);
    expect(d.getElementById('status')!.textContent).toContain('-5.000, 6.000');
    // the flip persists for the next session
    const saved = JSON.parse(w.localStorage.getItem('gerber-viewer:v1:demo board') || '{}');
    expect(saved.__flipped).toBe(true);

    btn.click(); // unflip — back to front, readout positive again
    move(5, 6);
    expect(d.getElementById('status')!.textContent).toContain('5.000, 6.000');

    // the pan window corrects: tx' = -tx keeps the same content region
    // visible — zoom at an off-center point, then flip/unflip must negate tx
    svg.dispatchEvent(
      new w.WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 20, clientY: 6, deltaY: -240 }),
    );
    const zoomedTz = pz.getAttribute('transform')!;
    btn.click(); // flip
    const flippedTz = pz.getAttribute('transform')!;
    const [tzF] = /translate\((-?[\d.]+) /.exec(zoomedTz)!.slice(1).map(Number);
    const [txF] = /translate\((-?[\d.]+) /.exec(flippedTz)!.slice(1).map(Number);
    expect(txF).toBeCloseTo(-tzF, 3);
    btn.click(); // unflip — flip∘flip = identity on the whole viewport
    expect(flip.getAttribute('transform')).toBe(baseT);
    expect(svg.getAttribute('viewBox')).toBe(baseVb);
    expect(pz.getAttribute('transform')).toBe(zoomedTz);
    expect(drcGroup.getAttribute('transform')).toBe('scale(1,1)');
    expect(btn.classList.contains('armed')).toBe(false);
    const saved2 = JSON.parse(w.localStorage.getItem('gerber-viewer:v1:demo board') || '{}');
    expect(saved2.__flipped).toBe(false);
  });
});

describe('stored routes never come back after a reload', () => {
  it('a legacy pending store is scrubbed and nothing restores', async () => {
    const html = buildViewerHtml(svg, [info, fabInfo], {
      title: 'demo board',
      pcbaSvg: '<svg/>',
      layoutComponents,
      layoutTexts,
      padLabels,
      rules,
    });
    const errors: string[] = [];
    const pendingKey = 'typecadPending:demo board:viewer.html';
    const ghost = {
      net: 'led_a',
      w: 0.3,
      power: null,
      impedance: null,
      pieces: [{ layer: 'F.Cu', w: 0.3, pts: [{ x: 400, y: -300 }, { x: 402, y: -302 }] }],
      vias: [{ x: 402, y: -302, size: 0.6, drill: 0.3 }],
    };
    const legit = {
      net: 'led_a',
      w: 0.3,
      power: null,
      impedance: null,
      pieces: [{ layer: 'F.Cu', w: 0.3, pts: [{ x: 5, y: -3 }, { x: 6, y: -4 }] }],
      vias: [],
    };
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://localhost/viewer.html',
      pretendToBeVisual: true,
      beforeParse(w) {
        w.console.error = (...a: unknown[]) => errors.push(a.join(' '));
        w.localStorage.setItem(pendingKey, JSON.stringify({ routes: [ghost, legit], deletes: [], partDeletes: [] }));
      },
    });
    const w = dom.window;
    const d = w.document;
    await new Promise((r) => setTimeout(r, 100));
    expect(errors).toEqual([]);
    // neither the ghost nor the legit route returns, and the store is gone
    expect(w.localStorage.getItem(pendingKey)).toBeNull();
    expect(d.querySelectorAll('path[data-route="1"]')).toHaveLength(0);
    expect((d.getElementById('status') as HTMLElement).textContent || '').not.toContain('restored');
  });
});




describe('deferred views load on first switch', () => {
  const bootLazy = () =>
    boot({
      pcbaSvg: undefined,
      blueprintSvg: undefined,
      schematicSvg: undefined,
      deferredViews: ['pcba', 'blueprint', 'schematic'],
    });

  it('the placeholders fill through the host bridge under a spinner that names the work', async () => {
    const page = await bootLazy();
    const w = page.window;
    const d = w.document;
    // the page shipped EMPTY placeholders — no renders anywhere in it
    const pcbaGroup = () => d.getElementById('view-pcba')!;
    expect(pcbaGroup().children.length).toBe(0);
    expect(d.querySelectorAll('#pcba-board, #bp-board, #sch-board').length).toBe(0);
    // the spinner exists and starts hidden
    const busy = d.getElementById('view-busy')!;
    expect(busy.style.display).toBe('none');

    // the host bridge: capture asks, answer on demand
    const asks: string[] = [];
    (w as unknown as Record<string, unknown>).typecadViewPart = function (part: string, cb: (e: Error | null, h?: string, o?: unknown) => void) {
      asks.push(part);
      setTimeout(() => {
        if (part === 'pcba') cb(null, '<g id="view-pcba" data-viewbox="0 0 20 10"><g id="pcba-board"><rect width="20" height="10"/></g></g>');
        else cb(new Error('nope'));
      }, 0);
    };

    // switch to pcba: the spinner shows naming the render, the view group
    // is still the empty placeholder while the part renders
    const sel = d.querySelector('select')! as HTMLSelectElement & { value: string };
    sel.value = 'pcba';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    expect(asks).toEqual(['pcba']);
    expect(busy.style.display).toBe('');
    expect(d.getElementById('view-busy-text')!.textContent).toContain('pcba view');
    expect(pcbaGroup().children.length).toBe(0); // nothing mounted yet

    await new Promise((r) => setTimeout(r, 30));
    // the fragment mounted: renamed ids, the busy overlay gone, the view
    // actually switched (pcba visible, gerber hidden)
    expect(pcbaGroup().children.length).toBeGreaterThan(0);
    expect(pcbaGroup().querySelector('#pcba-board')).not.toBeNull();
    expect(pcbaGroup().getAttribute('data-viewbox')).toBe('0 0 20 10');
    expect(busy.style.display).toBe('none');
    expect(pcbaGroup().style.display).toBe('');
    expect(d.getElementById('view-gerber')!.style.display).toBe('none');
    // the root viewBox unioned the part's box
    expect(d.getElementById('board')!.getAttribute('viewBox')).toContain('20');
    // a second switch asks nothing — the part is cached
    sel.value = 'gerber';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    sel.value = 'pcba';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    expect(asks).toEqual(['pcba']);
  });

  it('a failed part keeps the current view and says why', async () => {
    const page = await bootLazy();
    const w = page.window;
    const d = w.document;
    (w as unknown as Record<string, unknown>).typecadViewPart = function (_part: string, cb: (e: Error) => void) {
      setTimeout(() => cb(new Error('render died')), 0);
    };
    const sel = d.querySelector('select')! as HTMLSelectElement & { value: string };
    sel.value = 'blueprint';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
    // still on the gerber view, spinner gone, the failure named
    expect(d.getElementById('view-gerber')!.style.display).not.toBe('none');
    expect(d.getElementById('view-busy')!.style.display).toBe('none');
    expect(d.getElementById('status')!.textContent).toContain('could not load the blueprint view');
    expect(d.getElementById('status')!.textContent).toContain('render died');
  });
});

describe('B applies & rebuilds (the button, on a key)', () => {
  it('pressing b runs the same apply pipeline as the sidebar button', async () => {
    const page = await boot();
    const w = page.window;
    const d = w.document;
    // nothing pending: the button is gated off and b does nothing
    const captured: unknown[][] = [];
    (w as unknown as Record<string, unknown>).typecadLayoutApply = (...args: unknown[]) => {
      captured.push(args);
      (args[args.length - 1] as (e: string | null, f: boolean) => void)(null, false);
    };
    const btn = d.getElementById('layout-apply') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    page.key('b');
    expect(captured).toHaveLength(0);
    // a pending edit arms the button — b carries it exactly like a click
    const seg = d.querySelector("g[data-kind='copper'] line")!;
    const ex = parseFloat(seg.getAttribute('x1')!);
    const ey = parseFloat(seg.getAttribute('y1')!);
    d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: ex, clientY: -ey }));
    page.key('v');
    d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: ex, clientY: -ey }));
    page.pressBoard(ex, -ey);
    page.releaseBoard(ex, -ey);
    expect(btn.disabled).toBe(false);
    page.key('b');
    expect(captured).toHaveLength(1);
    const routes = captured[0]![5] as Array<{ net: string | null; vias: unknown[] }>;
    expect(routes.some((r) => r.vias && r.vias.length)).toBe(true);
  });
});

describe('unit readouts (the mil toggle is gone)', () => {
  it('no mil control exists and every position readout stays mm', async () => {
    const page = await boot();
    const w = page.window;
    const d = w.document;
    expect(d.getElementById('layout-mil')).toBeNull();
    // a committed layout-text drag writes a position readout — it must say
    // mm and NOT throw (the formatter once vanished with a neighboring
    // surgery and no readout survived to say so)
    page.pressText(); // selects
    page.pressText(); // a second press on the selected text arms the drag
    w.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 7, clientY: 7 }));
    w.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 7, clientY: 7 }));
    const st = d.getElementById('status')!.textContent;
    expect(st).toMatch(/\d+\.\d\d mm/);
    expect(st).not.toContain('mil');
  });
});

describe('live pour recompute on via delete', () => {
  it('the zone rebuilds whole: polygon paint, foreign holes, thermal reliefs', async () => {
    const page = await boot({
      layoutBoardZones: [{
        net: 'GND', layer: 'F.Cu', keepout: false,
        pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }],
        clearance: 0.3, thermalGap: 0.25, thermalBridgeWidth: 0.4,
      }],
      padLabels: [
        { ref: 'R1', pin: '1', net: 'GND', x: 2, y: -2, w: 1, h: 1, layers: ['F.Cu'] },
        { ref: 'R1', pin: '2', net: 'VCC', x: 5, y: -5, w: 1, h: 1, layers: ['F.Cu'] },
      ],
    });
    const w = page.window;
    const d = w.document;
    const cu = d.querySelector("g[data-kind='copper']");
    // the server's pour fragments (style attrs, gerber frame) + a PLOTTED
    // via flash inside the zone at gerber (4,4) on a foreign net
    const SVG = 'http://www.w3.org/2000/svg';
    const frag = d.createElementNS(SVG, 'path');
    frag.setAttribute('d', 'M 1 1 L 2 1 L 2 2 L 1 2 Z');
    frag.setAttribute('fill-rule', 'evenodd');
    frag.setAttribute('fill', '#123456');
    frag.setAttribute('opacity', '0.5');
    frag.setAttribute('data-net', 'GND');
    cu.appendChild(frag);
    const flash = d.createElementNS(SVG, 'use');
    flash.setAttribute('x', '4');
    flash.setAttribute('y', '4');
    flash.setAttribute('data-net', 'PROBE');
    flash.getBBox = () => ({ x: 3.7, y: 3.7, width: 0.6, height: 0.6 });
    cu.appendChild(flash);
    // select + delete the plotted via: hover it first (client y negates
    // into the gerber frame), then Tab until the via candidate comes up
    d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 4, clientY: -4 }));
    await new Promise((r) => setTimeout(r, 60));
    let viaSelected = false;
    for (let i = 0; i < 10 && !viaSelected; i++) {
      page.key('Tab');
      await new Promise((r) => setTimeout(r, 60));
      if (/^via \[/.test(d.getElementById('status')!.textContent)) viaSelected = true;
    }
    expect(viaSelected).toBe(true);
    page.key('Delete');
    await new Promise((r) => setTimeout(r, 120));
    // the fragments are GONE, replaced by ONE live fill carrying the zone
    // polygon in the pour's own paint, masked
    expect(frag.parentNode).toBeNull();
    const live = cu.querySelector('path[data-live-fill="1"]');
    expect(live).not.toBeNull();
    expect(live.getAttribute('d')).toContain('M 0.000 0.000 L 8.000 0.000');
    expect(live.getAttribute('fill')).toBe('#123456');
    expect(live.getAttribute('opacity')).toBe('0.5');
    expect(live.getAttribute('mask')).toMatch(/^url\(#zone-live-/);
    const maskId = live.getAttribute('mask')!.slice(5, -1);
    const mask = d.getElementById(maskId)!;
    // the mask REGION is explicit: the default percentage region resolves
    // against the board-mm viewBox in the y-flipped space and lands empty —
    // the pour then paints NOTHING in a real browser (the live "zone turned
    // black"; jsdom cannot render, so the attribute is the regression guard)
    expect(mask.getAttribute('maskUnits')).toBe('userSpaceOnUse');
    expect(+mask.getAttribute('x')!).toBeCloseTo(-3, 3);
    expect(+mask.getAttribute('y')!).toBeCloseTo(-3, 3);
    expect(+mask.getAttribute('width')!).toBeCloseTo(17, 3);
    expect(+mask.getAttribute('height')!).toBeCloseTo(15, 3);
    // cloned knockouts never carry the dimmer's opacity — channels are binary
    expect(mask.querySelector('[stroke="#000"][opacity]')).toBeNull();
    const blacks = [...mask.querySelectorAll('[fill="#000"]')];
    const whites = [...mask.querySelectorAll('[fill="#fff"]')];
    // white base + the thermal spokes (2 per same-net pad); black: the
    // deleted via is GONE from ink so its hole is not re-cut, but the VCC
    // pad rect and the fixture's led_a trace strokes are
    expect(whites.length).toBe(3);
    expect(blacks.length).toBeGreaterThan(0);
    expect(flash.parentNode).toBeNull();
  });
});

describe('the net-highlight dim never outlives its selection', () => {
  // the pour fragment: authored server paint the dimmer can sweep to 0.06 —
  // at 0.06 on the dark canvas the pour is invisible, which reads as "the
  // zone turned black" (reported live after a via delete)
  function seedFrag(d: Document, cu: Element) {
    const SVG = 'http://www.w3.org/2000/svg';
    const frag = d.createElementNS(SVG, 'path');
    frag.setAttribute('d', 'M 1 1 L 2 1 L 2 2 L 1 2 Z');
    frag.setAttribute('fill-rule', 'evenodd');
    frag.setAttribute('fill', '#123456');
    frag.setAttribute('opacity', '0.5');
    frag.setAttribute('data-net', 'GND');
    cu.appendChild(frag);
    return frag;
  }
  const zone = [{
    net: 'GND', layer: 'F.Cu', keepout: false,
    pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }],
  }];

  it('Tab cycling onto the zone clears the dim the via step set', async () => {
    const page = await boot({ layoutBoardZones: zone, padLabels: [] });
    const w = page.window;
    const d = w.document;
    const cu = d.querySelector("g[data-kind='copper']")!;
    const frag = seedFrag(d, cu);
    // a second fragment at the REAL board's pour opacity — the dim must
    // never take copper below its authored visibility (0.06 blacked the
    // pour out; the floor dims TO 0.35 but never above what was authored)
    const pour = seedFrag(d, cu);
    pour.setAttribute('opacity', '0.18');
    const SVG = 'http://www.w3.org/2000/svg';
    const flash = d.createElementNS(SVG, 'use');
    flash.setAttribute('x', '4');
    flash.setAttribute('y', '4');
    flash.setAttribute('data-net', 'PROBE');
    flash.getBBox = () => ({ x: 3.7, y: 3.7, width: 0.6, height: 0.6 });
    cu.appendChild(flash);
    d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 4, clientY: -4 }));
    await new Promise((r) => setTimeout(r, 60));
    page.key('Tab'); // the via first: PROBE lights, the board dims
    await new Promise((r) => setTimeout(r, 60));
    expect(/^(via|segment) \[/.test(d.getElementById('status')!.textContent)).toBe(true);
    expect(frag.getAttribute('opacity')).toBe('0.35'); // dimmed TO the floor
    expect(pour.getAttribute('opacity')).toBe('0.18'); // authored below the floor: untouched
    page.key('Tab'); // the zone: lights nothing — the via's dim must not survive
    await new Promise((r) => setTimeout(r, 60));
    expect(d.getElementById('status')!.textContent).toContain('Tab cycles the stack');
    expect(frag.getAttribute('opacity')).toBe('0.5');
    expect(cu.querySelectorAll('[opacity="0.35"]').length).toBe(0);
  });

  it('deleting the selected via clears the dim with it, and the live pour is net-attributed pour paint', async () => {    const page = await boot({ layoutBoardZones: zone, padLabels: [] });
    const w = page.window;
    const d = w.document;
    const cu = d.querySelector("g[data-kind='copper']")!;
    const frag = seedFrag(d, cu);
    const SVG = 'http://www.w3.org/2000/svg';
    const flash = d.createElementNS(SVG, 'use');
    flash.setAttribute('x', '4');
    flash.setAttribute('y', '4');
    flash.setAttribute('data-net', 'PROBE');
    flash.getBBox = () => ({ x: 3.7, y: 3.7, width: 0.6, height: 0.6 });
    cu.appendChild(flash);
    d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 4, clientY: -4 }));
    await new Promise((r) => setTimeout(r, 60));
    let viaSelected = false;
    for (let i = 0; i < 10 && !viaSelected; i++) {
      page.key('Tab');
      await new Promise((r) => setTimeout(r, 60));
      if (/^via \[/.test(d.getElementById('status')!.textContent)) viaSelected = true;
    }
    expect(viaSelected).toBe(true);
    expect(frag.getAttribute('opacity')).toBe('0.35'); // the via's net dimmed the board (to the floor)
    page.key('Delete');
    await new Promise((r) => setTimeout(r, 150));
    // the dim died with the selection — no floor-dimmed elements left
    expect(cu.querySelectorAll('[opacity="0.35"]').length).toBe(0);
    const live = cu.querySelector('path[data-live-fill="1"]');
    expect(live).not.toBeNull();
    // the rebuild carries its net (the dimmer's un-attributed sweep can never
    // blanket it) and the pour marker the obstacle scans skip on
    expect(live.getAttribute('data-net')).toBe('GND');
    expect(live.getAttribute('fill-rule')).toBe('nonzero');
    // painted with the pre-dim opacity, not the dim's 0.06
    expect(live.getAttribute('opacity')).toBe('0.5');
  });
});



describe('Enter probes the selected zone\'s source definition', () => {
  it('typecadSelectedZone reports the selected zone in board frame', async () => {
    const page = await boot({
      layoutBoardZones: [{
        net: 'GND', layer: 'F.Cu', keepout: false,
        pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }],
      }],
      padLabels: [],
    });
    const w = page.window;
    const d = w.document;
    const SVG = 'http://www.w3.org/2000/svg';
    const cu = d.querySelector("g[data-kind='copper']")!;
    const flash = d.createElementNS(SVG, 'use');
    flash.setAttribute('x', '4');
    flash.setAttribute('y', '4');
    flash.setAttribute('data-net', 'PROBE');
    flash.getBBox = () => ({ x: 3.7, y: 3.7, width: 0.6, height: 0.6 });
    cu.appendChild(flash);
    expect(typeof (w as unknown as { typecadSelectedZone: unknown }).typecadSelectedZone).toBe('function');
    expect((w as unknown as { typecadSelectedZone: () => unknown }).typecadSelectedZone()).toBeNull();
    // hover + Tab until the zone owns the selection (pad/seg/via precede it)
    d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 4, clientY: -4 }));
    await new Promise((r) => setTimeout(r, 60));
    let zoned = false;
    for (let i = 0; i < 10 && !zoned; i++) {
      page.key('Tab');
      await new Promise((r) => setTimeout(r, 60));
      if (/Tab cycles the stack/.test(d.getElementById('status')!.textContent)) zoned = true;
    }
    expect(zoned).toBe(true);
    const zone = (w as unknown as { typecadSelectedZone: () => unknown }).typecadSelectedZone() as {
      net: string; layer: string; pts: Array<{ x: number; y: number }>;
    };
    // board frame: the island's gerber y-up pts negated, ready to bbox-match
    // the zone({...}) literal's own points
    expect(zone.net).toBe('GND');
    expect(zone.layer).toBe('F.Cu');
    expect(zone.pts).toEqual([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: -6 }, { x: 0, y: -6 }]);
  });
});

describe('free text is Del-deletable', () => {
  it('Delete hides the selected board text and rides the apply as a statement deletion', async () => {
    const page = await boot();
    let capturedTexts: unknown[] | null = null;
    (page.window as unknown as Record<string, unknown>).typecadLayoutApply = (...args: unknown[]) => {
      capturedTexts = args[16] as unknown[];
      (args[args.length - 1] as (err: string | null, fast: boolean) => void)(null, false);
    };
    const textEl = page.window.document.querySelector("g[data-kind='fab'] path[data-text]")!;
    page.window.document.querySelector('#yflip g[data-kind="fab"]')!.removeAttribute('display');
    page.pressText();
    page.key('Delete');
    // the ink is gone now (hidden, reversible) and the apply button armed
    expect(textEl.style.display).toBe('none');
    expect(page.window.document.getElementById('layout-apply')!.disabled).toBe(false);
    page.window.document.getElementById('layout-apply')!.click();
    // the payload carries the AUTHORED identity the host matches the
    // .text({...}) literal by (value + anchor, board frame)
    expect(capturedTexts).toEqual([{ text0: 'hello silk', x0: 6.5, y0: 7.5 }]);
    // undo brings the strokes back and gates the apply off again
    page.key('z', { ctrlKey: true });
    expect(textEl.style.display).toBe('');
    expect(page.window.document.getElementById('layout-apply')!.disabled).toBe(true);
  });
});

describe('Tab cycles to a text under overlays', () => {
  it('a buried text joins the cycle and selects like a press', async () => {
    const page = await boot();
    const w = page.window;
    const d = w.document;
    // the fixture's first board text: rendered glyphs at gerber (6.5, -7.5)
    // (client y negates into the gerber frame); cover it with an overlay so
    // DOM picking cannot reach it — Tab is the only road in
    const SVG = 'http://www.w3.org/2000/svg';
    d.querySelector('#yflip g[data-kind="fab"]')!.removeAttribute('display');
    const cover = d.createElementNS(SVG, 'rect');
    cover.setAttribute('x', '4');
    cover.setAttribute('y', '-9');
    cover.setAttribute('width', '6');
    cover.setAttribute('height', '4');
    cover.setAttribute('fill', '#ffffff');
    d.getElementById('layout-overlay')!.appendChild(cover);
    d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 6.5, clientY: 7.5 }));
    await new Promise((r) => setTimeout(r, 60));
    let textPicked = false;
    for (let i = 0; i < 8 && !textPicked; i++) {
      page.key('Tab');
      await new Promise((r) => setTimeout(r, 60));
      if (/^text "/.test(d.getElementById('status')!.textContent)) textPicked = true;
    }
    expect(textPicked).toBe(true);
    expect(d.getElementById('status')!.textContent).toContain('hello silk');
    // the selection owns the same affordances a press grants: the E panel
    page.key('e');
    await new Promise((r) => setTimeout(r, 60));
    expect(page.panel().style.display).not.toBe('none');
  });
});

describe('a label whose strokes were claimed away still cycles', () => {
  it('reference and value share one anchor — the longer text swallows the strokes, the shorter still Tabs', async () => {
    const page = await boot({
      layoutComponents: [
        {
          reference: 'U9', value: 'TS3A24159DRC', footprint: 'R', variable: 'u9', side: 'front',
          at: { x: 20, y: 20, rotation: 0 }, dimensions: { width: 1, height: 0.5 }, padCount: 2,
          labels: [
            { kind: 'reference', text: 'U9', x: 20, y: 20, side: 'front', h: 1, w: 1, rot: 0 },
            { kind: 'value', text: 'TS3A24159DRC', x: 20, y: 20, side: 'front', h: 1, w: 1, rot: 0 },
          ],
        },
      ],
      layoutTexts: [],
    });
    const w = page.window;
    const d = w.document;
    // no plotted glyphs are seeded: with both labels sharing one anchor the
    // claim competition leaves whichever shorter without strokes, and the
    // ANCHOR DISC fallback is the only road to the reference
    d.querySelector('#yflip g[data-kind="fab"]')!.removeAttribute('display');
    d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 20, clientY: -20 }));
    await new Promise((r) => setTimeout(r, 60));
    // BOTH stacked labels cycle — the value first (glyph/anchor score),
    // then the reference at the same anchor
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      page.key('Tab');
      await new Promise((r) => setTimeout(r, 60));
      const st = d.getElementById('status')!.textContent;
      const m = /^text "([^"]+)"/.exec(st);
      if (m) seen.push(m[1]!);
    }
    expect(seen).toContain('TS3A24159DRC');
    expect(seen).toContain('U9');
  });
});

describe('hidden-layer texts never cycle', () => {
  it('a fab label leaves the Tab stack when the fab layer is off — and returns when it is back on', async () => {
    const page = await boot({
      layoutComponents: [
        {
          ref: 'U7', x: 20, y: 20, rot: 0, w: 1, h: 0.5, side: 'front' as const, nets: [],
          labels: [
            { kind: 'fab' as const, text: 'U7', x: 20, y: 20, side: 'front' as const, h: 1, w: 1, rot: 0, layerKind: 'fab' as const },
            { kind: 'reference' as const, text: 'REF9', x: 21, y: 22, side: 'front' as const, h: 1, w: 1, rot: 0, layerKind: 'silkscreen' as const },
          ],
        },
      ],
      layoutTexts: [],
    });
    const w = page.window;
    const d = w.document;
    const fabGroup = d.querySelector('#yflip g[data-kind="fab"][data-layer-name*="-F_"]');
    expect(fabGroup).not.toBeNull();
    fabGroup!.removeAttribute('display'); // the fixture renders fab hidden by default
    const hover = () => {
      d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 20, clientY: -20 }));
      return new Promise((r) => setTimeout(r, 60));
    };
    const cycleTexts = async () => {
      const seen: string[] = [];
      for (let i = 0; i < 6; i++) {
        page.key('Tab');
        await new Promise((r) => setTimeout(r, 60));
        const m = /^text "([^"]+)"/.exec(d.getElementById('status')!.textContent);
        if (m) seen.push(m[1]!);
      }
      return seen;
    };
    // fab layer ON: the label cycles (over the part, whose fields ride the
    // Tab cycle — and at its own anchor through the tight ink-less disc)
    await hover();
    expect(await cycleTexts()).toContain('U7');
    // fab layer OFF: the fab label is gone from the stack, but the
    // REFERENCE stays — it rides with the hovered part, its ink or no ink
    fabGroup!.setAttribute('display', 'none');
    await hover();
    const fabOff = await cycleTexts();
    expect(fabOff).not.toContain('U7');
    expect(fabOff).toContain('REF9');
    // back ON: it returns
    fabGroup!.removeAttribute('display');
    await hover();
    expect(await cycleTexts()).toContain('U7');
  });
});
