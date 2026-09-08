import { Component } from '../../component.js';
import { PCB, getPcbState } from '../../pcb/pcb.js';
import { IFilledZone, IKeepoutZone, IGrLine, IOutline } from '../../pcb/pcb_interfaces.js';
import { IRoutingObstacle } from './routing_grid.js';
import { PadResolver, IPadGeometry } from './pad_resolver.js';
import { displayName } from '../../utils/error_reporter.js';
import chalk from 'chalk';
import logger from '../../utils/logging.js';

/**
 * Builds routing obstacles from PCB elements.
 * Converts components, pads, zones, and other PCB features into obstacle representations
 * for the routing grid.
 */
export class ObstacleBuilder {
  /**
   * Build all obstacles from a PCB instance.
   *
   * @param pcb - The PCB to extract obstacles from
   * @param defaultClearance - Default clearance for obstacles in mm
   * @param additionalComponents - Additional components to include (e.g., from pins being routed)
   * @returns Array of routing obstacles
   *
   * @example
   * ```ts
   * const obstacles = ObstacleBuilder.buildFromPCB(pcb, 0.2);
   * obstacles.forEach(obs => grid.addObstacle(obs));
   * ```
   */
  static buildFromPCB(
    pcb: PCB,
    defaultClearance: number = 0.2,
    additionalComponents?: Component[],
    debug: boolean = false,
    pinNetMap?: Map<string, string>,
  ): IRoutingObstacle[] {
    const obstacles: IRoutingObstacle[] = [];
    const state = getPcbState(pcb);

    if (debug) {
      logger.debug(chalk.blue(`[ObstacleBuilder] Building obstacles from PCB`));
    }

    // Dedupe: the host passes every schematic component (state.components
    // already contains most of them) — rasterizing duplicates is pure waste.
    const componentSet = new Set<Component>();
    if (state.components) {
      state.components.forEach((c) => componentSet.add(c));
    }
    if (state.stagedComponents) {
      state.stagedComponents.forEach((c) => componentSet.add(c));
    }
    if (additionalComponents) {
      additionalComponents.forEach((c) => componentSet.add(c));
    }
    const allComponents = Array.from(componentSet);

    if (allComponents.length > 0) {
      if (debug) {
        logger.debug(
          chalk.blue(
            `[ObstacleBuilder] Processing ${allComponents.length} unique components (${state.components?.length || 0} active, ${state.stagedComponents?.length || 0} staged, ${additionalComponents?.length || 0} from pins)`,
          ),
        );
      }

      let failedComponents = 0;
      const failedRefs: string[] = [];

      for (const component of allComponents) {
        if (component.dnp) {
          continue; // Skip DNP components
        }

        // Treat placed vias as circular pad obstacles so traces respect via-to-trace clearance
        if (component.via === true && component.viaData) {
          try {
            const viaObs = this.buildFromVia(component, defaultClearance, pcb.copperLayers);
            if (viaObs) {
              obstacles.push(viaObs);
            }
            continue; // Via handled, skip normal component pad processing
          } catch (e: unknown) {
            logger.warn(
              chalk.yellow(
                `[ObstacleBuilder] Error processing via obstacle: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
            continue;
          }
        }

        try {
          // Add pad obstacles with net-aware collision detection
          // Pads block routes on different nets but not on same net
          const padObstacles = this.buildFromComponentPads(component, defaultClearance, pcb, debug, pinNetMap);
          obstacles.push(...padObstacles);
        } catch (error: unknown) {
          failedComponents++;
          failedRefs.push(component.reference);
          logger.warn(
            chalk.yellow(
              `[ObstacleBuilder] Error processing component ${displayName(component)}: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      }

      if (failedComponents > 0) {
        logger.warn(
          chalk.yellow(
            `[ObstacleBuilder] Failed to process ${failedComponents}/${allComponents.length} components: ${failedRefs.join(', ')}`,
          ),
        );
      }
    } else {
      if (debug) {
        logger.debug(chalk.yellow(`[ObstacleBuilder] No components found in PCB`));
      }
    }

    // Add zones
    const zones = state.zones;
    if (zones) {
      if (debug) {
        logger.debug(chalk.blue(`[ObstacleBuilder] Processing ${zones.length} filled zones`));
      }
      for (const zone of zones) {
        const zoneObstacle = this.buildFromZone(zone);
        if (zoneObstacle) {
          obstacles.push(zoneObstacle);
        }
      }
    }

    // Add keepout zones
    const keepoutZones = state.keepoutZones;
    if (keepoutZones) {
      if (debug) {
        logger.debug(chalk.blue(`[ObstacleBuilder] Processing ${keepoutZones.length} keepout zones`));
      }
      for (const keepout of keepoutZones) {
        const keepoutObstacle = this.buildFromKeepoutZone(keepout);
        if (keepoutObstacle) {
          obstacles.push(keepoutObstacle);
        }
      }
    }

    // Add board outlines as keepout
    const outlines = pcb.outlines as IOutline[];
    if (outlines && outlines.length > 0) {
      if (debug) {
        logger.debug(chalk.blue(`[ObstacleBuilder] Processing ${outlines.length} board outlines`));
      }
      for (const outline of outlines) {
        const outlineObstacle = this.buildFromOutline(outline, defaultClearance, pcb.copperLayers);
        if (outlineObstacle) {
          obstacles.push(outlineObstacle);
        }
      }
    }

    // Add existing tracks as obstacles (from committed tracks)
    const grLines = state.grLines;
    if (grLines && grLines.length > 0) {
      if (debug) {
        logger.debug(chalk.blue(`[ObstacleBuilder] Processing ${grLines.length} committed tracks`));
      }
      for (const line of grLines) {
        // Only process copper layer tracks
        if (line.layer.endsWith('.Cu')) {
          // Preserve net info so same-net routes can branch/merge correctly
          const trackObstacle = this.buildFromTrack(line, line.strokeWidth, defaultClearance, line.net);
          obstacles.push(trackObstacle);
        }
      }
    }

    // Add staged tracks as obstacles (tracks created but not yet committed via create())
    const stagedOutlines = state.stagedOutlines;
    if (stagedOutlines && stagedOutlines.length > 0) {
      let stagedTrackCount = 0;
      for (const outline of stagedOutlines) {
        if (outline.elements) {
          for (const element of outline.elements) {
            if (element.type === 'line' && element.layer.endsWith('.Cu')) {
              const line = element as IGrLine;
              const trackObstacle = this.buildFromTrack(line, line.strokeWidth, defaultClearance, line.net);
              obstacles.push(trackObstacle);
              stagedTrackCount++;
            }
          }
        }
      }
      if (stagedTrackCount > 0) {
        if (debug) {
          logger.debug(
            chalk.blue(
              `[ObstacleBuilder] Added ${stagedTrackCount} staged track obstacles from previous autoroute calls`,
            ),
          );
        }
      }
    }

    if (debug) {
      logger.debug(chalk.green(`[ObstacleBuilder] Built ${obstacles.length} total obstacles`));
    }

    return obstacles;
  }

  /**
   * Build an obstacle from a component's body (courtyard).
   *
   * @param component - The component
   * @param clearance - Clearance around component in mm
   * @returns Component body obstacle, or null if unable to determine bounds
   */
  static buildFromComponent(component: Component, clearance: number): IRoutingObstacle | null {
    try {
      // Parse footprint to get courtyard bounds
      const footprintSExpr = component.footprint_lib(component.footprint);
      PadResolver.getAllPadGeometries(component);

      const bounds = this.extractComponentBounds(null, component);

      if (!bounds) {
        // Fallback: use simple bounding box estimate
        return this.buildSimpleComponentObstacle(component, clearance);
      }

      // Determine which layer the component is on
      const layer = component.pcb.side === 'back' ? 'B.Cu' : 'F.Cu';

      return {
        type: 'component',
        bounds,
        layers: [layer],
        clearance,
        priority: 1,
      };
    } catch (error: unknown) {
      logger.warn(
        chalk.yellow(
          `[ObstacleBuilder] Could not build obstacle for ${displayName(component)}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return this.buildSimpleComponentObstacle(component, clearance);
    }
  }

  /**
   * Build obstacles from a component's pads.
   *
   * @param component - The component
   * @param clearance - Clearance around pads in mm
   * @param pcb - PCB instance to resolve nets
   * @returns Array of pad obstacles
   */
  static buildFromComponentPads(
    component: Component,
    clearance: number,
    pcb: PCB,
    debug: boolean = false,
    sharedPinNetMap?: Map<string, string>,
  ): IRoutingObstacle[] {
    const obstacles: IRoutingObstacle[] = [];

    const pads = PadResolver.getAllPadGeometries(component, pcb.copperLayers);

    // Reuse the host's pin→net map when provided (built once per autoroute
    // call); otherwise build it from the schematic for this invocation.
    let pinNetMap = sharedPinNetMap ?? null;
    if (!pinNetMap) {
      const schematic = pcb.schematic;
      if (schematic && Array.isArray(schematic.nodes)) {
        pinNetMap = new Map<string, string>();
        for (const schematicNode of schematic.nodes) {
          const netName = schematicNode?.name as string | undefined;
          const nodes = schematicNode?.nodes as Array<{ reference: string; number: string | number }> | undefined;
          if (!netName || !Array.isArray(nodes)) continue;
          for (const p of nodes) {
            const key = `${p.reference}:${String(p.number)}`;
            if (!pinNetMap.has(key)) {
              pinNetMap.set(key, netName);
            }
          }
        }
      }
    }

    for (const pad of pads) {
      // Resolve net for this pad from precomputed map
      let netName: string | undefined;
      if (pinNetMap) {
        netName = pinNetMap.get(`${component.reference}:${String(pad.number)}`);
      }

      // Log pad info for debugging
      const layerInfo = pad.type === 'thru_hole' ? `all layers (${pad.layers.join(', ')})` : pad.layer;
      if (debug) {
        // Only print pad-level debug info when TYPECAD_DEBUG is enabled and not in QUIET mode
        if (process.env.TYPECAD_DEBUG === '1' && process.env.TYPECAD_QUIET !== '1') {
          logger.debug(
            chalk.gray(
              `[ObstacleBuilder]   Pad ${component.reference}.${pad.number}: ${pad.type} on ${layerInfo}, net: ${netName || 'none'}`,
            ),
          );
        }
      }

      // Always create obstacles for pads, even without nets (unconnected pads still block routing)
      const obstacle = this.buildFromPad(pad, clearance, netName);
      if (obstacle) {
        obstacles.push(obstacle);
      }
    }

    return obstacles;
  }

  /**
   * Build an obstacle from a pad geometry.
   * @private
   */
  private static buildFromPad(pad: IPadGeometry, clearance: number, net?: string): IRoutingObstacle | null {
    // Calculate bounding box based on pad shape
    let halfWidth = pad.size.width / 2;
    let halfHeight = pad.size.height / 2;

    // For rotated pads, calculate axis-aligned bounding box
    if (pad.rotation !== 0) {
      const rotRad = (pad.rotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rotRad));
      const sin = Math.abs(Math.sin(rotRad));
      halfWidth = (pad.size.width * cos + pad.size.height * sin) / 2;
      halfHeight = (pad.size.width * sin + pad.size.height * cos) / 2;
    }

    // For fine-pitch components, use reduced obstacle size to enable pin escape routing
    // QFN pins typically need 0.25mm clearance for escape, which is tighter than standard clearance
    const isFinePitch = pad.size.width <= 0.6 || pad.size.height <= 0.6;
    const clearanceReduction = isFinePitch ? 0.08 : 0; // Increased reduction for QFN middle pins

    // Special handling for very small QFN pins to create escape channels
    let adjustedHalfWidth = halfWidth;
    let adjustedHalfHeight = halfHeight;

    if (isFinePitch) {
      // For rectangular fine-pitch pins, reduce the dimension that creates the bottleneck
      if (pad.size.width < pad.size.height) {
        // Horizontal pin - reduce width more to allow vertical escape
        adjustedHalfWidth = Math.max(0.08, halfWidth - clearanceReduction);
        adjustedHalfHeight = Math.max(0.1, halfHeight - clearanceReduction * 0.5);
      } else {
        // Vertical pin - reduce height more to allow horizontal escape
        adjustedHalfWidth = Math.max(0.1, halfWidth - clearanceReduction * 0.5);
        adjustedHalfHeight = Math.max(0.08, halfHeight - clearanceReduction);
      }
    }

    const expandedHalfWidth = adjustedHalfWidth;
    const expandedHalfHeight = adjustedHalfHeight;

    // For through-hole pads, use all layers they exist on (typically all copper layers)
    // For SMD pads, use only the specific layer(s) they're on
    const layers = pad.layers && pad.layers.length > 0 ? pad.layers : [pad.layer];

    return {
      type: 'pad',
      bounds: {
        minX: pad.center.x - expandedHalfWidth,
        maxX: pad.center.x + expandedHalfWidth,
        minY: pad.center.y - expandedHalfHeight,
        maxY: pad.center.y + expandedHalfHeight,
      },
      layers, // Use all layers for through-hole pads
      clearance,
      net, // Net-aware: obstacles on same net don't block
      priority: 2, // Higher priority than component body
      padShape: {
        shape: pad.shape === 'custom' ? 'rect' : pad.shape,
        center: { x: pad.center.x, y: pad.center.y },
        width: pad.size.width,
        height: pad.size.height,
        rotation: pad.rotation || 0,
      },
    };
  }

  /**
   * Build an obstacle from a filled zone.
   *
   * @param zone - The filled zone
   * @returns Zone obstacle, or null if invalid
   */
  static buildFromZone(zone: IFilledZone): IRoutingObstacle | null {
    if (!zone.polygon || zone.polygon.length === 0) {
      return null;
    }

    // Calculate bounding box from polygon
    const bounds = this.calculatePolygonBounds(zone.polygon);

    return {
      type: 'zone',
      bounds,
      layers: zone.layers,
      net: zone.net,
      clearance: zone.clearance || 0.2,
      priority: 0, // Lower priority - zones can often be routed over
      polygon: { points: zone.polygon },
    };
  }

  /**
   * Build an obstacle from a keepout zone.
   *
   * @param zone - The keepout zone
   * @returns Keepout obstacle, or null if tracks are allowed
   */
  static buildFromKeepoutZone(zone: IKeepoutZone): IRoutingObstacle | null {
    // Check if tracks are restricted in this keepout
    if (zone.restrictions?.tracks === false) {
      return null; // Tracks are allowed, no obstacle
    }

    if (!zone.polygon || zone.polygon.length === 0) {
      return null;
    }

    const bounds = this.calculatePolygonBounds(zone.polygon);

    return {
      type: 'keepout',
      bounds,
      layers: zone.layers,
      clearance: 0, // Keepout zones are absolute
      priority: 10, // Very high priority - absolute no-go zones
      polygon: { points: zone.polygon },
    };
  }

  /**
   * Build an obstacle from a track.
   *
   * @param track - The track (IGrLine)
   * @param width - Track width in mm
   * @param clearance - Clearance around track in mm
   * @param net - Net name for net-aware routing (optional)
   * @returns Track obstacle
   */
  static buildFromTrack(
    track: IGrLine,
    width: number,
    clearance: number,
    net?: string,
    isManualRoute?: boolean,
  ): IRoutingObstacle {
    // Improved bounding box calculation for angled tracks
    // Instead of just using endpoints with width/2 expansion, calculate the actual perpendicular expansion
    const dx = track.end.x - track.start.x;
    const dy = track.end.y - track.start.y;
    const length = Math.hypot(dx, dy);

    // Calculate perpendicular offset for track width/2 only (clearance handled by routing grid)
    const totalRadius = width / 2;

    if (length === 0) {
      // Degenerate case: point track
      return {
        type: 'track',
        bounds: {
          minX: track.start.x - totalRadius,
          maxX: track.start.x + totalRadius,
          minY: track.start.y - totalRadius,
          maxY: track.start.y + totalRadius,
        },
        layers: [track.layer],
        clearance,
        net,
        priority: 1,
        isManualRoute,
        segment: { x1: track.start.x, y1: track.start.y, x2: track.end.x, y2: track.end.y, width },
      };
    }

    // Calculate unit perpendicular vector
    const perpX = -dy / length;
    const perpY = dx / length;

    // Calculate the four corners of the expanded track rectangle
    const corners = [
      {
        x: track.start.x + perpX * totalRadius,
        y: track.start.y + perpY * totalRadius,
      },
      {
        x: track.start.x - perpX * totalRadius,
        y: track.start.y - perpY * totalRadius,
      },
      {
        x: track.end.x + perpX * totalRadius,
        y: track.end.y + perpY * totalRadius,
      },
      {
        x: track.end.x - perpX * totalRadius,
        y: track.end.y - perpY * totalRadius,
      },
    ];

    // Calculate tight bounding box from the expanded corners
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));

    return {
      type: 'track',
      bounds: { minX, maxX, minY, maxY },
      layers: [track.layer],
      clearance,
      net, // Net-aware: tracks on same net don't block (unless isManualRoute is true)
      priority: 1,
      isManualRoute, // Manual routes block even on same net
      segment: { x1: track.start.x, y1: track.start.y, x2: track.end.x, y2: track.end.y, width },
    };
  }

  /**
   * Build an obstacle from a board outline.
   *
   * @param outline - The board outline
   * @param clearance - Clearance from outline in mm
   * @returns Outline obstacle (everything outside the outline is blocked)
   */
  /**
   * Build an obstacle from a board outline (board edge keepout).
   * @param outline - The outline element
   * @param clearance - Clearance around the outline in mm
   * @param boardCopperLayers - The board's copper layers; the outline
   *   blocks routing on all of them (defaults to outer layers)
   */
  static buildFromOutline(
    outline: IOutline,
    clearance: number,
    boardCopperLayers?: readonly string[],
  ): IRoutingObstacle | null {
    // For now, treat outline as a simple bounding box keepout
    // TODO: Implement proper polygon-based outline handling

    return {
      type: 'outline',
      bounds: {
        minX: outline.x,
        maxX: outline.x + outline.width,
        minY: outline.y,
        maxY: outline.y + outline.height,
      },
      layers: boardCopperLayers && boardCopperLayers.length > 0 ? [...boardCopperLayers] : ['F.Cu', 'B.Cu'], // Affects all copper layers
      clearance,
      priority: 10, // Very high priority
    };
  }

  /**
   * Build an obstacle from a plated through via component.
   * Represent as a circular pad on all copper layers to enforce
   * trace-to-via clearances during routing.
   *
   * @param component - The via component
   * @param clearance - Clearance around the via in mm
   * @param boardCopperLayers - The board's copper layers, top to bottom.
   *   The via's physical span (endpoint layers through every layer between
   *   them) blocks routing; a through via blocks all layers.
   */
  private static buildFromVia(
    component: Component,
    clearance: number,
    boardCopperLayers?: readonly string[],
  ): IRoutingObstacle | null {
    const vd = component?.viaData;
    if (!vd || typeof vd.at?.x !== 'number' || typeof vd.at?.y !== 'number') {
      return null;
    }
    const size = typeof vd.size === 'number' ? vd.size : 0.6; // default via size
    const center = { x: vd.at.x, y: vd.at.y };
    const half = size / 2;

    // A via's barrel spans every board layer between its two endpoint
    // layers (a through via spans them all). Expand the endpoint pair to
    // the full physical span so inner-layer traces keep clearance too.
    let layers: string[];
    const spanLayers = Array.isArray(vd.layers) && vd.layers.length > 0 ? vd.layers : [];
    if (boardCopperLayers && boardCopperLayers.length > 0) {
      const startIdx = spanLayers.length > 0 ? boardCopperLayers.indexOf(spanLayers[0]) : -1;
      const endIdx = spanLayers.length > 0 ? boardCopperLayers.indexOf(spanLayers[spanLayers.length - 1]) : -1;
      if (startIdx !== -1 && endIdx !== -1) {
        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);
        layers = boardCopperLayers.slice(lo, hi + 1);
      } else {
        // Unknown or wildcard span: conservatively block all layers
        layers = [...boardCopperLayers];
      }
    } else {
      layers = spanLayers.length > 0 ? spanLayers : ['F.Cu', 'B.Cu'];
    }

    return {
      type: 'pad',
      bounds: {
        minX: center.x - half,
        maxX: center.x + half,
        minY: center.y - half,
        maxY: center.y + half,
      },
      layers,
      clearance,
      priority: 1,
      padShape: {
        shape: 'circle',
        center,
        width: size,
        height: size,
        rotation: 0,
      },
    };
  }

  /**
   * Extract component bounds from footprint S-expression.
   * Looks for courtyard or fabrication layer bounds.
   * @private
   */
  private static extractComponentBounds(
    footprintSExpr: unknown,
    component: Component,
  ): { minX: number; maxX: number; minY: number; maxY: number } | null {
    // This is a simplified version - real implementation would parse
    // courtyard polygons from the footprint

    // For MVP, we'll use a simple approach: get all pads and create bounding box
    const pads = PadResolver.getAllPadGeometries(component);

    if (pads.length === 0) {
      return null;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const pad of pads) {
      const halfWidth = pad.size.width / 2;
      const halfHeight = pad.size.height / 2;

      minX = Math.min(minX, pad.center.x - halfWidth);
      maxX = Math.max(maxX, pad.center.x + halfWidth);
      minY = Math.min(minY, pad.center.y - halfHeight);
      maxY = Math.max(maxY, pad.center.y + halfHeight);
    }

    // Expand bounds slightly to include component body
    const expansion = 1.0; // 1mm expansion around pads
    return {
      minX: minX - expansion,
      maxX: maxX + expansion,
      minY: minY - expansion,
      maxY: maxY + expansion,
    };
  }

  /**
   * Build a simple component obstacle using estimated dimensions.
   * @private
   */
  private static buildSimpleComponentObstacle(component: Component, clearance: number): IRoutingObstacle | null {
    // Estimate component size as 5mm x 5mm for unknown footprints
    const estimatedSize = 5.0;
    const layer = component.pcb.side === 'back' ? 'B.Cu' : 'F.Cu';

    return {
      type: 'component',
      bounds: {
        minX: component.pcb.x - estimatedSize / 2,
        maxX: component.pcb.x + estimatedSize / 2,
        minY: component.pcb.y - estimatedSize / 2,
        maxY: component.pcb.y + estimatedSize / 2,
      },
      layers: [layer],
      clearance,
      priority: 1,
    };
  }

  /**
   * Calculate bounding box from a polygon.
   * @private
   */
  private static calculatePolygonBounds(polygon: { x: number; y: number }[]): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const point of polygon) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    return { minX, maxX, minY, maxY };
  }
}
