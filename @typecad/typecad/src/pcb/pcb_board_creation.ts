import { Component } from "../component.js";
import { TrackBuilder } from './pcb_track_builder.js';
import { Schematic, setPendingBoardFilePath } from "../schematic.js";
import fs from "node:fs";
import fsexp from "fast-sexpr";

// The fsexp parser splits backtick-quoted strings at spaces.
// This recursively restores \x00 placeholders back to spaces in all string nodes.
function restoreSpacesInNodes(node: unknown[]): void {
    for (let i = 0; i < node.length; i++) {
        if (typeof node[i] === 'string') {
            node[i] = (node[i] as string).replace(/\x00/g, ' ');
        } else if (Array.isArray(node[i])) {
            restoreSpacesInNodes(node[i] as unknown[]);
        }
    }
}
import S from "../utils/sexpr_instance.js";
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
    IPcbOptions
} from './pcb_interfaces.js';
import { IPcbBoardContext } from './pcb_board_context.js';
import { prettyPrintSExpr } from '../utils/sexpr_formatter.js';
import { normalizeNetName, formatCallSite, getErrorMessage } from './pcb_utils.js';



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
    pcb._clearComponents();

    // Since we're regenerating everything from scratch, just clear outlines
    // All tracks/outlines defined in code are already in #stagedOutlines from _track() and outline() calls
    pcb._clearOutlines();

    // Add all explicitly passed components to the board
    components.forEach((component) => {
        pcb._addComponentToBoardPublic(component);
    });

    // TrackBuilder instances: tracks are already in stagedOutlines from _track() calls,
    // vias are already in components via pcb.place() calls - nothing more to do

    // Add all staged components to the board
    pcb.stagedComponents.forEach((stagedComponent: Component) => {
        pcb._addComponentToBoardPublic(stagedComponent);
    });

    // Restore via components that were preserved during routing
    viaComponents.forEach((viaComponent: Component) => {
        pcb._addComponentToBoardPublic(viaComponent);
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
    pcb.outlines = pcb.outlines_public.filter((outline: any) => {
        return outline.elements.some((element: any) => {
            if (element.type === 'arc') return true; // Arcs are typically for board outlines
            if (element.type === 'line') {
                const line = element as IGrLine;
                const isCopperLayer = /\.Cu$/.test(line.layer);
                return !isCopperLayer; // Only include lines NOT on copper layers
            }
            return false;
        });
    });

    pcb.tracks = pcb.outlines_public.filter((outline: any) => {
        return outline.elements.some((element: any) => {
            if (element.type === 'line') {
                const line = element as IGrLine;
                const isCopperLayer = /\.Cu$/.test(line.layer);
                return isCopperLayer; // Only include lines on copper layers
            }
            return false;
        });
    });

    const version = '(version 20241229)';
    const generator = '(generator "typecad")';
    const generator_version = '(generator_version "0.1.0")';
    const general = '(general (thickness 1.6) (legacy_teardrops no))';
    const paper = '(paper "A4")';

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

    let existing_board_contents: any[] = [];
    const boardFilePath = `./build/${pcb.Boardname}.kicad_pcb`;
    const boardNetNameToCodeMap = new Map<string, number>();

    // Use already-loaded existing board elements from constructor
    if (pcb.existingBoardElements.length > 0) {
        // Reconstruct existing_board_contents from existingBoardElements
        existing_board_contents = ['kicad_pcb', ...pcb.existingBoardElements];
    }

    let final_board_contents: any[] = [];
    let headerItems = [version, generator, generator_version, general, paper];

    if (existing_board_contents.length > 1) {
        existing_board_contents.slice(1).forEach(item => {
            if (typeof item === 'string' && item.startsWith('(')) {
                final_board_contents.push(item);
            } else if (Array.isArray(item) && item.length > 0) {
                const nodeType = item[0];

                if (nodeType === 'net' && item.length >= 3 && !isNaN(Number(item[1])) && (typeof item[2] === 'string' || typeof item[2] === 'symbol')) {
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
            const headerSymbol = header.substring(1, header.indexOf(" "));
            if (!final_board_contents.some(item => (typeof item === 'string' && item.includes(`(${headerSymbol}`)) || (Array.isArray(item) && item[0] === headerSymbol))) {
                final_board_contents.unshift(header);
            }
        });
    } else {
        final_board_contents = [...headerItems];
    }

    const schematicNetDefinitions: any[] = [];
    if (!pcb.Schematic) {
        logger.warn(`[PCB CREATE] Warning: No schematic provided. Net information will be limited to existing board nets.`);
    } else if (pcb.Schematic.Nodes) {
        pcb.Schematic.Nodes.forEach((schematicNet: any) => {
            schematicNetDefinitions.push(['net', schematicNet.code, `\`${schematicNet.name}\``]);
        });
    }

    let boardContentsWithoutNets = final_board_contents.filter(item => {
        // Keep everything except net definitions - we'll handle nets separately
        if (Array.isArray(item) && item[0] === 'net') {
            return false;
        }
        if (typeof item === 'string' && item.trim().startsWith('(net ')) {
            try {
                const parsedItem = fsexp(item).pop();
                if (Array.isArray(parsedItem) && parsedItem[0] === 'net') return false;
            } catch (e) { /* ignore */ }
        }
        return true;
    });

    // Collect existing nets from the board file to preserve them
    const existingNets = new Map<string, any[]>(); // net name -> net definition
    const existingNetCodes = new Set<number>();

    final_board_contents.forEach(item => {
        if (Array.isArray(item) && item[0] === 'net') {
            const netCode = parseInt(String(item[1]));
            const netName = String(item[2] || '').replace(/["`]/g, '');
            if (!isNaN(netCode)) {
                // Use netCode as the primary key to prevent duplicate net codes
                const netKey = `${netCode}:${netName}`;
                existingNets.set(netKey, item);
                existingNetCodes.add(netCode);
            }
        } else if (typeof item === 'string' && item.trim().startsWith('(net ')) {
            try {
                const parsedItem = fsexp(item).pop();
                if (Array.isArray(parsedItem) && parsedItem[0] === 'net') {
                    const netCode = parseInt(String(parsedItem[1]));
                    const netName = String(parsedItem[2] || '').replace(/["`]/g, '');
                    if (!isNaN(netCode)) {
                        // Use netCode as the primary key to prevent duplicate net codes
                        const netKey = `${netCode}:${netName}`;
                        existingNets.set(netKey, parsedItem);
                        existingNetCodes.add(netCode);
                    }
                }
            } catch (e) { /* ignore */ }
        }
    });

    // Merge schematic nets with existing nets, ensuring unique net names and codes.
    const allNets: any[] = [];
    const mergedNetCodes = new Set<number>(); // Tracks codes used in the final 'allNets' list.
    const finalNetDefinitionsByName = new Map<string, any[]>(); // Key: normalized net name, Value: final net S-expression array

    const formatNetNameForSExpr = (name: string): string => {
        const safeName = String(name ?? '').replace(/[`"]/g, '');
        return `\`${safeName}\``;
    };

    // Pass 1: Add existing board nets. Prioritize these definitions.
    // `existingNets` (Map<`${code}:${name}`, netDefArray>) is populated from the board file.
    // `boardNetNameToCodeMap` (normalizedName -> code) is also from the board file.

    // Create a temporary map of board nets by normalized name for easier lookup and ensuring unique names from board.
    const boardNetsProcessedByName = new Map<string, any[]>(); // normalizedName -> chosen board netDef
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
    schematicNetDefinitions.forEach(schNet => maxCodeInUse = Math.max(maxCodeInUse, parseInt(String(schNet[1]))));

    const getNextAvailableNetIdHelper = (currentMax: number, usedSet: Set<number>): number => {
        let id = currentMax + 1;
        while(usedSet.has(id)) {
            id++;
        }
        return id;
    };

    // Pass 2: Integrate schematic nets.
    schematicNetDefinitions.forEach((schematicNetDef: any[]) => {
        const originalSchCode = parseInt(String(schematicNetDef[1]));
        const schNameSExpr = schematicNetDef[2] as string;
        const schName = String(schNameSExpr).replace(/[`"]/g, '');
            let normalizedSchName = normalizeNetName(schName);

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
            const newNetDefArray = ['net', finalCode, schNameSExpr];
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
            if (!viaNetNames.has(normalized)) {
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
        const newNetDefArray = ['net', newCode, formatNetNameForSExpr(originalName)];
        finalNetDefinitionsByName.set(normalizedName, newNetDefArray);
        mergedNetCodes.add(newCode);
        boardNetNameToCodeMap.set(normalizedName, newCode);
    });

    // Ensure net 0 "" (unconnected) exists.
    const emptyNetNormalizedKey = ""; // Normalized key for the unnamed net
    if (!finalNetDefinitionsByName.has(emptyNetNormalizedKey)) {
        if (!mergedNetCodes.has(0)) {
            finalNetDefinitionsByName.set(emptyNetNormalizedKey, ['net', 0, '``']);
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
            if (Array.isArray(currentItem) && typeof currentItem[0] === 'string') {
                itemType = currentItem[0];
            } else if (typeof currentItem === 'string' && currentItem.startsWith('(')) {
                try {
                    const parsed = fsexp(currentItem).pop();
                    if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
                        itemType = parsed[0];
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
            if (Array.isArray(currentItem) && typeof currentItem[0] === 'string') {
                itemType = currentItem[0];
            } else if (typeof currentItem === 'string' && currentItem.startsWith('(')) {
                try {
                    const parsed = fsexp(currentItem).pop();
                    if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
                        itemType = parsed[0];
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
            const groupNode = fsexp(groupString.replaceAll('"', "`")).pop();
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

    pcb._clearGroups();

    if (existing_board_contents.length > 1) {
        existing_board_contents.slice(1).forEach(item => {
            if (Array.isArray(item) && item[0] === 'footprint') {
                let uuid: string | null = null;
                let existingAtNode: any[] | null = null;

                for (const subItem of item) {
                    if (Array.isArray(subItem)) {
                        if (subItem[0] === 'uuid' && typeof subItem[1] === 'string') {
                            uuid = subItem[1].replaceAll('`', '');
                        } else if (subItem[0] === 'at' && subItem.length >= 3) {
                            existingAtNode = subItem;
                        }
                    }
                    if (uuid && existingAtNode) break;
                }
                if (uuid && !existingAtNode) {
                    for (const subItem of item) {
                        if (Array.isArray(subItem) && subItem[0] === 'at' && subItem.length >= 3) {
                            existingAtNode = subItem;
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
                            if (Array.isArray(subItem) && subItem[0] === 'pad') {
                                for (const padSubItem of subItem) {
                                    if (Array.isArray(padSubItem) && padSubItem[0] === 'at') {
                                        if (padSubItem.length === 3) {
                                            padSubItem.push(component.pcb.rotation);
                                        } else if (padSubItem.length === 4) {
                                            padSubItem[3] = component.pcb.rotation - parseFloat(String(padSubItem[3]));
                                        }
                                    }
                                }
                            }
                        }

                        const updatedNode = pcb._updateFootprintNodePublic(item, component, boardNetNameToCodeMap);
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
            else if (Array.isArray(item) && item[0] === 'via') {
                // Skip all vias from old board - they will be regenerated from code
                // No need to preserve or check anything
            }
            else if (Array.isArray(item) && (item[0] === 'gr_line' || item[0] === 'segment' || item[0] === 'gr_arc' || item[0] === 'gr_rect')) {
                // Skip all tracks and graphical elements from old board - they will be regenerated from code
                // Segments are copper tracks, gr_* are graphical elements
            }
        });
    }


    componentMap.forEach(component => {
        try {
            const newNode = pcb._createFootprintNodePublic(component, boardNetNameToCodeMap);
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
            const netResolution = pcb._resolveNetPublic(
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

        const layersString = viaData.layers ? viaData.layers.map(l => `\"${l}\"`).join(" ") : '\"F.Cu\" \"B.Cu\"';
        const viaSexprString = `(via (at ${viaData.at?.x || 0} ${viaData.at?.y || 0}) (size ${viaData.size || 0.6}) (drill ${viaData.drill || 0.3}) (layers ${layersString}) (free yes) (net ${finalViaNetCode}) (uuid \"${viaData.uuid}\"))`;
        try {
            const viaNode = fsexp(viaSexprString.replaceAll('\"', '`')).pop();
            if (viaNode) {
                final_board_contents.push(viaNode);
            } else {
                logger.error(`👺 Error: Failed to parse via S-expression (fsexp returned undefined/empty): ${viaSexprString}${formatCallSite(pcb.getCallSite())}`);
            }
        } catch (e: unknown) {
            logger.error(`👺 Error: Failed to parse via S-expression for UUID ${viaData.uuid}: ${viaSexprString} - ${getErrorMessage(e)}${formatCallSite(pcb.getCallSite())}`);
        }
    });

    pcb.outlines_public.forEach((conceptualOutline: any) => {
        conceptualOutline.elements.forEach((element: any) => {
            let elementSexprString = '';
            if (element.type === 'line') {
                const line = element as IGrLine;
                // Check if this is a copper layer (should use segment) or graphical layer (should use gr_line)
                // Copper layers are: F.Cu, B.Cu, In1.Cu, In2.Cu, etc. But NOT Edge.Cuts
                const isCopperLayer = line.layer.includes('.Cu') && !line.layer.includes('Edge.Cuts');

                if (isCopperLayer) {
                    // Use segment for electrical traces on copper layers
                    elementSexprString = `(segment (start ${line.start.x} ${line.start.y}) (end ${line.end.x} ${line.end.y}) (width ${line.strokeWidth}) (locked ${line.locked ? 'yes' : 'no'}) (layer "${line.layer}") (uuid "${line.uuid}"))`;
                } else {
                    // Use gr_line for graphical elements on non-copper layers (Edge.Cuts, SilkS, etc.)
                    elementSexprString = `(gr_line (start ${line.start.x} ${line.start.y}) (end ${line.end.x} ${line.end.y}) (stroke (width ${line.strokeWidth}) (type default)) (layer "${line.layer}") (uuid "${line.uuid}"))`;
                }
            } else if (element.type === 'arc') {
                const arc = element as IGrArc;
                elementSexprString = `(gr_arc (start ${arc.start.x} ${arc.start.y}) (mid ${arc.mid.x} ${arc.mid.y}) (end ${arc.end.x} ${arc.end.y}) (stroke (width ${arc.strokeWidth}) (type default)) (layer "${arc.layer}") (uuid "${arc.uuid}"))`;
            }

            if (elementSexprString) {
                try {
                    const elementNode = fsexp(elementSexprString.replaceAll('"', '`')).pop();
                    if (elementNode) {
                        final_board_contents.push(elementNode);
                    } else {
                        logger.error(`👺 Error: Failed to parse outline element S-expression (fsexp returned undefined/empty) for UUID ${element.uuid}: ${elementSexprString}${formatCallSite(pcb.getCallSite())}`);
                    }
                } catch (e: unknown) {
                    logger.error(`👺 Error: Failed to parse outline element S-expression for UUID ${element.uuid}: ${elementSexprString} - ${getErrorMessage(e)}${formatCallSite(pcb.getCallSite())}`);
                }
            }
        });
    });


    // Log diagnostic counters for outlines -> node conversion
    if ((pcb as any).___diagCounters) {
        logger.debug(`[BoardCreation][DIAG] segmentsAdded=${(pcb as any).___diagCounters.segmentsAdded}, grLinesAdded=${(pcb as any).___diagCounters.grLinesAdded}, parseFailures=${(pcb as any).___diagCounters.parseFailures}`);
    }
    // Generate gr_text elements for board-level text
    pcb.grTexts.forEach((textElement: IGrTextOptions) => {
        // Build the effects section
        let effectsContent = '';

        // Font section
        let fontContent = '';

        // Font face (optional)
        if (textElement.font) {
            fontContent += `(face "${textElement.font}") `;
        }

        // Font size - can be a number or {width, height}
        const width = textElement.width ?? 1.27;
        const height = textElement.height ?? 1.27;
        fontContent += `(size ${height} ${width}) `;

        // Font thickness
        if (textElement.thickness !== undefined) {
            fontContent += `(thickness ${textElement.thickness}) `;
        }

        // Bold and italic
        if (textElement.bold) {
            fontContent += 'bold ';
        }
        if (textElement.italic) {
            fontContent += 'italic ';
        }

        effectsContent += `(font ${fontContent.trim()})`;

        // Justify section - only include explicitly specified values
        let justifyContent = '';
        const horizontal = textElement.justify?.horizontal;
        const vertical = textElement.justify?.vertical;
        const mirror = textElement.justify?.mirror ?? false;

        if (horizontal) justifyContent += horizontal + ' ';
        if (vertical) justifyContent += vertical + ' ';
        if (mirror) {
            justifyContent += 'mirror ';
        }

        effectsContent += ` (justify ${justifyContent.trim()})`;

        // Hide flag (outside effects but inside effects for KiCad 7+)
        if (textElement.hide) {
            effectsContent += ' hide';
        }

        // Build the complete gr_text s-expression
        const grTextSexpr = `(gr_text "${textElement.text}" (at ${textElement.x} ${textElement.y} ${textElement.rotation}) (layer "${textElement.layer}") (uuid "${textElement.uuid}") (effects ${effectsContent}))`;

        try {
            // The fsexp parser splits backtick-quoted strings at spaces.
            // Protect multi-word strings by replacing spaces inside quotes with a placeholder.
            const protectedSexpr = grTextSexpr.replaceAll('"', '`').replace(/`([^`]+)`/g, (match: string) => match.replace(/ /g, '\x00'));
            let grTextNode = fsexp(protectedSexpr).pop();

            // Restore spaces in string nodes
            if (grTextNode) {
                restoreSpacesInNodes(grTextNode as unknown[]);
            }
            if (grTextNode) {
                final_board_contents.push(grTextNode);
            } else {
                logger.error(`👺 Error: Failed to parse gr_text S-expression (fsexp returned undefined/empty) for UUID ${textElement.uuid}: ${grTextSexpr}${formatCallSite(pcb.getCallSite())}`);
            }
        } catch (e: unknown) {
            logger.error(`👺 Error: Failed to parse gr_text S-expression for UUID ${textElement.uuid}: ${grTextSexpr} - ${getErrorMessage(e)}${formatCallSite(pcb.getCallSite())}`);
        }
    });

    // Generate graphical lines
    pcb.grLines.forEach((line: any) => {
        const lockedSection = line.locked ? ' (locked yes)' : '';
        const lineSexpr = `(gr_line (start ${line.start.x} ${line.start.y}) (end ${line.end.x} ${line.end.y}) (stroke (width ${line.strokeWidth}) (type default)) (layer "${line.layer}") (uuid "${line.uuid}")${lockedSection})`;

        try {
            const lineNode = fsexp(lineSexpr.replaceAll('"', '`')).pop();
            if (lineNode) {
                final_board_contents.push(lineNode);
            } else {
                logger.error(`👺 Error: Failed to parse gr_line S-expression (fsexp returned undefined/empty) for UUID ${line.uuid}: ${lineSexpr}${formatCallSite(pcb.getCallSite())}`);
            }
        } catch (e: unknown) {
            logger.error(`👺 Error: Failed to parse gr_line S-expression for UUID ${line.uuid}: ${lineSexpr} - ${getErrorMessage(e)}${formatCallSite(pcb.getCallSite())}`);
        }
    });

    // Generate graphical circles
    pcb.grCircles.forEach((circle: any) => {
        const fillSection = circle.fill ? ' (fill solid)' : '';
        const lockedSection = circle.locked ? ' (locked yes)' : '';
        const circleSexpr = `(gr_circle (center ${circle.center.x} ${circle.center.y}) (end ${circle.end.x} ${circle.end.y}) (stroke (width ${circle.strokeWidth}) (type default)) (layer "${circle.layer}")${fillSection} (uuid "${circle.uuid}")${lockedSection})`;

        try {
            const circleNode = fsexp(circleSexpr.replaceAll('"', '`')).pop();
            if (circleNode) {
                final_board_contents.push(circleNode);
            } else {
                logger.error(`👺 Error: Failed to parse gr_circle S-expression (fsexp returned undefined/empty) for UUID ${circle.uuid}: ${circleSexpr}${formatCallSite(pcb.getCallSite())}`);
            }
        } catch (e: unknown) {
            logger.error(`👺 Error: Failed to parse gr_circle S-expression for UUID ${circle.uuid}: ${circleSexpr} - ${getErrorMessage(e)}${formatCallSite(pcb.getCallSite())}`);
        }
    });

    // Generate graphical rectangles
    pcb.grRects.forEach((rect: any) => {
        const fillSection = rect.fill ? ' (fill solid)' : '';
        const lockedSection = rect.locked ? ' (locked yes)' : '';
        const rectSexpr = `(gr_rect (start ${rect.start.x} ${rect.start.y}) (end ${rect.end.x} ${rect.end.y}) (stroke (width ${rect.strokeWidth}) (type default)) (layer "${rect.layer}")${fillSection} (uuid "${rect.uuid}")${lockedSection})`;

        try {
            const rectNode = fsexp(rectSexpr.replaceAll('"', '`')).pop();
            if (rectNode) {
                final_board_contents.push(rectNode);
            } else {
                logger.error(`👺 Error: Failed to parse gr_rect S-expression (fsexp returned undefined/empty) for UUID ${rect.uuid}: ${rectSexpr}${formatCallSite(pcb.getCallSite())}`);
            }
        } catch (e: unknown) {
            logger.error(`👺 Error: Failed to parse gr_rect S-expression for UUID ${rect.uuid}: ${rectSexpr} - ${getErrorMessage(e)}${formatCallSite(pcb.getCallSite())}`);
        }
    });

    // Generate graphical polygons
    pcb.grPolys.forEach((poly: any) => {
        const ptsArray = poly.points.map((pt: any) => `(xy ${pt.x} ${pt.y})`).join(' ');
        const fillSection = poly.fill ? ' (fill solid)' : '';
        const lockedSection = poly.locked ? ' (locked yes)' : '';
        const polySexpr = `(gr_poly (pts ${ptsArray}) (stroke (width ${poly.strokeWidth}) (type default)) (layer "${poly.layer}")${fillSection} (uuid "${poly.uuid}")${lockedSection})`;

        try {
            const polyNode = fsexp(polySexpr.replaceAll('"', '`')).pop();
            if (polyNode) {
                final_board_contents.push(polyNode);
            } else {
                logger.error(`👺 Error: Failed to parse gr_poly S-expression (fsexp returned undefined/empty) for UUID ${poly.uuid}: ${polySexpr}${formatCallSite(pcb.getCallSite())}`);
            }
        } catch (e: unknown) {
            logger.error(`👺 Error: Failed to parse gr_poly S-expression for UUID ${poly.uuid}: ${polySexpr} - ${getErrorMessage(e)}${formatCallSite(pcb.getCallSite())}`);
        }
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
                const netResolution = pcb._resolveNetPublic(
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
                    const foundNet = pcb.Schematic.Nodes.find((node: any) => {
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

        // Build polygon pts array
        const ptsArray = zone.polygon.map(pt => `(xy ${pt.x} ${pt.y})`).join(' ');

        // Build optional name section
        const nameSection = zone.name ? `(name "${zone.name}") ` : '';

        // Build locked section
        const lockedSection = zone.locked ? '(locked) ' : '';

        // Build priority section
        const prioritySection = zone.priority !== undefined && zone.priority !== 0 ? `(priority ${zone.priority}) ` : '';

        // Build fill section
        let fillParts: string[] = [];
        if (zone.filled !== false) {
            fillParts.push('yes');

            // Fill mode
            if (zone.fillMode === 'hatched') {
                fillParts.push('(mode hatched)');
            }

            // Arc segments
            if (zone.fillArcSegments !== undefined) {
                fillParts.push(`(arc_segments ${zone.fillArcSegments})`);
            }

            // Thermal relief
            fillParts.push(`(thermal_gap ${zone.thermalGap})`);
            fillParts.push(`(thermal_bridge_width ${zone.thermalBridgeWidth})`);

            // Smoothing
            if (zone.smoothing && zone.smoothing !== 'none' && zone.smoothingRadius !== undefined) {
                fillParts.push(`(smoothing ${zone.smoothing})`);
                fillParts.push(`(radius ${zone.smoothingRadius})`);
            }

            // Island removal
            if (zone.islandRemovalMode !== undefined) {
                fillParts.push(`(island_removal_mode ${zone.islandRemovalMode})`);
                if (zone.islandRemovalMode === 2 && zone.islandAreaMin !== undefined) {
                    fillParts.push(`(island_area_min ${zone.islandAreaMin})`);
                }
            }

            // Hatched fill options
            if (zone.fillMode === 'hatched') {
                if (zone.hatchThickness !== undefined) fillParts.push(`(hatch_thickness ${zone.hatchThickness})`);
                if (zone.hatchGap !== undefined) fillParts.push(`(hatch_gap ${zone.hatchGap})`);
                if (zone.hatchOrientation !== undefined) fillParts.push(`(hatch_orientation ${zone.hatchOrientation})`);
                if (zone.hatchSmoothingLevel !== undefined) fillParts.push(`(hatch_smoothing_level ${zone.hatchSmoothingLevel})`);
                if (zone.hatchSmoothingValue !== undefined) fillParts.push(`(hatch_smoothing_value ${zone.hatchSmoothingValue})`);
                if (zone.hatchBorderAlgorithm) fillParts.push(`(hatch_border_algorithm ${zone.hatchBorderAlgorithm})`);
                if (zone.hatchMinHoleArea !== undefined) fillParts.push(`(hatch_min_hole_area ${zone.hatchMinHoleArea})`);
            }
        }
        const fillSection = fillParts.length > 0 ? `(fill ${fillParts.join(' ')}) ` : '';

        // Build connect_pads section
        let connectPadsSection = '';
        if (zone.connectPads === 'thru_hole_only') {
            connectPadsSection = `(connect_pads thru_hole_only (clearance ${zone.clearance})) `;
        } else if (zone.connectPads === 'full') {
            connectPadsSection = `(connect_pads yes (clearance ${zone.clearance})) `;
        } else if (zone.connectPads === 'no') {
            connectPadsSection = `(connect_pads no (clearance ${zone.clearance})) `;
        } else {
            // Default to thermal relief
            connectPadsSection = `(connect_pads (clearance ${zone.clearance})) `;
        }

        // Build layers section - KiCad supports multiple layers in a single zone
        const layersSection = zone.layers.map(layer => `"${layer}"`).join(' ');

        // Generate single zone s-expression with all layers
        const zoneSexpr = `(zone (net ${netCode}) (net_name "${netName}") (layers ${layersSection}) ${nameSection}(uuid "${zone.uuid}") ${lockedSection}${prioritySection}(hatch ${zone.hatchStyle} ${zone.hatchPitch}) ${connectPadsSection}(min_thickness ${zone.minThickness}) ${fillSection}(polygon (pts ${ptsArray})))`;

        try {
            const zoneNode = fsexp(zoneSexpr.replaceAll('"', '`')).pop();
            if (zoneNode) {
                final_board_contents.push(zoneNode);
            } else {
                logger.error(`👺 Error: Failed to parse zone S-expression (fsexp returned undefined/empty) for UUID ${zone.uuid}: ${zoneSexpr}${formatCallSite(pcb.getCallSite())}`);
            }
        } catch (e: unknown) {
            logger.error(`👺 Error: Failed to parse zone S-expression for UUID ${zone.uuid}: ${zoneSexpr} - ${getErrorMessage(e)}${formatCallSite(pcb.getCallSite())}`);
        }
    });

    // Generate keepout zones
    pcb.keepoutZones.forEach((zone: IKeepoutZone) => {
        // Build polygon pts array
        const ptsArray = zone.polygon.map(pt => `(xy ${pt.x} ${pt.y})`).join(' ');

        // Build optional name section
        const nameSection = zone.name ? `(name "${zone.name}") ` : '';

        // Build locked section
        const lockedSection = zone.locked ? '(locked) ' : '';

        // Build priority section
        const prioritySection = zone.priority !== undefined && zone.priority !== 0 ? `(priority ${zone.priority}) ` : '';

        // Build keepout restrictions
        const restrictions = zone.restrictions || {};
        const tracksAllowed = restrictions.tracks ? 'not_allowed' : 'allowed';
        const viasAllowed = restrictions.vias ? 'not_allowed' : 'allowed';
        const padsAllowed = restrictions.pads ? 'not_allowed' : 'allowed';
        const copperpourAllowed = restrictions.copperpour ? 'not_allowed' : 'allowed';
        const footprintsAllowed = restrictions.footprints ? 'not_allowed' : 'allowed';

        const keepoutSection = `(keepout (tracks ${tracksAllowed}) (vias ${viasAllowed}) (pads ${padsAllowed}) (copperpour ${copperpourAllowed}) (footprints ${footprintsAllowed})) `;

        // Build smoothing section (for keepout polygon smoothing)
        let smoothingSection = '';
        if (zone.smoothing && zone.smoothing !== 'none' && zone.smoothingRadius !== undefined) {
            smoothingSection = `(smoothing ${zone.smoothing}) (radius ${zone.smoothingRadius}) `;
        }

        // Build layers section - KiCad supports multiple layers in a single zone
        const layersSection = zone.layers.map(layer => `"${layer}"`).join(' ');

        // Generate single keepout zone s-expression with all layers
        const hatchStyle = zone.hatchStyle || 'edge';
        const hatchPitch = zone.hatchPitch || 0.508;
        const zoneSexpr = `(zone (net 0) (net_name "") (layers ${layersSection}) ${nameSection}(uuid "${zone.uuid}") ${lockedSection}${prioritySection}(hatch ${hatchStyle} ${hatchPitch}) ${keepoutSection}${smoothingSection}(polygon (pts ${ptsArray})))`;

        try {
            const zoneNode = fsexp(zoneSexpr.replaceAll('"', '`')).pop();
            if (zoneNode) {
                final_board_contents.push(zoneNode);
            } else {
                logger.error(`👺 Error: Failed to parse keepout zone S-expression (fsexp returned undefined/empty) for UUID ${zone.uuid}: ${zoneSexpr}${formatCallSite(pcb.getCallSite())}`);
            }
        } catch (e: unknown) {
            logger.error(`👺 Error: Failed to parse keepout zone S-expression for UUID ${zone.uuid}: ${zoneSexpr} - ${getErrorMessage(e)}${formatCallSite(pcb.getCallSite())}`);
        }
    });

    // Determine the definitive version node
    let definitiveVersionNode: any = null;

    // Check if a version node (array form, typically from parsed existing file) exists
    const existingVersionArrayNode = final_board_contents.find(item => Array.isArray(item) && item[0] === 'version');

    // Check if a version node (string form, typically from default headers or if file had it as string) exists
    const existingVersionStringNode = final_board_contents.find(item => typeof item === 'string' && item.startsWith('(version '));

    if (existingVersionArrayNode) {
        // Prefer the parsed array form if it exists (likely from the original file)
        definitiveVersionNode = existingVersionArrayNode;
    } else if (existingVersionStringNode) {
        // Otherwise, use the string form if it exists
        definitiveVersionNode = existingVersionStringNode;
    } else {
        // If no version node exists at all, use the default 'version' string constant
        // This 'version' constant is defined at the top of the create method: const version = '(version 20241229)';
        definitiveVersionNode = version;
    }

    // Remove all types of version nodes from final_board_contents to prevent duplicates
    final_board_contents = final_board_contents.filter(item => {
        if (Array.isArray(item) && item[0] === 'version') return false; // Remove array form
        if (typeof item === 'string' && item.startsWith('(version ')) return false; // Remove string form
        return true; // Keep other items
    });

    // Prepend the single, definitive version node to the beginning
    final_board_contents.unshift(definitiveVersionNode);

    // Clean up orphaned nets - collect all net codes that are actually used
    const usedNetCodes = new Set<number>();
    usedNetCodes.add(0); // Always include net 0 (unconnected)

    // Collect net codes from component pads in final board contents
    final_board_contents.forEach(item => {
        if (Array.isArray(item) && item[0] === 'footprint') {
            item.forEach(subItem => {
                if (Array.isArray(subItem) && subItem[0] === 'pad') {
                    subItem.forEach(padElement => {
                        if (Array.isArray(padElement) && padElement[0] === 'net') {
                            const netCode = parseInt(String(padElement[1]));
                            if (!isNaN(netCode)) {
                                usedNetCodes.add(netCode);
                            }
                        }
                    });
                }
            });
        }
    });

    // Collect net codes from vias
    final_board_contents.forEach(item => {
        if (Array.isArray(item) && item[0] === 'via') {
            item.forEach(viaElement => {
                if (Array.isArray(viaElement) && viaElement[0] === 'net') {
                    const netCode = parseInt(String(viaElement[1]));
                    if (!isNaN(netCode)) {
                        usedNetCodes.add(netCode);
                    }
                }
            });
        }
    });

    // Collect net codes from zones
    final_board_contents.forEach(item => {
        if (Array.isArray(item) && item[0] === 'zone') {
            item.forEach(zoneElement => {
                if (Array.isArray(zoneElement) && zoneElement[0] === 'net') {
                    const netCode = parseInt(String(zoneElement[1]));
                    if (!isNaN(netCode)) {
                        usedNetCodes.add(netCode);
                    }
                }
            });
        }
    });

    const finalStructure = ['kicad_pcb', ...final_board_contents];
    try {
        // Serialize the structure with pretty printing
        // DIAGNOSTIC: count final_board_contents node types and collect UUIDs
        try {
            const segNodes = final_board_contents.filter(it => Array.isArray(it) && it[0] === 'segment');
            const grLineNodes = final_board_contents.filter(it => Array.isArray(it) && it[0] === 'gr_line');
            const segUuids: string[] = [];
            segNodes.forEach((node: any) => {
                try {
                    const uuidPair = node.find((n: any) => Array.isArray(n) && n[0] === 'uuid');
                    if (uuidPair && uuidPair[1]) segUuids.push(String(uuidPair[1]));
                } catch (e) { /* ignore */ }
            });
            // logger.debug(`[BoardCreation][DIAG] final_board_contents: segments=${segNodes.length}, gr_lines=${grLineNodes.length}, segmentUUIDs=${segUuids.length}`);

                // DIAGNOSTIC: check staged outlines are present in final_board_contents
                try {
                    const stagedUuids = pcb.stagedOutlines.map((o: any) => o.uuid).filter(Boolean);
                    const missingInFinal = stagedUuids.filter((u: string) => !JSON.stringify(final_board_contents).includes(u));
                    if (missingInFinal.length > 0) {
                            // logger.warn(`[BoardCreation][DIAG] staged outlines missing from final_board_contents: ${JSON.stringify(missingInFinal)}`);
                            // Print details about missing staged outlines for debugging
                            for (const miss of missingInFinal) {
                                const so = pcb.stagedOutlines.find((o: any) => o.uuid === miss);
                                logger.debug(`[BoardCreation][DIAG] missing outline ${miss}: fullOutline=${JSON.stringify(so)}`);
                            }
                    } else {
                        logger.debug(`[BoardCreation][DIAG] all staged outlines present in final_board_contents`);
                    }
                } catch (e) { /* ignore */ }
        } catch (e) { /* ignore diagnostics */ }

        const serialized = S.serialize(finalStructure).replaceAll("`", '"');
        // DIAGNOSTIC: show short prefix of serialized content and check for segment/gr_line tokens
        try {
            const prefix = serialized.substring(0, 1200);
            logger.debug(`[BoardCreation][DIAG] serialized prefix:\n${prefix}\n---`);
            const hasSegmentToken = serialized.includes('(segment');
            const hasGrLineToken = serialized.includes('(gr_line');
            logger.debug('[BoardCreation][DIAG] serialized contains (segment=' + hasSegmentToken + ', gr_line=' + hasGrLineToken + ')');
        } catch (e) { /* ignore */ }
        pcb._setPcb(pcb.prettyPrintSExpr(serialized));
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
        pcb._setPcb("");
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
            const stagedElementUuids = pcb.stagedOutlines.slice(0, 10).flatMap((o: any) => (o.elements ?? []).map((el: any) => el.uuid)).filter(Boolean);
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
