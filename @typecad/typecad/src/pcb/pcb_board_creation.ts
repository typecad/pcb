import { Component } from "../component.js";
import { TrackBuilder } from './pcb_track_builder.js';
import { Schematic, setPendingBoardFilePath } from "../schematic.js";
import fs from "node:fs";
import { parse, serialize, s, sym, yes, no, Sym, nameOf } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';
import type { SexprNode } from '../types/sexpr_types.js';
import logger from '../logging.js';
import { BoardCreationError } from '../errors.js';
import { reportError } from '../utils/error_reporter.js';
import {
    IVia,
    IGrLine,
    IGrArc,
    IGrCircle,
    IGrRect,
    IGrPoly,
    IGrTextOptions,
    IFilledZone,
    IKeepoutZone,
    IPcbOptions,
    IOutline,
    OutlineElement
} from './pcb_interfaces.js';
import type { ISchematicNode } from '../types/schematic_types.js';
import { IPcbBoardContext } from './pcb_board_context.js';
import { normalizeNetName, formatCallSite, getErrorMessage } from './pcb_utils.js';
import { createFootprintNode, updateFootprintNode } from './pcb_footprint.js';



/**
 * Creates and saves the board to a file.
 * This function extracts the board creation logic from the PCB class.
 *
 * @param pcb - The PCB instance containing all board data (typed via IPcbBoardContext)
 * @param items - Components and TrackBuilder instances to add to the board before creating.
 */
export function createBoard(
    pcb: IPcbBoardContext,
    ...items: Array<Component | TrackBuilder>
) {
    // Separate components from track builders
    const components: Component[] = [];
    const trackBuilders: TrackBuilder[] = [];

    items.forEach(item => {
        if (item && typeof item === 'object' && 'reference' in item) {
            components.push(item);
        } else if (item instanceof TrackBuilder) {
            trackBuilders.push(item);
        }
    });

    // Only pass components to schematic (TrackBuilders don't create schematic elements)
    pcb.Schematic!.create(...components);

    // Clear the board components and only add components explicitly passed to create()
    // But first, preserve any via components that were created during routing
    const viaComponents: Component[] = [];
    pcb.components.forEach((comp: Component) => {
        if (comp.via === true) {
            viaComponents.push(comp);
        }
    });
    pcb.state.components = [];

    pcb.state.outlines = [];

    // Add all explicitly passed components to the board
    components.forEach((component) => {
        if (component.dnp !== true) pcb.state.components.push(component);
    });

    // TrackBuilder instances: tracks are already in stagedOutlines from _track() calls,
    // vias are already in components via pcb.place() calls - nothing more to do

    // Add all staged components to the board
    pcb.stagedComponents.forEach((stagedComponent: Component) => {
        if (stagedComponent.dnp !== true) pcb.state.components.push(stagedComponent);
    });

    viaComponents.forEach((viaComponent: Component) => {
        if (viaComponent.dnp !== true) pcb.state.components.push(viaComponent);
    });

    // Include any outlines/tracks that were created during this create() session
    // This allows tracks created during component placement or grouping to appear
    
    // Debug: record counts before and after including staged outlines
    logger.debug(`[BoardCreation][DEBUG] Including staged outlines: stagedOutlines=${pcb.stagedOutlines.length}, outlines_public(before)=${pcb.outlines_public.length}`);
    pcb.outlines_public.push(...pcb.stagedOutlines);
    logger.debug(`[BoardCreation][DEBUG] outlines_public(after)=${pcb.outlines_public.length}`);

    // Update public properties - separate outlines from tracks based on layer
    // Outlines: lines/arcs on non-copper layers (Edge.Cuts, silkscreen, etc.)
    // Tracks: lines on copper layers (F.Cu, B.Cu, In1.Cu, etc.)
    pcb.outlines = pcb.outlines_public.filter((outline: IOutline) => {
        return outline.elements.some((element: OutlineElement) => {
            if (element.type === 'arc') return true; // Arcs are typically for board outlines
            if (element.type === 'line') {
                const line = element as IGrLine;
                const isCopperLayer = /\.Cu$/.test(line.layer);
                return !isCopperLayer; // Only include lines NOT on copper layers
            }
            return false;
        });
    });

    pcb.tracks = pcb.outlines_public.filter((outline: IOutline) => {
        return outline.elements.some((element: OutlineElement) => {
            if (element.type === 'line') {
                const line = element as IGrLine;
                const isCopperLayer = /\.Cu$/.test(line.layer);
                return isCopperLayer; // Only include lines on copper layers
            }
            return false;
        });
    });

    const version = parse('(version 20241229)');
    const generator = parse('(generator "typecad")');
    const generator_version = parse('(generator_version "0.1.0")');
    const general = parse('(general (thickness 1.6) (legacy_teardrops no))');
    const paper = parse('(paper "A4")');

    const componentMap = new Map<string, Component>();
    pcb.components.forEach((comp: Component) => {
        if (!comp.dnp && comp.uuid && comp.via === false) {
            componentMap.set(comp.uuid, comp);
        }
    });

    const viaMap = new Map<string, IVia>();

    let viaCount = 0;
    pcb.components.forEach((comp: Component) => {
        if (comp.via === true && comp.uuid && comp.viaData) {
            viaCount++;

            const viaDataFromComponent = { ...comp.viaData };

            if (comp.pcb && typeof comp.pcb.x === 'number' && typeof comp.pcb.y === 'number') {
                viaDataFromComponent.at = { x: comp.pcb.x, y: comp.pcb.y };
            }
            viaMap.set(comp.uuid, viaDataFromComponent);
        }
    });

    let existing_board_contents: SexprNode = [];
    const boardFilePath = `./build/${pcb.Boardname}.kicad_pcb`;
    const boardNetNameToCodeMap = new Map<string, number>();

    if (pcb.existingBoardElements.length > 0) {
        existing_board_contents = [sym('kicad_pcb'), ...(pcb.existingBoardElements as SexprNode)];
    }

    let final_board_contents: SexprNode = [];
    let headerItems = [version, generator, generator_version, general, paper];

    if (existing_board_contents.length > 1) {
        existing_board_contents.slice(1).forEach(item => {
            if (typeof item === 'string' && item.startsWith('(')) {
                try {
                    final_board_contents.push(parse(item) as SexprNode);
                } catch {
                    final_board_contents.push(item);
                }
            } else if (Array.isArray(item) && item.length > 0) {
                const nodeType = nameOf(item[0]);

                if (nodeType === 'net' && item.length >= 3 && !isNaN(Number(item[1]))) {
                    const netCode = Number(item[1]);
                    let originalNetNameFromFile = String(item[2]);
                    let netNameForMapKey = originalNetNameFromFile;

                    if (netNameForMapKey.startsWith('`') && netNameForMapKey.endsWith('`')) {
                        netNameForMapKey = netNameForMapKey.substring(1, netNameForMapKey.length - 1);
                    } else if (netNameForMapKey.startsWith('"') && netNameForMapKey.endsWith('"')) {
                        netNameForMapKey = netNameForMapKey.substring(1, netNameForMapKey.length - 1);
                    }
                    if (netNameForMapKey.startsWith('/')) {
                        netNameForMapKey = netNameForMapKey.substring(1);
                    }
                    netNameForMapKey = netNameForMapKey.toLowerCase();

                    if (netNameForMapKey) {
                        boardNetNameToCodeMap.set(netNameForMapKey, netCode);
                    }
                    final_board_contents.push(item);
                } else if (nodeType !== 'footprint' &&
                    nodeType !== 'group' &&
                    nodeType !== 'gr_rect' &&
                    nodeType !== 'gr_line' &&
                    nodeType !== 'gr_arc' &&
                    nodeType !== 'gr_circle' &&
                    nodeType !== 'gr_poly' &&
                    nodeType !== 'gr_text' &&
                    nodeType !== 'via' &&
                    nodeType !== 'segment' &&
                    nodeType !== 'zone' &&
                    nodeType !== 'generator' &&
                    nodeType !== 'generator_version') {
                    final_board_contents.push(item);
                }
            }
        });
        headerItems.forEach(header => {
            const headerSymbol = Array.isArray(header) ? nameOf(header[0]) : '';
            if (!final_board_contents.some(item => (typeof item === 'string' && item.includes(`(${headerSymbol}`)) || (Array.isArray(item) && nameOf(item[0]) === headerSymbol))) {
                final_board_contents.unshift(header);
            }
        });
    } else {
        final_board_contents = [...headerItems];
    }

    const schematicNetDefinitions: SexprNode = [];
    if (!pcb.Schematic) {
        logger.warn(`[PCB CREATE] Warning: No schematic provided. Net information will be limited to existing board nets.`);
    } else if (pcb.Schematic.Nodes) {
        pcb.Schematic.Nodes.forEach((schematicNet: ISchematicNode) => {
            schematicNetDefinitions.push(s('net', schematicNet.code, schematicNet.name));
        });
    }

    let boardContentsWithoutNets = final_board_contents.filter(item => {
        // Keep everything except net definitions - we'll handle nets separately
        if (Array.isArray(item) && nameOf(item[0]) === 'net') {
            return false;
        }
        if (typeof item === 'string' && item.trim().startsWith('(net ')) {
            try {
                const parsedItem = parse(item) as SexprNode;
                if (Array.isArray(parsedItem) && nameOf(parsedItem[0]) === 'net') return false;
            } catch (e) { /* ignore */ }
        }
        return true;
    });

    // Collect existing nets from the board file to preserve them
    const existingNets = new Map<string, SexprNode>();
    const existingNetCodes = new Set<number>();

    final_board_contents.forEach(item => {
        if (Array.isArray(item) && nameOf(item[0]) === 'net') {
            const netCode = parseInt(String(item[1]));
            const netName = String(item[2] || '').replace(/["`]/g, '');
            if (!isNaN(netCode)) {
                const netKey = `${netCode}:${netName}`;
                existingNets.set(netKey, item as SexprNode);
                existingNetCodes.add(netCode);
            }
        } else if (typeof item === 'string' && item.trim().startsWith('(net ')) {
            try {
                const parsedItem = parse(item) as SexprNode;
                if (Array.isArray(parsedItem) && nameOf(parsedItem[0]) === 'net') {
                    const netCode = parseInt(String(parsedItem[1]));
                    const netName = String(parsedItem[2] || '').replace(/["`]/g, '');
                    if (!isNaN(netCode)) {
                        const netKey = `${netCode}:${netName}`;
                        existingNets.set(netKey, parsedItem);
                        existingNetCodes.add(netCode);
                    }
                }
            } catch (e) { /* ignore */ }
        }
    });

    // Merge schematic nets with existing nets, ensuring unique net names and codes.
    const allNets: SexprNode = [];
    const mergedNetCodes = new Set<number>();
    const finalNetDefinitionsByName = new Map<string, SexprNode>();

    const formatNetNameForSExpr = (name: string): string => {
        return String(name ?? '').replace(/[`"]/g, '');
    };

    // Pass 1: Add existing board nets. Prioritize these definitions.
    // `existingNets` (Map<`${code}:${name}`, netDefArray>) is populated from the board file.
    // `boardNetNameToCodeMap` (normalizedName -> code) is also from the board file.

    // Create a temporary map of board nets by normalized name for easier lookup and ensuring unique names from board.
    const boardNetsProcessedByName = new Map<string, SexprNode>();
    if (existingNets && existingNets.size > 0) {
        const sortedExistingNetDefs = Array.from(existingNets.values()).sort((a,b) => parseInt(String(a[1])) - parseInt(String(b[1])));
        for (const netDef of sortedExistingNetDefs) {
            const name = String(netDef[2]).replace(/[`"]/g, '');
            let normalizedName = name.toLowerCase();
            if (normalizedName.startsWith('/')) {
                normalizedName = normalizedName.substring(1);
            }
            if (!boardNetsProcessedByName.has(normalizedName)) { // Keep first encountered definition for a given name
                boardNetsProcessedByName.set(normalizedName, netDef);
            }
        }
    }

    boardNetsProcessedByName.forEach((netDef, normalizedName) => {
        const code = parseInt(String(netDef[1]));
        finalNetDefinitionsByName.set(normalizedName, netDef);
        mergedNetCodes.add(code);
    });

    // Determine max code for potential renumbering new schematic nets
    let maxCodeInUse = 0;
    mergedNetCodes.forEach(c => maxCodeInUse = Math.max(maxCodeInUse, c));
    schematicNetDefinitions.forEach(schNet => maxCodeInUse = Math.max(maxCodeInUse, parseInt(String((schNet as SexprNode)[1]))));

    const getNextAvailableNetIdHelper = (currentMax: number, usedSet: Set<number>): number => {
        let id = currentMax + 1;
        while(usedSet.has(id)) {
            id++;
        }
        return id;
    };

    // Pass 2: Integrate schematic nets.
    schematicNetDefinitions.forEach((schematicNetDef: SExpr) => {
        const netDefArray = schematicNetDef as SexprNode;
        const originalSchCode = parseInt(String(netDefArray[1]));
        const schNameSExpr = netDefArray[2] as string;
        const schName = String(schNameSExpr).replace(/[`"]/g, '');
            let normalizedSchName = normalizeNetName(schName);
        if (!normalizedSchName) return;

        if (finalNetDefinitionsByName.has(normalizedSchName)) {
            // Net name already exists (came from board). Board's definition is authoritative.
            // Ensure boardNetNameToCodeMap (used by #resolveNet) reflects the board's code for this name.
            const boardDef = finalNetDefinitionsByName.get(normalizedSchName)!;
            const boardCode = parseInt(String(boardDef[1]));
            boardNetNameToCodeMap.set(normalizedSchName, boardCode);
        } else {
            // This is a new net name from the schematic.
            let finalCode = originalSchCode;
            if (mergedNetCodes.has(originalSchCode)) { // Code conflict with an existing *different* named net.
                finalCode = getNextAvailableNetIdHelper(maxCodeInUse, mergedNetCodes);
                maxCodeInUse = finalCode; // Update max for next potential renumbering
            }
            const newNetDefArray = s('net', finalCode, schNameSExpr);
            finalNetDefinitionsByName.set(normalizedSchName, newNetDefArray);
            mergedNetCodes.add(finalCode);
            boardNetNameToCodeMap.set(normalizedSchName, finalCode); // Update map for #resolveNet with the final code
        }
    });

    // Add nets referenced only by manual vias (not present in schematic or board file).
    const viaNetNames = new Map<string, string>(); // normalizedName -> originalName
    viaMap.forEach((viaData) => {
        if (viaData.net && typeof viaData.net === 'string' && viaData.net.trim().length > 0) {
            const normalized = normalizeNetName(viaData.net);
            if (normalized && !viaNetNames.has(normalized)) {
                viaNetNames.set(normalized, viaData.net);
            }
        }
    });

    viaNetNames.forEach((originalName, normalizedName) => {
        if (finalNetDefinitionsByName.has(normalizedName)) {
            return;
        }

        const newCode = getNextAvailableNetIdHelper(maxCodeInUse, mergedNetCodes);
        maxCodeInUse = newCode;
        const newNetDefArray = s('net', newCode, formatNetNameForSExpr(originalName));
        finalNetDefinitionsByName.set(normalizedName, newNetDefArray);
        mergedNetCodes.add(newCode);
        boardNetNameToCodeMap.set(normalizedName, newCode);
    });

    // Ensure net 0 "" (unconnected) exists.
    const emptyNetNormalizedKey = ""; // Normalized key for the unnamed net
    if (!finalNetDefinitionsByName.has(emptyNetNormalizedKey)) {
        if (!mergedNetCodes.has(0)) {
            finalNetDefinitionsByName.set(emptyNetNormalizedKey, s('net', 0, ''));
            mergedNetCodes.add(0); // Ensure 0 is marked as used
            boardNetNameToCodeMap.set(emptyNetNormalizedKey, 0);
        } else {
             // Code 0 is taken by a named net. This is unusual.
             // KiCad expects (net 0 "") to exist. We might need to shift the other net.
             // For now, log a warning. A more robust solution might re-evaluate all nets if 0 is taken by a named net.
             logger.error(`[Net Create] Cannot add (net 0 "") because code 0 is already in use by a named net. PCB might be invalid.`);
        }
    } else { // Net "" exists, ensure its code is 0.
        const def = finalNetDefinitionsByName.get(emptyNetNormalizedKey)!;
        const currentCodeForEmptyNet = parseInt(String(def[1]));
        if (currentCodeForEmptyNet !== 0) {
            if (!mergedNetCodes.has(0)) { // If 0 is free
                mergedNetCodes.delete(currentCodeForEmptyNet); // Free up its old code
                def[1] = 0; // Set to code 0
                mergedNetCodes.add(0);
                boardNetNameToCodeMap.set(emptyNetNormalizedKey, 0);
            } else { // Code 0 is taken by another named net AND "" net has a non-zero code.
                logger.error(`[Net Create] Net "" exists with code ${currentCodeForEmptyNet}, but code 0 is taken. PCB might be invalid.`);
            }
        }
    }

    // Populate allNets from finalNetDefinitionsByName, sorted by code.
    const sortedFinalNetDefs = Array.from(finalNetDefinitionsByName.values()).sort((a,b) => parseInt(String(a[1])) - parseInt(String(b[1])));
    sortedFinalNetDefs.forEach(def => {
        allNets.push(def);
    });

    let insertionIndex = -1;
    const preferredOrderMarkers = ['setup', 'layers', 'paper', 'general', 'generator_version', 'generator', 'version'];

    for (const marker of preferredOrderMarkers) {
        for (let i = 0; i < boardContentsWithoutNets.length; i++) {
            const currentItem = boardContentsWithoutNets[i];
            let itemType = '';
            if (Array.isArray(currentItem) && currentItem.length > 0) {
                itemType = nameOf(currentItem[0]);
            } else if (typeof currentItem === 'string' && currentItem.startsWith('(')) {
                try {
                    const parsed = parse(currentItem) as SexprNode;
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        itemType = nameOf(parsed[0]);
                    }
                } catch (e) { /* ignore */ }
            }
            if (itemType === marker) {
                insertionIndex = i + 1;
            }
        }
        if (insertionIndex !== -1 && marker === 'setup') break;
    }

    if (insertionIndex === -1) {
        let count = 0;
        const initialHeaders = ['version', 'generator', 'generator_version', 'general', 'paper', 'layers', 'setup'];
        for (let i = 0; i < boardContentsWithoutNets.length; ++i) {
            const currentItem = boardContentsWithoutNets[i];
            let itemType = '';
            if (Array.isArray(currentItem) && currentItem.length > 0) {
                itemType = nameOf(currentItem[0]);
            } else if (typeof currentItem === 'string' && currentItem.startsWith('(')) {
                try {
                    const parsed = parse(currentItem) as SexprNode;
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        itemType = nameOf(parsed[0]);
                    }
                } catch (e) { /* ignore */ }
            }
            if (initialHeaders.includes(itemType)) count = i + 1; else break;
        }
        insertionIndex = count > 0 ? count : (boardContentsWithoutNets.findIndex(item => typeof item !== 'string' || !item.startsWith('(')));
        if (insertionIndex === -1) insertionIndex = boardContentsWithoutNets.length;
    }

    if (allNets.length > 0) {
        boardContentsWithoutNets.splice(insertionIndex, 0, ...allNets);
    }

    final_board_contents = boardContentsWithoutNets;

    pcb.groups.forEach((groupString: string) => {
        try {
            const groupNode = parse(groupString) as SexprNode;
            if (groupNode) {
                final_board_contents.push(groupNode);
            }
        } catch (e: unknown) {
            const callSite = pcb.getCallSite();
            reportError(`Failed to parse group string: ${getErrorMessage(e)}`, {
                reference: 'Group',
                sourceInfo: callSite ? { file: callSite.file, line: callSite.line } : undefined
            });
        }
    });

    pcb.state.groups = [];

    if (existing_board_contents.length > 1) {
        existing_board_contents.slice(1).forEach(item => {
            if (Array.isArray(item) && nameOf(item[0]) === 'footprint') {
                let uuid: string | null = null;
                let existingAtNode: SexprNode | null = null;

                for (const subItem of item) {
                    if (Array.isArray(subItem)) {
                        if (nameOf(subItem[0]) === 'uuid' && typeof subItem[1] === 'string') {
                            uuid = subItem[1].replace(/[`"]/g, '');
                        } else if (nameOf(subItem[0]) === 'at' && subItem.length >= 3) {
                            existingAtNode = subItem as SexprNode;
                        }
                    }
                    if (uuid && existingAtNode) break;
                }
                if (uuid && !existingAtNode) {
                    for (const subItem of item) {
                        if (Array.isArray(subItem) && nameOf(subItem[0]) === 'at' && subItem.length >= 3) {
                            existingAtNode = subItem as SexprNode;
                            break;
                        }
                    }
                }


                if (uuid && componentMap.has(uuid)) {
                    const component = componentMap.get(uuid)!;

                    if (existingAtNode) {
                        const existingX = parseFloat(String(existingAtNode[1]));
                        const existingY = parseFloat(String(existingAtNode[2]));
                        let existingRotation = 0;
                        if (existingAtNode.length > 3 && typeof existingAtNode[3] !== 'undefined') {
                            const parsedRot = parseFloat(String(existingAtNode[3]));
                            if (!isNaN(parsedRot)) {
                                existingRotation = parsedRot;
                            }
                        }

                        if (!isNaN(existingX) && !isNaN(existingY)) {
                            component.pcb.x = existingX;
                            component.pcb.y = existingY;
                            component.pcb.rotation = existingRotation;
                        } else {
                            component.pcb.rotation = component.pcb.rotation ?? 0;
                        }
                    } else {
                        component.pcb.rotation = component.pcb.rotation ?? 0;
                    }

                    try {
                        for (const subItem of item) {
                            if (Array.isArray(subItem) && nameOf(subItem[0]) === 'pad') {
                                for (const padSubItem of subItem) {
                                    if (Array.isArray(padSubItem) && nameOf(padSubItem[0]) === 'at') {
                                        if (padSubItem.length === 3) {
                                            padSubItem.push(component.pcb.rotation);
                                        } else if (padSubItem.length === 4) {
                                            padSubItem[3] = component.pcb.rotation - parseFloat(String(padSubItem[3]));
                                        }
                                    }
                                }
                            }
                        }

                        const updatedNode = updateFootprintNode(item, component, (ref, pin, uuid, map) => pcb.resolveNet(ref, pin, uuid, map), boardNetNameToCodeMap);
                        final_board_contents.push(updatedNode);
                        componentMap.delete(uuid);
                    } catch (e: unknown) {
                        reportError(`Failed to update footprint node for ${component.reference || uuid}: ${getErrorMessage(e)}`, component);
                    }
                } else {
                    // Component exists in board file but not in current component list
                    if (pcb.options.remove_orphans) {
                        // Do not add to final_board_contents (effectively deletes orphaned component)
                    } else {
                        // Keep orphaned component when remove_orphans is false
                        final_board_contents.push(item);
                    }
                }
            }
            else if (Array.isArray(item) && nameOf(item[0]) === 'via') {
                // Skip all vias from old board - they will be regenerated from code
                // No need to preserve or check anything
            }
            else if (Array.isArray(item) && (nameOf(item[0]) === 'gr_line' || nameOf(item[0]) === 'segment' || nameOf(item[0]) === 'gr_arc' || nameOf(item[0]) === 'gr_rect')) {
                // Skip all tracks and graphical elements from old board - they will be regenerated from code
                // Segments are copper tracks, gr_* are graphical elements
            }
        });
    }


    componentMap.forEach(component => {
        try {
            const newNode = createFootprintNode(component, (ref, pin, uuid, map) => pcb.resolveNet(ref, pin, uuid, map), boardNetNameToCodeMap);
            final_board_contents.push(newNode);
        } catch (e: unknown) {
            throw new BoardCreationError(`[${component.footprint} ${component.reference} ${component.description}] Failed to create footprint node. Is the .kicad_mod missing or empty in build/footprints/? Footprint must be in format "library:footprint" (e.g., "Resistor_SMD:R_0603_1608Metric" or "lib:Local_Footprint"`);
        }
    });

    viaMap.forEach((viaData, uuid) => {
        let finalViaNetCode = 0;

        // For routing-created vias, directly use the routing-assigned net name
        // Vias created during routing don't exist in the schematic, so we resolve their net directly
        if (viaData.net && boardNetNameToCodeMap) {
            // Use the net name assigned by the routing system
            let lookupKey = viaData.net.toLowerCase();
            if (lookupKey.startsWith('/')) {
                lookupKey = lookupKey.substring(1);
            }

            if (boardNetNameToCodeMap.has(lookupKey)) {
                finalViaNetCode = boardNetNameToCodeMap.get(lookupKey)!;
            } else {
                logger.warn(`[BoardCreation] Could not resolve via net "${viaData.net}" in board net map, defaulting to net 0`);
                finalViaNetCode = 0;
            }
        } else if (viaData.uuid) {
            // Fallback to generalized net resolution function (for compatibility)
            const netResolution = pcb.resolveNet(
                '', // Empty reference since this is a via
                "1", // Vias always use pin number "1"
                viaData.uuid, // UUID for via lookup
                boardNetNameToCodeMap,
                viaData.net // Fallback to existing net name if any
            );

            finalViaNetCode = netResolution.netCode;

            // Update viaData with resolved net information
            if (netResolution.found) {
                viaData.net = netResolution.netName;
                viaData.netCode = netResolution.netCode;
            }
        } else {
            logger.warn(`[BoardCreation] Via missing UUID and net name. Assigning to net 0.`);
            finalViaNetCode = 0;
        }

        const viaLayers = viaData.layers || ['F.Cu', 'B.Cu'];
        try {
            const viaNode = s('via',
                s('at', viaData.at?.x || 0, viaData.at?.y || 0),
                s('size', viaData.size || 0.6),
                s('drill', viaData.drill || 0.3),
                s('layers', ...viaLayers),
                s('free', yes()),
                s('net', finalViaNetCode),
                s('uuid', uuid)
            );
            final_board_contents.push(viaNode);
        } catch (e: unknown) {
            logger.error(`👺 Error: Failed to build via node for UUID ${uuid}: ${getErrorMessage(e)}${formatCallSite(pcb.getCallSite())}`);
        }
    });

    pcb.outlines_public.forEach((conceptualOutline: IOutline) => {
        conceptualOutline.elements.forEach((element: OutlineElement) => {
            try {
                if (element.type === 'line') {
                    const line = element as IGrLine;
                    const isCopperLayer = line.layer.includes('.Cu') && !line.layer.includes('Edge.Cuts');

                    if (isCopperLayer) {
                        let segNetCode = 0;
                        if (line.net) {
                            let lookupKey = line.net.toLowerCase();
                            if (lookupKey.startsWith('/')) lookupKey = lookupKey.substring(1);
                            segNetCode = boardNetNameToCodeMap.get(lookupKey) ?? 0;
                        }
                        const segNode = s('segment',
                            s('start', line.start.x, line.start.y),
                            s('end', line.end.x, line.end.y),
                            s('width', line.strokeWidth),
                            s('locked', line.locked ? yes() : no()),
                            s('layer', line.layer),
                            s('net', segNetCode),
                            s('uuid', line.uuid)
                        );
                        final_board_contents.push(segNode);
                    } else {
                        const grLineNode = s('gr_line',
                            s('start', line.start.x, line.start.y),
                            s('end', line.end.x, line.end.y),
                            s('stroke', s('width', line.strokeWidth), s('type', sym('default'))),
                            s('layer', line.layer),
                            s('uuid', line.uuid)
                        );
                        final_board_contents.push(grLineNode);
                    }
                } else if (element.type === 'arc') {
                    const arc = element as IGrArc;
                    const grArcNode = s('gr_arc',
                        s('start', arc.start.x, arc.start.y),
                        s('mid', arc.mid.x, arc.mid.y),
                        s('end', arc.end.x, arc.end.y),
                        s('stroke', s('width', arc.strokeWidth), s('type', sym('default'))),
                        s('layer', arc.layer),
                        s('uuid', arc.uuid)
                    );
                    final_board_contents.push(grArcNode);
                }
            } catch (e: unknown) {
                logger.error(`👺 Error: Failed to build outline element for UUID ${element.uuid}: ${getErrorMessage(e)}${formatCallSite(pcb.getCallSite())}`);
            }
        });
    });


    pcb.grTexts.forEach((textElement: IGrTextOptions) => {
        const fontChildren: SexprNode = [];
        if (textElement.font) fontChildren.push(s('face', textElement.font));
        const width = textElement.width ?? 1.27;
        const height = textElement.height ?? 1.27;
        fontChildren.push(s('size', height, width));
        if (textElement.thickness !== undefined) fontChildren.push(s('thickness', textElement.thickness));
        if (textElement.bold) fontChildren.push(sym('bold'));
        if (textElement.italic) fontChildren.push(sym('italic'));

        const effectsChildren: SexprNode = [s('font', ...fontChildren)];
        const justifyChildren: SexprNode = [];
        const horizontal = textElement.justify?.horizontal;
        const vertical = textElement.justify?.vertical;
        const mirror = textElement.justify?.mirror ?? false;
        if (horizontal) justifyChildren.push(sym(horizontal));
        if (vertical) justifyChildren.push(sym(vertical));
        if (mirror) justifyChildren.push(sym('mirror'));
        effectsChildren.push(s('justify', ...justifyChildren));
        if (textElement.hide) effectsChildren.push(sym('hide'));

        try {
            const textNode = s('gr_text',
                textElement.text,
                s('at', textElement.x ?? 0, textElement.y ?? 0, textElement.rotation ?? 0),
                s('layer', textElement.layer ?? 'F.SilkS'),
                s('uuid', textElement.uuid ?? ''),
                s('effects', ...effectsChildren)
            );
            final_board_contents.push(textNode);
        } catch (e: unknown) {
            logger.error(`👺 Error: Failed to build gr_text node for UUID ${textElement.uuid}: ${getErrorMessage(e)}${formatCallSite(pcb.getCallSite())}`);
        }
    });

    pcb.grLines.forEach((line: IGrLine) => {
        const children: SexprNode = [
            s('start', line.start.x, line.start.y),
            s('end', line.end.x, line.end.y),
            s('stroke', s('width', line.strokeWidth), s('type', sym('default'))),
            s('layer', line.layer),
            s('uuid', line.uuid)
        ];
        if (line.locked) children.push(s('locked', yes()));
        final_board_contents.push(s('gr_line', ...children));
    });

    pcb.grCircles.forEach((circle: IGrCircle) => {
        const children: SexprNode = [
            s('center', circle.center.x, circle.center.y),
            s('end', circle.end.x, circle.end.y),
            s('stroke', s('width', circle.strokeWidth), s('type', sym('default'))),
            s('layer', circle.layer)
        ];
        if (circle.fill) children.push(s('fill', sym('solid')));
        children.push(s('uuid', circle.uuid));
        if (circle.locked) children.push(s('locked', yes()));
        final_board_contents.push(s('gr_circle', ...children));
    });

    pcb.grRects.forEach((rect: IGrRect) => {
        const children: SexprNode = [
            s('start', rect.start.x, rect.start.y),
            s('end', rect.end.x, rect.end.y),
            s('stroke', s('width', rect.strokeWidth), s('type', sym('default'))),
            s('layer', rect.layer)
        ];
        if (rect.fill) children.push(s('fill', sym('solid')));
        children.push(s('uuid', rect.uuid));
        if (rect.locked) children.push(s('locked', yes()));
        final_board_contents.push(s('gr_rect', ...children));
    });

    pcb.grPolys.forEach((poly: IGrPoly) => {
        const ptsChildren = poly.points.map((pt: { x: number; y: number }) => s('xy', pt.x, pt.y));
        const children: SexprNode = [
            s('pts', ...ptsChildren),
            s('stroke', s('width', poly.strokeWidth), s('type', sym('default'))),
            s('layer', poly.layer)
        ];
        if (poly.fill) children.push(s('fill', sym('solid')));
        children.push(s('uuid', poly.uuid));
        if (poly.locked) children.push(s('locked', yes()));
        final_board_contents.push(s('gr_poly', ...children));
    });

    // Generate filled zones
    pcb.zones.forEach((zone: IFilledZone) => {
        // Resolve net for the zone
        let netCode = 0;
        let netName = '';

        if (zone.net) {
            const parts = zone.net.split(':');
            const identifier = parts[0]; // 'pin' or 'net'

            if (identifier === 'pin' && parts.length === 3) {
                // Format: "pin:reference:pinNumber"
                const reference = parts[1];
                const pinNumber = parts[2];
                const netResolution = pcb.resolveNet(
                    reference,
                    pinNumber,
                    undefined,
                    boardNetNameToCodeMap
                );
                netCode = netResolution.netCode;
                netName = netResolution.netName;
            } else if (identifier === 'net' && parts.length === 2) {
                const searchNetName = parts[1];

                // Look up the net in the schematic by name
                if (pcb.Schematic && pcb.Schematic.Nodes) {
                    const foundNet = pcb.Schematic.Nodes.find((node: ISchematicNode) => {
                        // Case-insensitive comparison, strip leading slashes
                        let nodeName = node.name.toLowerCase();
                        let searchName = searchNetName.toLowerCase();
                        if (nodeName.startsWith('/')) nodeName = nodeName.substring(1);
                        if (searchName.startsWith('/')) searchName = searchName.substring(1);
                        return nodeName === searchName;
                    });

                    if (foundNet) {
                        netCode = foundNet.code;
                        netName = foundNet.name;
                    } else {
                        // Net not found in schematic, try board net map
                        const lookupKey = searchNetName.toLowerCase().replace(/^\//, '');
                        if (boardNetNameToCodeMap.has(lookupKey)) {
                            netCode = boardNetNameToCodeMap.get(lookupKey)!;
                            netName = searchNetName;
                        } else {
                            logger.error(`[PCB ZONE] ERROR: Net "${searchNetName}" not found in schematic or board${formatCallSite(pcb.getCallSite())}`);
                        }
                    }
                }
            }
        }

        const zoneChildren: SexprNode = [
            s('net', netCode),
            s('net_name', netName),
            s('layers', ...zone.layers),
        ];
        if (zone.name) zoneChildren.push(s('name', zone.name));
        zoneChildren.push(s('uuid', zone.uuid));
        if (zone.locked) zoneChildren.push(sym('locked'));
        if (zone.priority !== undefined && zone.priority !== 0) zoneChildren.push(s('priority', zone.priority));
        zoneChildren.push(s('hatch', sym(zone.hatchStyle ?? 'none'), zone.hatchPitch ?? 0));

        if (zone.connectPads === 'thru_hole_only') {
            zoneChildren.push(s('connect_pads', sym('thru_hole_only'), s('clearance', zone.clearance ?? 0)));
        } else if (zone.connectPads === 'full') {
            zoneChildren.push(s('connect_pads', yes(), s('clearance', zone.clearance ?? 0)));
        } else if (zone.connectPads === 'no') {
            zoneChildren.push(s('connect_pads', sym('no'), s('clearance', zone.clearance ?? 0)));
        } else {
            zoneChildren.push(s('connect_pads', s('clearance', zone.clearance ?? 0)));
        }

        zoneChildren.push(s('min_thickness', zone.minThickness ?? 0));

        if (zone.filled !== false) {
            const fillChildren: SexprNode = [yes()];
            if (zone.fillMode === 'hatched') fillChildren.push(s('mode', sym('hatched')));
            if (zone.fillArcSegments !== undefined) fillChildren.push(s('arc_segments', zone.fillArcSegments));
            fillChildren.push(s('thermal_gap', zone.thermalGap ?? 0));
            fillChildren.push(s('thermal_bridge_width', zone.thermalBridgeWidth ?? 0));
            if (zone.smoothing && zone.smoothing !== 'none' && zone.smoothingRadius !== undefined) {
                fillChildren.push(s('smoothing', sym(zone.smoothing)));
                fillChildren.push(s('radius', zone.smoothingRadius));
            }
            if (zone.islandRemovalMode !== undefined) {
                fillChildren.push(s('island_removal_mode', zone.islandRemovalMode));
                if (zone.islandRemovalMode === 2 && zone.islandAreaMin !== undefined) {
                    fillChildren.push(s('island_area_min', zone.islandAreaMin));
                }
            }
            if (zone.fillMode === 'hatched') {
                if (zone.hatchThickness !== undefined) fillChildren.push(s('hatch_thickness', zone.hatchThickness));
                if (zone.hatchGap !== undefined) fillChildren.push(s('hatch_gap', zone.hatchGap));
                if (zone.hatchOrientation !== undefined) fillChildren.push(s('hatch_orientation', zone.hatchOrientation));
                if (zone.hatchSmoothingLevel !== undefined) fillChildren.push(s('hatch_smoothing_level', zone.hatchSmoothingLevel));
                if (zone.hatchSmoothingValue !== undefined) fillChildren.push(s('hatch_smoothing_value', zone.hatchSmoothingValue));
                if (zone.hatchBorderAlgorithm) fillChildren.push(s('hatch_border_algorithm', zone.hatchBorderAlgorithm));
                if (zone.hatchMinHoleArea !== undefined) fillChildren.push(s('hatch_min_hole_area', zone.hatchMinHoleArea));
            }
            zoneChildren.push(s('fill', ...fillChildren));
        }

        const ptsChildren = zone.polygon.map(pt => s('xy', pt.x, pt.y));
        zoneChildren.push(s('polygon', s('pts', ...ptsChildren)));

        final_board_contents.push(s('zone', ...zoneChildren));
    });

    pcb.keepoutZones.forEach((zone: IKeepoutZone) => {
        const restrictions = zone.restrictions || {};
        const tracksAllowed = restrictions.tracks ? 'not_allowed' : 'allowed';
        const viasAllowed = restrictions.vias ? 'not_allowed' : 'allowed';
        const padsAllowed = restrictions.pads ? 'not_allowed' : 'allowed';
        const copperpourAllowed = restrictions.copperpour ? 'not_allowed' : 'allowed';
        const footprintsAllowed = restrictions.footprints ? 'not_allowed' : 'allowed';

        const hatchStyle = zone.hatchStyle || 'edge';
        const hatchPitch = zone.hatchPitch || 0.508;

        const zoneChildren: SexprNode = [
            s('net', 0),
            s('net_name', ''),
            s('layers', ...zone.layers),
        ];
        if (zone.name) zoneChildren.push(s('name', zone.name));
        zoneChildren.push(s('uuid', zone.uuid));
        if (zone.locked) zoneChildren.push(sym('locked'));
        if (zone.priority !== undefined && zone.priority !== 0) zoneChildren.push(s('priority', zone.priority));
        zoneChildren.push(s('hatch', sym(hatchStyle), hatchPitch));
        zoneChildren.push(s('keepout',
            s('tracks', sym(tracksAllowed)),
            s('vias', sym(viasAllowed)),
            s('pads', sym(padsAllowed)),
            s('copperpour', sym(copperpourAllowed)),
            s('footprints', sym(footprintsAllowed))
        ));

        if (zone.smoothing && zone.smoothing !== 'none' && zone.smoothingRadius !== undefined) {
            zoneChildren.push(s('smoothing', sym(zone.smoothing)));
            zoneChildren.push(s('radius', zone.smoothingRadius));
        }

        const ptsChildren = zone.polygon.map(pt => s('xy', pt.x, pt.y));
        zoneChildren.push(s('polygon', s('pts', ...ptsChildren)));

        final_board_contents.push(s('zone', ...zoneChildren));
    });

    let definitiveVersionNode: SexprNode | string | null = null;

    const existingVersionArrayNode = final_board_contents.find(item => Array.isArray(item) && nameOf(item[0]) === 'version') as SexprNode | undefined;

    const existingVersionStringNode = final_board_contents.find(item => typeof item === 'string' && item.startsWith('(version ')) as string | undefined;

    if (existingVersionArrayNode) {
        definitiveVersionNode = existingVersionArrayNode;
    } else if (existingVersionStringNode) {
        definitiveVersionNode = existingVersionStringNode;
    } else {
        definitiveVersionNode = version as SexprNode;
    }

    final_board_contents = final_board_contents.filter(item => {
        if (Array.isArray(item) && nameOf(item[0]) === 'version') return false;
        if (typeof item === 'string' && item.startsWith('(version ')) return false;
        return true;
    });

    // Prepend the single, definitive version node to the beginning
    final_board_contents.unshift(definitiveVersionNode!);

    // Clean up orphaned nets - collect all net codes that are actually used
    const usedNetCodes = new Set<number>();
    usedNetCodes.add(0); // Always include net 0 (unconnected)

    final_board_contents.forEach(item => {
        if (Array.isArray(item) && nameOf(item[0]) === 'footprint') {
            (item as SexprNode).forEach(subItem => {
                if (Array.isArray(subItem) && nameOf(subItem[0]) === 'pad') {
                    (subItem as SexprNode).forEach(padElement => {
                        if (Array.isArray(padElement) && nameOf(padElement[0]) === 'net') {
                            const netCode = parseInt(String((padElement as SexprNode)[1]));
                            if (!isNaN(netCode)) {
                                usedNetCodes.add(netCode);
                            }
                        }
                    });
                }
            });
        }
    });

    final_board_contents.forEach(item => {
        if (Array.isArray(item) && nameOf(item[0]) === 'via') {
            (item as SexprNode).forEach(viaElement => {
                if (Array.isArray(viaElement) && nameOf(viaElement[0]) === 'net') {
                    const netCode = parseInt(String((viaElement as SexprNode)[1]));
                    if (!isNaN(netCode)) {
                        usedNetCodes.add(netCode);
                    }
                }
            });
        }
    });

    final_board_contents.forEach(item => {
        if (Array.isArray(item) && nameOf(item[0]) === 'zone') {
            (item as SexprNode).forEach(zoneElement => {
                if (Array.isArray(zoneElement) && nameOf(zoneElement[0]) === 'net') {
                    const netCode = parseInt(String((zoneElement as SexprNode)[1]));
                    if (!isNaN(netCode)) {
                        usedNetCodes.add(netCode);
                    }
                }
            });
        }
    });

    const finalStructure: SExpr = [sym('kicad_pcb'), ...final_board_contents];
    try {
        // Serialize the structure with pretty printing
        // DIAGNOSTIC: count final_board_contents node types and collect UUIDs
        try {
            const segNodes = final_board_contents.filter(it => Array.isArray(it) && nameOf(it[0]) === 'segment');
            const grLineNodes = final_board_contents.filter(it => Array.isArray(it) && nameOf(it[0]) === 'gr_line');
            const segUuids: string[] = [];
            (segNodes as SexprNode[]).forEach((node: SexprNode) => {
                try {
                    const uuidPair = node.find((n) => Array.isArray(n) && nameOf((n as SexprNode)[0]) === 'uuid') as SexprNode | undefined;
                    if (uuidPair && uuidPair[1]) segUuids.push(String(uuidPair[1]));
                } catch (e) { /* ignore */ }
            });
            // logger.debug(`[BoardCreation][DIAG] final_board_contents: segments=${segNodes.length}, gr_lines=${grLineNodes.length}, segmentUUIDs=${segUuids.length}`);

                // DIAGNOSTIC: check staged outlines are present in final_board_contents
                try {
                    const stagedUuids = pcb.stagedOutlines.map((o: IOutline) => o.uuid).filter(Boolean);
                    const missingInFinal = stagedUuids.filter((u: string) => !JSON.stringify(final_board_contents).includes(u));
                    if (missingInFinal.length > 0) {
                            // logger.warn(`[BoardCreation][DIAG] staged outlines missing from final_board_contents: ${JSON.stringify(missingInFinal)}`);
                            // Print details about missing staged outlines for debugging
                            for (const miss of missingInFinal) {
                                const so = pcb.stagedOutlines.find((o: IOutline) => o.uuid === miss);
                                logger.debug(`[BoardCreation][DIAG] missing outline ${miss}: fullOutline=${JSON.stringify(so)}`);
                            }
                    } else {
                        logger.debug(`[BoardCreation][DIAG] all staged outlines present in final_board_contents`);
                    }
                } catch (e) { /* ignore */ }
        } catch (e) { /* ignore diagnostics */ }

        const serialized = serialize(finalStructure, { pretty: true });
        // DIAGNOSTIC: show short prefix of serialized content and check for segment/gr_line tokens
        try {
            const prefix = serialized.substring(0, 1200);
            logger.debug(`[BoardCreation][DIAG] serialized prefix:\n${prefix}\n---`);
            const hasSegmentToken = serialized.includes('(segment');
            const hasGrLineToken = serialized.includes('(gr_line');
            logger.debug('[BoardCreation][DIAG] serialized contains (segment=' + hasSegmentToken + ', gr_line=' + hasGrLineToken + ')');
        } catch (e) { /* ignore */ }
        pcb.state.pcb = serialized;
        // DIAGNOSTIC: inspect pcb.pcb (the final pretty printed string) before writing
        try {
            const pcbString = pcb.pcb ?? '';
            logger.debug(`[BoardCreation][DIAG] pcb.pcb length=${pcbString.length}, contains (segment=${pcbString.includes('(segment')}, contains (gr_line=${pcbString.includes('(gr_line')})`);
            // Optionally dump a short prefix for visual inspection
            logger.debug(`[BoardCreation][DIAG] pcb.pcb prefix:\n${pcbString.substring(0, 800)}\n---`);
        } catch (e) { /* ignore */ }

        // DEBUG: optionally write the pretty-printed PCB to a debug file and read it back to verify write/read fidelity
        // Enable by setting TYPECAD_DEBUG_BOARD_WRITE=1 in the environment
        try {
            if (process.env.TYPECAD_DEBUG_BOARD_WRITE === '1') {
                const debugPath = `./build/${pcb.Boardname}.debug.kicad_pcb`;
                fs.writeFileSync(debugPath, pcb.pcb, { encoding: 'utf8' });
                const debugContents = fs.readFileSync(debugPath, { encoding: 'utf8' });
                logger.debug(`[BoardCreation][DIAG] debug file written: ${debugPath}, length=${debugContents.length}, contains (segment=${debugContents.includes('(segment')}, gr_line=${debugContents.includes('(gr_line')})`);
            }
        } catch (e) {
            logger.error(`[BoardCreation][DIAG] Could not write/read debug PCB file: ${String(e)}`);
        }
    } catch (e: unknown) {
        logger.error(` 👺 Error: Failed to serialize final board structure: ${getErrorMessage(e)}${formatCallSite(pcb.getCallSite())}`);
        pcb.state.pcb = "";
        return;
    }

    try {
        // Simply write the board file
        fs.writeFileSync(boardFilePath, pcb.pcb);

        // Post-write verification: check the file for segment/gr_line entries and staged UUIDs
        try {
            const fileContents = fs.readFileSync(boardFilePath, { encoding: 'utf8' });
            // Be permissive in token matching - pretty printer may insert newlines
            const hasSegments = fileContents.includes('(segment');
            const hasGrLines = fileContents.includes('(gr_line');
            logger.debug(`[BoardCreation][VERIFY] file contains segments=${hasSegments}, gr_lines=${hasGrLines}`);

            // Search for a few staged *element* UUIDs (tracks/lines/arcs) to ensure they were serialized
            const stagedElementUuids = pcb.stagedOutlines.slice(0, 10).flatMap((o: IOutline) => (o.elements ?? []).map((el: OutlineElement) => el.uuid)).filter(Boolean);
            const foundElementUuids = stagedElementUuids.filter((u: string) => fileContents.includes(u));
            const missingElementUuids = stagedElementUuids.filter((u: string) => !fileContents.includes(u));
            logger.debug(`[BoardCreation][VERIFY] staged ELEMENT UUIDs present in file: ${foundElementUuids.length}/${stagedElementUuids.length}`);
            logger.debug(`[BoardCreation][VERIFY] foundElementUuids=${JSON.stringify(foundElementUuids)}, missingElementUuids=${JSON.stringify(missingElementUuids)}`);
            if (foundElementUuids.length < stagedElementUuids.length) {
                logger.warn('[BoardCreation][VERIFY] Some staged ELEMENT UUIDs were not found in written board file.');
            }
        } catch (e: unknown) {
            logger.error(`[BoardCreation][VERIFY] Error while verifying written board file: ${getErrorMessage(e)}`);
        }

        // Show final output summary (deferred until the end so routing logs
        // can appear first and the summary can include both net + board paths).
        setPendingBoardFilePath(boardFilePath);
    } catch (err: unknown) {
        logger.error(`👺 Error: Could not write board file ${boardFilePath}: ${getErrorMessage(err)}${formatCallSite(pcb.getCallSite())}`);
    }
}
