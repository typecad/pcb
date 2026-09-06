import { Schematic } from '../schematic.js';
import { Pin } from '../pin.js';
import type { IPcbRules } from './pcb_rules.js';

/**
 * Length matching pattern configuration
 */
export interface ILengthMatchPatternConfig {
  type: 'sawtooth';
  amplitude?: number; // optional amplitude in mm
  pitch?: number; // optional pitch in mm
}

/**
 * Length matching configuration
 */
export interface ILengthMatchConfig {
  tolerance: number; // maximum length difference in mm
  pattern?: ILengthMatchPatternConfig;
  minStraightSegment?: number; // minimum straight segment length for pattern placement
  maxIterations?: number; // maximum iterations for pattern fitting
  debug?: boolean; // enable debug logging
}

/**
 * Board-wide design rules (minimum clearances, track/via dimensions) in mm.
 * All fields optional; unspecified fields fall back to the JLCPCB no-surcharge
 * standard. Written to the `.kicad_pro` project file and honored by the
 * autorouter. See `pcb_rules.ts` for the canonical definition and defaults.
 */
export type { IPcbRules } from './pcb_rules.js';

/**
 * Options for creating a PCB instance.
 * Passed to the `new PCB()` constructor to configure board properties.
 */
export interface IPcbOptions {
  /**
   * Associated schematic. If not provided, a new Schematic is created
   * with the same board name.
   *
   * @internal Use `pcb.schematic` to access the schematic after construction.
   */
  schematic?: Schematic;
  /**
   * If true (default), unmatched existing board elements are removed
   * during board generation. Set to false to preserve them.
   */
  remove_orphans?: boolean;
  /**
   * Board thickness in mm. Defaults to 1.6mm (standard FR4).
   */
  thickness?: number;
  /**
   * Copper plating thickness in microns. Defaults to 35μm (1 oz/ft²).
   */
  copper_thickness?: number;
  /**
   * Number of copper layers (2–32). Defaults to 2 (F.Cu + B.Cu).
   *
   * This is the single source of truth for the board's copper layer set:
   * routing defaults, through-hole pad expansion, and layer validation all
   * derive from it. Materials/thicknesses of the generated stackup can be
   * further configured via `pcb.stackup()`.
   */
  layers?: number;
  /**
   * Board-wide design rules. Unspecified fields default to the JLCPCB
   * no-surcharge standard (0.2mm clearance/track, 0.6/0.3mm via, etc.).
   * Rules are written to the `.kicad_pro` file for DRC and read by the
   * autorouter as the fallback clearance and track width.
   */
  rules?: IPcbRules;
  /**
   * Materialize zone fills at create() time by round-tripping the written
   * board through `kicad-cli pcb drc --refill-zones --save-board`
   * (default: true). Individual zones opt out with `fill: false`. Without
   * kicad-cli the fill is skipped with a warning — zones stay declared but
   * exports contain no pour copper until a fill runs.
   */
  fill_zones?: boolean;
}

/**
 * Manufacturing policy for vias placed by the autorouter.
 *
 * - `through`: every router via spans F.Cu→B.Cu. Always manufacturable at
 *   budget fabs (JLCPCB-class). Default.
 * - `blind-buried`: router vias use the exact layer pair the path transitions
 *   between (a blind via from an outer layer, buried between inner layers),
 *   as long as the span depth is within `maxSpan` (layer boundaries crossed,
 *   default 2); deeper transitions fall back to through vias.
 */
export type IViaPolicy = { type: 'through' } | { type: 'blind-buried'; maxSpan?: number };

/** Default via policy: through vias only. */
export const DEFAULT_VIA_POLICY: IViaPolicy = { type: 'through' };

/**
 * Result of resolving a net assignment for a component pin or via.
 * Maps a component+pin combination to its KiCad net code and name.
 */
export interface INetResolution {
  /** Whether the net was found in the schematic */
  found: boolean;
  /** The resolved net code to use in the PCB S-expression */
  netCode: number;
  /** The resolved net name to use in the PCB S-expression */
  netName: string;
  /** The original schematic net code (if found via schematic resolution) */
  schematicNetCode?: number;
  /** The original schematic net name (if found via schematic resolution) */
  schematicNetName?: string;
}

/**
 * Describes a plated through-hole via for layer transitions.
 * Used by `pcb.via()` and `TrackBuilder.via()` to create vias.
 */
export interface IVia {
  /** UUID for tracking. Auto-generated if omitted. */
  uuid?: string;
  /** Net code assigned to the via. Resolved automatically via net name. */
  netCode?: number;
  /** Net name to resolve the net code from. */
  net?: string;
  /** Copper layers the via spans. Defaults to ["F.Cu", "B.Cu"]. */
  layers?: string[];
  /** XY position of the via center. */
  at?: { x: number; y: number };
  /** Via annular ring diameter in mm. Defaults to 0.8mm. */
  size?: number;
  /** Drill hole diameter in mm. Defaults to 0.4mm. */
  drill?: number;
  /** Power characteristics for automatic via current capacity calculation. */
  powerInfo?: IViaPowerInfo;
}

/**
 * Base interface for all graphical primitives on the PCB.
 */
export interface IGraphicPrimitive {
  /** Unique identifier for tracking and updating. */
  uuid: string;
  /** KiCad layer name (e.g., "F.Cu", "B.SilkS", "Edge.Cuts"). */
  layer: string;
  /** Line width in mm. */
  strokeWidth: number;
}

/**
 * A straight line segment on the PCB (graphical or track).
 */
export interface IGrLine extends IGraphicPrimitive {
  type: 'line';
  /** Start point coordinates in mm. */
  start: { x: number; y: number };
  /** End point coordinates in mm. */
  end: { x: number; y: number };
  /** If true, the line is locked against manual editing in KiCad. */
  locked?: boolean;
  /** Net name for net-aware routing obstacle detection. */
  net?: string;
}

/**
 * An arc segment on the PCB (used for rounded corners and curved traces).
 */
export interface IGrArc extends IGraphicPrimitive {
  type: 'arc';
  /** Start point coordinates in mm. */
  start: { x: number; y: number };
  /** Midpoint coordinates defining arc curvature. */
  mid: { x: number; y: number };
  /** End point coordinates in mm. */
  end: { x: number; y: number };
}

/**
 * A filled or outlined circle on the PCB.
 */
export interface IGrCircle extends IGraphicPrimitive {
  type: 'circle';
  /** Center coordinates in mm. */
  center: { x: number; y: number };
  /** Point on the circumference defining the radius (end = center + radius). */
  end: { x: number; y: number };
  /** If true, the circle is filled solid. Otherwise outlined. */
  fill?: boolean;
  /** If true, locked against manual editing in KiCad. */
  locked?: boolean;
}

/**
 * A filled or outlined rectangle on the PCB.
 */
export interface IGrRect extends IGraphicPrimitive {
  type: 'rect';
  /** Top-left corner coordinates in mm. */
  start: { x: number; y: number };
  /** Bottom-right corner coordinates in mm. */
  end: { x: number; y: number };
  /** If true, the rectangle is filled solid. Otherwise outlined. */
  fill?: boolean;
  /** If true, locked against manual editing in KiCad. */
  locked?: boolean;
}

/**
 * A filled or outlined polygon on the PCB.
 */
export interface IGrPoly extends IGraphicPrimitive {
  type: 'poly';
  /** Ordered vertices of the polygon in mm. */
  points: { x: number; y: number }[];
  /** If true, the polygon is filled solid. Otherwise outlined. */
  fill?: boolean;
  /** If true, locked against manual editing in KiCad. */
  locked?: boolean;
}

/**
 * Elements that can appear in outlines (board edge cuts and track segments).
 * Circles, rectangles, and polygons are valid on Edge.Cuts for arbitrary
 * board shapes, cutouts, and mounting holes.
 */
export type OutlineElement = IGrLine | IGrArc | IGrCircle | IGrRect | IGrPoly;

/**
 * Source location information for tracking where PCB elements originate from.
 */
export interface ISourceInfo {
  /** Source file path. */
  file: string;
  /** Line number in the source file. */
  line: number;
  /** Column number (optional). */
  column?: number;
  /** Variable name associated with the source. */
  variable?: string;
  /** Whether the variable is assigned to this.X (class member). */
  isThis?: boolean;
  /** Additional parameters from the call site. */
  params?: Record<string, unknown>;
}

/**
 * Describes a rectangular outline on the Edge.Cuts layer or a track group.
 * Outlines define the board shape boundary. Tracks use outlines internally
 * for grouping line segments into logical traces.
 */
export interface IOutline {
  /** UUID for the outline group. */
  uuid: string;
  /** X coordinate of the start corner. */
  x: number;
  /** Y coordinate of the start corner. */
  y: number;
  /** Width of the rectangular outline in mm. */
  width: number;
  /** Height of the rectangular outline in mm. */
  height: number;
  /** Corner fillet radius (0 for sharp corners). */
  filletRadius: number;
  /** Elements making up this outline (lines and arcs). */
  elements: OutlineElement[];
  /** Source location where this outline was created. */
  sourceInfo?: ISourceInfo;
}

export interface IPowerInfo {
  current: number;
  maxTempRise?: number; // defaults to 10
  thickness?: number; // defaults to 35 (microns)
}

export interface IViaPowerInfo {
  current: number;
  maxTempRise?: number; // defaults to 10
  thickness?: number; // defaults to 35 (microns)
}

export interface IPinPowerInfo {
  minimum_voltage?: number;
  maximum_voltage?: number;
  current?: number;
}

export interface ITrackDetails {
  start: { x: number; y: number };
  end: { x: number; y: number };
  width: number;
  layer: string;
  locked: boolean;
  powerInfo?: IPowerInfo;
}

// Interface for elements generated by TrackBuilder, moved here to avoid circular dependency
export interface IGeneratedElement {
  type: 'track' | 'via';
  uuid: string;
  details: ITrackDetails | IVia;
}

export interface ITextPositioning {
  /** Omit to keep the footprint's existing horizontal position. */
  x?: number;
  /** Omit to keep the footprint's existing vertical position. */
  y?: number;
  rotation?: number;
  layer?: string;
  /** TrueType font face (KiCad `(face ...)`); omit for KiCad's default stroke font. */
  font?: string;
  width?: number;
  height?: number;
  fontSize?: number;
  thickness?: number;
  bold?: boolean;
  italic?: boolean;
  justify?: {
    horizontal?: 'left' | 'right' | 'center';
    vertical?: 'top' | 'bottom' | 'middle';
    mirror?: boolean;
  };
  show?: boolean;
}

export interface IGrTextOptions {
  text: string;
  x: number;
  y: number;
  rotation?: number;
  layer?: string;
  font?: string;
  width?: number;
  height?: number;
  thickness?: number;
  bold?: boolean;
  italic?: boolean;
  justify?: {
    horizontal?: 'left' | 'right' | 'center';
    vertical?: 'top' | 'bottom' | 'middle';
    mirror?: boolean;
  };
  hide?: boolean;
  uuid?: string;
}

export interface IZone {
  uuid: string;
  layers: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  polygon: { x: number; y: number }[];
  priority?: number;
  locked?: boolean;
  name?: string;
}

export interface IFilledZone extends IZone {
  net?: string;
  netCode?: number;
  netName?: string;

  // Fill settings
  fillMode?: 'solid' | 'hatched';
  filled?: boolean; // Whether zone should be filled

  // Hatch display settings (for zone outline)
  hatchStyle?: 'none' | 'edge' | 'full';
  hatchPitch?: number;

  // Basic zone settings
  minThickness?: number;

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
  islandRemovalMode?: number; // 0 = always, 1 = never, 2 = area below min
  islandAreaMin?: number;

  // Hatched fill options (when fillMode is 'hatched')
  hatchThickness?: number;
  hatchGap?: number;
  hatchOrientation?: number; // Angle in degrees
  hatchSmoothingLevel?: number; // 0-3
  hatchSmoothingValue?: number;
  hatchBorderAlgorithm?: 'hatch_thickness' | 'min_thickness';
  hatchMinHoleArea?: number;

  // Additional fill settings
  fillArcSegments?: number;
  filledAreasThickness?: boolean;
}

export interface IKeepoutZone extends IZone {
  restrictions?: {
    tracks?: boolean;
    vias?: boolean;
    pads?: boolean;
    copperpour?: boolean;
    footprints?: boolean;
  };

  /** Rule-area option: also applies to footprints placed from a schematic sheet. */
  placement?: boolean;

  // Keepout zones can have hatch display settings
  hatchStyle?: 'none' | 'edge' | 'full';
  hatchPitch?: number;
}

/**
 * Waypoint coordinate for autorouting hints.
 * Suggests points the autorouter should try to route through.
 */
export interface IAutorouteWaypoint {
  x: number;
  y: number;
  layer?: string;
}

/**
 * Forced via insertion directive for autorouting.
 * Specifies where to transition layers and which layer to continue on after the via.
 */
export interface IAutorouteVia {
  x: number;
  y: number;
  layer: string;
}

/**
 * Combined routing directives that can include waypoints and forced vias.
 */
export interface IRouteDirectives {
  waypoints?: IAutorouteWaypoint[];
  vias?: IAutorouteVia[];
}

/**
 * Impedance control specifications for controlled impedance routing.
 */
export interface IImpedanceConstraint {
  /** Target impedance in ohms */
  target: number;
  /**
   * Acceptable impedance tolerance in ohms. When given, the trace width is
   * snapped to a 0.01mm fabrication grid whose achieved impedance stays
   * within `target ± tolerance`; when the design-rule floor forces the trace
   * outside the band, routing warns with the achieved impedance. Omit for
   * the exact solved width.
   */
  tolerance?: number;
}

/**
 * Identifier for a specific connection between two pins.
 * Used to exclude connections from autorouting or to specify manual routes.
 */
export interface IConnectionIdentifier {
  /** Source pin */
  from: Pin;
  /** Destination pin */
  to: Pin;
}

/**
 * Pre-specified manual route for a specific connection.
 * When provided, the autorouter will use this exact path instead of calculating one.
 */
export interface IManualRoute {
  /**
   * Source pin (optional if can be inferred from route endpoints and net pins)
   * If not provided, will attempt to match route start position to a pin in the net
   */
  from?: Pin;

  /**
   * Destination pin (optional if can be inferred from route endpoints and net pins)
   * If not provided, will attempt to match route end position to a pin in the net
   */
  to?: Pin;

  /**
   * The pre-defined route to use for this connection.
   * Can be:
   * - An IRoutePath object (low-level path with nodes)
   * - An IAutorouteResult from a previous autoroute() or route() call
   *   (will use the first route's path)
   */
  route: IRoutePath | IAutorouteResult;
}

/**
 * Options for the PCB autoroute functionality.
 * Autorouting automatically generates traces between specified pins.
 */
export interface IAutorouteOptions {
  /** Starting pin(s) for the route */
  from: Pin | Pin[];

  /** Destination pin(s) for the route */
  to: Pin | Pin[];

  /** Optional waypoints to hint the routing path */
  waypoints?: IAutorouteWaypoint[];

  /**
   * Optional forced vias that will be inserted along the route before continuing on the specified layer.
   * These behave similarly to waypoints but guarantee a layer change at the provided XY coordinate.
   */
  vias?: IAutorouteVia[];

  /** Impedance control settings for controlled impedance traces */
  impedance?: IImpedanceConstraint;

  /** Restrict routing to specific copper layers (e.g., ['F.Cu', 'B.Cu']) */
  layers?: string[];

  /**
   * Select the routing algorithm to use (must be registered with RouterRegistry).
   * If omitted, the host will use the sole registered algorithm, or the first registered when multiple exist.
   */
  algorithm?: string;

  /**
   * Maximum solver iterations per route.
   */
  maxIterations?: number;

  /**
   * Cost penalty applied when using a via.
   * Higher values discourage vias; set allowVias=false to prohibit them.
   */
  viaCost?: number;

  /** Cost penalty for changing direction (bend). */
  bendCost?: number;

  /** Whether vias are allowed during autorouting. */
  allowVias?: boolean;

  /** Trace width in mm */
  width?: number;

  /** Enable debug console logging for routing operations */
  debug?: boolean;

  /** Minimum clearance from other objects in mm */
  clearance?: number;

  /**
   * Fine-pitch note: 0.5mm-pitch parts (QFN/BGA) cannot be escaped with the
   * default board rules — a 0.2mm trace at 0.2mm clearance needs 0.4mm+
   * between pad centers where the pitch provides 0.25mm. Pass explicit
   * `{ width: 0.15, clearance: 0.1 }` (and consider a finer
   * `gridResolution`) for such parts, and set matching board rules so DRC
   * agrees with the router.
   */

  /**
   * Minimum edge-to-edge clearance for vias in mm.
   * Defaults to 0.2mm if omitted; used in addition to obstacle clearances when placing vias.
   */
  viaClearance?: number;

  /**
   * Via pad diameter in mm to use when this route needs a via. Set internally
   * from the resolved net class (or board rules); not user-facing.
   * @internal
   */
  viaSize?: number;
  /**
   * Via drill diameter in mm to use when this route needs a via. Set internally
   * from the resolved net class (or board rules); not user-facing.
   * @internal
   */
  viaDrill?: number;

  /**
   * Routing grid resolution in mm per cell.
   * If not provided, defaults to 0.1mm.
   */
  gridResolution?: number;
  /**
   * Enable rip-up-and-reroute: when this route fails (or comes out far
   * worse than the pin-to-pin distance implies), the router rips up the
   * conflicting nets' tracks, re-routes this net, then re-routes them —
   * rolling everything back unless the outcome improves. Default: true.
   */
  ripup?: boolean;

  // Speed/quality trade-offs and advanced router controls
  /** Heuristic weight (>1 speeds up, may be slightly suboptimal) */
  heuristicWeight?: number;
  /** Number of parallel workers to use for MST edge routing (beta). Default: 1 (disabled) */
  parallelMSTWorkers?: number;

  // HPA-related options removed

  /**
   * Explicit net name for the route.
   * If not provided, the net is inferred from the pins.
   */
  net?: string;

  /** Power information for trace width calculation */
  powerInfo?: IPowerInfo;

  /** Lock the generated traces to prevent manual editing in KiCAD */
  locked?: boolean;

  /**
   * Apply Steiner Minimum Tree optimization after initial routing.
   * Adds intermediate junction points to reduce total trace length.
   * Only applies to nets with 3+ connection points.
   * Default: true
   */
  useSteinerOptimization?: boolean;

  /**
   * Pre-specified routes for connections.
   * Provide a list of previously generated routes (IAutorouteResult) or raw paths (IRoutePath).
   * The endpoints of each route will be inferred and matched to the current net's pins.
   */
  routes?: (IRoutePath | IAutorouteResult)[];

  /**
   * If true, TrackBuilders won't stage tracks immediately.
   * Used when creating routes that will be passed as manual routes.
   * @internal
   */
  deferStaging?: boolean;

  /**
   * Connections to exclude from autorouting.
   * These pin pairs will be skipped and must be routed manually by the user.
   */
  excludeConnections?: IConnectionIdentifier[];

  /**
   * Length matching configuration for matched trace lengths
   */
  lengthMatch?: ILengthMatchConfig;
}

/**
 * Result of a low-level routing operation.
 */
export interface IRoutePath {
  /** Ordered list of waypoints describing the routed path */
  nodes: { x: number; y: number; layer: string }[];
  /** Optional grid coordinates for debugging/visualization */
  gridNodes?: { gridX: number; gridY: number; layer: string }[];
  /** Total path length in mm */
  length: number;
  /** Number of vias used */
  viaCount: number;
  /** Whether routing succeeded */
  success: boolean;
  /** Error description if routing failed */
  error?: string;
  /** Nets whose copper blocked a failed search — rip-up candidates */
  blockedBy?: string[];
  /** Optional sub-segments (e.g., for multi-hop routes) */
  segments?: IRoutePath[];
}

/**
 * Metadata for a single routed trace.
 */
export interface IRouteMetadata {
  /** Actual trace length in mm */
  length: number;

  /** Number of vias used in this route */
  viaCount: number;

  /** Layers used by this route */
  layers: string[];

  /** Whether this specific route succeeded */
  success: boolean;

  /** Error message if route failed */
  error?: string;

  /** The actual routing path (nodes and segments) */
  path?: IRoutePath;
}

/**
 * Result of an autoroute operation.
 * This is an array of TrackBuilder objects with attached metadata.
 * Can be spread directly into pcb.create() or used to access routing details.
 */
export interface IAutorouteResult extends Array<import('./pcb_track_builder.js').TrackBuilder> {
  /** Whether all routes were successful */
  success: boolean;

  /** Total number of routes attempted */
  routeCount: number;

  /** Number of successfully completed routes */
  completedCount: number;

  /** Routing metadata for each trace */
  routeDetails: IRouteMetadata[];
}

/**
 * Route-only options for batch orchestration that exclude endpoints.
 * Used by autorouteBatch where from/to are provided separately.
 */
export type IAutorouteRouteOptions = Omit<IAutorouteOptions, 'from' | 'to'>;

/**
 * Zone fill settings, grouped for `pcb.zone({ fill: { ... } })`. Maps to the
 * `(fill ...)` block of a KiCad zone. Fields mirror the flat zone options
 * (`mode` → `fillMode`, `arcSegments` → `fillArcSegments`); nested values
 * take precedence over the flat ones.
 */
export interface IZoneFillOptions {
  /** Fill mode: 'solid' (default) or 'hatched'. */
  mode?: 'solid' | 'hatched';
  /** Arc segments for smooth fill edges. Default 16. */
  arcSegments?: number;
  /** Thermal relief gap in mm. Default 0.254. */
  thermalGap?: number;
  /** Thermal relief bridge width in mm. Default 0.4064. */
  thermalBridgeWidth?: number;
  /** Corner smoothing: 'chamfer', 'fillet', or 'none' (default). */
  smoothing?: 'chamfer' | 'fillet' | 'none';
  /** Corner smoothing radius in mm (required when smoothing is set). */
  smoothingRadius?: number;
  /** Island removal mode: 0 = never remove, 1 = always remove, 2 = remove below islandAreaMin. Default 2. */
  islandRemovalMode?: number;
  /** Minimum island area in mm² (used when islandRemovalMode is 2). */
  islandAreaMin?: number;
  /** Hatched fill: line width in mm (file token `hatch_thickness`). */
  hatchThickness?: number;
  /** Alias of {@link hatchThickness} — KiCad's zone dialog labels it "Hatch width". */
  hatchWidth?: number;
  /** Hatched fill: gap between hatch lines in mm. */
  hatchGap?: number;
  /** Hatched fill: orientation in degrees. */
  hatchOrientation?: number;
  /** Hatched fill: smoothing level 0-3. */
  hatchSmoothingLevel?: number;
  /** Hatched fill: smoothing value in mm. */
  hatchSmoothingValue?: number;
  /** Hatched fill: border algorithm. */
  hatchBorderAlgorithm?: 'hatch_thickness' | 'min_thickness';
  /** Hatched fill: minimum hole area in mm². */
  hatchMinHoleArea?: number;
}

/**
 * Rectangle geometry by bounds: anything with `left`/`top`/`width`/`height`
 * (e.g. `pcb.board`) or `x`/`y`/`width`/`height`. Accepted wherever a zone,
 * keepout, rect, or stitch area takes an explicit rectangle, so board-state
 * geometry passes through without field-by-field mapping.
 */
export type IBoundsLike =
  | { left: number; top: number; width: number; height: number }
  | { x: number; y: number; width: number; height: number };

export interface IPcbZoneOptions {
  pin?: Pin;
  net?: string;
  layers: string[];
  /**
   * Arbitrary polygon geometry (>= 3 vertices). Alternative to the
   * x/y/width/height rectangle — provide one or the other, not both.
   */
  points?: Array<{ x: number; y: number }>;
  /** Bounds rectangle (e.g. `pcb.board`); alternative to points or x/y/width/height. */
  bounds?: IBoundsLike;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /**
   * Grouped fill settings (the `(fill ...)` block). `false` creates an
   * unfilled zone outline. Nested values override the flat fill options
   * below, which remain supported.
   */
  fill?: IZoneFillOptions | false;
  fillMode?: 'solid' | 'hatched';
  filled?: boolean;
  priority?: number;
  locked?: boolean;
  name?: string;
  minThickness?: number;
  hatchStyle?: 'none' | 'edge' | 'full';
  hatchPitch?: number;
  clearance?: number;
  connectPads?: 'thru_hole_only' | 'full' | 'no';
  thermalGap?: number;
  thermalBridgeWidth?: number;
  smoothing?: 'chamfer' | 'fillet' | 'none';
  smoothingRadius?: number;
  /** Island removal mode: 0 = never remove, 1 = always remove, 2 = remove below islandAreaMin. Default 2. */
  islandRemovalMode?: number;
  islandAreaMin?: number;
  /** Hatched fill: line width in mm. */
  hatchThickness?: number;
  /** Alias of `hatchThickness` — KiCad's zone dialog labels it "Hatch width". */
  hatchWidth?: number;
  hatchGap?: number;
  hatchOrientation?: number;
  hatchSmoothingLevel?: number;
  hatchSmoothingValue?: number;
  hatchBorderAlgorithm?: 'hatch_thickness' | 'min_thickness';
  hatchMinHoleArea?: number;
  fillArcSegments?: number;
  /** Whether filled areas use the minimum thickness. Default: KiCad's default. */
  filledAreasThickness?: boolean;
}

export interface IPcbKeepoutOptions {
  layers: string[];
  /** Arbitrary polygon geometry (>= 3 vertices); alternative to the rectangle. */
  points?: Array<{ x: number; y: number }>;
  /** Bounds rectangle (e.g. `pcb.board`); alternative to points or x/y/width/height. */
  bounds?: IBoundsLike;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  restrictions?: {
    tracks?: boolean;
    vias?: boolean;
    pads?: boolean;
    copperpour?: boolean;
    footprints?: boolean;
  };
  /** Whether the rule area also applies to footprints placed from a schematic sheet. Default false. */
  placement?: boolean;
  priority?: number;
  locked?: boolean;
  name?: string;
  hatchStyle?: 'none' | 'edge' | 'full';
  hatchPitch?: number;
}

export interface IPcbLineOptions {
  start: { x: number; y: number };
  end: { x: number; y: number };
  layer?: string;
  width?: number;
  locked?: boolean;
}

export interface IPcbCircleOptions {
  center: { x: number; y: number };
  radius?: number;
  end?: { x: number; y: number };
  layer?: string;
  width?: number;
  fill?: boolean;
  locked?: boolean;
}

export interface IPcbRectOptions {
  /** Bounds rectangle (e.g. `pcb.board`); alternative to x/y/width/height. */
  bounds?: IBoundsLike;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  layer?: string;
  strokeWidth?: number;
  fill?: boolean;
  locked?: boolean;
}

export interface IPcbArcOptions {
  /** Arc start point in mm. */
  start: { x: number; y: number };
  /** A point on the arc between start and end (KiCad's arc definition). */
  mid: { x: number; y: number };
  /** Arc end point in mm. */
  end: { x: number; y: number };
  layer?: string;
  width?: number;
  locked?: boolean;
}

export interface IPcbPolyOptions {
  points: { x: number; y: number }[];
  layer?: string;
  width?: number;
  fill?: boolean;
  locked?: boolean;
}
