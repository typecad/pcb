// ---------------------------------------------------------------------------
// Stroke-text rendering, mirroring KiCad's plot pipeline:
//   FONT::getLinePositions (justify offsets) → STROKE_FONT::GetTextAsGlyphs
//   (per-char cursor advance, STROKE_GLYPH::Transform) → CALLBACK_GAL stroke
//   callback (one MoveTo/LineTo pair per contour segment).
// All constants come from the KiCad sources; positions round via KiROUND
// (half away from zero) at cursor steps and final point conversion.
// ---------------------------------------------------------------------------

import { getStrokeGlyph, spaceWidth } from './stroke_font.js';
import { GerberWriter, type Point } from './gerber_writer.js';

export interface TextOpts {
  text: string;
  /** anchor in board mm (the item's `at`, already footprint-transformed) */
  at: Point;
  /** absolute orientation in degrees */
  angle: number;
  /** text size (width, height) in mm — x < 0 means mirrored */
  size: { x: number; y: number };
  /** stroke width in mm */
  thickness: number;
  hJustify: 'left' | 'center' | 'right';
  vJustify: 'top' | 'center' | 'bottom';
  italic?: boolean;
  /** back-side text (footprint on B, or mirrored layer) */
  mirror?: boolean;
  /**
   * Stroke pen override. KiCad clamps the plotted pen to width/4
   * (ClampTextPenSize) but computes text POSITIONS with the unclamped
   * thickness — the two must be allowed to differ.
   */
  pen?: number;
}

const ITALIC_TILT = 1 / 8;

function kiRound(v: number): number {
  return v < 0 ? -Math.round(-v) : Math.round(v);
}

/** iu = nm; KiCad walks cursors in integer nm */
const NM = 1e6;

/**
 * Render one text item as pen strokes. Returns true when anything was drawn.
 */
export function renderStrokeText(w: GerberWriter, o: TextOpts): boolean {
  const text = o.text;
  if (!text) return false;
  const lines = text.split('\n');
  const mirrored = o.mirror ?? o.size.x < 0;
  // file (size H W): H = o.size.x scales y, W = o.size.y scales x
  const sy = Math.abs(o.size.x);
  const sx = Math.abs(o.size.y);

  // All cursor math in integer nanometres like KiCad's VECTOR2I pipeline.
  // int division (VECTOR2I operator/) truncates toward zero.
  const idiv = (a: number, b: number): number => Math.trunc(a / b);
  const thNm = kiRound(o.thickness * NM);
  const syNm = kiRound(sy * NM);
  const height = Math.trunc(syNm * 1.17); // int += double truncates in C++
  const interline = Math.trunc(syNm * 1.7 * 0.9583);

  // per-char advance: cursor.x += KiROUND(bboxEnd.x * size.x)
  const extents: number[] = lines.map((line) => {
    let x = 0;
    for (const ch of line) {
      if (ch === ' ') x += kiRound(spaceWidth() * sx * NM);
      else {
        const g = getStrokeGlyph(ch.codePointAt(0)!);
        if (g) x += kiRound(g.width * sx * NM);
      }
    }
    return x;
  });

  // probe-verified base: cap height minus stroke adjustments plus the
  // condensed-width correction below the font's natural 0.8 aspect
  const kNm = Math.max(0, kiRound(0.013 * (0.8 * sy - sx) * NM));
  let offsetY = syNm - kiRound(o.thickness * 0.052 * NM) + kNm;
  switch (o.vJustify) {
    case 'bottom':
      offsetY -= height;
      break;
    case 'center':
      offsetY -= idiv(height, 2);
      break;
    default:
      break;
  }

  const anchorX = kiRound(o.at.x * NM);
  const anchorY = kiRound(o.at.y * NM);
  // KiCad rotates text in its y-down internal frame — negate for file frame
  const rad = (-o.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const tilt = o.italic ? ITALIC_TILT : 0;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    let lineOffsetX: number;
    switch (o.hJustify) {
      case 'left':
        lineOffsetX = idiv(thNm, 1.52);
        break;
      case 'right':
        lineOffsetX = -(extents[li]! + idiv(thNm, 1.52));
        break;
      default:
        lineOffsetX = -idiv(extents[li]!, 2);
        break;
    }
    let cursorX = anchorX + lineOffsetX;
    const cursorY = anchorY + offsetY + li * interline;

    for (const ch of line) {
      const code = ch.codePointAt(0)!;
      if (ch === ' ') {
        cursorX += kiRound(spaceWidth() * sx * NM);
        continue;
      }
      const g = getStrokeGlyph(code);
      if (!g) continue;
      for (const contour of g.contours) {
        let prev: Point | null = null;
        for (let i = 0; i < contour.length; i += 2) {
          // glyph x right-positive; decoded y used directly in the y-up
          // file frame (baseline ≈ -0.95, cap top ≈ +0.05)
          let px = contour[i]! * sx;
          const py = contour[i + 1]! * sy;
          if (tilt) px -= py * tilt;
          // VECTOR2D -> VECTOR2I is static_cast: truncation toward zero
          let bxnm = Math.trunc(cursorX + px * NM);
          let bynm = Math.trunc(cursorY + py * NM);
          if (mirrored) bxnm = anchorX - (bxnm - anchorX);
          if (o.angle !== 0) {
            const bx = (bxnm - anchorX) / NM;
            const by = (bynm - anchorY) / NM;
            bxnm = anchorX + Math.trunc((bx * cos - by * sin) * NM);
            bynm = anchorY + Math.trunc((bx * sin + by * cos) * NM);
          }
          const p = { x: bxnm / NM, y: bynm / NM };
          if (prev) {
            w.selectAperture(w.aperture({ kind: 'C', dia: o.pen ?? o.thickness }));
            w.moveTo({ x: prev.x, y: -prev.y }); // board y-up → gerber y-down
            w.lineTo({ x: p.x, y: -p.y });
          }
          prev = p;
        }
      }
      cursorX += kiRound(g.width * sx * NM);
    }
  }
  return true;
}

interface ParsedEffects {
  size?: { x: number; y: number };
  thickness?: number;
  hJustify: 'left' | 'center' | 'right';
  vJustify: 'top' | 'center' | 'bottom';
  italic: boolean;
  bold: boolean;
  mirror: boolean;
  face?: string;
}

import type { SNode } from '../sexpr/index.js';
import { scalar } from './copper.js';

/** Parse an `(effects …)` node into justify/size/thickness/face signals. */
export function parseEffects(item: SNode): ParsedEffects {
  const fx = item.child('effects');
  const out: ParsedEffects = {
    hJustify: 'center',
    vJustify: 'center',
    italic: false,
    bold: false,
    mirror: false,
  };
  if (!fx) return out;
  const font = fx.child('font');
  if (font) {
    const sz = font.child('size');
    if (sz) out.size = { x: scalar(sz, 1, 1), y: scalar(sz, 2, 1) };
    const th = font.child('thickness');
    if (th) out.thickness = scalar(th, 1, 0.15);
    out.italic = font.child('italic') !== null;
    out.bold = font.child('bold') !== null;
    const face = font.child('face');
    if (face) out.face = String(face.raw[1] ?? '');
  }
  const just = fx.child('justify');
  if (just) {
    for (const tok of just.raw.slice(1)) {
      if (typeof tok !== 'string') continue;
      if (tok === 'left' || tok === 'right' || tok === 'center') out.hJustify = tok;
      if (tok === 'top' || tok === 'bottom') out.vJustify = tok;
      if (tok === 'mirror') out.mirror = true;
    }
  }
  return out;
}
