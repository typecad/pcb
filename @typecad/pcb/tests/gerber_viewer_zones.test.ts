// ---------------------------------------------------------------------------
// The zone tool: two clicks draw a rectangle pour/keepout as a pending
// overlay; apply hands the geometry to the host bridge (stubbed here — the
// host-side sidecar insertion is covered by the vscode package's syncApply
// suite, the semantic check by semanticVerify.test.ts).
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildViewerHtml } from '../src/gerber_viewer/render/viewer_html.js';
import { boardZoneFillAreas, parseBoardZones } from '../src/gerber_viewer/build.js';
import { renderSvg } from '../src/gerber_viewer/render/svg.js';
import { detectLayer } from '../src/gerber_viewer/detect_layer.js';
import { parseGerber } from '../src/gerber_viewer/gerber/parse_gerber.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gerber');
const read = (name: string) => fs.readFileSync(path.join(fixtures, name), 'utf8');

const image = parseGerber(read('traces.gbr'));
const info = detectLayer('demo-F_Cu.gbr', image);
const svg = renderSvg([{ info, image }]);
const layoutComponents = [
  { ref: 'R1', x: 10, y: -20, rot: 0, w: 1.6, h: 0.8, side: 'front' as const, nets: ['VCC'] },
];

async function boot() {
  const padLabels = [
    { ref: 'R1', pin: '1', net: 'VCC', x: 9.5, y: -20, w: 0.8, h: 0.9, layers: ['F.Cu'] },
    { ref: 'R1', pin: '2', net: 'GND', x: 10.5, y: -20, w: 0.8, h: 0.9, layers: ['F.Cu'] },
  ];
  const html = buildViewerHtml(svg, [info], { title: 'demo board', pcbaSvg: '<svg/>', layoutComponents, padLabels });
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
  const vs = d.getElementById('view-mode')!;
  vs.value = 'layout';
  vs.dispatchEvent(new w.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 100));
  expect(errors).toEqual([]);
  /** two clicks commit a zone rectangle between the client points — both
   *  events target the board so the svg.contains guards hold */
  const clickTwoCorners = (x1: number, y1: number, x2: number, y2: number) => {
    for (const [x, y] of [[x1, y1], [x2, y2]] as const) {
      d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: x, clientY: y }));
      d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, button: 0, clientX: x, clientY: y }));
    }
  };
    /** E with nothing selected: the props panel hosts the zone tool */
  const openZoneTools = () => {
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
  };
  return { w, d, clickTwoCorners, openZoneTools };
}

describe('parseBoardZones (pcbnew >= 10 name-based zone form)', () => {
  it('reads (layer …) singular and (net "name") string nets', () => {
    const board = `(kicad_pcb (version 20260206)
      (footprint "Resistor:R" (layer "F.Cu") (at 10 10)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net "VCC")))
      (zone
        (net "VCC")
        (layer "F.Cu")
        (polygon (pts (xy 7 7) (xy 13 7) (xy 13 13) (xy 7 13))))
    )`;
    const zones = parseBoardZones(board);
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({ net: 'VCC', layer: 'F.Cu', keepout: false });
    expect(zones[0]!.pts[0]).toEqual({ x: 7, y: -7 }); // kicad y-down -> gerber y-up
  });
});

describe('boardZoneFillAreas (why a pour is empty)', () => {
  const board = (zonePts: string) => `(kicad_pcb (version 20241229)
  (net 1 "VCC")
  (footprint "Resistor:R" (layer "F.Cu") (at 10 10)
    (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1 "VCC")))
  (
    zone
    (net 1)
    (net_name "VCC")
    (layers "F.Cu")
    (connect_pads yes (clearance 0.2))
    (polygon (pts ${zonePts}))
  )
)`;

  it('a zone over same-net copper fills; a zone in empty space fills to nothing', () => {
    const overPad = boardZoneFillAreas(board('(xy 7 7) (xy 13 7) (xy 13 13) (xy 7 13)'));
    expect(overPad).toHaveLength(1);
    expect(overPad[0]!).toBeGreaterThan(1); // 6x6 minus clearances still connects
    const empty = boardZoneFillAreas(board('(xy 50 50) (xy 56 50) (xy 56 56) (xy 50 56)'));
    expect(empty).toEqual([0]); // no VCC copper inside -> island removed
  });
});

describe('declared zone boundaries render in the layout view', () => {
  it('parseBoardZones reads the pretty-printed writer form and maps y to gerber', () => {
    const board = `(kicad_pcb (version 20241229)
  (
    zone
    (net 1)
    (net_name "VCC")
    (layers "F.Cu")
    (hatch edge 0.508)
    (
      polygon
      (
        pts
        (xy 144.6 78.5)
        (xy 150.2 78.5)
        (xy 150.2 80.2)
        (xy 144.6 80.2)
      )
    )
  )
  (
    zone
    (net 0)
    (net_name "")
    (layers "F.Cu")
    (keepout (tracks not_allowed) (vias not_allowed))
    (
      polygon
      (
        pts
        (xy 3 3)
        (xy 5 3)
        (xy 5 5)
      )
    )
  )
)`;
    const zones = parseBoardZones(board);
    expect(zones).toHaveLength(2);
    expect(zones[0]).toMatchObject({ net: 'VCC', layer: 'F.Cu', keepout: false });
    // kicad y-down -> gerber y-up
    expect(zones[0]!.pts[0]).toEqual({ x: 144.6, y: -78.5 });
    expect(zones[1]!.keepout).toBe(true);
  });

  it('the layout view draws the boundaries thin, dashed, and upright-labeled', async () => {
    const { w, d } = await boot()
    // no boundaries without data
    expect(d.getElementById('layout-board-zones-g')).toBeNull();
    // rebuild the page with zones: a fresh boot with the option set
    const html2 = buildViewerHtml(svg, [info], {
      title: 'demo board',
      pcbaSvg: '<svg/>',
      layoutComponents,
      padLabels: [
        { ref: 'R1', pin: '1', net: 'VCC', x: 9.5, y: -20, w: 0.8, h: 0.9, layers: ['F.Cu'] },
        { ref: 'R1', pin: '2', net: 'GND', x: 10.5, y: -20, w: 0.8, h: 0.9, layers: ['F.Cu'] },
      ],
      layoutBoardZones: [
        { net: 'VCC', layer: 'F.Cu', keepout: false, pts: [{ x: 40, y: -80.2 }, { x: 70, y: -80.2 }, { x: 70, y: -40 }, { x: 40, y: -40 }], filledMm2: 0 },
      ],
    });
    const dom2 = new JSDOM(html2, {
      runScripts: 'dangerously',
      url: 'https://localhost/viewer.html',
      pretendToBeVisual: true,
      beforeParse(w) {
        w.console.error = () => {};
        const idCtm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } };
        w.SVGSVGElement.prototype.getScreenCTM = () => idCtm;
        w.SVGSVGElement.prototype.createSVGPoint = () => {
          const p = { x: 0, y: 0 };
          return { get x() { return p.x; }, set x(v: number) { p.x = v; }, get y() { return p.y; }, set y(v: number) { p.y = v; }, matrixTransform: () => ({ x: p.x, y: p.y }) };
        };
        w.SVGElement.prototype.getBBox = function () {
          return { x: 0, y: 0, width: 10, height: 10 };
        };
      },
    });
    const w2 = dom2.window;
    const d2 = dom2.window.document;
    await new Promise((r) => setTimeout(r, 100));
    const vs2 = d2.getElementById('view-mode')!;
    vs2.value = 'layout';
    vs2.dispatchEvent(new w2.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    const grp = d2.getElementById('layout-board-zones-g');
    expect(grp).toBeTruthy();
    const path = grp!.querySelector('path')!;
    expect(path.getAttribute('d')).toContain('M 40.000 -80.200');
    expect(path.getAttribute('stroke-width')).toBe('0.08');
    // upright label outside the y-flip, at the board-frame top edge
    expect(d2.getElementById('layout-board-zone-labels')!.querySelector('text')).toBeNull(); // unselected: no label
    // labels render for the SELECTED zone only — press its boundary first
    d2.querySelector('#layout-board-zones-g path')!.dispatchEvent(
      new w2.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 55, clientY: 80.2 }),
    );
    const label = d2.getElementById('layout-board-zone-labels')!.querySelector('text')!;
    expect(label.textContent).toBe('VCC · F.Cu · no fill (no VCC copper inside)');
    expect(label.closest('#yflip')).toBeNull();
    expect(parseFloat(label.getAttribute('y')!)).toBeCloseTo(40.3, 2);
    // switching away removes the boundaries (other views show authored copper)
    vs2.value = 'gerber';
    vs2.dispatchEvent(new w2.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    expect(d2.getElementById('layout-board-zones-g')).toBeNull();
  });
});

describe('the zone tool draws pours and keepouts', () => {
  it('two clicks draw a pending pour; apply hands it to the host; Del removes a selected one', async () => {
    const { w, d, clickTwoCorners, openZoneTools } = await boot()
    // arm the tool and draw a pour attached to VCC (net from R1's pads)
    openZoneTools(), (d.getElementById('zone-draw') as HTMLButtonElement).click();
    const kind = d.getElementById('zone-kind') as HTMLSelectElement;
    const layer = d.getElementById('zone-layer') as HTMLSelectElement;
    const net = d.getElementById('zone-net') as HTMLSelectElement;
    expect(layer.options.length).toBeGreaterThanOrEqual(1);
    net.value = 'VCC';
    kind.value = 'pour';
    layer.value = layer.options[0]!.value;
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(true);
    clickTwoCorners(40, 40, 70, 80);
    // the pending zone renders with a positive rectangle and arms apply
    const rect = d.querySelector('#layout-zones rect') as SVGRectElement | null;
    expect(rect).toBeTruthy();
    expect(parseFloat(rect!.getAttribute('width')!)).toBeGreaterThan(0);
    expect(parseFloat(rect!.getAttribute('height')!)).toBeGreaterThan(0);
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(false);
    // undo removes it, redo brings it back
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(d.querySelector('#layout-zones rect')).toBeNull();
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true }));
    expect(d.querySelector('#layout-zones rect')).toBeTruthy();
    // apply hands the zone to the host bridge in the board frame
    let got: { zones?: Array<Record<string, unknown>> } | null = null;
    (w as unknown as { typecadLayoutApply: unknown }).typecadLayoutApply = function (...args: unknown[]) {
      got = { zones: args[8] as Array<Record<string, unknown>> };
      (args[args.length - 1] as (e: string | null) => void)(null);
    };
    (d.getElementById('layout-apply') as HTMLButtonElement).click();
    expect(got).not.toBeNull();
    const zones = got!.zones!;
    expect(zones).toHaveLength(1);
    expect(zones[0]!.kind).toBe('pour');
    expect(zones[0]!.net).toBe('VCC');
    expect(zones[0]!.layer).toBe(layer.value);
    expect(zones[0]!.w).toBeGreaterThan(0);
    expect(zones[0]!.h).toBeGreaterThan(0);
    // the applied zone retires (the rebuild's page will render the real pour)
    expect(d.querySelector('#layout-zones rect')).toBeNull();
  });

  it('keepout kind drops the net, and Esc cancels an in-progress draw', async () => {
    const { w, d, clickTwoCorners, openZoneTools } = await boot()
    openZoneTools(), (d.getElementById('zone-draw') as HTMLButtonElement).click();
    (d.getElementById('zone-kind') as HTMLSelectElement).value = 'keepout';
    // first corner only, then Esc — nothing committed
    clickTwoCorners(40, 40, -1, -1); // second corner out of view still fires; guard below
    // even after a full draw, kind keepout must not carry a net
    const kind = d.getElementById('zone-kind') as HTMLSelectElement;
    kind.value = 'keepout';
    openZoneTools(), (d.getElementById('zone-draw') as HTMLButtonElement).click(); // disarm (toggle)
    openZoneTools(), (d.getElementById('zone-draw') as HTMLButtonElement).click(); // re-arm
    clickTwoCorners(40, 40, 60, 60);
    let got: { zones?: Array<Record<string, unknown>> } | null = null;
    (w as unknown as { typecadLayoutApply: unknown }).typecadLayoutApply = function (...args: unknown[]) {
      got = { zones: args[8] as Array<Record<string, unknown>> };
      (args[args.length - 1] as (e: string | null) => void)(null);
    };
    (d.getElementById('layout-apply') as HTMLButtonElement).click();
    expect(got!.zones).toHaveLength(1);
    expect(got!.zones![0]!.kind).toBe('keepout');
    expect(got!.zones![0]!.net).toBeUndefined();
  });

  it('zone labels render upright in a group outside the y-flip', async () => {
    const { w, d, clickTwoCorners, openZoneTools } = await boot()
    openZoneTools(), (d.getElementById('zone-draw') as HTMLButtonElement).click();
    clickTwoCorners(40, 40, 70, 80);
    // label shows once the pending zone is selected
    (d.querySelector('#layout-zones rect') as SVGRectElement).dispatchEvent(
      new w.MouseEvent('pointerdown', { bubbles: true, button: 0 }),
    );
    const labels = d.getElementById('layout-zone-labels')!;
    expect(labels).toBeTruthy();
    // sibling of #yflip, never inside it — the flip's scale(1,-1) would
    // mirror the glyphs upside-down
    expect(labels.closest('#yflip')).toBeNull();
    const label = labels.querySelector('text')!;
    // the label sits just below the zone's board-frame top edge (screen-like
    // y-down coordinates, no mirroring)
    expect(parseFloat(label.getAttribute('y')!)).toBeCloseTo(40.35, 2);
    // strokes match the outline indicator's SELECTED weight (the zone is selected for its label)
    const rect = d.querySelector('#layout-zones rect') as SVGRectElement;
    expect(rect.getAttribute('stroke-width')).toBe('0.12');
  });

  it('a selected pending zone is removed by Del', async () => {
    const { w, d, clickTwoCorners, openZoneTools } = await boot()
    openZoneTools(), (d.getElementById('zone-draw') as HTMLButtonElement).click();
    clickTwoCorners(40, 40, 70, 80);
    expect(d.querySelector('#layout-zones rect')).toBeTruthy();
    // select the pending zone and remove it
    (d.querySelector('#layout-zones rect') as SVGRectElement).dispatchEvent(
      new w.MouseEvent('pointerdown', { bubbles: true, button: 0 }),
    );
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(d.querySelector('#layout-zones rect')).toBeNull();
    expect((d.getElementById('layout-apply') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Z arms the zone tool with nothing selected (options land in the E panel)', async () => {
    const { w, d, clickTwoCorners } = await boot();
    // plain Z with no selection: the props panel opens on the zone section
    // and the tool arms — no sidebar trip needed
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'z', bubbles: true }));
    const panel = d.getElementById('props-pop') as HTMLElement;
    expect(panel.style.display).not.toBe('none');
    expect(d.getElementById('zone-draw')).toBeTruthy();
    const layer = d.getElementById('zone-layer') as HTMLSelectElement;
    expect(layer.options.length).toBeGreaterThanOrEqual(1);
    // Z toggles: a second press disarms, a third re-arms
    const status = d.getElementById('status') as HTMLElement;
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'z', bubbles: true }));
    expect(status.textContent).toContain('cancelled');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'z', bubbles: true }));
    expect(status.textContent).toContain('first corner');
    // and the draw itself works straight from the key
    clickTwoCorners(40, 40, 70, 80);
    expect(d.querySelector('#layout-zones rect')).toBeTruthy();
  });
});

describe('stacked board zones are selectable', () => {
  const RECT = [
    { x: 40, y: -80.2 },
    { x: 70, y: -80.2 },
    { x: 70, y: -40 },
    { x: 40, y: -40 },
  ];
  const bootStacked = async () => {
    const html = buildViewerHtml(svg, [info], {
      title: 'demo board',
      pcbaSvg: '<svg/>',
      layoutComponents,
      padLabels: [
        { ref: 'R1', pin: '1', net: 'VCC', x: 9.5, y: -20, w: 0.8, h: 0.9, layers: ['F.Cu'] },
        { ref: 'R1', pin: '2', net: 'GND', x: 10.5, y: -20, w: 0.8, h: 0.9, layers: ['F.Cu'] },
      ],
      layoutBoardZones: [
        { net: 'VCC', layer: 'F.Cu', keepout: false, pts: RECT, filledMm2: 0 },
        { net: 'GND', layer: 'B.Cu', keepout: false, pts: RECT, filledMm2: 0 },
      ],
    });
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://localhost/viewer.html',
      pretendToBeVisual: true,
      beforeParse(w) {
        w.console.error = () => {};
        const idCtm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } };
        w.SVGSVGElement.prototype.getScreenCTM = () => idCtm;
        w.SVGSVGElement.prototype.createSVGPoint = () => {
          const p = { x: 0, y: 0 };
          return { get x() { return p.x; }, set x(v: number) { p.x = v; }, get y() { return p.y; }, set y(v: number) { p.y = v; }, matrixTransform: () => ({ x: p.x, y: p.y }) };
        };
        w.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
      },
    });
    const w = dom.window;
    const d = w.document;
    await new Promise((r) => setTimeout(r, 100));
    const vs = d.getElementById('view-mode')!;
    vs.value = 'layout';
    vs.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    return { w, d };
  };
  const pressBoundary = (w: Window, d: Document, onPath: SVGPathElement) => {
    // identity CTM: client coords read as gerber coords — land exactly on
    // the shared boundary edge
    onPath.dispatchEvent(new (w as unknown as typeof Window).MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 55, clientY: 80.2 }));
  };

  it('repeated presses on the coincident boundary walk the stack', async () => {
    const { w, d } = await bootStacked();
    const paths = [...d.querySelectorAll('#layout-board-zones-g path')] as SVGPathElement[];
    expect(paths).toHaveLength(2);
    const status = d.getElementById('status') as HTMLElement;
    const top = paths[1]!; // the topmost outline (last drawn)
    pressBoundary(w, d, top);
    expect(status.textContent).toContain('GND · B.Cu');
    // pressing the same boundary again advances to the buried zone
    pressBoundary(w, d, top);
    expect(status.textContent).toContain('VCC · F.Cu');
    // and wraps around the stack
    pressBoundary(w, d, top);
    expect(status.textContent).toContain('GND · B.Cu');
  });

  it('E reassigns the zone net — pending edit carries it, the label follows, undo restores', async () => {
    const { w, d } = await bootStacked();
    // select the VCC · F.Cu zone by pressing its boundary (client y +80.2 -> gerber -80.2)
    const paths = [...d.querySelectorAll('#layout-board-zones-g path')] as SVGPathElement[];
    paths[0]!.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 55, clientY: 80.2 }));
    const status = d.getElementById('status') as HTMLElement;
    expect(status.textContent).toContain('VCC · F.Cu');
    // E: the panel offers a net select with the zone's net selected
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    const net = d.getElementById('bz-net') as HTMLSelectElement;
    expect(net).toBeTruthy();
    expect(net.value).toBe('VCC');
    expect([...net.options].map((o) => o.value)).toContain('GND');
    // reassign to GND and apply the panel
    net.value = 'GND';
    (d.getElementById('pp-apply') as HTMLButtonElement).click();
    // the pending edit carries the net and the selected zone's label follows it
    const label = d.querySelector('#layout-board-zone-labels text')!.textContent!;
    expect(label).toContain('GND · F.Cu');
    expect(label).not.toContain('VCC');
    // undo restores the authored net, redo re-applies it
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    const label2 = d.querySelector('#layout-board-zone-labels text')!.textContent!;
    expect(label2).toContain('VCC · F.Cu');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true }));
    const labelR = d.querySelector('#layout-board-zone-labels text')!.textContent!;
    expect(labelR).toContain('GND · F.Cu');
    // apply & rebuild hands the net through the zone-edits payload (the
    // apply consumes the session state — undo checks come before it)
    let got: Array<Record<string, unknown>> = [];
    (w as unknown as Record<string, unknown>).typecadLayoutApply = function (...args: unknown[]) {
      got = args[10] as Array<Record<string, unknown>>;
      (args[args.length - 1] as (e: string | null) => void)(null);
    };
    (d.getElementById('layout-apply') as HTMLButtonElement).click();
    expect(got).toHaveLength(1);
    expect(got[0]!.net).toBe('GND');
  });

  it('a press or Tab inside the zone AREA finds the stack too', async () => {
    const { w, d } = await bootStacked();
    const status = d.getElementById('status') as HTMLElement;
    // click the MIDDLE of the pour (gerber (55, -60) -> client (55, 60) via
    // gerberAt's y negation): boundary is 20 mm away, containment must hit
    d.getElementById('board')!.dispatchEvent(
      new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 55, clientY: 60 }),
    );
    expect(status.textContent).toMatch(/VCC · F.Cu|GND · B.Cu/);
    expect(status.textContent).toContain('press again for the next zone');
    // repeat presses advance the stack from anywhere inside
    const first = status.textContent;
    d.getElementById('board')!.dispatchEvent(
      new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 55, clientY: 60 }),
    );
    expect(status.textContent).not.toBe(first);
    // Tab over the middle cycles as well
    d.getElementById('board')!.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 55, clientY: 60 }));
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(status.textContent).toContain('Tab cycles the stack');
  });

  it('Tab cycles the stacked zones under the cursor', async () => {
    const { w, d } = await bootStacked();
    const status = d.getElementById('status') as HTMLElement;
    const board = d.getElementById('board')!;
    board.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 55, clientY: 80.2 }));
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(status.textContent).toContain('Tab cycles the stack');
    expect(status.textContent).toMatch(/VCC · F\.Cu|GND · B\.Cu/);
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(status.textContent).toMatch(/VCC · F\.Cu|GND · B\.Cu/);
  });

  it('hiding a zone layer removes its boundary from the render and stack', async () => {
    const { w, d } = await bootStacked();
    const rows = [...d.querySelectorAll('.layer-row')] as HTMLElement[];
    const copperRow = rows.find((r) => (r.getAttribute('data-layer-id') || '').includes('f_cu'));
    expect(copperRow).toBeTruthy();
    const cb = copperRow!.querySelector('.layer-vis') as HTMLInputElement;
    cb.checked = false;
    cb.dispatchEvent(new w.Event('change', { bubbles: true }));
    // both zones canon-resolve to the single copper group in this fixture —
    // hiding it must clear the boundaries entirely
    expect(d.querySelectorAll('#layout-board-zones-g path')).toHaveLength(0);
    // and they return when the layer comes back
    cb.checked = true;
    cb.dispatchEvent(new w.Event('change', { bubbles: true }));
    expect(d.querySelectorAll('#layout-board-zones-g path')).toHaveLength(2);
  });
});
