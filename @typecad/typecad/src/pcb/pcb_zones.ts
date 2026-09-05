import logger from '../utils/logging.js';
import { IFilledZone, IKeepoutZone, IOutline, OutlineElement } from './pcb_interfaces.js';
import type { IZoneFillOptions, IBoundsLike } from './pcb_interfaces.js';
import type { PcbInternalState } from './pcb_state.js';
import { generateUuid, formatCallSite } from './pcb_utils.js';
import { Pin } from '../pin.js';
import { getCallSite } from '../utils/stack_trace.js';
import { BoardCreationError } from '../utils/errors.js';

/** Expand a bounds-like rectangle ({left,top,...} or {x,y,...}) to x/y/width/height. */
function boundsToRect(bounds: IBoundsLike): { x: number; y: number; width: number; height: number } {
  if ('left' in bounds && 'top' in bounds) {
    return { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
  }
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

/**
 * PCB Zone Management Module
 *
 * This module contains standalone functions for managing copper zones, keepout zones,
 * and staged outlines. These functions were extracted from the main PCB class to provide
 * better modularity and reusability.
 */

/**
 * Creates a filled zone on copper layers connected to a specific net.
 * @param pcb - The PCB instance to add the zone to
 * @param options - Zone configuration options
 * @param options.pin - The pin object to connect this zone to (determines the net). Use either pin or net, not both.
 * @param options.net - The net name to connect this zone to (e.g., 'GND', 'VCC'). Use either pin or net, not both.
 * @param options.layers - Array of layer names (e.g., ['F.Cu', 'B.Cu'])
 * @param options.x - The x-coordinate of the zone's starting corner
 * @param options.y - The y-coordinate of the zone's starting corner
 * @param options.width - The width of the zone
 * @param options.height - The height of the zone
 * @param options.fillMode - Fill mode: 'solid' (default) or 'hatched'
 * @param options.filled - Whether zone should be filled (default: true)
 * @param options.priority - Zone priority (default: 0)
 * @param options.locked - Lock zone to prevent editing (default: false)
 * @param options.name - Optional zone name
 * @param options.minThickness - Minimum thickness (default: 0.1778mm)
 * @param options.clearance - Clearance from pads (default: 0.2mm)
 * @param options.connectPads - Pad connection type (default: thermal relief)
 * @param options.thermalGap - Thermal relief gap (default: 0.254mm)
 * @param options.thermalBridgeWidth - Thermal bridge width (default: 0.4064mm)
 * @param options.hatchStyle - Hatch style for zone outline: 'none', 'edge' (default), or 'full'
 * @param options.hatchPitch - Hatch pitch/spacing (default: 0.508mm)
 * @param options.smoothing - Corner smoothing: 'chamfer', 'fillet', or 'none' (default)
 * @param options.smoothingRadius - Radius for corner smoothing (required if smoothing is set)
 * @param options.islandRemovalMode - Island removal mode (default: 2)
 * @param options.islandAreaMin - Minimum island area (default: 0.5)
 * @param options.hatchThickness - Hatch thickness
 * @param options.hatchGap - Hatch gap
 * @param options.hatchOrientation - Hatch orientation
 * @param options.hatchSmoothingLevel - Hatch smoothing level
 * @param options.hatchSmoothingValue - Hatch smoothing value
 * @param options.hatchBorderAlgorithm - Hatch border algorithm
 * @param options.hatchMinHoleArea - Hatch minimum hole area
 * @param options.fillArcSegments - Fill arc segments (default: 16)
 * @param options.filledAreasThickness - Whether filled areas have thickness
 * @example
 * ```ts
 * // Basic ground plane
 * pcb.zone({
 *   net: 'GND',
 *   layers: ['F.Cu', 'B.Cu'],
 *   x: 0, y: 0,
 *   width: 50, height: 50
 * });
 *
 * // Zone connected to specific pin
 * pcb.zone({
 *   pin: pcb.components[0].pins[0],
 *   layers: ['F.Cu'],
 *   x: 10, y: 10,
 *   width: 20, height: 20,
 *   clearance: 0.25,
 *   thermalGap: 0.3,
 *   thermalBridgeWidth: 0.5
 * });
 *
 * // Hatched fill zone
 * pcb.zone({
 *   net: 'VCC',
 *   layers: ['F.Cu'],
 *   x: 0, y: 0,
 *   width: 40, height: 40,
 *   fillMode: 'hatched',
 *   hatchStyle: 'edge',
 *   hatchPitch: 0.5
 * });
 * ```
 */
export function zone(
  state: PcbInternalState,
  options: {
    // Net attachment: `pin` XOR `net`; neither = unconnected pour (net 0)
    pin?: Pin;
    net?: string;

    // Geometry: an explicit polygon (points, >= 3 vertices), a bounds
    // rectangle (bounds), or explicit x/y/width/height
    layers: string[];
    points?: Array<{ x: number; y: number }>;
    bounds?: IBoundsLike;
    x?: number;
    y?: number;
    width?: number;
    height?: number;

    // Grouped fill settings (KiCad's (fill ...) block); `false` = unfilled
    fill?: IZoneFillOptions | false;

    // Basic zone settings
    fillMode?: 'solid' | 'hatched';
    filled?: boolean;
    priority?: number;
    locked?: boolean;
    name?: string;
    minThickness?: number;

    // Hatch display settings (for zone outline)
    hatchStyle?: 'none' | 'edge' | 'full';
    hatchPitch?: number;

    // Pad connection settings
    clearance?: number;
    connectPads?: 'thru_hole_only' | 'full' | 'no';

    // Thermal relief settings
    thermalGap?: number;
    thermalBridgeWidth?: number;

    // Corner smoothing
    smoothing?: 'chamfer' | 'fillet' | 'none';
    smoothingRadius?: number;

    // Island removal
    islandRemovalMode?: number;
    islandAreaMin?: number;

    // Hatched fill options
    hatchThickness?: number;
    /** Alias of hatchThickness — KiCad's zone dialog labels it "Hatch width". */
    hatchWidth?: number;
    hatchGap?: number;
    hatchOrientation?: number;
    hatchSmoothingLevel?: number;
    hatchSmoothingValue?: number;
    hatchBorderAlgorithm?: 'hatch_thickness' | 'min_thickness';
    hatchMinHoleArea?: number;

    // Additional fill settings
    fillArcSegments?: number;
    filledAreasThickness?: boolean;
  },
): void {
  const {
    pin,
    net,
    layers,
    points,
    bounds,
    x,
    y,
    width,
    height,
    fill,
    fillMode,
    filled,
    priority = 0,
    locked = false,
    name,
    minThickness = 0.1778,
    hatchStyle = 'edge',
    hatchPitch = 0.508,
    clearance = 0.2,
    connectPads,
    thermalGap,
    thermalBridgeWidth,
    smoothing,
    smoothingRadius,
    islandRemovalMode,
    islandAreaMin,
    hatchThickness,
    hatchWidth, // alias of hatchThickness (KiCad dialog: "Hatch width")
    hatchGap,
    hatchOrientation,
    hatchSmoothingLevel,
    hatchSmoothingValue,
    hatchBorderAlgorithm,
    hatchMinHoleArea,
    fillArcSegments,
    filledAreasThickness,
  } = options;

  // Effective fill settings: the grouped `fill` object (KiCad's `(fill ...)`
  // block) wins over the flat options, which fall back to the defaults.
  // `fill: false` creates an unfilled zone outline.
  const fillSpec = fill === false ? undefined : fill;
  const pick = <T>(nested: T | undefined, flat: T | undefined, fallback: T): T =>
    nested !== undefined ? nested : flat !== undefined ? flat : fallback;
  const effFillMode = fillSpec?.mode ?? fillMode ?? 'solid';
  const effFilled = fill === false ? false : (filled ?? true);
  const effThermalGap = pick(fillSpec?.thermalGap, thermalGap, 0.254);
  const effThermalBridgeWidth = pick(fillSpec?.thermalBridgeWidth, thermalBridgeWidth, 0.4064);
  const effSmoothing = pick(fillSpec?.smoothing, smoothing, undefined);
  const effSmoothingRadius = pick(fillSpec?.smoothingRadius, smoothingRadius, undefined);
  const effIslandRemovalMode = pick(fillSpec?.islandRemovalMode, islandRemovalMode, 2);
  const effIslandAreaMin = pick(fillSpec?.islandAreaMin, islandAreaMin, undefined);
  const effFillArcSegments = pick(fillSpec?.arcSegments, fillArcSegments, 16);
  // hatchWidth is the KiCad-dialog alias of hatchThickness; the file-token
  // name wins when both are given at the same level.
  const effHatchThickness = pick(
    fillSpec?.hatchThickness ?? fillSpec?.hatchWidth,
    hatchThickness ?? hatchWidth,
    undefined,
  );
  const effHatchGap = pick(fillSpec?.hatchGap, hatchGap, undefined);
  const effHatchOrientation = pick(fillSpec?.hatchOrientation, hatchOrientation, undefined);
  const effHatchSmoothingLevel = pick(fillSpec?.hatchSmoothingLevel, hatchSmoothingLevel, undefined);
  const effHatchSmoothingValue = pick(fillSpec?.hatchSmoothingValue, hatchSmoothingValue, undefined);
  const effHatchBorderAlgorithm = pick(fillSpec?.hatchBorderAlgorithm, hatchBorderAlgorithm, undefined);
  const effHatchMinHoleArea = pick(fillSpec?.hatchMinHoleArea, hatchMinHoleArea, undefined);

  // Net attachment: `pin` and `net` are mutually exclusive; neither means an
  // unconnected pour (KiCad net 0) — used e.g. when importing boards.
  if (pin && net) {
    logger.error(
      `[PCB ZONE] ERROR: Cannot provide both 'pin' and 'net' parameters. Use one or the other${formatCallSite(getCallSite())}`,
    );
    return;
  }

  // Geometry: a bounds rectangle (e.g. pcb.board), an explicit polygon
  // (points), or explicit x/y/width/height. Bounds expand to the rect form
  // first; the bounding box of any form fills x/y/width/height so obstacle
  // building and outline math work identically.
  let rectX = x;
  let rectY = y;
  let rectW = width;
  let rectH = height;
  if (bounds !== undefined) {
    if (x !== undefined || y !== undefined || width !== undefined || height !== undefined) {
      logger.error(
        `[PCB ZONE] ERROR: Provide 'bounds', 'points', or (x, y, width, height) — not combinations${formatCallSite(getCallSite())}`,
      );
      return;
    }
    const r = boundsToRect(bounds);
    rectX = r.x;
    rectY = r.y;
    rectW = r.width;
    rectH = r.height;
  }
  let polygon: Array<{ x: number; y: number }>;
  if (points !== undefined) {
    if (
      !Array.isArray(points) ||
      points.length < 3 ||
      points.some((p) => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))
    ) {
      logger.error(
        `[PCB ZONE] ERROR: 'points' must be an array of at least 3 finite {x, y} vertices${formatCallSite(getCallSite())}`,
      );
      return;
    }
    if (bounds !== undefined || x !== undefined || y !== undefined || width !== undefined || height !== undefined) {
      logger.error(
        `[PCB ZONE] ERROR: Provide 'bounds', 'points', or (x, y, width, height) — not combinations${formatCallSite(getCallSite())}`,
      );
      return;
    }
    polygon = points.map((p) => ({ x: p.x, y: p.y }));
  } else if (rectX !== undefined && rectY !== undefined && rectW !== undefined && rectH !== undefined) {
    polygon = [
      { x: rectX, y: rectY },
      { x: rectX + rectW, y: rectY },
      { x: rectX + rectW, y: rectY + rectH },
      { x: rectX, y: rectY + rectH },
    ];
  } else {
    logger.error(
      `[PCB ZONE] ERROR: Zone geometry requires 'bounds', 'points' (>= 3 vertices), or all of x, y, width, height${formatCallSite(getCallSite())}`,
    );
    return;
  }
  const boundsX = Math.min(...polygon.map((p) => p.x));
  const boundsY = Math.min(...polygon.map((p) => p.y));
  const boundsW = Math.max(...polygon.map((p) => p.x)) - boundsX;
  const boundsH = Math.max(...polygon.map((p) => p.y)) - boundsY;

  // Bounds + layers + net identify the zone; the derived UUID keeps builds
  // byte-identical.
  const zoneUuid = generateUuid(
    'zone',
    layers.join('+'),
    boundsX,
    boundsY,
    boundsW,
    boundsH,
    pin ? `${pin.reference}:${pin.number}` : '',
    net ?? '',
  );

  // Store net information for later resolution
  // Format: "pin:reference:pinNumber" or "net:netName"
  let netIdentifier: string | undefined;
  if (pin) {
    netIdentifier = `pin:${pin.reference}:${pin.number}`;
  } else if (net) {
    netIdentifier = `net:${net}`;
  }

  const zone: IFilledZone = {
    uuid: zoneUuid,
    layers,
    x: boundsX,
    y: boundsY,
    width: boundsW,
    height: boundsH,
    polygon,
    net: netIdentifier,

    // Basic zone settings (fill values merged from the `fill` object)
    fillMode: effFillMode,
    filled: effFilled,
    priority,
    locked,
    name,
    minThickness,

    // Hatch display settings
    hatchStyle,
    hatchPitch,

    // Pad connection
    clearance,
    connectPads,

    // Thermal relief
    thermalGap: effThermalGap,
    thermalBridgeWidth: effThermalBridgeWidth,

    // Corner smoothing
    smoothing: effSmoothing,
    smoothingRadius: effSmoothingRadius,

    // Island removal
    islandRemovalMode: effIslandRemovalMode,
    islandAreaMin: effIslandAreaMin,

    // Hatched fill options
    hatchThickness: effHatchThickness,
    hatchGap: effHatchGap,
    hatchOrientation: effHatchOrientation,
    hatchSmoothingLevel: effHatchSmoothingLevel,
    hatchSmoothingValue: effHatchSmoothingValue,
    hatchBorderAlgorithm: effHatchBorderAlgorithm,
    hatchMinHoleArea: effHatchMinHoleArea,

    // Additional fill settings
    fillArcSegments: effFillArcSegments,
    filledAreasThickness,
  };

  state.zones.push(zone);
}

/**
 * Materialize declared planes (`pcb.plane()`) into board-covering filled
 * zones. Called from createBoard, where the board outline extent is known.
 *
 * Each plane becomes one zone on its layer, connected to its net with
 * through-hole-only pad connections (the classic plane setup: SMD pads reach
 * the plane through vias, not solid spokes). Re-running create() replaces
 * the previously materialized zone instead of duplicating it.
 *
 * @param state - The PCB internal state carrying the plane declarations.
 * @throws {BoardCreationError} when a plane is declared but the board has no
 *   outline to derive the plane extent from.
 */
export function materializePlanes(state: PcbInternalState): void {
  if (state.planes.length === 0) return;

  const bounds = state.getOutlineBounds();
  if (!bounds) {
    const described = state.planes.map((p) => `"${p.net}" on ${p.layer}`).join(', ');
    throw new BoardCreationError(
      `pcb.plane() requires a board outline to derive the plane extent ` +
        `(planes declared: ${described}). Call pcb.outline() before create().`,
    );
  }

  for (const plane of state.planes) {
    // Drop a previous create()'s materialization so repeated create()
    // calls don't accumulate duplicate planes.
    if (plane.zoneUuid) {
      state.zones = state.zones.filter((z) => z.uuid !== plane.zoneUuid);
    }

    zone(state, {
      net: plane.net,
      layers: [plane.layer],
      x: bounds.minX,
      y: bounds.minY,
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
      name: `${plane.net} plane`,
      connectPads: 'thru_hole_only',
    });

    // zone() generates its own uuid; record it for replacement on the
    // next create() (it is the zone just pushed).
    const materialized = state.zones[state.zones.length - 1];
    plane.zoneUuid = materialized?.uuid ?? generateUuid();
  }
}

/**
 * Creates a keepout zone that restricts routing and placement.
 * @param pcb - The PCB instance to add the keepout zone to
 * @param options - Keepout zone configuration options
 * @param options.layers - Array of layer names (e.g., ['F.Cu', 'B.Cu'])
 * @param options.x - The x-coordinate of the keepout zone's starting corner
 * @param options.y - The y-coordinate of the keepout zone's starting corner
 * @param options.width - The width of the keepout zone
 * @param options.height - The height of the keepout zone
 * @param options.restrictions - Object specifying what to restrict (all default to true)
 * @param options.restrictions.tracks - Restrict tracks (default: true)
 * @param options.restrictions.vias - Restrict vias (default: true)
 * @param options.restrictions.pads - Restrict pads (default: true)
 * @param options.restrictions.copperpour - Restrict copper pour (default: true)
 * @param options.restrictions.footprints - Restrict footprints (default: true)
 * @param options.priority - Zone priority (default: 0)
 * @param options.locked - Lock zone to prevent editing (default: false)
 * @param options.name - Optional zone name
 * @param options.hatchStyle - Hatch style for zone outline: 'none', 'edge' (default), or 'full'
 * @param options.hatchPitch - Hatch pitch/spacing (default: 0.508mm)
 * @param options.smoothing - Corner smoothing: 'chamfer', 'fillet', or 'none' (default)
 * @param options.smoothingRadius - Radius for corner smoothing (required if smoothing is set)
 * @example
 * ```ts
 * // ============================================
 * // BASIC EXAMPLES
 * // ============================================
 *
 * // Basic keepout (restricts everything)
 * pcb.keepout({
 *   layers: ['F.Cu', 'B.Cu'],
 *   x: 0, y: 0,
 *   width: 10, height: 10
 * });
 *
 * // ============================================
 * // CUSTOM RESTRICTIONS
 * // ============================================
 *
 * // Restrict only tracks and vias, allow pads
 * pcb.keepout({
 *   layers: ['F.Cu'],
 *   x: 5, y: 5, width: 8, height: 8,
 *   restrictions: {
 *     tracks: true,
 *     vias: true,
 *     pads: false,
 *     copperpour: true,
 *     footprints: false
 *   }
 * });
 *
 * // Restrict only copper pour (allow routing)
 * pcb.keepout({
 *   layers: ['F.Cu'],
 *   x: 10, y: 10, width: 15, height: 15,
 *   restrictions: {
 *     tracks: false,
 *     vias: false,
 *     pads: false,
 *     copperpour: true,
 *     footprints: false
 *   }
 * });
 *
 * // ============================================
 * // ZONE MANAGEMENT OPTIONS
 * // ============================================
 *
 * // Named, locked keepout with priority
 * pcb.keepout({
 *   layers: ['F.Cu', 'B.Cu'],
 *   x: 0, y: 0, width: 20, height: 20,
 *   name: 'Antenna Keepout',
 *   locked: true,
 *   priority: 10
 * });
 *
 * // High-priority keepout area
 * pcb.keepout({
 *   layers: ['F.Cu'],
 *   x: 0, y: 0, width: 30, height: 30,
 *   name: 'Critical Area',
 *   priority: 100
 * });
 * ```
 */
export function keepout(
  state: PcbInternalState,
  options: {
    // Geometry: an explicit polygon (points, >= 3 vertices), a bounds
    // rectangle (bounds), or explicit x/y/width/height
    layers: string[];
    points?: Array<{ x: number; y: number }>;
    bounds?: IBoundsLike;
    x?: number;
    y?: number;
    width?: number;
    height?: number;

    // Restrictions
    restrictions?: {
      tracks?: boolean;
      vias?: boolean;
      pads?: boolean;
      copperpour?: boolean;
      footprints?: boolean;
    };

    // Rule-area options (KiCad 9+ rule areas)
    /** Whether the rule area also applies to footprints placed from a schematic sheet. Default false. */
    placement?: boolean;

    // Basic zone settings
    priority?: number;
    locked?: boolean;
    name?: string;

    // Hatch display settings
    hatchStyle?: 'none' | 'edge' | 'full';
    hatchPitch?: number;
  },
): void {
  const {
    layers,
    points,
    bounds,
    x,
    y,
    width,
    height,
    restrictions = {},
    placement,
    priority = 0,
    locked = false,
    name,
    hatchStyle = 'edge',
    hatchPitch = 0.508,
  } = options;

  // Geometry: same contract as zone() — bounds, explicit polygon, or rectangle
  let rectX = x;
  let rectY = y;
  let rectW = width;
  let rectH = height;
  if (bounds !== undefined) {
    if (x !== undefined || y !== undefined || width !== undefined || height !== undefined) {
      logger.error(
        `[PCB KEEPOUT] ERROR: Provide 'bounds', 'points', or (x, y, width, height) — not combinations${formatCallSite(getCallSite())}`,
      );
      return;
    }
    const r = boundsToRect(bounds);
    rectX = r.x;
    rectY = r.y;
    rectW = r.width;
    rectH = r.height;
  }
  let polygon: Array<{ x: number; y: number }>;
  if (points !== undefined) {
    if (
      !Array.isArray(points) ||
      points.length < 3 ||
      points.some((p) => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))
    ) {
      logger.error(
        `[PCB KEEPOUT] ERROR: 'points' must be an array of at least 3 finite {x, y} vertices${formatCallSite(getCallSite())}`,
      );
      return;
    }
    if (bounds !== undefined || x !== undefined || y !== undefined || width !== undefined || height !== undefined) {
      logger.error(
        `[PCB KEEPOUT] ERROR: Provide 'bounds', 'points', or (x, y, width, height) — not combinations${formatCallSite(getCallSite())}`,
      );
      return;
    }
    polygon = points.map((p) => ({ x: p.x, y: p.y }));
  } else if (rectX !== undefined && rectY !== undefined && rectW !== undefined && rectH !== undefined) {
    polygon = [
      { x: rectX, y: rectY },
      { x: rectX + rectW, y: rectY },
      { x: rectX + rectW, y: rectY + rectH },
      { x: rectX, y: rectY + rectH },
    ];
  } else {
    logger.error(
      `[PCB KEEPOUT] ERROR: Keepout geometry requires 'bounds', 'points' (>= 3 vertices), or all of x, y, width, height${formatCallSite(getCallSite())}`,
    );
    return;
  }
  const boundsX = Math.min(...polygon.map((p) => p.x));
  const boundsY = Math.min(...polygon.map((p) => p.y));
  const boundsW = Math.max(...polygon.map((p) => p.x)) - boundsX;
  const boundsH = Math.max(...polygon.map((p) => p.y)) - boundsY;

  const zoneUuid = generateUuid('keepout', layers.join('+'), boundsX, boundsY, boundsW, boundsH);

  // Default all restrictions to true (not allowed)
  const keepoutZone: IKeepoutZone = {
    uuid: zoneUuid,
    layers,
    x: boundsX,
    y: boundsY,
    width: boundsW,
    height: boundsH,
    polygon,
    priority,
    locked,
    name,
    restrictions: {
      tracks: restrictions.tracks !== false,
      vias: restrictions.vias !== false,
      pads: restrictions.pads !== false,
      copperpour: restrictions.copperpour !== false,
      footprints: restrictions.footprints !== false,
    },
    placement,
    hatchStyle,
    hatchPitch,
  };

  state.keepoutZones.push(keepoutZone);
}
