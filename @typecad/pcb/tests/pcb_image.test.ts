import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodePng } from '../src/image/png_decode.js';
import { parseHexColor, classifyCells, mergeRects, DEFAULT_INKS } from '../src/image/image_inks.js';
import { Image } from '../src/pcb/pcb_image.js';
import { PcbInternalState } from '../src/pcb/pcb_state.js';

// ---------------------------------------------------------------------------
// In-test PNG encoder: builds real PNG files (with a CRC32, real zlib IDAT,
// and selectable per-row filters) so the decoder is exercised end to end
// without a fixture binary.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), body])), 0);
  return Buffer.concat([head, body, crc]);
}

interface EncodeOptions {
  width: number;
  height: number;
  /** 'rgba8' | 'rgb8' | 'gray8' | 'palette8' | 'rgba16' | 'gray1' */
  format?: string;
  /** per-row PNG filter applied on the encode side (default: all None) */
  filters?: number[];
  interlace?: number;
  /** palette entries for 'palette8' */
  palette?: number[][];
  /** per-index alpha for 'palette8' (tRNS) */
  paletteAlpha?: number[];
}

function encodePng(pixels: Uint8Array, opts: EncodeOptions): Buffer {
  const format = opts.format ?? 'rgba8';
  const channels = format === 'rgb8' ? 3 : format === 'gray8' || format === 'gray1' || format === 'palette8' ? 1 : 4;
  const depth = format === 'rgba16' ? 16 : format === 'gray1' ? 1 : 8;
  const bytesPerSample = depth === 16 ? 2 : 1;
  const rowBytes = Math.ceil((opts.width * channels * depth) / 8);

  // PNG filters reference the ORIGINAL prior-row bytes, so materialize the
  // unfiltered bytes first and filter from those, not from `raw`
  const orig = new Uint8Array(rowBytes * opts.height);
  for (let y = 0; y < opts.height; y++) {
    for (let i = 0; i < rowBytes; i++) {
      if (format === 'gray1') {
        const bit = i * 8;
        let packed = 0;
        for (let b = 0; b < 8 && bit + b < opts.width; b++) {
          packed |= (pixels[y * opts.width + bit + b]! ? 1 : 0) << (7 - b);
        }
        orig[y * rowBytes + i] = packed;
      } else {
        const src = (y * rowBytes + i) * bytesPerSample;
        orig[y * rowBytes + i] = bytesPerSample === 2 ? pixels[src]! : pixels[y * rowBytes + i]!;
      }
    }
  }

  const raw: number[] = [];
  for (let y = 0; y < opts.height; y++) {
    const filter = opts.filters?.[y] ?? 0;
    raw.push(filter);
    const stride = channels * bytesPerSample;
    for (let i = 0; i < rowBytes; i++) {
      let value = orig[y * rowBytes + i]!;
      // encode-side inversion of the simple filters (Sub/Up) the tests use
      if (filter === 1) value = (value - (i >= stride ? orig[y * rowBytes + i - stride]! : 0)) & 0xff;
      else if (filter === 2) value = (value - (y > 0 ? orig[(y - 1) * rowBytes + i]! : 0)) & 0xff;
      raw.push(value & 0xff);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(opts.width, 0);
  ihdr.writeUInt32BE(opts.height, 4);
  ihdr[8] = depth;
  const colorTypeCode: Record<string, number> = { rgba8: 6, rgb8: 2, gray8: 0, palette8: 3, rgba16: 6, gray1: 0 };
  ihdr[9] = colorTypeCode[format];
  ihdr[12] = opts.interlace ?? 0;

  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
  ];
  if (format === 'palette8') {
    parts.push(chunk('PLTE', Buffer.from((opts.palette ?? []).flat())));
    if (opts.paletteAlpha) parts.push(chunk('tRNS', Buffer.from(opts.paletteAlpha)));
  }
  parts.push(chunk('IDAT', deflateSync(Buffer.from(raw))));
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

const RED = [255, 0, 0, 255];
const WHITE = [255, 255, 255, 255];
const BLUE = [0, 0, 255, 255];
const CLEAR = [0, 0, 0, 0];

describe('PNG decoder', () => {
  it('decodes RGBA8 with no filtering', () => {
    const png = encodePng(new Uint8Array([...RED, ...WHITE, ...BLUE, ...CLEAR]), { width: 2, height: 2 });
    const img = decodePng(png);
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect([...img.rgba]).toEqual([...RED, ...WHITE, ...BLUE, ...CLEAR]);
  });

  it('undoes Sub and Up row filters', () => {
    const pixels = new Uint8Array([200, 10, 40, 255, 90, 90, 90, 255, 1, 2, 3, 255, 250, 251, 252, 255]);
    const plain = decodePng(encodePng(pixels, { width: 2, height: 2 }));
    const filtered = decodePng(encodePng(pixels, { width: 2, height: 2, filters: [1, 2] }));
    expect([...filtered.rgba]).toEqual([...plain.rgba]);
  });

  it('decodes RGB8, replicating the missing alpha', () => {
    const png = encodePng(new Uint8Array([10, 20, 30, 200, 100, 5]), { width: 2, height: 1, format: 'rgb8' });
    const img = decodePng(png);
    expect([...img.rgba]).toEqual([10, 20, 30, 255, 200, 100, 5, 255]);
  });

  it('decodes gray8 and 1-bit gray', () => {
    const gray = decodePng(encodePng(new Uint8Array([0, 255]), { width: 2, height: 1, format: 'gray8' }));
    expect([...gray.rgba]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);

    const bits = decodePng(encodePng(new Uint8Array([1, 0]), { width: 2, height: 1, format: 'gray1' }));
    // depth-1 pixel value 1 scales to full white; MSB-first packing
    expect([...bits.rgba]).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
  });

  it('decodes palette images with tRNS alpha', () => {
    const png = encodePng(new Uint8Array([0, 1, 2, 1]), {
      width: 4,
      height: 1,
      format: 'palette8',
      palette: [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
      ],
      paletteAlpha: [255, 128, 0],
    });
    const img = decodePng(png);
    // third entry's tRNS alpha is 0 — fully transparent, not opaque
    expect([...img.rgba]).toEqual([
      255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 0, 255, 0, 128,
    ]);
  });

  it('decodes 16-bit RGBA by taking the high byte', () => {
    const png = encodePng(new Uint8Array([0x12, 0x34, 0xff, 0xff, 0x00, 0x00, 0xab, 0xcd]), {
      width: 1,
      height: 1,
      format: 'rgba16',
    });
    expect([...decodePng(png).rgba]).toEqual([0x12, 0xff, 0x00, 0xab]);
  });

  it('rejects non-PNG data, truncation, interlacing, and corrupt CRCs', () => {
    expect(() => decodePng(Buffer.from('GIF89a'))).toThrow(/bad signature/i);

    const png = encodePng(new Uint8Array(16), { width: 2, height: 2 });
    expect(() => decodePng(png.subarray(0, png.length - 6))).toThrow(/truncated|IEND/i);

    const interlaced = encodePng(new Uint8Array(16), { width: 2, height: 2, interlace: 1 });
    expect(() => decodePng(interlaced)).toThrow(/interlac/i);

    const corrupt = Buffer.from(png);
    corrupt[20] ^= 0xff; // a byte inside the IHDR body — its CRC no longer matches
    expect(() => decodePng(corrupt)).toThrow(/crc/i);
  });
});

describe('ink classification', () => {
  it('parses hex colors and rejects junk', () => {
    expect(parseHexColor('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseHexColor('0f0')).toEqual({ r: 0, g: 255, b: 0 });
    expect(() => parseHexColor('red')).toThrow(/hex color/i);
  });

  const tiny = { width: 2, height: 2, rgba: new Uint8Array([...RED, ...WHITE, ...BLUE, ...CLEAR]) };
  const inks = [
    { key: 'copper', color: parseHexColor(DEFAULT_INKS.copper) },
    { key: 'silk', color: parseHexColor(DEFAULT_INKS.silk) },
    { key: 'mask', color: parseHexColor(DEFAULT_INKS.mask) },
  ];

  it('matches palette colors and treats transparent/background as unset', () => {
    const grids = classifyCells(tiny, inks, 2, 2, 100);
    expect([...grids.get('copper')!]).toEqual([1, 0, 0, 0]);
    expect([...grids.get('silk')!]).toEqual([0, 1, 0, 0]);
    expect([...grids.get('mask')!]).toEqual([0, 0, 1, 0]);
  });

  it('matches near-miss colors within tolerance but not beyond', () => {
    const nearWhite = { width: 1, height: 2, rgba: new Uint8Array([250, 250, 250, 255, 150, 150, 150, 255]) };
    const grids = classifyCells(nearWhite, [inks[1]!], 1, 2, 100);
    expect([...grids.get('silk')!]).toEqual([1, 0]); // #FAFAFA in, mid-gray out
  });

  it('samples the cell center when the grid differs from the image', () => {
    // 4-wide image, 2-wide grid: each cell samples its middle column
    const strip = {
      width: 4,
      height: 1,
      rgba: new Uint8Array([...RED, ...RED, ...WHITE, ...WHITE]),
    };
    const grids = classifyCells(strip, inks, 2, 1, 100);
    expect([...grids.get('copper')!]).toEqual([1, 0]);
    expect([...grids.get('silk')!]).toEqual([0, 1]);
  });
});

describe('greedy rect merging', () => {
  it('merges a plus shape into three rectangles', () => {
    // 3x3 plus: center column + center row
    const grid = new Uint8Array([0, 1, 0, 1, 1, 1, 0, 1, 0]);
    const rects = mergeRects(grid, 3, 3);
    expect(rects).toHaveLength(3);
    expect(rects).toContainEqual({ x: 1, y: 0, w: 1, h: 3 });
    expect(rects).toContainEqual({ x: 0, y: 1, w: 1, h: 1 });
    expect(rects).toContainEqual({ x: 2, y: 1, w: 1, h: 1 });
  });

  it('collapses a solid block into one rectangle', () => {
    const grid = new Uint8Array(9).fill(1);
    expect(mergeRects(grid, 3, 3)).toEqual([{ x: 0, y: 0, w: 3, h: 3 }]);
  });

  it('keeps holes as holes (a ring never fills its center)', () => {
    const grid = new Uint8Array([1, 1, 1, 1, 0, 1, 1, 1, 1]);
    const rects = mergeRects(grid, 3, 3);
    const covered = new Uint8Array(9);
    for (const r of rects) {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) covered[y * 3 + x] = 1;
    }
    expect(covered[4]).toBe(0); // center stays unpainted
    expect(covered.reduce((a, b) => a + b!, 0)).toBe(8); // everything else painted
  });
});

// ---------------------------------------------------------------------------
// Image class
// ---------------------------------------------------------------------------

describe('Image class', () => {
  let tmp: string;
  const artFile = () => path.join(tmp, 'art.png');

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-image-'));
    // 4x4: top row silk, left column copper, bottom-right mask cell
    const pixels: number[][] = [
      WHITE, WHITE, WHITE, WHITE,
      RED, CLEAR, CLEAR, CLEAR,
      RED, CLEAR, BLUE, CLEAR,
      RED, CLEAR, CLEAR, CLEAR,
    ];
    fs.writeFileSync(artFile(), encodePng(new Uint8Array(pixels.flat()), { width: 4, height: 4 }));
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const newState = () => new PcbInternalState({} as never);

  it('validates its options in the constructor', () => {
    expect(() => new Image({ file: '', at: { x: 0, y: 0 } })).toThrow(/file/);
    expect(() => new Image({ file: 'x.png', at: { x: NaN, y: 0 } })).toThrow(/at/);
    expect(() => new Image({ file: 'x.png', at: { x: 0, y: 0 }, size: -1 })).toThrow(/size/);
    expect(() => new Image({ file: 'x.png', at: { x: 0, y: 0 }, side: 'left' as never })).toThrow(/side/);
    expect(() => new Image({ file: 'x.png', at: { x: 0, y: 0 }, resolution: 0 })).toThrow(/resolution/);
    expect(() => new Image({ file: 'x.png', at: { x: 0, y: 0 }, maskExpansion: -0.1 })).toThrow(/maskExpansion/);
    expect(() => new Image({ file: 'x.png', at: { x: 0, y: 0 }, smooth: -1 })).toThrow(/smooth/);
    expect(() => new Image({ file: 'x.png', at: { x: 0, y: 0 }, mode: 'blobs' as never })).toThrow(/mode/);
  });

  it('applies ink overrides and rejects an all-null palette', () => {
    const img = new Image({ file: artFile(), at: { x: 0, y: 0 }, inks: { copper: null, silk: '#123456' } });
    expect(img.resolvedInks().map((i) => i.key)).toEqual(['silk', 'mask']);
    expect(img.resolvedInks()[0]!.color).toEqual({ r: 0x12, g: 0x34, b: 0x56 });
    const empty = new Image({ file: artFile(), at: { x: 0, y: 0 }, inks: { copper: null, silk: null, mask: null } });
    expect(() => empty.resolvedInks()).toThrow(/every ink disabled/);
  });

  it('fails with a clear error on a missing file at render time', () => {
    const img = new Image({ file: path.join(tmp, 'nope.png'), at: { x: 0, y: 0 } });
    expect(() => img.render(newState())).toThrow(/could not be read/);
  });

  it('emits filled polys on the right front layers with copper mask openings', () => {
    const img = new Image({ file: artFile(), at: { x: 10, y: 20 }, size: 4, resolution: 1, mode: 'rects' }); // 4mm, 1mm cells
    const state = newState();
    img.render(state);

    const byLayer = (layer: string) => state.grPolys.filter((p) => p.layer === layer);
    expect(byLayer('F.SilkS')).toHaveLength(1); // top row → one merged rect
    expect(byLayer('F.Cu')).toHaveLength(1); // left column → one merged rect
    expect(byLayer('F.Mask')).toHaveLength(2); // mask ink cell + copper's opening

    for (const poly of state.grPolys) {
      expect(poly.fill).toBe(true);
      expect(poly.strokeWidth).toBe(0);
      expect(poly.points).toHaveLength(4);
    }

    // copper rect: left column spans art rows 1-3 of a 4x4 art at size 4
    // → x 8..9, y 19..22
    const copper = byLayer('F.Cu')[0]!;
    expect(copper.points.map((p) => `${p.x},${p.y}`)).toEqual(['8,19', '9,19', '9,22', '8,22']);

    // silk rect: top row → x 8..12, y 18..19
    const silk = byLayer('F.SilkS')[0]!;
    expect(silk.points.map((p) => `${p.x},${p.y}`)).toEqual(['8,18', '12,18', '12,19', '8,19']);

    // copper's mask opening is grown by the default 0.05mm on every side
    const openings = byLayer('F.Mask').map((p) => p.points.map((q) => `${q.x},${q.y}`).join(' '));
    expect(openings).toContain('7.95,18.95 9.05,18.95 9.05,22.05 7.95,22.05');
    // the mask-ink cell is placed unexpanded
    expect(openings).toContain('10,20 11,20 11,21 10,21');
  });

  it('mirrors artwork and uses B.* layers on the back side', () => {
    const img = new Image({ file: artFile(), at: { x: 10, y: 20 }, size: 4, resolution: 1, side: 'back', mode: 'rects' });
    const state = newState();
    img.render(state);

    expect(state.grPolys.every((p) => p.layer.startsWith('B.'))).toBe(true);
    // the copper column sat at board x 8..9 from the front; mirrored around
    // the image center (x=10) it lands at 11..12
    const copper = state.grPolys.find((p) => p.layer === 'B.Cu')!;
    // mirroring flips the winding — compare the corners as a set
    expect(new Set(copper.points.map((p) => `${p.x},${p.y}`))).toEqual(
      new Set(['11,19', '12,19', '12,22', '11,22']),
    );
  });

  it('accepts the proposal API: at as [x, y] and size as an aspect-preserving bounding box', () => {
    // at: [x, y] tuple places identically to { x, y }
    const a = new Image({ file: artFile(), at: [10, 20], size: 4, resolution: 1, mode: 'rects' });
    const b = new Image({ file: artFile(), at: { x: 10, y: 20 }, size: 4, resolution: 1, mode: 'rects' });
    expect(a.at).toEqual({ x: 10, y: 20 });
    const sa = newState();
    const sb = newState();
    a.render(sa);
    b.render(sb);
    expect(JSON.stringify(sa.grPolys)).toBe(JSON.stringify(sb.grPolys));

    // size: [w, h] FITS the artwork inside the box, aspect preserved: an
    // all-copper square source in a [4, 2] box places at 2x2, centered on at
    const squareFile = path.join(tmp, 'square.png');
    fs.writeFileSync(
      squareFile,
      encodePng(new Uint8Array(new Array(16).fill(null).flatMap(() => RED)), { width: 4, height: 4 }),
    );
    const fit = new Image({ file: squareFile, at: [10, 20], size: [4, 2], resolution: 1, mode: 'rects' });
    const sf = newState();
    fit.render(sf);
    expect(sf.grPolys.length).toBeGreaterThan(0);
    // measure the copper ink itself — the mask opening is grown by design
    const copperPoly = sf.grPolys.filter((p) => p.layer === 'F.Cu');
    const xs = copperPoly.flatMap((p) => p.points.map((q) => q.x));
    const ys = copperPoly.flatMap((p) => p.points.map((q) => q.y));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2, 6); // fitted width (box aspect won)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2, 6); // height = width: square stays square
    expect(Math.min(...xs)).toBeCloseTo(9, 6); // centered on x=10
    expect(Math.min(...ys)).toBeCloseTo(19, 6); // centered on y=20

    // malformed tuples still throw
    expect(() => new Image({ file: artFile(), at: [10] as never })).toThrow(/at/);
    expect(() => new Image({ file: artFile(), at: { x: 0, y: 0 }, size: [4, -2] })).toThrow(/size/);
  });

  it('renders deterministically — same image, same polys', () => {
    const a = new Image({ file: artFile(), at: { x: 5, y: 5 }, size: 4, resolution: 1 });
    const b = new Image({ file: artFile(), at: { x: 5, y: 5 }, size: 4, resolution: 1 });
    const sa = newState();
    const sb = newState();
    a.render(sa);
    b.render(sb);
    expect(JSON.stringify(sa.grPolys)).toBe(JSON.stringify(sb.grPolys));
  });
});

// ---------------------------------------------------------------------------
// Full board integration: an Image through pcb.create() lands in the
// .kicad_pcb as filled gr_poly graphics, and rebuilds are byte-identical.
// ---------------------------------------------------------------------------

import { PCB, Resistor } from '../src/index.js';

describe('Image board integration', () => {
  let tmp: string;
  let prevBuildDir: string | undefined;

  const artFile = () => path.join(tmp, 'art.png');

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-image-board-'));
    prevBuildDir = process.env.TYPECAD_BUILD_DIR;
    process.env.TYPECAD_BUILD_DIR = tmp;
    // 4x4: silk top row, copper left column, one mask cell
    const pixels: number[][] = [
      WHITE, WHITE, WHITE, WHITE,
      RED, CLEAR, CLEAR, CLEAR,
      RED, CLEAR, BLUE, CLEAR,
      RED, CLEAR, CLEAR, CLEAR,
    ];
    fs.writeFileSync(artFile(), encodePng(new Uint8Array(pixels.flat()), { width: 4, height: 4 }));
  });

  afterAll(() => {
    if (prevBuildDir === undefined) delete process.env.TYPECAD_BUILD_DIR;
    else process.env.TYPECAD_BUILD_DIR = prevBuildDir;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('creates a board whose file carries the artwork as filled gr_polys', () => {
    const pcb = new PCB('image_board');
    pcb.outline(0, 0, 40, 30, 2);
    const r1 = new Resistor({ value: '1 kOhm' });
    r1.pcb = { x: 20, y: 15 };
    pcb.named('n1').net(r1.pin(1), r1.pin(2));

    const art = new Image({ file: artFile(), at: { x: 10, y: 10 }, size: 4, resolution: 1 });
    pcb.create(r1, art);

    const board = fs.readFileSync(path.join(tmp, 'image_board.kicad_pcb'), 'utf8');
    expect(board).toContain('(gr_poly');

    const silkPolys = board.match(/\(gr_poly[\s\S]*?F\.SilkS[\s\S]*?\)\)/g) ?? [];
    expect(silkPolys.length).toBe(1);
    expect(silkPolys[0]).toContain('(fill solid)');
    expect(board).toContain('F.Cu');
    expect(board.match(/F\.Mask/g)?.length).toBeGreaterThan(0);

    // the footprint survived alongside the artwork (schematic unaffected)
    expect(board).toContain('R_0603');
    expect(board).toContain('"R1"');
  });

  it('rebuilds byte-identically', () => {
    const build = () => {
      const pcb = new PCB('image_board_determinism');
      pcb.outline(0, 0, 40, 30, 2);
      const art = new Image({ file: artFile(), at: { x: 10, y: 10 }, size: 4, resolution: 1 });
      pcb.create(art);
      return fs.readFileSync(path.join(tmp, 'image_board_determinism.kicad_pcb'), 'utf8');
    };
    expect(build()).toBe(build());
  });
});
