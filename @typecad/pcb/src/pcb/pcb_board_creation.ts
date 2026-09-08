import { Component } from '../component.js';
import { TrackBuilder } from './pcb_track_builder.js';
import { parse, parseAsList, nameOf, s, no } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';
import logger from '../utils/logging.js';
import { BoardCreationError } from '../utils/errors.js';
import { IVia, IGrLine, IOutline, OutlineElement } from './pcb_interfaces.js';
import { createFootprintNode } from './pcb_footprint.js';
import { mergeNets } from './pcb_net_merger.js';
import { materializePlanes } from './pcb_zones.js';
import { materializeStitches } from './pcb_stitching.js';
import { materializeZoneFills } from './pcb_zone_fill.js';
import { parseExistingBoard, insertNetsIntoBoardContents, processExistingFootprints } from './pcb_existing_board.js';
import { getCallSite } from '../utils/stack_trace.js';
import {
  renderVias,
  renderOutlinesAndTracks,
  renderGraphics,
  renderZones,
  renderKeepoutZones,
  serializeAndWriteBoard,
  ensureSingleSetupNode,
  ensureSingleLayersNode,
} from './pcb_board_serializer.js';
import { writeRulesToProject } from './pcb_rules.js';
import { buildStackup, buildLayersNode } from './pcb_stackup.js';
import { validateDeclaredLayers } from './pcb_layer_validation.js';
import { PCB, getPcbState, setPcbOutlines, setPcbTracks, pcbResolveNet } from './pcb.js';
import { getErrorMessage } from './pcb_utils.js';
import { reportError } from '../utils/error_reporter.js';
import { displayName } from '../utils/error_reporter.js';
import { schematic } from '../renderers/schematic_visualizer.js';

export function isComponentLike(obj: unknown): obj is Component {
  if (obj instanceof Component) return true;
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.footprint === 'string' &&
    typeof o.pcb === 'object' &&
    o.pcb !== null &&
    typeof o.dnp === 'boolean' &&
    typeof o.via === 'boolean' &&
    Array.isArray(o.pins)
  );
}

export function isTrackBuilderLike(obj: unknown): obj is TrackBuilder {
  if (obj instanceof TrackBuilder) return true;
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return typeof o.from === 'function' && typeof o.to === 'function' && typeof o.route === 'function';
}

function buildComponentMaps(pcb: PCB): {
  componentMap: Map<string, Component>;
  viaMap: Map<string, IVia>;
} {
  const state = getPcbState(pcb);
  const componentMap = new Map<string, Component>();
  state.components.forEach((comp: Component) => {
    if (!comp.dnp && comp.uuid && comp.via === false) {
      componentMap.set(comp.uuid, comp);
    }
  });

  const viaMap = new Map<string, IVia>();
  state.components.forEach((comp: Component) => {
    if (comp.via === true && comp.uuid && comp.viaData) {
      const viaDataFromComponent = { ...comp.viaData };
      if (comp.pcb && typeof comp.pcb.x === 'number' && typeof comp.pcb.y === 'number') {
        viaDataFromComponent.at = { x: comp.pcb.x, y: comp.pcb.y };
      }
      viaMap.set(comp.uuid, viaDataFromComponent);
    }
  });

  return { componentMap, viaMap };
}

function collectBoardComponents(pcb: PCB, items: Array<Component | TrackBuilder>, components: Component[]): void {
  const state = getPcbState(pcb);
  const viaComponents: Component[] = [];
  state.components.forEach((comp: Component) => {
    if (comp.via === true) viaComponents.push(comp);
  });

  state.components = [];
  state.outlines = [];

  for (const component of components) {
    if (component.dnp !== true) state.components.push(component);
  }

  state.stagedComponents.forEach((stagedComponent: Component) => {
    if (stagedComponent.dnp !== true) state.components.push(stagedComponent);
  });

  viaComponents.forEach((viaComponent: Component) => {
    if (viaComponent.dnp !== true) state.components.push(viaComponent);
  });
}

function separateOutlinesAndTracks(pcb: PCB): void {
  const state = getPcbState(pcb);
  logger.debug(
    `[BoardCreation][DEBUG] Including staged outlines: stagedOutlines=${state.stagedOutlines.length}, outlines_public(before)=${state.outlines.length}`,
  );
  state.outlines.push(...state.stagedOutlines);
  logger.debug(`[BoardCreation][DEBUG] outlines_public(after)=${state.outlines.length}`);

  setPcbOutlines(
    pcb,
    state.outlines.filter((outline: IOutline) => {
      return outline.elements.some((element: OutlineElement) => {
        if (element.type === 'arc' || element.type === 'circle' || element.type === 'rect' || element.type === 'poly') {
          return true;
        }
        if (element.type === 'line') {
          const isCopperLayer = /\.Cu$/.test((element as IGrLine).layer);
          return !isCopperLayer;
        }
        return false;
      });
    }),
  );

  setPcbTracks(
    pcb,
    state.outlines.filter((outline: IOutline) => {
      return outline.elements.some((element: OutlineElement) => {
        if (element.type === 'line') {
          const isCopperLayer = /\.Cu$/.test((element as IGrLine).layer);
          return isCopperLayer;
        }
        return false;
      });
    }),
  );
}

export function createBoard(pcb: PCB, ...items: Array<Component | TrackBuilder>) {
  const state = getPcbState(pcb);
  const components: Component[] = [];
  const trackBuilders: TrackBuilder[] = [];

  items.forEach((item: unknown) => {
    if (isComponentLike(item)) {
      components.push(item);
    } else if (isTrackBuilderLike(item)) {
      trackBuilders.push(item);
    } else {
      const name =
        item !== null && typeof item === 'object' && 'constructor' in item
          ? (item as { constructor: { name: string } }).constructor.name
          : typeof item;
      const site = getCallSite();
      logger.warn(
        `[BoardCreation] Unrecognized item passed to create(): ${name}. Items must be Component or TrackBuilder instances.${site ? ` (called from ${site.file}:${site.line})` : ''}`,
      );
    }
  });

  pcb.schematic.create(...components);
  schematic(pcb.schematic);
  collectBoardComponents(pcb, items, components);
  separateOutlinesAndTracks(pcb);

  // Re-resolve deferred placement expressions (`below(r1).by(3)`,
  // `board(pcb).fromLeft(5)`) against final state. Chains resolve in
  // passes: each pass re-reads targets' current positions, so a dependent
  // stack settles within at most one pass per link.
  const placementComponents = [...state.components, ...state.stagedComponents];
  for (let pass = 0; pass < placementComponents.length; pass++) {
    let changed = false;
    for (const c of placementComponents) {
      if (c._refreshPlacement()) changed = true;
    }
    if (!changed) break;
  }

  materializePlanes(state);
  materializeStitches(pcb);

  const { componentMap, viaMap } = buildComponentMaps(pcb);

  const version = parse('(version 20241229)');
  const generator = parse('(generator "typecad")');
  const generator_version = parse('(generator_version "0.1.0")');
  const general = s('general', s('thickness', pcb.thickness), s('legacy_teardrops', no()));
  const paper = parse('(paper "A4")');
  const headerItems = [version, generator, generator_version, general, paper];

  const {
    boardContents,
    boardNetNameToCodeMap,
    componentMap: updatedComponentMap,
  } = parseExistingBoard(pcb, headerItems, componentMap);

  // Generate the layer stackup and layer declarations. The stackup lives
  // inside `(setup ...)`, and the `(layers ...)` block must match the
  // copper-layer count. Both use dedup helpers so an existing board's
  // setup/layers are replaced (not duplicated). Emitted when the user
  // called `pcb.stackup()` (even for 2 layers, to apply material options)
  // or when the board's copper-layer count (constructor `layers` option)
  // exceeds the 2-layer default.
  const stackupCfg = pcb.stackupConfig;
  const layerCount = pcb.layerCount;
  if (stackupCfg || layerCount > 2) {
    const stackupNode = buildStackup(layerCount, pcb.thickness, pcb.copper_thickness, stackupCfg?.options);
    const setupNode = s('setup', stackupNode);
    ensureSingleSetupNode(boardContents, setupNode);
    ensureSingleLayersNode(boardContents, buildLayersNode(layerCount));
  }

  const { allNets, boardNetNameToCodeMap: finalNetMap } = mergeNets(
    pcb.schematic,
    pcb.schematic?.nodes,
    boardContents,
    viaMap,
  );

  for (const [key, val] of finalNetMap) {
    boardNetNameToCodeMap.set(key, val);
  }

  const finalBoardContents = insertNetsIntoBoardContents(boardContents, allNets);

  state.groups.forEach((groupString: string) => {
    try {
      const groupNode = parseAsList(groupString);
      if (groupNode) finalBoardContents.push(groupNode);
    } catch (e: unknown) {
      const callSite = getCallSite();
      reportError(`Failed to parse group string: ${getErrorMessage(e)}`, {
        reference: 'Group',
        sourceInfo: callSite ? { file: callSite.file, line: callSite.line } : undefined,
      });
    }
  });
  state.groups = [];

  processExistingFootprints(
    state.existingBoardElements,
    pcb,
    updatedComponentMap,
    boardNetNameToCodeMap,
    finalBoardContents,
  );

  updatedComponentMap.forEach((component) => {
    try {
      const newNode = createFootprintNode(
        component,
        (ref, pin, uuid, map) => pcbResolveNet(pcb, ref, pin, uuid, map),
        boardNetNameToCodeMap,
      );
      finalBoardContents.push(newNode);
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e);
      reportError(`Failed to create footprint node for ${displayName(component)}.`, component);
      throw new BoardCreationError(
        `[${component.footprint} ${component.reference} ${component.description}] Failed to create footprint node: ${detail}`,
      );
    }
  });

  renderVias(viaMap, pcb, finalNetMap, finalBoardContents);
  renderOutlinesAndTracks(state.outlines, pcb, finalNetMap, finalBoardContents);
  renderGraphics(pcb, finalBoardContents);
  renderZones(state.zones, pcb, finalNetMap, finalBoardContents);
  renderKeepoutZones(state.keepoutZones, finalBoardContents);

  validateDeclaredLayers(layerCount, state, viaMap);

  serializeAndWriteBoard(pcb, finalBoardContents, version);
  writeRulesToProject(
    pcb.boardName,
    pcb.rules,
    pcb.netClasses.definitions,
    pcb.netClasses.assignmentEntries,
    pcb.teardropConfig,
  );

  // Mark the board as written: autorouting from here on can never reach the
  // board file, so the routing API throws on it instead of failing quietly.
  state.boardWritten = true;

  // Materialize declared zone fills on the written board (KiCad computes
  // the fill geometry; skipped gracefully without kicad-cli).
  materializeZoneFills(pcb, state);
}
