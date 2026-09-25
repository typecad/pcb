// ---------------------------------------------------------------------------
// Stroke font for silkscreen/fab text: the public-domain Hershey "futural"
// single-stroke engineering lettering (created at the US National Bureau
// of Standards; see stroke_font_data.LICENSE.md for provenance).
//
// Glyph frame (identical to the previous newstroke conventions, so the
// justification/anchoring math in text.ts is unchanged):
//   - x in [0 .. width], advance width in cap-height units
//   - y up-positive with the baseline at -0.95 and cap top at +0.05
//   - contours are OPEN polylines (single-stroke font): flat [x0,y0,x1,y1...]
// ASCII U+0020-U+007E; other code points fall back to '?'.
// ---------------------------------------------------------------------------

import rawData from './stroke_font_data.json' with { type: 'json' };

export interface StrokeGlyph {
  /** advance width in glyph units */
  width: number;
  /** contours as flat [x0, y0, x1, y1, ...] arrays in glyph units */
  contours: number[][];
}

type GlyphEntry = [number, number[][]];

const data = rawData as unknown as GlyphEntry[];

export function getStrokeGlyph(code: number): StrokeGlyph | null {
  const c = code < 0x20 || code > 0x7e ? 0x3f : code; // '?' fallback
  const entry = data[c - 0x20]!;
  return { width: entry[0]!, contours: entry[1]! };
}

/** advance width of U+0020 in glyph units */
export function spaceWidth(): number {
  return data[0]![0]!;
}
