import { Component } from '../component.js';
import { Schematic } from '../schematic.js';
import type { ISchematicNetDefinition } from '../net_manager.js';
import { Pin } from '../pin.js';
import type { Power } from '../buses.js';
import { SimulationContext } from '../simulation/ngspice.js';
import { TrackBuilder } from './pcb_track_builder.js';
import type {
  IPcbOptions,
  INetResolution,
  IVia,
  IViaPolicy,
  IGrLine,
  IOutline,
  IGrTextOptions,
  IAutorouteOptions,
  IAutorouteResult,
  IPcbZoneOptions,
  IPcbKeepoutOptions,
  IPcbLineOptions,
  IPcbCircleOptions,
  IPcbRectOptions,
  IPcbPolyOptions,
  IPcbArcOptions,
} from './pcb_interfaces.js';
import { DEFAULT_VIA_POLICY } from './pcb_interfaces.js';

import { resolveNet as resolveNetStandalone } from './pcb_net_resolver.js';
import { createVia } from './pcb_via.js';
import { loadExistingBoardElements } from './pcb_board_loader.js';
import { PcbInternalState } from './pcb_state.js';
import { resolveRules } from './pcb_rules.js';
import type { IPcbRules, INetClass, INetClassOptions } from './pcb_rules.js';
import { NetClassRegistry } from './pcb_net_class.js';
import { validateLayerCount, copperLayerNames, resolveStackupGeometry, type IStackupGeometry } from './pcb_stackup.js';
import { stackupImpedanceGeometry, widthForImpedance, widthForImpedanceWithinTolerance } from './pcb_impedance.js';
import { below, above, rightOf, leftOf, sameAs, board as boardBounds } from '../placement.js';
import type { PlacementBuilder, BoardBounds, SameAsResult } from '../placement.js';
import { resolveTeardrops, DEFAULT_TEARDROPS } from './pcb_teardrops.js';
import type { ITeardropsOptions, ITeardropPolicy } from './pcb_teardrops.js';
import { validateStitchRequest } from './pcb_stitching.js';
import type { IStitchOptions } from './pcb_stitching.js';
import type { IStackupOptions } from './pcb_stackup.js';

import { createBoard } from './pcb_board_creation.js';
import { placeComponent, stageComponent, groupComponents } from './pcb_component_lifecycle.js';
import { registerRouter } from './pcb_router_registry.js';
import type { RouterFactory, RouterGridConfigurator } from './pcb_router_registry.js';
import { pcbNet, pcbNamed, pcbBom, pcbContract, pcbAdd } from './pcb_schematic_bridge.js';
import { pcbRoute, pcbWaitForPendingAutoroutes, pcbAutorouteBatch } from './pcb_routing_api.js';
import {
  pcbTextWithOffset,
  pcbZoneWithOffset,
  pcbKeepoutWithOffset,
  pcbLineWithOffset,
  pcbCircleWithOffset,
  pcbRectWithOffset,
  pcbPolyWithOffset,
  pcbArcWithOffset,
  pcbOutlineWithOffset,
  pcbOutlinePolygonWithOffset,
  pcbOutlineCircleWithOffset,
  pcbCutoutWithOffset,
  pcbCutoutCircleWithOffset,
  pcbOutlinePathWithOffset,
  pcbTrackWithOffset,
} from './pcb_graphics_delegation.js';

// Re-export types and classes that other modules expect to import from './pcb'
export { TrackBuilder } from './pcb_track_builder.js';
export type {
  IPcbOptions,
  INetResolution,
  IVia,
  IViaPolicy,
  IGraphicPrimitive,
  IGrLine,
  IGrArc,
  IGrCircle,
  IGrRect,
  IGrPoly,
  OutlineElement,
  IOutline,
  ISourceInfo,
  IGeneratedElement,
  IGrTextOptions,
  IZone,
  IFilledZone,
  IZoneFillOptions,
  IKeepoutZone,
  IAutorouteOptions,
  IAutorouteResult,
  IAutorouteWaypoint,
  IImpedanceConstraint,
  IRouteMetadata,
  IConnectionIdentifier,
  IManualRoute,
  IAutorouteRouteOptions,
} from './pcb_interfaces.js';
export type { IPcbRules, INetClass, INetClassOptions } from './pcb_rules.js';
export type { IStackupOptions } from './pcb_stackup.js';

/**
 * Represents a printed circuit board (PCB).
 */
export class PCB {
  readonly boardName: string;
  private _schematic: Schematic;
  private _state: PcbInternalState;
  private _outlines: IOutline[] = [];
  private _tracks: IOutline[] = [];
  private _netClasses = new NetClassRegistry();
  private _stackup?: { layerCount: number; options: IStackupOptions };
  private _viaPolicy: IViaPolicy = DEFAULT_VIA_POLICY;
  private _teardrops: ITeardropPolicy = DEFAULT_TEARDROPS;

  /**
   * Initializes a new PCB.
   * @param boardName - Name and filename of generated files.
   * @param options - Optional configuration for the PCB.
   */
  constructor(boardName: string, options?: IPcbOptions) {
    this.boardName = boardName;
    if (options?.layers !== undefined) {
      validateLayerCount(options.layers);
    }
    const resolvedOptions: IPcbOptions = {
      remove_orphans: true,
      thickness: 1.6,
      copper_thickness: 35,
      layers: 2,
      schematic: new Schematic(boardName),
      ...options,
    };
    this._state = new PcbInternalState(resolvedOptions);
    this._schematic = resolvedOptions.schematic ?? new Schematic(boardName);

    this._state.existingBoardElements = loadExistingBoardElements(boardName);
  }

  get schematic(): Schematic {
    return this._schematic;
  }

  get thickness(): number {
    return this._state.options.thickness ?? 1.6;
  }

  get copper_thickness(): number {
    return this._state.options.copper_thickness ?? 35;
  }

  /**
   * Resolved board-wide design rules (JLCPCB no-surcharge defaults merged
   * with any constructor overrides). The autorouter reads these as its
   * fallback clearance and track width; they are also written to the
   * `.kicad_pro` file for DRC.
   */
  get rules(): Required<IPcbRules> {
    return resolveRules(this._state.options.rules);
  }

  /**
   * The net-class registry, holding user-defined net classes and net→class
   * assignments. Consumed by the build write path and the autorouter.
   */
  get netClasses(): NetClassRegistry {
    return this._netClasses;
  }

  get outlines(): readonly IOutline[] {
    return this._outlines;
  }

  get tracks(): readonly IOutline[] {
    return this._tracks;
  }

  get options(): IPcbOptions {
    return {
      ...this._state.options,
      remove_orphans: this._state.options.remove_orphans ?? true,
    };
  }

  /**
   * Places components on the board.
   * @param components - List of components to place.
   */
  place(...components: Component[]) {
    components.forEach((component) => {
      placeComponent(this._state, component);
    });
  }

  stage(...components: Component[]) {
    components.forEach((component) => {
      stageComponent(this._state, component);
    });
  }

  /**
   * Groups components and/or elements from a TrackBuilder together on the board.
   * @param group_name - Name of the group.
   * @param items - A list of Component instances or TrackBuilder instances.
   */
  group(group_name: string, ...items: Array<Component | TrackBuilder>) {
    groupComponents(this._state, (...comps) => this.place(...comps), group_name, ...items);
  }

  text(options: IGrTextOptions): void {
    pcbTextWithOffset(this._state, options);
  }

  /**
   * Generates all KiCad project files: schematic (.net), PCB (.kicad_pcb),
   * and BOM. Writes outputs to the build directory.
   *
   * @param items - Components, TrackBuilders, or arrays thereof to include.
   */
  create(...items: Array<Component | TrackBuilder | Array<Component | TrackBuilder>>) {
    const flattened: Array<Component | TrackBuilder> = [];
    for (const item of items) {
      if (Array.isArray(item)) {
        flattened.push(...item);
      } else {
        flattened.push(item);
      }
    }
    const result = createBoard(this, ...flattened);
    this.bom();
    return result;
  }

  /**
   * Handles via-related operations.
   * @param via - The via details.
   * @returns The component representing the via.
   */
  via({ at, size, drill, net, powerInfo }: Omit<IVia, 'uuid' | 'netCode' | 'layers'> = {}): Component {
    return createVia(this._state.currentOffset, (c) => this.stage(c), { at, size, drill, net, powerInfo });
  }

  zone(options: IPcbZoneOptions): void {
    pcbZoneWithOffset(this._state, options);
  }

  keepout(options: IPcbKeepoutOptions): void {
    pcbKeepoutWithOffset(this._state, options);
  }

  line(options: IPcbLineOptions): void {
    pcbLineWithOffset(this._state, options);
  }

  circle(options: IPcbCircleOptions): void {
    pcbCircleWithOffset(this._state, options);
  }

  rect(options: IPcbRectOptions): void {
    pcbRectWithOffset(this._state, options);
  }

  poly(options: IPcbPolyOptions): void {
    pcbPolyWithOffset(this._state, options);
  }

  /**
   * Draw an arc on a board layer (silkscreen, fabrication, copper, ...).
   * KiCad defines an arc by three points: `start`, `mid` (a point on the
   * arc), and `end`.
   *
   * @example
   * ```ts
   * // quarter circle on the silkscreen
   * pcb.arc({
   *   start: { x: 10, y: 10 },
   *   mid: { x: 10 + 5 * Math.cos(Math.PI / 4), y: 10 + 5 * Math.sin(Math.PI / 4) },
   *   end: { x: 15, y: 10 },
   *   layer: 'F.SilkS',
   *   width: 0.15,
   * });
   * ```
   */
  arc(options: IPcbArcOptions): void {
    pcbArcWithOffset(this._state, options);
  }

  outline(
    x: number,
    y: number,
    width: number,
    height: number,
    filletRadius: number = 0,
    conceptualUuidFromUser?: string,
  ): void {
    pcbOutlineWithOffset(this._state, x, y, width, height, filletRadius, conceptualUuidFromUser);
  }

  /**
   * Define a custom polygon board outline on Edge.Cuts. The polygon is
   * emitted as a single `gr_poly`; KiCad treats it as a closed contour.
   * @param points - Polygon vertices in mm (≥3).
   */
  outlinePolygon(points: Array<{ x: number; y: number }>): void {
    pcbOutlinePolygonWithOffset(this._state, points);
  }

  /**
   * Define a circular board outline on Edge.Cuts.
   * @param cx - Center X in mm.
   * @param cy - Center Y in mm.
   * @param radius - Radius in mm.
   */
  outlineCircle(cx: number, cy: number, radius: number): void {
    pcbOutlineCircleWithOffset(this._state, cx, cy, radius);
  }

  /**
   * Define an internal cutout (e.g. a milled slot or non-circular mounting
   * cutout) on Edge.Cuts. Same mechanism as a polygon outline; KiCad treats
   * nested closed contours on Edge.Cuts as holes.
   * @param points - Cutout vertices in mm (≥3).
   */
  cutout(points: Array<{ x: number; y: number }>): void {
    pcbCutoutWithOffset(this._state, points);
  }

  /**
   * Define a circular cutout (e.g. a mounting hole) on Edge.Cuts.
   * @param cx - Center X in mm.
   * @param cy - Center Y in mm.
   * @param radius - Radius in mm.
   */
  cutoutCircle(cx: number, cy: number, radius: number): void {
    pcbCutoutCircleWithOffset(this._state, cx, cy, radius);
  }

  /**
   * Start building an arbitrary outline path of line/arc segments on
   * Edge.Cuts. Use `.lineTo()`, `.arcTo()`, and `.close()` on the returned
   * builder.
   * @param x - Start X in mm.
   * @param y - Start Y in mm.
   */
  outlinePath(x: number, y: number) {
    return pcbOutlinePathWithOffset(this._state, x, y);
  }

  /**
   * Define a net class with per-net physical dimensions (mm). Nets assigned
   * to the class (via {@link assign}) get these dimensions for routing and
   * DRC. Unspecified fields fall back to the board design rules.
   *
   * `options.layers` sets preferred routing layers for the class's nets
   * (e.g. `['In1.Cu']` to keep a bus on an inner layer); must be declared
   * copper layers.
   *
   * @param name - Class name. Must not be `Default` (reserved).
   * @param options - Partial dimensions plus optional preferred layers.
   */
  netClass(name: string, options: INetClassOptions): void {
    if (options.layers && options.layers.length > 0) {
      const undeclared = options.layers.filter((l) => !this.copperLayers.includes(l));
      if (undeclared.length > 0) {
        throw new RangeError(
          `netClass "${name}" prefers layer${undeclared.length === 1 ? '' : 's'} ` +
            `${undeclared.map((l) => `"${l}"`).join(', ')} not declared on this ` +
            `${this.layerCount}-layer board (declared: ${this.copperLayers.join(', ')})`,
        );
      }
    }
    this._netClasses.define(name, options, this.rules);
  }

  /**
   * Assign a net to a previously-defined net class. Accepts the
   * {@link ISchematicNetDefinition} returned by `pcb.net()` or
   * `pcb.named().net()`, so it works for named and auto-named nets.
   *
   * @param netDef - The net definition object.
   * @param className - The class name (must have been defined via {@link netClass}).
   */
  assign(netDef: ISchematicNetDefinition, className: string): void {
    this._netClasses.assign(netDef, className);
  }

  /**
   * Configure the board's physical layer stackup. Generates the
   * `(setup (stackup ...))` block and regenerates the `(layers ...)` block to
   * match the copper-layer count. Uses JLCPCB-standard materials (FR4,
   * 1oz copper, green mask) at the board's total thickness.
   *
   * This also sets the board's copper-layer count (see {@link copperLayers}),
   * overriding any `layers` value passed to the constructor.
   *
   * @param layerCount - Number of copper layers (2–32).
   * @param options - Optional stackup-level overrides (copper finish, etc.).
   */
  stackup(layerCount: number, options?: IStackupOptions): void {
    validateLayerCount(layerCount);
    this._stackup = { layerCount, options: options ?? {} };
  }

  /** The configured stackup, if `pcb.stackup()` was called. */
  get stackupConfig(): Readonly<{ layerCount: number; options: IStackupOptions }> | undefined {
    return this._stackup;
  }

  /**
   * The board's copper-layer count. Set by `pcb.stackup()` when called,
   * otherwise by the constructor's `layers` option (default 2).
   */
  get layerCount(): number {
    return this._stackup?.layerCount ?? this._state.options.layers ?? 2;
  }

  /**
   * The board's copper layer names, top to bottom, derived from the
   * layer count (`['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']` for 4 layers).
   * This is the authoritative layer set used by routing defaults,
   * through-hole pad expansion, and layer validation.
   */
  get copperLayers(): readonly string[] {
    return copperLayerNames(this.layerCount);
  }

  /**
   * Layers declared as planes via {@link plane}. Excluded from the
   * autorouter's default routing layers; each becomes a board-covering
   * filled zone on its net at create() time.
   */
  get planeLayers(): ReadonlySet<string> {
    return new Set(this._state.planes.map((p) => p.layer));
  }

  /**
   * Declare a copper layer as a power/ground plane for a net.
   *
   * At create() time the plane is materialized as a board-covering filled
   * zone on that layer (thermal-relief pad connections, clearance from the
   * board rules), and the layer is excluded from the autorouter's default
   * routing layers.
   *
   * @param net - Net name the plane connects to (e.g. `'GND'`).
   * @param layer - Copper layer for the plane; must be a declared copper
   *   layer (`'In1.Cu'` on a board with `layers: 4`).
   *
   * @example
   * ```ts
   * let pcb = new PCB('board', { layers: 4 });
   * pcb.plane('GND', 'In1.Cu');
   * pcb.plane('+3V3', 'In2.Cu');
   * ```
   */
  plane(net: string, layer: string): void {
    if (!net) throw new RangeError('plane() requires a net name');
    if (!this.copperLayers.includes(layer)) {
      throw new RangeError(
        `plane() layer "${layer}" is not a declared copper layer on this ` +
          `${this.layerCount}-layer board (declared: ${this.copperLayers.join(', ')})`,
      );
    }
    if (this.planeLayers.has(layer)) {
      throw new RangeError(`layer "${layer}" is already declared as a plane; a layer can carry only one plane`);
    }
    this._state.planes.push({ net, layer });
  }

  /**
   * Set the manufacturing policy for vias placed by the autorouter.
   * Defaults to `{ type: 'through' }` (every router via spans F.Cu→B.Cu).
   * `{ type: 'blind-buried', maxSpan }` lets the router use the exact layer
   * pair a route transitions between, within the span limit.
   *
   * @example
   * ```ts
   * pcb.viaPolicy({ type: 'blind-buried', maxSpan: 2 });
   * ```
   */
  viaPolicy(policy: IViaPolicy): void {
    if (!policy || (policy.type !== 'through' && policy.type !== 'blind-buried')) {
      throw new RangeError(
        `viaPolicy() expects { type: 'through' } or { type: 'blind-buried', maxSpan? }, got ${JSON.stringify(policy)}`,
      );
    }
    this._viaPolicy = policy;
  }

  /** The active via policy (see {@link viaPolicy}). */
  get viaPolicyConfig(): IViaPolicy {
    return this._viaPolicy;
  }

  /**
   * The board's resolved stackup geometry: copper, mask, and dielectric
   * thicknesses/materials (JLCPCB-standard presets with any per-layer
   * overrides from `pcb.stackup()`). Shared by the stackup writer and the
   * impedance calculator so the two can never disagree.
   */
  get stackupGeometry(): Readonly<IStackupGeometry> {
    return resolveStackupGeometry(
      this.layerCount,
      this.thickness,
      this.copper_thickness,
      this._stackup?.options.layers,
    );
  }

  /**
   * Trace width (mm) that achieves a target characteristic impedance on a
   * copper layer of this board's stackup — outer layers are modeled as
   * microstrip, inner layers as symmetric stripline. Engineering-grade
   * accuracy (typically within fab tolerance), not field-solver grade.
   *
   * Used automatically by `pcb.route({ impedance: { target } })`; exposed for
   * manual `pcb.track()` routing and design exploration.
   *
   * @param layer - Copper layer name (e.g. `'F.Cu'`, `'In1.Cu'`).
   * @param targetOhms - Target impedance in ohms.
   * @param toleranceOhms - When given, snap the width to a 0.01mm fabrication
   *   grid whose achieved impedance stays within `target ± tolerance`.
   * @throws {RangeError} for an unknown layer or an unreachable target.
   *
   * @example
   * ```ts
   * let pcb = new PCB('board', { layers: 4 });
   * pcb.stackup(4, { layers: { 'dielectric 1': { thickness: 0.21, epsilon_r: 4.4 } } });
   * pcb.impedanceWidth('In1.Cu', 50); // ~0.35mm for a typical 4-layer core
   * pcb.impedanceWidth('F.Cu', 50, 5); // grid-snapped, within 50±5Ω
   * ```
   */
  impedanceWidth(layer: string, targetOhms: number, toleranceOhms?: number): number {
    const geometry = stackupImpedanceGeometry(this.stackupGeometry, layer);
    if (!geometry) {
      throw new RangeError(
        `impedanceWidth() layer "${layer}" is not a declared copper layer on this ` +
          `${this.layerCount}-layer board (declared: ${this.copperLayers.join(', ')})`,
      );
    }
    if (toleranceOhms !== undefined) {
      return widthForImpedanceWithinTolerance(targetOhms, toleranceOhms, geometry);
    }
    return widthForImpedance(targetOhms, geometry);
  }

  track(options?: { locked?: boolean; net?: string; deferStaging?: boolean; debug?: boolean }): TrackBuilder {
    return new TrackBuilder(this, options);
  }

  route(options: IAutorouteOptions): IAutorouteResult;
  route(
    netDefinition: ISchematicNetDefinition,
    options?: import('./pcb_interfaces.js').IAutorouteRouteOptions,
  ): IAutorouteResult;
  route(
    arg1: ISchematicNetDefinition | IAutorouteOptions,
    options?: import('./pcb_interfaces.js').IAutorouteRouteOptions,
  ): IAutorouteResult {
    return pcbRoute(this, this._state, arg1, options);
  }

  waitForPendingAutoroutes(): void {
    pcbWaitForPendingAutoroutes(this._state);
  }

  /**
   * Enable teardrops — reinforced track-to-via junctions.
   *
   * Writes the KiCad teardrop tool configuration to the `.kicad_pro` (so
   * boards open preconfigured) and, for vias placed by the autorouter,
   * generates the teardrop geometry itself: tapered side segments on each
   * copper layer the via connects, part of the routed net.
   *
   * @example
   * ```ts
   * pcb.teardrops();                       // defaults: vias + pads, round, ≤1mm
   * pcb.teardrops({ vias: true, maxLength: 0.8, shape: 'rect' });
   * ```
   */
  teardrops(options?: ITeardropsOptions): void {
    this._teardrops = resolveTeardrops(options);
  }

  /** The active teardrop policy (see {@link teardrops}). */
  get teardropConfig(): Readonly<ITeardropPolicy> {
    return this._teardrops;
  }

  /**
   * Stitch a net across layers with a clearance-aware grid of vias — the
   * standard way to tie outer-layer pours to inner planes (e.g. GND).
   *
   * This is a declaration, like `pcb.plane()`: the vias are placed at
   * `create()` time, against the complete board contents — every component
   * passed to `create()`, `add()`ed, or carrying a net is considered, so
   * nothing needs to be registered beforehand for stitching to see it.
   *
   * Candidates are placed on a rectangular grid over the region (the board
   * outline inset by `margin`, or an explicit `area`), skipping any position
   * that would violate clearance against existing copper — pads, tracks,
   * vias, and zones — on the layers the stitch spans. Component footprints
   * (full keep-clear extent) and board text block stitches too; same-net
   * pours never block (that's the point).
   *
   * @param net - Net to stitch (e.g. `'GND'`).
   *
   * @example
   * ```ts
   * pcb.plane('GND', 'In2.Cu');
   * pcb.zone({ net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 50, height: 30 });
   * pcb.stitch('GND', { pitch: 1.5 }); // placed at create()
   * ```
   */
  stitch(net: string, options?: IStitchOptions): void {
    validateStitchRequest(this, net, options);
    this._state.stitchRequests.push({ net, options: options ?? {}, placedUuids: [] });
  }

  /**
   * The board's placement namespace: live physical bounds derived from the
   * outline (`center`, edges, corners, `from*` edge-relative values) plus
   * the component-relative verbs (`below`, `above`, `rightOf`, `leftOf`,
   * `sameAs`). Readable at any time — before or after `pcb.outline()` —
   * values follow the final outline.
   *
   * @example
   * ```ts
   * u1.pcb = { x: pcb.board.center.x, y: pcb.board.center.y };
   * mh1.pcb = { x: pcb.board.fromLeft(5), y: pcb.board.fromTop(5) };
   * r2.pcb = { x: pcb.board.sameAs(r1), y: pcb.board.below(r1).by(3) };
   * ```
   */
  get board(): BoardBounds {
    return boardBounds(this);
  }

  net(...pins: Pin[]): ISchematicNetDefinition {
    return pcbNet(this._schematic, ...pins);
  }

  named(name: string) {
    return pcbNamed(this._schematic, name);
  }

  bom(output_folder?: string): void {
    pcbBom(this._schematic, output_folder);
  }

  contract(options: import('../contract.js').ContractOptions): void {
    pcbContract(this, options);
  }

  add(...components: Component[]): void {
    pcbAdd(this._schematic, ...components);
  }

  /**
   * Mark pins as do-not-connect (no-connect flag in the schematic).
   * Equivalent to placing a no-connect flag on unused pins in KiCad's
   * schematic editor.
   */
  dnc(...pins: Pin[]): void {
    this._schematic.dnc(...pins);
  }

  /**
   * Run ngspice SPICE simulation on this board's schematic.
   * Returns a {@link SimulationContext} for running DC operating point
   * (`.op()`) or transient (`.tran()`) analyses.
   *
   * @param powers - One or more {@link Power} objects defining voltage sources.
   *
   * @example
   * ```ts
   * const result = pcb.simulate(vin).op();
   * const voltage = result.getVoltage('vdiv');
   * ```
   */
  simulate(...powers: Power[]): SimulationContext {
    return this._schematic.simulate(...powers);
  }

  /**
   * Throw a typed error with a user-defined message. Useful for validating
   * design constraints in build code.
   */
  error(message: string): void {
    this._schematic.error(message);
  }

  /**
   * Emit a warning message to the console.
   */
  warn(message: string): void {
    this._schematic.warn(message);
  }
}

export function getPcbState(pcb: PCB): PcbInternalState {
  return (pcb as unknown as { _state: PcbInternalState })._state;
}

export function setPcbOutlines(pcb: PCB, outlines: IOutline[]): void {
  (pcb as unknown as { _outlines: IOutline[] })._outlines = outlines;
}

export function setPcbTracks(pcb: PCB, tracks: IOutline[]): void {
  (pcb as unknown as { _tracks: IOutline[] })._tracks = tracks;
}

export function pcbTrackSegment(
  pcb: PCB,
  start: { x: number; y: number },
  end: { x: number; y: number },
  width: number = 0.05,
  layer: string = 'F.Cu',
  locked: boolean = false,
  uuid?: string,
  net?: string,
): string {
  const state = getPcbState(pcb);
  return pcbTrackWithOffset(state, start, end, width, layer, locked, uuid, net);
}

export function pcbGetTrackData(pcb: PCB, uuid: string): IGrLine | null {
  const state = getPcbState(pcb);
  for (const outline of state.stagedOutlines) {
    if (outline.uuid === uuid && outline.elements.length === 1 && outline.elements[0].type === 'line') {
      return outline.elements[0] as IGrLine;
    }
  }
  return null;
}

export function pcbResolveNet(
  pcb: PCB,
  componentReference: string,
  pinNumber: string,
  componentUuid?: string,
  boardNetNameToCodeMap?: Map<string, number>,
  fallbackNetName?: string,
): INetResolution {
  return resolveNetStandalone(
    (pcb as unknown as { _schematic: Schematic })._schematic,
    componentReference,
    pinNumber,
    componentUuid,
    boardNetNameToCodeMap,
    fallbackNetName,
  );
}

export function pcbPushOffset(pcb: PCB, x: number, y: number): void {
  getPcbState(pcb).pushOffset(x, y);
}

export function pcbPopOffset(pcb: PCB): void {
  getPcbState(pcb).popOffset();
}

export function pcbGetCurrentOffset(pcb: PCB): { x: number; y: number } {
  return getPcbState(pcb).getOffset();
}

export function pcbRegisterRouter(
  pcb: PCB,
  registerFn: (
    registry: {
      register(name: string, factory: RouterFactory, options?: { configureGrid?: RouterGridConfigurator }): void;
    },
    algorithm?: string,
  ) => void,
): void {
  registerRouter(registerFn);
}

export function autorouteBatchOnPcb(
  pcb: PCB,
  items: Array<{
    from: Pin | Pin[];
    to: Pin | Pin[];
    options?: import('./pcb_interfaces.js').IAutorouteRouteOptions;
    name?: string;
  }>,
  batchOptions?: {
    rounds?: number;
    reorder?: 'none' | 'reverse' | 'byDistance';
    relaxViaCostPerRound?: number;
    increaseIterationsPerRound?: number;
  },
): { results: IAutorouteResult[]; success: boolean; rounds: number } {
  return pcbAutorouteBatch(pcb, items, batchOptions);
}
