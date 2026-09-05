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

  return;
}
