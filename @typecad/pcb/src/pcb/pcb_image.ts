// ---------------------------------------------------------------------------
// Board artwork from an image file. `new Image({...})` + `pcb.create(img)`
// traces an image into the board's three "inks" — exposed copper, white
// silkscreen, and solder-mask openings — and emits the geometry as filled
// gr_poly graphics on the matching KiCad layer. Polygons (not rects)
// because the gerber exporter plots filled gr_poly as proper regions while
// gr_rect only strokes. Holes (letter counters, logo counters) are either
// never painted (rect mode) or bridged into the ring as a keyhole slit
// (contour mode).
//
// A board's real palette is three inks on a substrate — the fab's mask color
// IS the background — so the image format is an exact-or-nearest color map,
// not grayscale. Copper ink automatically gets its mask opening (copper
// under intact mask is invisible).
//
// Two input families: raster (PNG, decoded with node:zlib — classified per
// cell, then merged rectangles or traced contours) and SVG (vector — paths
// flattened, filled shapes collected per ink; contours are the natural
// output, `mode: 'rects'` has no grid to make and is ignored).
// ---------------------------------------------------------------------------

import ClipperLib from 'clipper-lib';
import fs from 'node:fs';
import { decodePng, type DecodedImage } from '../image/png_decode.js';
import { decodeSvg, type DecodedSvg } from '../image/svg_decode.js';
import { DEFAULT_INKS, classifyCells, mergeRects, parseHexColor, type CellRect, type Rgb } from '../image/image_inks.js';
import { bridgeHoles, nestRings, simplifyRing, traceLoops, type NestedShape, type RingPt } from '../image/contours.js';
import type { IGrPoly } from './pcb_interfaces.js';
import { generateUuid } from './pcb_utils.js';
import logger from '../utils/logging.js';
import type { PcbInternalState } from './pcb_state.js';

/**
 * What one ink puts on the board — any combination of copper, a mask
 * opening, and silkscreen. `mask` means an OPENING (the mask gerber is
 * negative); `maskPaint` is the subtractive channel that closes openings
 * (paints mask back). `silk` together with `mask` is rejected at resolve
 * time: most fabs strip silkscreen over mask openings — the Image's
 * `allowExposedSilk` opts in for fab lines that will print it.
 */
export interface InkStack {
  copper?: boolean;
  mask?: boolean;
  silk?: boolean;
  /** closes mask openings instead of opening them (two-tone mask art) */
  maskPaint?: boolean;
}

/** A custom ink: a pixel color mapped to a stack of layers. */
export interface CustomInk {
  color: string;
  stack: InkStack;
}

/**
 * Ink palette: the three named presets (hex color overrides, or `null` to
 * switch one off) plus optional custom inks keyed by color and stack.
 */
export interface ImageInks {
  copper?: string | null;
  silk?: string | null;
  mask?: string | null;
  custom?: CustomInk[];
}

export interface ImageInit {
  /** Path to an image file — PNG (8/16-bit gray, RGB, palette, or RGBA; not
   *  interlaced) or SVG (filled shapes; presentation attributes, not CSS). */
  file: string;
  /** Board position of the artwork's center, in mm — `{ x, y }` or `[x, y]`. */
  at: { x: number; y: number } | [number, number];
  /** Placed size in mm: a single number fixes the width (height follows the
   *  image aspect); `[w, h]` is a bounding box the artwork FITS INSIDE with
   *  its aspect preserved, centered (a square logo in `[40, 30]` places at
   *  30×30). Default: one pixel / SVG user unit per `resolution`. */
  size?: number | [number, number];
  /** Board side. `back` mirrors the artwork horizontally and uses B.* layers. */
  side?: 'front' | 'back';
  /** Raster cell size in mm (default 0.1). Smaller = finer + more geometry;
   *  also the default mm-per-SVG-unit when `size` is omitted. */
  resolution?: number;
  /** Geometry style for raster input: `'contours'` traces each ink's
   *  boundary into rings with keyhole-bridged holes (small files, smooth
   *  diagonals); `'rects'` emits merged rectangles (the v1 shape, exact
   *  cell grid). SVG input always traces. Default `'contours'`. */
  mode?: 'contours' | 'rects';
  /** Contour simplification: max deviation in mm (Douglas-Peucker). Default
   *  half the resolution — enough to straighten staircases; `0` keeps every
   *  grid vertex. */
  smooth?: number;
  /** Per-ink color overrides (hex); `null` disables an ink. Custom inks
   *  (color -> layer stack) ride here too — see {@link ImageInks}. */
  inks?: ImageInks;
  /** Permit a custom ink stacking silk over a mask opening. Most fabs strip
   *  silkscreen over openings — set this only for a fab that will print it. */
  allowExposedSilk?: boolean;
  /** Mask opening grown beyond copper artwork, mm (default 0.05 — fab
   *  registration usually wants the opening slightly larger than the metal). */
  maskExpansion?: number;
  /** Nearest-color match cutoff, Euclidean RGB distance 0–441 (default 100).
   *  Exact palette colors always match; lower values ignore more of the
   *  antialiased fringe. */
  tolerance?: number;
  /** Lock the generated graphics against editing in KiCad. */
  locked?: boolean;
  uuid?: string;
}

/** A unit-space ink decomposition. Raster shapes live on the CELL grid
 *  (space: 'grid', 0..gridW/0..gridH); SVG shapes live in USER units
 *  (space: 'user', viewBox-relative). `render` maps each space onto the
 *  board — mixing them scales artwork by gridW/widthPx whenever the grid
 *  differs from the pixel count (any down/upsampled raster). */
interface InkShapes {
  key: string;
  stack: InkStack;
  rects: CellRect[];
  outlines: NestedShape[];
  space: 'grid' | 'user';
  gridW: number;
  gridH: number;
}

interface ResolvedInk {
  key: string;
  color: Rgb;
  stack: InkStack;
}

const MAX_GRID_DIM = 4096;
const WARN_SHAPE_COUNT = 20_000;
const NM = 1e6; // clipper works in integers — nm, like the DRC engine

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

type DecodedArt = { kind: 'png'; image: DecodedImage } | { kind: 'svg'; svg: DecodedSvg };

export class Image {
  readonly file: string;
  /** Board position — mutable so a Package can shift it by its own offset. */
  at: { x: number; y: number };
  readonly side: 'front' | 'back';
  readonly resolution: number;
  readonly mode: 'contours' | 'rects';
  readonly smooth: number;
  readonly maskExpansion: number;
  readonly tolerance: number;
  readonly locked: boolean;
  readonly uuid?: string;
  private readonly sizeOption: number | [number, number] | undefined;
  private readonly inkOptions: ImageInks | undefined;
  private readonly allowExposedSilk: boolean;
  private cachedDecoded?: DecodedArt;
  private cachedInkShapes?: InkShapes[];

  constructor(init: ImageInit) {
    if (typeof init.file !== 'string' || init.file.length === 0) {
      throw new TypeError('Image requires a `file` path to a PNG or SVG');
    }
    this.file = init.file;
    if (
      !init.at ||
      typeof init.at !== 'object' ||
      (Array.isArray(init.at)
        ? init.at.length !== 2 || !init.at.every((v) => Number.isFinite(v))
        : !Number.isFinite(init.at.x) || !Number.isFinite(init.at.y))
    ) {
      throw new TypeError('Image requires finite `at` coordinates ({ x, y } or [x, y] in mm)');
    }
    this.at = Array.isArray(init.at) ? { x: init.at[0], y: init.at[1] } : { x: init.at.x, y: init.at.y };

    if (init.size !== undefined) {
      const [w, h] = typeof init.size === 'number' ? [init.size, init.size] : init.size;
      const tuple = typeof init.size !== 'number';
      if (!Number.isFinite(w) || w <= 0 || (tuple && (!Number.isFinite(h!) || h! <= 0))) {
        throw new TypeError('Image `size` must be a positive mm width or a [width, height] bounding box');
      }
    }
    this.sizeOption = init.size;

    this.side = init.side ?? 'front';
    if (this.side !== 'front' && this.side !== 'back') {
      throw new TypeError(`Image \`side\` must be 'front' or 'back', got "${init.side}"`);
    }

    this.resolution = init.resolution ?? 0.1;
    if (!Number.isFinite(this.resolution) || this.resolution <= 0 || this.resolution > 10) {
      throw new TypeError('Image `resolution` must be a positive mm value (0–10)');
    }
    this.mode = init.mode ?? 'contours';
    if (this.mode !== 'contours' && this.mode !== 'rects') {
      throw new TypeError(`Image \`mode\` must be 'contours' or 'rects', got "${init.mode}"`);
    }
    this.smooth = init.smooth ?? this.resolution * 0.5;
    if (!Number.isFinite(this.smooth) || this.smooth < 0 || this.smooth > 5) {
      throw new TypeError('Image `smooth` must be a mm deviation between 0 and 5');
    }
    this.maskExpansion = init.maskExpansion ?? 0.05;
    if (!Number.isFinite(this.maskExpansion) || this.maskExpansion < 0 || this.maskExpansion >= 5) {
      throw new TypeError('Image `maskExpansion` must be a mm value in [0, 5)');
    }
    this.tolerance = init.tolerance ?? 100;
    if (!Number.isFinite(this.tolerance) || this.tolerance < 0 || this.tolerance > 442) {
      throw new TypeError('Image `tolerance` must be an RGB distance between 0 and 442');
    }
    this.locked = init.locked ?? false;
    this.uuid = init.uuid;
    this.inkOptions = init.inks;
    this.allowExposedSilk = init.allowExposedSilk ?? false;
  }

  /** The effective ink palette: the three named presets (with their fixed
   *  stacks) plus custom color-keyed stacks, after `null` overrides remove
   *  presets. The silk-over-mask-opening combination is rejected here —
   *  most fabs strip that silkscreen — unless `allowExposedSilk` opts in. */
  resolvedInks(): ResolvedInk[] {
    const presetStacks: Record<'copper' | 'silk' | 'mask', InkStack> = {
      copper: { copper: true, mask: true }, // exposed: the opening comes with it
      silk: { silk: true },
      mask: { mask: true },
    };
    const resolved: ResolvedInk[] = [];
    for (const ink of ['copper', 'silk', 'mask'] as const) {
      const override = this.inkOptions?.[ink];
      if (override === null) continue;
      resolved.push({ key: ink, color: parseHexColor(override ?? DEFAULT_INKS[ink]), stack: presetStacks[ink] });
    }
    for (const custom of this.inkOptions?.custom ?? []) {
      const stack = custom.stack ?? {};
      const bits = [stack.copper, stack.mask, stack.silk, stack.maskPaint].filter(Boolean).length;
      if (bits === 0) {
        throw new TypeError(
          `Image custom ink "${custom.color}" sets no layers — a stack needs at least one of copper, mask, silk, maskPaint`,
        );
      }
      if (stack.silk && stack.mask && !this.allowExposedSilk) {
        throw new TypeError(
          `Image custom ink "${custom.color}" stacks silk over a mask opening — most fabs strip ` +
            `silkscreen over openings. Pick silk or an opening, not both (allowExposedSilk opts in for a fab that prints it)`,
        );
      }
      resolved.push({ key: `custom:${custom.color}`, color: parseHexColor(custom.color), stack });
    }
    if (resolved.length === 0) {
      throw new Error(`Image "${this.file}" has every ink disabled — nothing would be placed on the board`);
    }
    return resolved;
  }

  /** Placed size in mm: a width with the aspect preserved, or the fit-inside
   *  scale of a `[w, h]` bounding box (aspect preserved, centered on `at`). */
  private sizeMm(units: { width: number; height: number }): { width: number; height: number } {
    if (this.sizeOption === undefined) {
      return { width: units.width * this.resolution, height: units.height * this.resolution };
    }
    if (typeof this.sizeOption === 'number') {
      return { width: this.sizeOption, height: (this.sizeOption * units.height) / units.width };
    }
    const scale = Math.min(this.sizeOption[0] / units.width, this.sizeOption[1] / units.height);
    return { width: units.width * scale, height: units.height * scale };
  }

  private decode(): DecodedArt {
    if (this.cachedDecoded) return this.cachedDecoded;
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(this.file);
    } catch (err) {
      throw new Error(
        `Board image "${this.file}" could not be read: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const head = buffer.subarray(0, 512).toString('latin1');
    const isSvg = /^[\uFEFF\s]*</.test(head) && /<svg[\s>]/i.test(head);
    this.cachedDecoded = isSvg
      ? { kind: 'svg', svg: decodeSvg(buffer.toString('utf8')) }
      : { kind: 'png', image: decodePng(buffer) };
    return this.cachedDecoded;
  }

  /** Source dimensions in natural units — pixels (PNG) or user units (SVG). */
  sourceUnits(): { width: number; height: number } {
    const art = this.decode();
    return art.kind === 'svg'
      ? { width: art.svg.unitsWidth, height: art.svg.unitsHeight }
      : { width: art.image.width, height: art.image.height };
  }

  /** The placed box in board-frame mm — what the images manifest records so
   *  tooling (the layout view) can select/edit applied artwork. */
  placementBox(): { file: string; x: number; y: number; w: number; h: number; side: 'front' | 'back' } {
    const { width, height } = this.sizeMm(this.sourceUnits());
    return { file: this.file, x: this.at.x, y: this.at.y, w: width, h: height, side: this.side };
  }

  /**
   * Decompose the artwork into per-ink shapes (memoized — one decode per
   * image per process). Shapes live in SOURCE units: cell indices for PNG,
   * user units for SVG; `render` maps them onto the board.
   */
  inkShapes(): InkShapes[] {
    if (this.cachedInkShapes) return this.cachedInkShapes;
    const art = this.decode();
    const inks = this.resolvedInks();
    let shapes: InkShapes[];

    if (art.kind === 'png') {
      const image = art.image;
      const { width: widthMm, height: heightMm } = this.sizeMm({ width: image.width, height: image.height });
      const gridW = Math.max(1, Math.round(widthMm / this.resolution));
      const gridH = Math.max(1, Math.round(heightMm / this.resolution));
      if (gridW > MAX_GRID_DIM || gridH > MAX_GRID_DIM) {
        throw new Error(
          `Board image "${this.file}" rasterizes to a ${gridW}×${gridH} cell grid — ` +
            `raise \`resolution\` (currently ${this.resolution}mm) or shrink \`size\``,
        );
      }
      const grids = classifyCells(image, inks, gridW, gridH, this.tolerance);
      shapes = inks.map(({ key, stack }) => {
        const grid = grids.get(key)!;
        if (this.mode === 'rects')
          return { key, stack, rects: mergeRects(grid, gridW, gridH), outlines: [], space: 'grid' as const, gridW, gridH };
        return {
          key,
          stack,
          rects: [],
          outlines: nestRings(traceLoops(grid, gridW, gridH)),
          space: 'grid' as const,
          gridW,
          gridH,
        };
      });
    } else {
      // SVG: vector in, rings out. Shapes nest per element (a path's
      // subpaths carry their own holes); implicit fills (no fill attribute
      // on the chain) ARE the artwork — they land on the copper ink.
      const svg = art.svg;
      shapes = inks.map(({ key, color }) => {
        const outlines: NestedShape[] = [];
        for (const shape of svg.shapes) {
          const matched =
            shape.color === null ? key === 'copper' : svgColorDistance(shape.color, color) <= this.tolerance ** 2;
          if (matched) outlines.push(...nestRings(shape.rings));
        }
        return { key, stack: this.resolvedInks().find((i) => i.key === key)!.stack, rects: [], outlines, space: 'user' as const, gridW: 1, gridH: 1 };
      });
    }

    const count = shapes.reduce((sum, s) => sum + s.rects.length + s.outlines.length, 0);
    if (count > WARN_SHAPE_COUNT) {
      logger.warn(
        `Board image "${this.file}" decomposed into ${count} shapes — consider a coarser ` +
          `\`resolution\` (currently ${this.resolution}mm), a larger \`smooth\`, or contour mode ` +
          'to keep the board file small',
      );
    }
    this.cachedInkShapes = shapes;
    return shapes;
  }

  /** SVG user-unit → mm scale (per axis; raster uses the cell grid). */
  private unitScale(): { x: number; y: number } {
    const units = this.sourceUnits();
    const { width, height } = this.sizeMm(units);
    return { x: width / units.width, y: height / units.height };
  }

  /**
   * Emit the artwork into the board's graphics state as filled polygons,
   * shifted to `at` plus the active offset. Copper ink automatically
   * carries its mask opening, grown by `maskExpansion`.
   */
  render(state: PcbInternalState, offset: { x: number; y: number } = { x: 0, y: 0 }): void {
    const originX = this.at.x + offset.x;
    const originY = this.at.y + offset.y;
    const { width: widthMm, height: heightMm } = this.sizeMm(this.sourceUnits());
    // back-side artwork reads correctly when the board is flipped: mirror
    // horizontally around the image's own center axis
    const mirror = this.side === 'back';

    const sidePrefix = this.side === 'back' ? 'B.' : 'F.';
    const push = (layer: string, pts: RingPt[]): void => {
      state.grPolys.push({
        type: 'poly',
        uuid: generateUuid('image', this.file, layer, pts.map((p) => `${p.x},${p.y}`).join(';')),
        layer,
        strokeWidth: 0,
        points: pts,
        fill: true,
        locked: this.locked,
      });
    };
    // mask geometry is collected and emitted LAST: the maskPaint channel is
    // subtractive — it closes openings — so every ink's opening (including
    // copper's grown one) has to exist before the difference runs
    const openings: RingPt[][] = [];
    const paints: RingPt[][] = [];

    for (const { stack, rects, outlines, space, gridW, gridH } of this.inkShapes()) {
      // each pipeline's unit space maps onto the placed box independently:
      // grid cells divide the box by gridW/gridH (the grid is the art's
      // final raster — pixel scale never enters), user units scale by
      // sizeMm/sourceUnits. mm per unit, per axis:
      const mmPerUnit =
        space === 'grid' ? { x: widthMm / gridW, y: heightMm / gridH } : this.unitScale();
      const toMm = (p: RingPt): RingPt => {
        let x = p.x * mmPerUnit.x;
        if (mirror) x = widthMm - x;
        return { x: round3(originX - widthMm / 2 + x), y: round3(originY - heightMm / 2 + p.y * mmPerUnit.y) };
      };

      for (const rect of rects) {
        const corners = (r: CellRect): RingPt[] => [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x, y: r.y + r.h },
        ];
        if (stack.copper) push(`${sidePrefix}Cu`, corners(rect).map(toMm));
        if (stack.silk) push(`${sidePrefix}SilkS`, corners(rect).map(toMm));
        if (stack.mask) {
          // copper's opening grows past the metal for fab registration;
          // adjacent openings overlap — same-polarity regions union
          const e =
            stack.copper && this.maskExpansion > 0
              ? { x: this.maskExpansion / mmPerUnit.x, y: this.maskExpansion / mmPerUnit.y }
              : { x: 0, y: 0 };
          openings.push(
            corners({ x: rect.x - e.x, y: rect.y - e.y, w: rect.w + 2 * e.x, h: rect.h + 2 * e.y }).map(toMm),
          );
        }
        if (stack.maskPaint) paints.push(corners(rect).map(toMm));
      }
      for (const { outer, holes } of outlines) {
        // map to board mm, straighten grid staircases, THEN bridge the
        // holes — simplifying after bridging could collapse the slits
        const ring = bridgeHoles(
          simplifyRing(outer.map(toMm), this.smooth),
          holes.map((h) => simplifyRing(h.map(toMm), this.smooth)),
        );
        if (stack.copper) push(`${sidePrefix}Cu`, ring);
        if (stack.silk) push(`${sidePrefix}SilkS`, ring);
        if (stack.mask) openings.push(stack.copper && this.maskExpansion > 0 ? offsetRing(ring, this.maskExpansion) : ring);
        if (stack.maskPaint) paints.push(ring);
      }
    }

    // the mask layer: openings minus the paint channel (two-tone mask art —
    // painting mask back into an opening also re-hides copper under it,
    // which is the documented precedence). The difference's solution carries
    // holes as separate, oppositely-oriented paths — emitted independently
    // each would fill (an opening's hole would become an opening). Re-nest
    // the solution and keyhole-bridge each shape back into ONE ring, the
    // same shape every other emitted poly has.
    const maskPolys = paints.length > 0 ? clipperDifference(openings, paints) : openings;
    for (const shape of nestRings(maskPolys)) push(`${sidePrefix}Mask`, bridgeHoles(shape.outer, shape.holes));
  }
}

/** Boolean difference of polygon sets (clipper, nm integers like the DRC
 *  engine). Subjects union together (nonzero — overlapping openings must
 *  merge, not punch holes), clips subtract from that union. Falls back to
 *  the subjects when the operation fails. */
function clipperDifference(subjects: RingPt[][], clips: RingPt[][]): RingPt[][] {
  if (subjects.length === 0 || clips.length === 0) return subjects;
  try {
    const toPath = (ring: RingPt[]) => ring.map((p) => ({ X: Math.round(p.x * NM), Y: Math.round(p.y * NM) }));
    const clipper = new ClipperLib.Clipper();
    clipper.AddPaths(subjects.map(toPath), ClipperLib.PolyType.ptSubject, true);
    clipper.AddPaths(clips.map(toPath), ClipperLib.PolyType.ptClip, true);
    const solution: Array<Array<{ X: number; Y: number }>> = [];
    clipper.Execute(
      ClipperLib.ClipType.ctDifference,
      solution,
      ClipperLib.PolyFillType.pftNonZero,
      ClipperLib.PolyFillType.pftNonZero,
    );
    const out = solution
      .map((path) => path.map((p) => ({ x: round3(p.X / NM), y: round3(p.Y / NM) })))
      .filter((ring) => ring.length >= 3);
    return out.length > 0 ? out : subjects;
  } catch {
    return subjects;
  }
}

/** Euclidean-squared distance between an SVG color string and an ink. */
function svgColorDistance(color: string, ink: Rgb): number {
  let rgb: Rgb;
  try {
    rgb = parseSvgColor(color);
  } catch {
    return Infinity;
  }
  return (rgb.r - ink.r) ** 2 + (rgb.g - ink.g) ** 2 + (rgb.b - ink.b) ** 2;
}

function parseSvgColor(value: string): Rgb {
  const v = value.trim().toLowerCase();
  const named = NAMED_SVG_COLORS[v];
  if (named) return named;
  const rgbm = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(v);
  if (rgbm) return { r: +rgbm[1]!, g: +rgbm[2]!, b: +rgbm[3]! };
  return parseHexColor(v);
}

const NAMED_SVG_COLORS: Record<string, Rgb> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  red: { r: 255, g: 0, b: 0 },
  lime: { r: 0, g: 255, b: 0 },
  green: { r: 0, g: 128, b: 0 },
  blue: { r: 0, g: 0, b: 255 },
  yellow: { r: 255, g: 255, b: 0 },
  cyan: { r: 0, g: 255, b: 255 },
  magenta: { r: 255, g: 0, b: 255 },
  gray: { r: 128, g: 128, b: 128 },
  grey: { r: 128, g: 128, b: 128 },
  silver: { r: 192, g: 192, b: 192 },
  maroon: { r: 128, g: 0, b: 0 },
  navy: { r: 0, g: 0, b: 128 },
  olive: { r: 128, g: 128, b: 0 },
  purple: { r: 128, g: 0, b: 128 },
  teal: { r: 0, g: 128, b: 128 },
  orange: { r: 255, g: 165, b: 0 },
  gold: { r: 255, g: 215, b: 0 },
};

/** Uniform polygon offset outward by `e` mm (mask openings) — a true
 *  geometric offset via clipper (join round, like KiCad's), so concave
 *  corners and thin features grow correctly. Falls back to the input ring
 *  when the offset collapses it. */
function offsetRing(ring: RingPt[], e: number): RingPt[] {
  if (ring.length < 3 || e <= 0) return ring;
  const delta = Math.round(e * NM);
  if (delta <= 0) return ring;
  try {
    const co = new ClipperLib.ClipperOffset(2, NM / 1000);
    co.AddPath(
      ring.map((p) => ({ X: Math.round(p.x * NM), Y: Math.round(p.y * NM) })),
      ClipperLib.JoinType.jtRound,
      ClipperLib.EndType.etClosedPolygon,
    );
    const paths: Array<Array<{ X: number; Y: number }>> = [];
    co.Execute(paths, delta);
    if (paths.length === 0) return ring;
    const biggest = paths.reduce((a, b) =>
      Math.abs(ClipperLib.Clipper.Area(b)) > Math.abs(ClipperLib.Clipper.Area(a)) ? b : a,
    );
    const out = biggest.map((p) => ({ x: round3(p.X / NM), y: round3(p.Y / NM) }));
    return out.length >= 3 ? out : ring;
  } catch {
    return ring;
  }
}

/** Structural check used by `pcb.create()` — accepts any Image-like without a hard import. */
export function isImageLike(obj: unknown): obj is Image {
  return obj instanceof Image;
}
