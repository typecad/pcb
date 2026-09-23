// ---------------------------------------------------------------------------
// Route provenance summary for the board viewer's Layout view.
//
// The gerbers carry each trace's net but not WHO built it: a net routed by
// the autorouter (`pcb.route(net)`) looks identical to one hand-drawn with a
// standalone TrackBuilder. This writes the distinction to
// `build/<board>_routes.json` on every board write — per net, 'manual'
// (TrackBuilder), 'auto' (autorouter), or 'mixed' (both contributed). The
// viewer pipeline auto-discovers it beside the netlist, exactly like the
// operating point (`<board>_op.json`) and stackup (`<board>_stackup.json`).
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import logger from '../utils/logging.js';
import { getBuildDir } from '../utils/constants.js';
import type { PCB } from './pcb.js';

export type RouteProvenance = 'manual' | 'auto' | 'mixed';

/** The routes shape the viewer consumes (a `#routes` JSON island). */
export interface RoutesSummary {
  /** net name (as the gerbers' X2 %TO.N carries it) → provenance */
  nets: Record<string, { provenance: RouteProvenance }>;
  /** netless hand routes: declaration site + polyline (board mm, y-down) so
   *  trace probing can resolve a double-click to its `new TrackBuilder` line */
  unnamed?: Array<{ source: string; pts: Array<{ x: number; y: number }> }>;
}

/**
 * Compute + serialize the per-net route provenance. `manualNets` are the
 * nets of the TrackBuilder items passed to `create()`/`add()`; the PCB also
 * records every net handed to `route()`. Never throws.
 */
export function writeRoutes(
  pcb: PCB,
  manualNets: Iterable<string>,
  unnamedBuilders: Array<{ sourceSite?: string; points: Array<{ x: number; y: number }> }> = [],
): void {
  try {
    const nets: RoutesSummary['nets'] = {};
    for (const net of new Set(manualNets)) {
      if (!net) continue;
      nets[net] = { provenance: pcb.routedNetNames.has(net) ? 'mixed' : 'manual' };
    }
    for (const net of pcb.routedNetNames) {
      if (net && !nets[net]) nets[net] = { provenance: 'auto' };
    }
    const unnamed = unnamedBuilders
      .filter((b) => b.sourceSite && b.points.length >= 2)
      .map((b) => ({ source: b.sourceSite!, pts: b.points.map((pt) => ({ x: +pt.x.toFixed(3), y: +pt.y.toFixed(3) })) }));
    const outPath = path.join(getBuildDir(), `${pcb.boardName}_routes.json`);
    fs.mkdirSync(getBuildDir(), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ nets, unnamed } satisfies RoutesSummary, null, 2));
    logger.debug(`routes provenance written: ${outPath}`);
  } catch (error) {
    logger.warn(`could not write routes provenance: ${error instanceof Error ? error.message : String(error)}`);
  }
}
