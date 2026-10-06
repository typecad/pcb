// ---------------------------------------------------------------------------
// Image → board-geometry pipeline, part 1: palette classification and greedy
// rectangle merging. Pure functions — no fs, no PCB state — so the raster
// math is unit-testable on its own.
//
// Artwork inks are exact-or-nearest color matches against a small palette
// (copper / silkscreen / mask-opening). Each matched ink becomes a boolean
// cell grid, and each grid is greedily merged into the fewest rectangles the
// run-length structure allows — those become filled gr_poly graphics.
// ---------------------------------------------------------------------------

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const DEFAULT_INKS: { copper: string; silk: string; mask: string } = {
  copper: '#FF0000', // red — exposed, gold-plated metal
  silk: '#FFFFFF', // white — silkscreen print
  mask: '#0000FF', // blue — solder-mask opening (bare substrate or underlying copper)
};

/** Parse `#RGB` or `#RRGGBB` (leading # optional). Throws on anything else. */
export function parseHexColor(value: string): Rgb {
  const hex = value.replace(/^#/, '');
  const expanded = /^[0-9a-fA-F]{3}$/.test(hex)
    ? hex
        .split('')
        .map((c) => c + c)
        .join('')
    : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`"${value}" is not a hex color — inks use #RRGGBB (e.g. "#FF0000")`);
  }
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

/** A rectangle in cell units (x, y = top-left cell; w, h in cells). */
export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Classify every cell of a `gridW × gridH` target grid against the ink
 * palette, sampling the source image at each cell's center. Each cell takes
 * the nearest ink within `tolerance` (Euclidean RGB distance); fully
 * transparent cells and cells near no ink are background (the fab's mask
 * color shows).
 */
export function classifyCells(
  image: { width: number; height: number; rgba: Uint8Array },
  inks: Array<{ key: string; color: Rgb }>,
  gridW: number,
  gridH: number,
  tolerance: number,
): Map<string, Uint8Array> {
  const grids = new Map<string, Uint8Array>();
  for (const { key } of inks) grids.set(key, new Uint8Array(gridW * gridH));
  if (inks.length === 0) return grids;

  const toleranceSq = tolerance * tolerance;
  const sx = image.width / gridW; // source-pixel stride per cell
  const sy = image.height / gridH;

  for (let cy = 0; cy < gridH; cy++) {
    // sample the cell's center pixel; clamp for stride < 1 (upscaled art)
    const srcY = Math.min(image.height - 1, Math.floor((cy + 0.5) * sy));
    for (let cx = 0; cx < gridW; cx++) {
      const srcX = Math.min(image.width - 1, Math.floor((cx + 0.5) * sx));
      const base = (srcY * image.width + srcX) * 4;
      if (image.rgba[base + 3]! < 128) continue; // transparent → background

      const r = image.rgba[base]!;
      const g = image.rgba[base + 1]!;
      const b = image.rgba[base + 2]!;
      let best: { key: string; dist: number } | undefined;
      for (const { key, color } of inks) {
        const dr = r - color.r;
        const dg = g - color.g;
        const db = b - color.b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist <= toleranceSq && (!best || dist < best.dist)) best = { key, dist };
      }
      if (best) grids.get(best.key)![cy * gridW + cx] = 1;
    }
  }
  return grids;
}

/**
 * Greedy rectangle merge over a boolean cell grid: extend each unclaimed run
 * rightward, then downward while the full run below matches — the standard
 * greedy-meshing pass, deterministic, and fewest-rectangles for the row-run
 * structure. Holes come free: an unset cell is simply never claimed.
 */
export function mergeRects(grid: Uint8Array, gridW: number, gridH: number): CellRect[] {
  const claimed = new Uint8Array(gridW * gridH);
  const rects: CellRect[] = [];

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      if (!grid[y * gridW + x] || claimed[y * gridW + x]) continue;

      // extend the run rightward
      let x2 = x;
      while (x2 + 1 < gridW && grid[y * gridW + x2 + 1] && !claimed[y * gridW + x2 + 1]) x2++;

      // extend the full run downward while every cell below is set and free
      let y2 = y;
      grow: while (y2 + 1 < gridH) {
        for (let xx = x; xx <= x2; xx++) {
          if (!grid[(y2 + 1) * gridW + xx] || claimed[(y2 + 1) * gridW + xx]) break grow;
        }
        y2++;
      }

      for (let yy = y; yy <= y2; yy++) {
        claimed.fill(1, yy * gridW + x, yy * gridW + x2 + 1);
      }
      rects.push({ x, y, w: x2 - x + 1, h: y2 - y + 1 });
    }
  }
  return rects;
}
