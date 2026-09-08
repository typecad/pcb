import { NormalizedRoutingOptions } from './types.js';

/**
 * Common context describing where a clearance query is being evaluated.
 * Coordinates are expressed in grid units to avoid repeated conversions.
 */
export interface TraceClearanceContext {
  gridX: number;
  gridY: number;
  start?: { gridX: number; gridY: number };
  end?: { gridX: number; gridY: number };
}

export interface ClearanceProfileConfig {
  options: NormalizedRoutingOptions;
  /**
   * Diameter of a via used for clearance checks (mm).
   * Historically a constant but now configurable for consistency.
   */
  viaDiameter: number;
  /** Grid resolution (mm per cell). Needed for derived padding. */
  gridResolution: number;
}

/**
 * Central authority for every clearance calculation in the router.
 * All call sites should consume this helper rather than rolling their own
 * arithmetic so that design-rule tweaks happen in a single location.
 */
export class ClearanceProfile {
  private readonly traceClearance: number;
  private readonly traceRadius: number;
  private readonly viaClearance: number;
  private readonly viaDiameter: number;
  private readonly viaRadius: number;
  private readonly gridResolution: number;
  private readonly safetyPad: number;

  constructor(config: ClearanceProfileConfig) {
    this.traceClearance = Math.max(0, config.options.clearance);
    this.traceRadius = Math.max(0, config.options.traceWidth) / 2;
    this.viaClearance = Math.max(0, config.options.viaClearance ?? config.options.clearance);
    this.viaDiameter = Math.max(0, config.viaDiameter);
    this.viaRadius = this.viaDiameter / 2;
    this.gridResolution = config.gridResolution;
    this.safetyPad = Math.max(0.1, this.gridResolution);
  }

  /**
   * Minimum spacing used when probing occupancy for trace movement:
   * the design-rule clearance PLUS the new trace's own half-width, since
   * occupancy checks measure centerline-to-centerline distance and the
   * trace's copper extends `traceWidth / 2` beyond its centerline.
   * Context is currently unused but retained for future adaptive logic.
   */
  public getTraceClearance(_context?: TraceClearanceContext): number {
    return this.traceClearance + this.traceRadius;
  }

  /**
   * Keepout radius for placing vias, accounting for the physical via radius,
   * desired clearance, and a grid-resolution-sized safety pad.
   */
  public getViaKeepoutRadius(): number {
    return this.viaRadius + this.viaClearance + this.safetyPad;
  }

  /** Clearance radius for pad adjacency checks when routing traces. */
  public getPadClearanceRadius(): number {
    return this.traceClearance;
  }

  /** Expose via diameter so path-length heuristics stay consistent. */
  public getViaDiameter(): number {
    return this.viaDiameter;
  }
}
