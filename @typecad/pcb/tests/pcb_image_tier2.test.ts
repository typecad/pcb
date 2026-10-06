import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { mergeCollinear, nestRings, simplifyRing, traceLoops, bridgeHoles, type RingPt } from '../src/image/contours.js';
import { Image } from '../src/pcb/pcb_image.js';
import { PCB, Package, Resistor } from '../src/index.js';
import { PcbInternalState } from '../src/pcb/pcb_state.js';

/** even-odd point-in-ring over an emitted gr_poly's points (ring may carry
 *  keyhole bridges — the fill rule handles them, so does this). */
function pointInPoly(poly: Array<{ x: number; y: number }>, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const grid3 = (cells: number[]): Uint8Array => new Uint8Array(cells);

describe('contour tracing', () => {
  it('traces a plus into one 12-corner loop', () => {
    const grid = grid3([0, 1, 0, 1, 1, 1, 0, 1, 0]);
    const loops = traceLoops(grid, 3, 3);
    expect(loops).toHaveLength(1);
    expect(loops[0]!).toHaveLength(12); // a plus has exactly 12 corners
  });

  it('traces a ring into an outer and a hole, nested correctly', () => {
    const grid = grid3([1, 1, 1, 1, 0, 1, 1, 1, 1]);
    const loops = traceLoops(grid, 3, 3);
    expect(loops).toHaveLength(2);
    const shapes = nestRings(loops);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.holes).toHaveLength(1);
  });

  it('bridges a donut into one ring whose hole stays a hole under even-odd', () => {
    const outer: RingPt[] = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 3 },
      { x: 0, y: 3 },
    ];
    const hole: RingPt[] = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
    ];
    const ring = bridgeHoles(outer, [hole]);
    // outer + hole + the two doubled bridge vertices
    expect(ring).toHaveLength(10);
    expect(pointInPoly(ring, 1.5, 1.5)).toBe(false); // the hole
    expect(pointInPoly(ring, 0.5, 0.5)).toBe(true); // the metal
  });

  it('simplifies staircases within tolerance and keeps exact rings at 0', () => {
    const staircase: RingPt[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 3, y: 4 },
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(simplifyRing(staircase, 0)).toHaveLength(10);
    const smooth = simplifyRing(staircase, 0.6);
    expect(smooth.length).toBeLessThan(6);
    // every original vertex stays within tolerance of the simplified ring
    for (const p of staircase) {
      const minDist = Math.min(
        ...smooth.map((q, i) => {
          const r = smooth[(i + 1) % smooth.length]!;
          const dx = r.x - q.x;
          const dy = r.y - q.y;
          const len = Math.hypot(dx, dy);
          return len === 0 ? Math.hypot(p.x - q.x, p.y - q.y) : Math.abs(dy * p.x - dx * p.y + r.x * q.y - r.y * q.x) / len;
        }),
      );
      expect(minDist).toBeLessThanOrEqual(0.6 + 1e-9);
    }
  });

  it('merges collinear runs across the ring seam', () => {
    const l = mergeCollinear([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
    ]);
    expect(l).toHaveLength(4);
  });

  it('is deterministic', () => {
    const grid = grid3([1, 1, 0, 1, 0, 0, 1, 1, 1]);
    expect(JSON.stringify(traceLoops(grid, 3, 3))).toBe(JSON.stringify(traceLoops(grid, 3, 3)));
  });
});

// --- PNG through the contour path ------------------------------------------

const encodePng = (pixels: number[][], w: number, h: number): Buffer => {
  const crcT = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcT[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (t: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length);
    head.write(t, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(t, 'ascii'), body])));
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const flat = pixels.flat(); // w*h RGBA pixels
  const raw: number[] = [];
  for (let y = 0; y < h; y++) raw.push(0, ...flat.slice(y * w * 4, (y + 1) * w * 4));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const RED = [255, 0, 0, 255];
const CLEAR = [0, 0, 0, 0];

describe('Image contour mode (raster)', () => {
  let tmp: string;
  const art = (name: string, pixels: number[][], w: number, h: number): string => {
    const file = path.join(tmp, name);
    fs.writeFileSync(file, encodePng(pixels, w, h));
    return file;
  };

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-contours-'));
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const newState = () => new PcbInternalState({} as never);

  it('emits ONE ring for a plus where rect mode emitted three rects', () => {
    // plus: rows RR., RRR, .RR over 3 columns (transparent elsewhere)
    const file = art('plus.png', [
      ...[RED, RED, CLEAR],
      ...[RED, RED, RED],
      ...[CLEAR, RED, RED],
    ], 3, 3);
    const rects = new Image({ file, at: { x: 0, y: 0 }, size: 3, resolution: 1, mode: 'rects' });
    const contours = new Image({ file, at: { x: 0, y: 0 }, size: 3, resolution: 1 });
    const sr = newState();
    const sc = newState();
    rects.render(sr);
    contours.render(sc);
    const copperR = sr.grPolys.filter((p) => p.layer === 'F.Cu');
    const copperC = sc.grPolys.filter((p) => p.layer === 'F.Cu');
    expect(copperR).toHaveLength(3); // rect merge: row runs
    expect(copperC).toHaveLength(1); // contour: one ring
    expect(copperC[0]!.points.length).toBe(8); // this plus has 8 corners
    expect(pointInPoly(copperC[0]!.points, 0.5, 0.5)).toBe(true);
    expect(pointInPoly(copperC[0]!.points, 2.5, 0.5)).toBe(false);
  });

  it('keeps letter counters as holes (bridged ring, even-odd)', () => {
    // a 5x5 "O": red ring, clear center
    const O = [
      RED, RED, RED, RED, RED,
      RED, CLEAR, CLEAR, CLEAR, RED,
      RED, CLEAR, CLEAR, CLEAR, RED,
      RED, CLEAR, CLEAR, CLEAR, RED,
      RED, RED, RED, RED, RED,
    ];
    const file = art('oh.png', O, 5, 5);
    const img = new Image({ file, at: { x: 10, y: 10 }, size: 5, resolution: 1 });
    const s = newState();
    img.render(s);
    const copper = s.grPolys.filter((p) => p.layer === 'F.Cu');
    expect(copper).toHaveLength(1);
    const pts = copper[0]!.points;
    // the placed O spans 7.5..12.5; probe bar centers away from the
    // keyhole slit and off the boundary edges
    expect(pointInPoly(pts, 10, 10)).toBe(false); // the counter
    expect(pointInPoly(pts, 8, 10)).toBe(true); // left bar
    expect(pointInPoly(pts, 10, 8)).toBe(true); // top bar
  });

  it('smooths staircases by default (half-resolution tolerance)', () => {
    // diagonal staircase: row-major pixels, 2 cells wide
    const pixels: number[][] = [];
    for (let y = 0; y < 6; y++) {
      const row: number[] = [];
      for (let x = 0; x < 6; x++) row.push(...(x === y || x === y + 1 ? RED : CLEAR));
      pixels.push(row);
    }
    const file = art('stair.png', pixels, 6, 6);
    const img = new Image({ file, at: { x: 0, y: 0 }, size: 6, resolution: 1 });
    const s = newState();
    img.render(s);
    const copper = s.grPolys.filter((p) => p.layer === 'F.Cu');
    expect(copper).toHaveLength(1);
    // half-resolution smoothing straightens some steps; smooth: 0 keeps all
    const raw = new Image({ file, at: { x: 0, y: 0 }, size: 6, resolution: 1, smooth: 0 });
    const sr = newState();
    raw.render(sr);
    const rawCopper = sr.grPolys.filter((p) => p.layer === 'F.Cu');
    expect(copper[0]!.points.length).toBeLessThan(rawCopper[0]!.points.length);
  });

  it('renders contour-mode artwork deterministically', () => {
    const file = art('det.png', [
      RED, CLEAR, RED,
      RED, RED, RED,
      CLEAR, RED, RED,
    ], 3, 3);
    const a = new Image({ file, at: { x: 1, y: 2 }, size: 3, resolution: 1 });
    const b = new Image({ file, at: { x: 1, y: 2 }, size: 3, resolution: 1 });
    const sa = newState();
    const sb = newState();
    a.render(sa);
    b.render(sb);
    expect(JSON.stringify(sa.grPolys)).toBe(JSON.stringify(sb.grPolys));
  });
});

// --- SVG input --------------------------------------------------------------

describe('Image SVG input', () => {
  let tmp: string;
  const svg = (name: string, body: string): string => {
    const file = path.join(tmp, name);
    fs.writeFileSync(file, body);
    return file;
  };

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-svg-'));
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const newState = () => new PcbInternalState({} as never);

  it('maps a filled rect through viewBox and size onto copper', () => {
    const file = svg(
      'rect.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="2" y="3" width="4" height="2" fill="#FF0000"/></svg>',
    );
    const img = new Image({ file, at: { x: 5, y: 5 }, size: 10 });
    expect(img.sourceUnits()).toEqual({ width: 10, height: 10 });
    const s = newState();
    img.render(s);
    const copper = s.grPolys.filter((p) => p.layer === 'F.Cu');
    expect(copper).toHaveLength(1);
    expect(new Set(copper[0]!.points.map((p) => `${p.x},${p.y}`))).toEqual(
      new Set(['2,3', '6,3', '6,5', '2,5']),
    );
  });

  it('treats implicit fills as the artwork (copper) and maps white to silk', () => {
    const file = svg(
      'fills.svg',
      '<svg viewBox="0 0 10 10"><rect x="0" y="0" width="2" height="2"/><rect x="4" y="0" width="2" height="2" fill="white"/><rect x="8" y="0" width="1" height="1" fill="#123456"/></svg>',
    );
    const img = new Image({ file, at: { x: 5, y: 5 }, size: 10 });
    const s = newState();
    img.render(s);
    expect(s.grPolys.some((p) => p.layer === 'F.Cu' && pointInPoly(p.points, 1, 1))).toBe(true);
    expect(s.grPolys.some((p) => p.layer === 'F.SilkS' && pointInPoly(p.points, 5, 1))).toBe(true);
    // off-palette explicit fill: background — nothing paints there (the
    // copper implicit rect DOES carry its own mask opening elsewhere)
    expect(s.grPolys.every((p) => !pointInPoly(p.points, 8.5, 0.5))).toBe(true);
  });

  it('bridges SVG subpath holes (a donut path) with even-odd nesting', () => {
    const file = svg(
      'donut.svg',
      '<svg viewBox="0 0 20 20"><path d="M2 2h16v16h-16Z M8 8h4v4h-4Z" fill="red"/></svg>',
    );
    const img = new Image({ file, at: { x: 10, y: 10 }, size: 20 });
    const s = newState();
    img.render(s);
    const copper = s.grPolys.filter((p) => p.layer === 'F.Cu');
    expect(copper).toHaveLength(1);
    expect(pointInPoly(copper[0]!.points, 10, 10)).toBe(false); // the hole
    expect(pointInPoly(copper[0]!.points, 4, 4)).toBe(true);
  });

  it('applies transforms (rotate about a point)', () => {
    const file = svg(
      'rot.svg',
      '<svg viewBox="0 0 10 10"><rect x="4" y="0" width="2" height="4" fill="#FF0000" transform="rotate(90 5 5)"/></svg>',
    );
    const img = new Image({ file, at: { x: 5, y: 5 }, size: 10 });
    const s = newState();
    img.render(s);
    const copper = s.grPolys.filter((p) => p.layer === 'F.Cu');
    expect(copper).toHaveLength(1);
    // the vertical rect (x 4..6, y 0..4) rotates to horizontal (x 6..10, y 4..6)
    for (const p of ['6,4', '10,4', '10,6', '6,6']) {
      expect(copper[0]!.points.map((q) => `${q.x},${q.y}`)).toContain(p);
    }
  });

  it('scales by resolution when size is omitted and curves flatten', () => {
    const file = svg(
      'circle.svg',
      '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#FF0000"/><path d="M1 1 Q 2 2 3 1 T 5 1" fill="none"/></svg>',
    );
    const img = new Image({ file, at: { x: 0, y: 0 } }); // 20 units * 0.1mm = 2mm
    const s = newState();
    img.render(s);
    const copper = s.grPolys.filter((p) => p.layer === 'F.Cu');
    expect(copper).toHaveLength(1);
    const xs = copper[0]!.points.map((p) => p.x);
    const ys = copper[0]!.points.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1.6, 1); // 16 units * 0.1mm
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1.6, 1);
    expect(copper[0]!.points.length).toBeGreaterThan(12); // the circle flattened
  });

  it('inherits fill from ancestor groups (SVG semantics)', () => {
    const file = svg(
      'group-fill.svg',
      '<svg viewBox="0 0 10 10"><g fill="white"><rect x="0" y="0" width="2" height="2"/><g><rect x="4" y="0" width="2" height="2"/></g></g>' +
        '<g><rect x="8" y="0" width="1" height="1"/></g></svg>',
    );
    const img = new Image({ file, at: { x: 5, y: 5 }, size: 10 });
    const s = newState();
    img.render(s);
    // both nested rects inherit white -> silkscreen, none implicit -> copper
    expect(s.grPolys.some((p) => p.layer === 'F.SilkS' && pointInPoly(p.points, 1, 1))).toBe(true);
    expect(s.grPolys.some((p) => p.layer === 'F.SilkS' && pointInPoly(p.points, 5, 1))).toBe(true);
    expect(s.grPolys.some((p) => p.layer === 'F.Cu' && pointInPoly(p.points, 8.5, 0.5))).toBe(true);
    // an explicit fill="none" on the child overrides the inherited fill
    const noneFile = svg(
      'group-none.svg',
      '<svg viewBox="0 0 10 10"><g fill="white"><rect x="0" y="0" width="2" height="2" fill="none"/></g></svg>',
    );
    const s2 = newState();
    new Image({ file: noneFile, at: { x: 5, y: 5 }, size: 10 }).render(s2);
    expect(s2.grPolys.length).toBe(0);
  });

  it('rounds rounded-rect corners on the correct side (no interior bulge)', () => {
    const file = svg(
      'rrect.svg',
      '<svg viewBox="0 0 10 10"><rect x="0" y="0" width="6" height="4" rx="1.5" ry="1.5" fill="#FF0000"/></svg>',
    );
    const img = new Image({ file, at: { x: 5, y: 5 }, size: 10 });
    const s = newState();
    img.render(s);
    const copper = s.grPolys.filter((p) => p.layer === 'F.Cu');
    expect(copper).toHaveLength(1);
    const pts = copper[0]!.points;
    // bounding box matches the rect (arcs reach the full extents)
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    // size 10 over a 10-unit viewBox maps 1 mm/unit, origin at (0,0): the
    // rect spans 0..6 x 0..4 with corners rounded at r=1.5
    expect(Math.min(...xs)).toBeCloseTo(0, 2);
    expect(Math.max(...xs)).toBeCloseTo(6, 2);
    expect(Math.min(...ys)).toBeCloseTo(0, 2);
    expect(Math.max(...ys)).toBeCloseTo(4, 2);
    // corners cut by the rounding: outside; edges' midpoints and center: inside
    expect(pointInPoly(pts, 0.3, 0.3)).toBe(false); // TL corner region
    expect(pointInPoly(pts, 5.7, 3.7)).toBe(false); // BR corner region
    expect(pointInPoly(pts, 3, 0.2)).toBe(true); // top edge midpoint
    expect(pointInPoly(pts, 0.2, 2)).toBe(true); // left edge midpoint
    expect(pointInPoly(pts, 3, 2)).toBe(true); // center
    expect(pts.length).toBeGreaterThan(12); // arcs flattened
  });

  it('honors smooth=0 (every SVG vertex kept) and skips fill:none', () => {
    const file = svg(
      'poly.svg',
      '<svg viewBox="0 0 10 10"><polygon points="0,0 1.5,0 3,0 3,3 0,3" fill="#FF0000" stroke="blue"/></svg>',
    );
    const img = new Image({ file, at: { x: 0, y: 0 }, size: 10, smooth: 0 });
    const s = newState();
    img.render(s);
    const copper = s.grPolys.filter((p) => p.layer === 'F.Cu');
    expect(copper).toHaveLength(1);
    // the collinear 1.5 vertex merges; everything else stays
    expect(copper[0]!.points).toHaveLength(4);
    // stroke-only color never paints
    expect(s.grPolys.filter((p) => p.layer.startsWith('B'))).toHaveLength(0);
  });
});

// --- Package support --------------------------------------------------------

import { Image as BoardImage } from '../src/index.js';

describe('Image inside a Package', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-pkgimg-'));
    fs.writeFileSync(
      path.join(tmp, 'art.png'),
      encodePng(
        [
          RED, RED, RED, RED,
          RED, CLEAR, CLEAR, RED,
          RED, CLEAR, CLEAR, RED,
          RED, RED, RED, RED,
        ],
        4,
        4,
      ),
    );
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('auto-collects a property image, shifts it by the package offset, and renders it', () => {
    class Badge extends Package {
      art: BoardImage;
      resistor: Resistor;
      build(): void {
        // authored in PACKAGE-LOCAL coordinates, like every component .pcb
        this.art = new BoardImage({
          file: path.join(tmp, 'art.png'),
          at: { x: 2, y: 2 },
          size: 4,
          resolution: 1,
          mode: 'rects',
        });
        this.resistor = new Resistor({ value: '1 kOhm' });
        this.resistor.pcb = { x: 10, y: 2 };
      }
    }

    const typecad = new PCB('pkg_art');
    typecad.outline(0, 0, 40, 30, 2);
    const badge = new Badge({ pcb: typecad, x: 10, y: 20 });
    // the package pattern: its collected components (artwork included) go
    // to create() — the offset is already baked into every position
    typecad.create(badge.components);

    const art = badge.components.find((c): c is BoardImage => c instanceof BoardImage)!;
    // the offset shifted the image's at: (2,2) + (10,20)
    expect(art.at).toEqual({ x: 12, y: 22 });

    const boardFile = path.join(process.env.TYPECAD_BUILD_DIR ?? 'build', 'pkg_art.kicad_pcb');
    const board = fs.readFileSync(boardFile, 'utf8');
    expect(board).toContain('(gr_poly');
    // the artwork landed at the package-shifted position: art spans 10..14 × 20..24
    expect(board).toContain('(xy 10 20)');
    expect(board).toContain('(xy 14 24)');
    // and the part staged through the same package still built
    expect(board).toContain('"R1"');
  });
});

// --- custom stack inks (the cube) -------------------------------------------

describe('Image custom stack inks', () => {
  let tmp: string;
  const RED = [255, 0, 0, 255];
  const WHITE = [255, 255, 255, 255];
  const BLUE = [0, 0, 255, 255];
  const PURPLE = [128, 0, 128, 255];

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-stacks-'));
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const newState = () => new PcbInternalState({} as never);
  const art = (name: string, pixels: number[], w: number, h: number): string => {
    const file = path.join(tmp, name);
    fs.writeFileSync(file, encodePng(pixels, w, h));
    return file;
  };

  it('hidden copper: a custom { copper } stack emits F.Cu with no mask opening', () => {
    const file = art(
      'hidden.png',
      // 2x2: one purple (custom hidden copper) cell, rest transparent
      [...PURPLE, ...[0, 0, 0, 0], ...[0, 0, 0, 0], ...[0, 0, 0, 0]],
      2,
      2,
    );
    const img = new Image({
      file,
      at: [10, 10],
      size: 2,
      resolution: 1,
      mode: 'rects',
      inks: { copper: null, silk: null, mask: null, custom: [{ color: '#800080', stack: { copper: true } }] },
    });
    const s = newState();
    img.render(s);
    expect(s.grPolys.filter((p) => p.layer === 'F.Cu')).toHaveLength(1);
    expect(s.grPolys.filter((p) => p.layer === 'F.Mask')).toHaveLength(0); // invisible by design
    expect(s.grPolys.filter((p) => p.layer === 'F.SilkS')).toHaveLength(0);
  });

  it('rejects silk over a mask opening without the escape hatch, allows it with one', () => {
    const file = art('both.png', [...PURPLE, ...[0, 0, 0, 0]], 2, 1);
    const base = {
      file,
      at: [10, 10] as [number, number],
      size: 2,
      resolution: 1,
      inks: { custom: [{ color: '#800080', stack: { silk: true, mask: true } }] },
    };
    expect(() => new Image(base).resolvedInks()).toThrow(/silkscreen over openings/);
    const allowed = new Image({ ...base, allowExposedSilk: true });
    const s = newState();
    allowed.render(s);
    expect(s.grPolys.some((p) => p.layer === 'F.SilkS')).toBe(true);
    expect(s.grPolys.some((p) => p.layer === 'F.Mask')).toBe(true);
  });

  it('rejects an empty stack and requires a hex color', () => {
    const file = art('none.png', [...PURPLE, ...[0, 0, 0, 0]], 2, 1);
    const img = new Image({
      file,
      at: [0, 0],
      inks: { custom: [{ color: '#800080', stack: {} }] },
    });
    expect(() => img.resolvedInks()).toThrow(/sets no layers/);
    expect(() =>
      new Image({ file, at: [0, 0], inks: { custom: [{ color: 'purple', stack: { silk: true } }] } }).resolvedInks(),
    ).toThrow(/not a hex color/);
  });

  it('maskPaint closes openings (two-tone mask) and re-hides copper under them', () => {
    // 4x1: blue (opening) across all cells, purple (mask paint) over the
    // right half — the opening survives only on the left
    const file = art(
      'tone.png',
      [...BLUE, ...BLUE, ...PURPLE, ...PURPLE],
      4,
      1,
    );
    const img = new Image({
      file,
      at: [10, 10],
      size: 4,
      resolution: 1,
      mode: 'rects',
      maskExpansion: 0,
      inks: {
        custom: [
          { color: '#0000FF', stack: { mask: true } },
          { color: '#800080', stack: { maskPaint: true } },
        ],
      },
    });
    const s = newState();
    img.render(s);
    const masks = s.grPolys.filter((p) => p.layer === 'F.Mask');
    expect(masks).toHaveLength(1); // the subtraction merged to one opening
    // the opening covers the blue left half (x 8..10) and NOT the painted
    // right half — probe both halves through the emitted ring
    expect(pointInPoly(masks[0]!.points, 8.5, 10)).toBe(true);
    expect(pointInPoly(masks[0]!.points, 11.5, 10)).toBe(false);
  });

  it('maskPaint over a copper opening keeps the copper but closes the opening', () => {
    // 4x1: red cells 0-1 (exposed copper, opening grown past the metal by
    // the default maskExpansion), purple cells 2-3 painting mask back over
    // the grown part — the paint must OVERLAP the opening to subtract
    const file = art('rehides.png', [...RED, ...RED, ...PURPLE, ...PURPLE], 4, 1);
    const img = new Image({
      file,
      at: [10, 10],
      size: 4,
      resolution: 1,
      mode: 'rects',
      inks: { custom: [{ color: '#800080', stack: { maskPaint: true } }] },
    });
    const s = newState();
    img.render(s);
    expect(s.grPolys.filter((p) => p.layer === 'F.Cu')).toHaveLength(1); // the metal stays whole
    const masks = s.grPolys.filter((p) => p.layer === 'F.Mask');
    expect(masks).toHaveLength(1); // the surviving opening, cut back by the paint
    expect(pointInPoly(masks[0]!.points, 9, 10)).toBe(true); // over the copper
    expect(pointInPoly(masks[0]!.points, 10.5, 10)).toBe(false); // painted back shut
  });

  it('silk-on-mask preset still works beside custom inks, deterministically', () => {
    const file = art(
      'mix.png',
      [...WHITE, ...PURPLE, ...[0, 0, 0, 0], ...PURPLE],
      4,
      1,
    );
    const build = () => {
      const img = new Image({
        file,
        at: [5, 5],
        size: 4,
        resolution: 1,
        mode: 'rects',
        inks: { custom: [{ color: '#800080', stack: { copper: true, mask: true } }] },
      });
      const s = newState();
      img.render(s);
      return JSON.stringify(s.grPolys);
    };
    expect(build()).toBe(build());
    // custom exposed-copper stack mirrors the preset: Cu + Mask
    const s2 = newState();
    new Image({
      file,
      at: [5, 5],
      size: 4,
      resolution: 1,
      mode: 'rects',
      inks: { custom: [{ color: '#800080', stack: { copper: true, mask: true } }] },
    }).render(s2);
    expect(s2.grPolys.some((p) => p.layer === 'F.Cu')).toBe(true);
    expect(s2.grPolys.some((p) => p.layer === 'F.Mask')).toBe(true);
    expect(s2.grPolys.some((p) => p.layer === 'F.SilkS')).toBe(true);
  });
});

describe('Image maskPaint in contour mode (clipper hole re-bridging)', () => {
  let tmp: string;
  const BLUE = [0, 0, 255, 255];
  const PURPLE = [128, 0, 128, 255];

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-tone2-'));
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('a paint square inside a blue opening stays shut in contours mode too', () => {
    // 20x20: blue field, purple 8x8 square in the middle — contour mode is
    // the default and traces the blue field with a HOLE; the clipper
    // difference used to decompose that hole into its own opening
    const pixels: number[] = [];
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const inPurple = x >= 6 && x < 14 && y >= 6 && y < 14;
        pixels.push(...(inPurple ? PURPLE : BLUE));
      }
    }
    const file = path.join(tmp, 'field.png');
    fs.writeFileSync(file, encodePng(pixels, 20, 20));
    const img = new Image({
      file,
      at: [10, 10],
      size: 20,
      resolution: 1,
      inks: {
        custom: [
          { color: '#0000FF', stack: { mask: true } },
          { color: '#800080', stack: { maskPaint: true } },
        ],
      },
    });
    const s = new PcbInternalState({} as never);
    img.render(s);
    const masks = s.grPolys.filter((p) => p.layer === 'F.Mask');
    // ONE bridged ring: the opening with the painted square as its hole
    expect(masks).toHaveLength(1);
    expect(masks[0]!.points.length).toBeGreaterThan(8); // keyhole bridge present
    expect(pointInPoly(masks[0]!.points, 10, 10)).toBe(false); // the painted square stays shut
    expect(pointInPoly(masks[0]!.points, 2, 10)).toBe(true); // the surrounding opening
    expect(pointInPoly(masks[0]!.points, 18, 18)).toBe(true);
  });
});
