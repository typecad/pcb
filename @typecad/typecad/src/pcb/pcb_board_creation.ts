import { Component } from "../component.js";
import { TrackBuilder } from './pcb_track_builder.js';
import { parse, nameOf } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';
import logger from '../logging.js';
import { BoardCreationError } from '../errors.js';
import {
    IVia,
    IGrLine,
    IOutline,
    OutlineElement
} from './pcb_interfaces.js';
import { createFootprintNode } from './pcb_footprint.js';
import { mergeNets } from './pcb_net_merger.js';
import { parseExistingBoard, insertNetsIntoBoardContents, processExistingFootprints } from './pcb_existing_board.js';
import { getCallSite } from '../utils/stack_trace.js';
import { renderVias, renderOutlinesAndTracks, renderGraphics, renderZones, renderKeepoutZones, serializeAndWriteBoard } from './pcb_board_serializer.js';
import { IPcbBoardContext } from './pcb_board_context.js';
import { getErrorMessage } from './pcb_utils.js';
import { reportError } from '../utils/error_reporter.js';
import { schematic } from '../schematic_visualizer.js';

function buildComponentMaps(pcb: IPcbBoardContext): {
    componentMap: Map<string, Component>;
    viaMap: Map<string, IVia>;
} {
    const componentMap = new Map<string, Component>();
    pcb.state.components.forEach((comp: Component) => {
        if (!comp.dnp && comp.uuid && comp.via === false) {
            componentMap.set(comp.uuid, comp);
        }
    });

    const viaMap = new Map<string, IVia>();
    pcb.state.components.forEach((comp: Component) => {
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

function collectBoardComponents(
    pcb: IPcbBoardContext,
    items: Array<Component | TrackBuilder>,
    components: Component[]
): void {
    const viaComponents: Component[] = [];
    pcb.state.components.forEach((comp: Component) => {
        if (comp.via === true) viaComponents.push(comp);
    });

    pcb.state.components = [];
    pcb.state.outlines = [];

    for (const component of components) {
        if (component.dnp !== true) pcb.state.components.push(component);
    }

    pcb.state.stagedComponents.forEach((stagedComponent: Component) => {
        if (stagedComponent.dnp !== true) pcb.state.components.push(stagedComponent);
    });

    viaComponents.forEach((viaComponent: Component) => {
        if (viaComponent.dnp !== true) pcb.state.components.push(viaComponent);
    });
}

function separateOutlinesAndTracks(pcb: IPcbBoardContext): void {
    logger.debug(`[BoardCreation][DEBUG] Including staged outlines: stagedOutlines=${pcb.state.stagedOutlines.length}, outlines_public(before)=${pcb.state.outlines.length}`);
    pcb.state.outlines.push(...pcb.state.stagedOutlines);
    logger.debug(`[BoardCreation][DEBUG] outlines_public(after)=${pcb.state.outlines.length}`);

    pcb.outlines = pcb.state.outlines.filter((outline: IOutline) => {
        return outline.elements.some((element: OutlineElement) => {
            if (element.type === 'arc') return true;
            if (element.type === 'line') {
                const isCopperLayer = /\.Cu$/.test((element as IGrLine).layer);
                return !isCopperLayer;
            }
            return false;
        });
    });

    pcb.tracks = pcb.state.outlines.filter((outline: IOutline) => {
        return outline.elements.some((element: OutlineElement) => {
            if (element.type === 'line') {
                const isCopperLayer = /\.Cu$/.test((element as IGrLine).layer);
                return isCopperLayer;
            }
            return false;
        });
    });
}

export function createBoard(
    pcb: IPcbBoardContext,
    ...items: Array<Component | TrackBuilder>
) {
    const components: Component[] = [];
    const trackBuilders: TrackBuilder[] = [];

    items.forEach(item => {
        if (item instanceof Component) {
            components.push(item);
        } else if (item instanceof TrackBuilder) {
            trackBuilders.push(item);
        }
    });

    pcb.schematic!.create(...components);
    schematic(pcb.schematic!);
    collectBoardComponents(pcb, items, components);
    separateOutlinesAndTracks(pcb);

    const { componentMap, viaMap } = buildComponentMaps(pcb);

    const version = parse('(version 20241229)');
    const generator = parse('(generator "typecad")');
    const generator_version = parse('(generator_version "0.1.0")');
    const general = parse('(general (thickness 1.6) (legacy_teardrops no))');
    const paper = parse('(paper "A4")');
    const headerItems = [version, generator, generator_version, general, paper];

    const { boardContents, boardNetNameToCodeMap, componentMap: updatedComponentMap } = parseExistingBoard(pcb, headerItems, componentMap);

    const { allNets, boardNetNameToCodeMap: finalNetMap } = mergeNets(
        pcb.schematic,
        pcb.schematic?.nodes,
        boardContents,
        viaMap
    );

    for (const [key, val] of finalNetMap) {
        boardNetNameToCodeMap.set(key, val);
    }

    const finalBoardContents = insertNetsIntoBoardContents(boardContents, allNets);

    pcb.state.groups.forEach((groupString: string) => {
        try {
            const groupNode = parse(groupString) as SExpr[];
            if (groupNode) finalBoardContents.push(groupNode);
        } catch (e: unknown) {
            const callSite = getCallSite();
            reportError(`Failed to parse group string: ${getErrorMessage(e)}`, {
                reference: 'Group',
                sourceInfo: callSite ? { file: callSite.file, line: callSite.line } : undefined
            });
        }
    });
    pcb.state.groups = [];

    processExistingFootprints(pcb.state.existingBoardElements, pcb, updatedComponentMap, boardNetNameToCodeMap, finalBoardContents);

    updatedComponentMap.forEach(component => {
        try {
            const newNode = createFootprintNode(component, (ref, pin, uuid, map) => pcb.resolveNet(ref, pin, uuid, map), boardNetNameToCodeMap);
            finalBoardContents.push(newNode);
        } catch (e: unknown) {
            throw new BoardCreationError(`[${component.footprint} ${component.reference} ${component.description}] Failed to create footprint node. Is the .kicad_mod missing or empty in build/footprints/? Footprint must be in format "library:footprint" (e.g., "Resistor_SMD:R_0603_1608Metric" or "lib:Local_Footprint"`);
        }
    });

    renderVias(viaMap, pcb, finalNetMap, finalBoardContents);
    renderOutlinesAndTracks(pcb.state.outlines, pcb, finalNetMap, finalBoardContents);
    renderGraphics(pcb, finalBoardContents);
    renderZones(pcb.state.zones, pcb, finalNetMap, finalBoardContents);
    renderKeepoutZones(pcb.state.keepoutZones, finalBoardContents);

    serializeAndWriteBoard(pcb, finalBoardContents, version);
}
