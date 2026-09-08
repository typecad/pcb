/**
 * Controlled-impedance trace width calculation.
 *
 * Given the board's physical stackup geometry (from
 * {@link resolveStackupGeometry}) and a target characteristic impedance,
 * solve for the trace width using first-order transmission-line models:
 *
 * - Outer layers (F.Cu/B.Cu): **microstrip** — trace on the board surface
 *   over a dielectric and reference plane. Hammerstad-style effective
 *   permittivity.
 * - Inner layers (In*.Cu): **symmetric stripline** — trace embedded between
 *   two reference planes. Cohn-style narrow/wide formulas.
 *
 * Widths are found by bisection (impedance is monotonically decreasing in
 * width), so any refinement of the models slots in without changing the
 * solving strategy. Accuracy is engineering-grade (typically within ~10%,
 * the usual fab tolerance), not field-solver grade.
 */

import { copperLayerNames, type IStackupGeometry } from './pcb_stackup.js';

/** Transmission-line model matched to the layer's position in the stack. */
export type ImpedanceModel = 'microstrip' | 'stripline';

/** The physical inputs for one layer's impedance model. */
export interface IImpedanceGeometry {
  model: ImpedanceModel;
  /** Trace copper thickness in mm. */
  copperThicknessMm: number;
  /** Relative permittivity of the (dominant) dielectric. */
  epsilonR: number;
  /** Microstrip: dielectric height to the reference plane in mm. */
  hMm?: number;
  /** Stripline: total spacing between the two reference planes in mm. */
  bMm?: number;
}

/** Characteristic impedance of a microstrip trace in ohms. */
function microstripImpedance(widthMm: number, g: IImpedanceGeometry & { hMm: number }): number {
  const { hMm: h, epsilonR: er, copperThicknessMm: t } = g;
  const u = Math.max(widthMm, 1e-4) / h;

  // Effective permittivity (first-order Hammerstad, no thickness correction).
  const eEff = (er + 1) / 2 + (er - 1) / 2 / Math.sqrt(1 + 12 / u);

  const z0 =
    u <= 1
      ? (60 / Math.sqrt(eEff)) * Math.log(8 / u + u / 4)
      : (120 * Math.PI) / (Math.sqrt(eEff) * (u + 1.393 + 0.667 * Math.log(u + 1.444)));

  // Very thin traces near the dielectric approach the thickness-corrected
  // limit; the first-order formula stays monotonic without it (t unused).
  void t;
  return z0;
}

/** Characteristic impedance of a symmetric stripline trace in ohms. */
function striplineImpedance(widthMm: number, g: IImpedanceGeometry & { bMm: number }): number {
  const { bMm: b, epsilonR: er, copperThicknessMm: t } = g;
  // Cohn finite-thickness width correction (mild, keeps monotonicity).
  const tEff = Math.min(Math.max(t, 0), b / 4);
  const wEff = Math.max(widthMm, 1e-4) + (tEff / Math.PI) * (1 + Math.log((2 * b) / (Math.PI * tEff)));
  const u = wEff / b;

  const z0 = u < 0.35 ? (60 / Math.sqrt(er)) * Math.log(4 / (Math.PI * u)) : 94.15 / (Math.sqrt(er) * (u + 0.441));
  return z0;
}

/**
 * Characteristic impedance of a trace of `widthMm` under the given geometry.
 */
export function impedanceOfWidth(widthMm: number, g: IImpedanceGeometry): number {
  if (g.model === 'microstrip') {
    if (!g.hMm || g.hMm <= 0) throw new RangeError('microstrip geometry requires a positive hMm');
    return microstripImpedance(widthMm, { ...g, hMm: g.hMm });
  }
  if (!g.bMm || g.bMm <= 0) throw new RangeError('stripline geometry requires a positive bMm');
  return striplineImpedance(widthMm, { ...g, bMm: g.bMm });
}

/**
 * Solve the trace width (mm) that achieves `targetOhms` under `geometry`, by
 * bisection over [0.02, 10] mm (impedance decreases monotonically with
 * width). Result is rounded to µm precision.
 *
 * @throws {RangeError} if the target is outside what the geometry can reach
 *   (~[5, 300] Ω for realistic stackups).
 */
export function widthForImpedance(targetOhms: number, g: IImpedanceGeometry): number {
  if (!Number.isFinite(targetOhms) || targetOhms <= 0) {
    throw new RangeError(`target impedance must be a positive number of ohms, got ${targetOhms}`);
  }
  let lo = 0.02;
  let hi = 10;
  const zLo = impedanceOfWidth(lo, g); // widest impedance (narrow trace)
  const zHi = impedanceOfWidth(hi, g); // lowest impedance (wide trace)
  if (targetOhms > zLo || targetOhms < zHi) {
    throw new RangeError(
      `target impedance ${targetOhms}Ω is outside this geometry's reachable range ` +
        `(${zHi.toFixed(1)}–${zLo.toFixed(1)}Ω for ${g.model}); adjust the stackup or route on another layer`,
    );
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const z = impedanceOfWidth(mid, g);
    if (z > targetOhms) {
      lo = mid; // too high impedance -> widen
    } else {
      hi = mid; // too low impedance -> narrow
    }
  }
  return Math.round(((lo + hi) / 2) * 1000) / 1000;
}

/**
 * Manufacturable width within a tolerance band.
 *
 * Solves the exact width for `targetOhms`, then snaps it to a fabrication
 * grid (default 0.01mm) while keeping the achieved impedance inside
 * `targetOhms ± toleranceOhms`. Prefers the grid value closest to the exact
 * solution; when no grid value fits the band (e.g. a tolerance near zero on
 * a geometry with steep dZ/dw), the exact width is returned.
 *
 * @throws {RangeError} on a non-positive/negative tolerance, bad grid, or
 *   an unreachable target (see {@link widthForImpedance}).
 */
export function widthForImpedanceWithinTolerance(
  targetOhms: number,
  toleranceOhms: number,
  g: IImpedanceGeometry,
  gridMm = 0.01,
): number {
  if (!Number.isFinite(toleranceOhms) || toleranceOhms < 0) {
    throw new RangeError(`impedance tolerance must be a non-negative number of ohms, got ${toleranceOhms}`);
  }
  if (!Number.isFinite(gridMm) || gridMm <= 0) {
    throw new RangeError(`fabrication grid must be positive, got ${gridMm}`);
  }
  const exact = widthForImpedance(targetOhms, g);
  if (toleranceOhms === 0) return exact;

  const inBand = (w: number) => Math.abs(impedanceOfWidth(w, g) - targetOhms) <= toleranceOhms;
  const below = Math.max(0.02, Math.floor(exact / gridMm) * gridMm);
  const above = below + gridMm;
  const candidates: Array<{ w: number; distance: number }> = [];
  if (inBand(below)) candidates.push({ w: below, distance: exact - below });
  if (inBand(above)) candidates.push({ w: above, distance: above - exact });
  if (candidates.length === 0) return exact;
  candidates.sort((a, b) => a.distance - b.distance);
  return Math.round(candidates[0].w * 1000) / 1000;
}

/**
 * Derive the impedance-model geometry for a copper layer from the board's
 * resolved stackup geometry.
 *
 * Outer coppers become microstrips referenced through their adjacent
 * dielectric; inner coppers become symmetric striplines between the two
 * neighboring dielectrics (εr averaged).
 *
 * @returns The model inputs, or `null` for an unknown layer name.
 */
export function stackupImpedanceGeometry(geometry: IStackupGeometry, copperLayer: string): IImpedanceGeometry | null {
  const names = copperLayerNames(geometry.copperThicknessMm.length);
  const idx = names.indexOf(copperLayer);
  if (idx === -1) return null;

  const copperThicknessMm = geometry.copperThicknessMm[idx];
  const last = names.length - 1;

  if (idx === 0 || idx === last) {
    const d = geometry.dielectrics[idx === 0 ? 0 : geometry.dielectrics.length - 1];
    return {
      model: 'microstrip',
      copperThicknessMm,
      epsilonR: d.epsilonR,
      hMm: d.thicknessMm,
    };
  }

  const above = geometry.dielectrics[idx - 1];
  const below = geometry.dielectrics[idx];
  return {
    model: 'stripline',
    copperThicknessMm,
    epsilonR: (above.epsilonR + below.epsilonR) / 2,
    bMm: above.thicknessMm + copperThicknessMm + below.thicknessMm,
  };
}
