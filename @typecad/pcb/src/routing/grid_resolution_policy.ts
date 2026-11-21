export interface GridConfigurationContext {
  /** User-requested grid resolution (mm) before any policy adjustment. Example: 0.2 */
  requestedResolution: number;
  /** Default grid resolution (mm) supplied by host if user did not request one. Example: 0.25 */
  defaultResolution: number;
  pads: {
    /** Optional component reference for context (e.g., 'U1'). */
    componentRef?: string;
    /** Pad size in mm. Example: { width: 0.5, height: 0.3 } */
    size: { width: number; height: number };
    type: 'smd' | 'thru_hole' | 'np_thru_hole' | 'connect';
    /** Layers this pad appears on. Example: ['F.Cu', 'F.Mask'] */
    layers: string[];
  }[];
  /** Trace width (mm) of the route being planned, when known. */
  traceWidth?: number;
  /** Clearance (mm) of the route being planned, when known. */
  clearance?: number;
}

export interface GridConfigurationResult {
  gridResolution?: number;
  reason?: string;
}

/**
 * Plugin-side grid resolution policy.
 * Mirrors the legacy host behavior: if fine-pitch pads are present and the
 * requested grid is coarser than 0.1mm, clamp to 0.1mm for escape routing.
 */
export function configureGridResolution(context: GridConfigurationContext): GridConfigurationResult | void {
  if (!context || !Array.isArray(context.pads)) {
    return;
  }

  const userSpecifiedGrid = context.requestedResolution !== context.defaultResolution;
  let hasFinePitch = false;
  let minPadSize = Infinity;

  for (const pad of context.pads) {
    const padMin = Math.min(pad.size.width, pad.size.height);
    minPadSize = Math.min(minPadSize, padMin);
    if (padMin <= 0.6) {
      hasFinePitch = true;
      break;
    }
  }

  if (!userSpecifiedGrid && hasFinePitch && context.requestedResolution > 0.1) {
    return {
      gridResolution: 0.1,
      reason: `Fine-pitch pads detected (min ${minPadSize.toFixed(3)}mm); clamping grid to 0.1mm`,
    };
  }

  // Coarse geometry: when every feature is large (wide traces, wide
  // clearance, big pads), a 0.1mm grid just multiplies the search space —
  // 5mm traces on a 100mm board meant a 1000x1000 grid and minute-long
  // searches that timed out. Use a quarter of the smallest feature, capped
  // at 1mm. The caller widens the clearance buffer to cover the coarser
  // rasterization (see autoroute §11).
  if (!userSpecifiedGrid && !hasFinePitch && context.traceWidth && context.clearance) {
    const smallest = Math.min(context.traceWidth, context.clearance, minPadSize);
    const coarse = Math.min(1, Math.floor((smallest / 4) * 100) / 100);
    if (coarse > context.requestedResolution + 1e-9) {
      return {
        gridResolution: coarse,
        reason: `Coarse geometry (smallest feature ${smallest.toFixed(2)}mm); grid ${coarse}mm`,
      };
    }
  }

  return;
}
