// ---------------------------------------------------------------------------
// Label layouts live in TWO frames, and the importer must convert between
// them or the build→import→build cycle never settles.
//
// A part's `referenceLayout` / `valueLayout` / `fabLayout` in SOURCE is the
// AUTHORED frame — as if the part were on the front. For a back-side part the
// board writer (pcb/pcb_footprint.ts, applyBackSideTransformToNode) then
// transforms the written text: y negates, rotation gains 180°, and the text is
// justified `mirror`. The BOARD therefore carries the transformed values.
//
// An importer that wrote the board's values straight back into source handed
// the build values it would transform AGAIN: y flipped sign and rotation moved
// 180° on every rebuild (270° → 90° → 270° …), so each cycle rewrote the
// source and the next cycle disagreed — the endless sync loop. Reading a back
// part's layout through toAuthoredLayout() (the exact inverse of the build's
// transform) makes import ∘ build the identity: the source stops changing
// after the first write.
// ---------------------------------------------------------------------------
import type { TextLayoutIR } from './types.js';

/**
 * The board's label layout → the authored (pre-build-transform) frame the
 * source stores. Front-side parts pass through untouched.
 */
export function toAuthoredLayout<T extends TextLayoutIR>(layout: T | undefined, side: 'front' | 'back'): T | undefined {
  if (!layout || side !== 'back') return layout;
  const out: T = { ...layout };
  // y negated (the build's `raw[2] = -raw[2]`); keep 0 as 0, never -0
  out.y = layout.y === 0 ? 0 : -layout.y;
  // rotation + 180 undone, normalized to [0, 360)
  const rot = layout.rotation ?? 0;
  out.rotation = (((rot - 180) % 360) + 360) % 360;
  // the build always adds `mirror` for back parts — it is not authored state
  if (layout.justify) {
    const { mirror: _mirror, ...rest } = layout.justify;
    void _mirror;
    if (Object.keys(rest).length > 0) out.justify = rest;
    else delete out.justify;
  }
  return out;
}
