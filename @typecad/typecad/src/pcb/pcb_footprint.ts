import { Component } from "../component.js";
import fsexp from "fast-sexpr";
import { generateUuid, formatSourceInfoForProperty } from "./pcb_utils.js";
import { mapLayerToSide, transformSexprLayers, mirrorChamferDirection } from "./pcb_layer_utils.js";
import { BoardCreationError } from '../errors.js';

/**
 * Apply back-side (bottom layer) transformations to an S-expression sub-item:
 * - Flip the Y coordinate in the `at` node
 * - Add 180° rotation
 * - Add `mirror` to the `justify` node inside `effects`
 */
function applyBackSideTransform(subItem: any[]): void {
    // Find and transform the 'at' node
    for (let k = 0; k < subItem.length; k++) {
        if (Array.isArray(subItem[k]) && subItem[k][0] === 'at') {
            const atNode = subItem[k];
            if (atNode.length >= 3) {
                // Flip Y coordinate for back-side
                atNode[2] = -parseFloat(String(atNode[2]));
                // Add or update rotation (180° for back-side)
                if (atNode.length === 3) {
                    atNode.push(180);
                } else if (atNode.length === 4) {
                    atNode[3] = (parseFloat(String(atNode[3])) + 180) % 360;
                }
            }
            break;
        }
    }

    // Find and add mirror justification to effects
    for (let k = 0; k < subItem.length; k++) {
        if (Array.isArray(subItem[k]) && subItem[k][0] === 'effects') {
            const effectsNode = subItem[k];
            // Check if justify already exists
            let justifyFound = false;
            for (let j = 0; j < effectsNode.length; j++) {
                if (Array.isArray(effectsNode[j]) && effectsNode[j][0] === 'justify') {
                    // Add mirror to existing justify
                    if (!effectsNode[j].includes('mirror')) {
                        effectsNode[j].push('mirror');
                    }
                    justifyFound = true;
                    break;
                }
            }
            if (!justifyFound) {
                // Add new justify mirror
                effectsNode.push(['justify', 'mirror']);
            }
            break;
        }
    }
}

export function processFootprintItem(subItem: any[], component: Component, resolveNet: any, boardNetNameToCodeMap?: Map<string, number>) {

            
            

            const itemType = subItem[0];

            // Update Properties (Content Only - Preserve nested nodes like at, layer, effects)
            if (itemType === 'property') {
                const propName = subItem[1];
                let newValue: string | undefined = undefined;

                // Determine the new value based on the property name
                if (propName === '`Reference`' && component.reference !== undefined) {
                    newValue = `\`${component.reference}\``;
                } else if (propName === '`Value`' && component.value !== undefined) {
                    newValue = `\`${component.value}\``;
                } else if (propName === '`Footprint`' && component.footprint !== undefined) {
                    newValue = `\`${component.footprint}\``;
                } else if (propName === '`Datasheet`' && component.datasheet !== undefined) {
                    // Sanitize for S-expression: remove problematic chars and normalize spaces
                    const sanitized = component.datasheet.replace(/[()"`±]/g, '').replace(/\s+/g, ' ').trim();
                    newValue = `\`${sanitized}\``;
                } else if (propName === '`Description`' && component.description !== undefined) {
                    // Sanitize for S-expression: remove problematic chars and normalize spaces
                    // Remove entire parenthetical expressions and problematic characters
                    const sanitized = component.description
                        .replace(/\([^)]*\)/g, '') // Remove entire parenthetical expressions
                        .replace(/[()"`±]/g, '') // Remove any remaining problematic chars
                        .replace(/\s+/g, ' ') // Normalize whitespace
                        .trim();
                    newValue = `\`${sanitized}\``;
                } else if (propName === '`MPN`' && component.mpn !== undefined) {
                    // Sanitize for S-expression: remove problematic chars and normalize spaces
                    const sanitized = component.mpn.replace(/[()"`±]/g, '').replace(/\s+/g, ' ').trim();
                    newValue = `\`${sanitized}\``;
                }

                // Always sanitize existing property values to fix corrupted data
                let firstNodeIndex = -1;
                // Find the index of the first node (array) after the name
                for (let k = 2; k < subItem.length; k++) {
                    if (Array.isArray(subItem[k])) {
                        firstNodeIndex = k;
                        break;
                    }
                }

                // Determine the number of elements representing the old value
                const valueElementsCount = (firstNodeIndex === -1) ? (subItem.length - 2) : (firstNodeIndex - 2);

                if (valueElementsCount > 0) {
                    // Sanitize existing values to fix corruption
                    let existingValue = '';
                    for (let k = 2; k < 2 + valueElementsCount; k++) {
                        if (typeof subItem[k] === 'string') {
                            existingValue += subItem[k];
                        }
                    }
                    
                    // Clean up the existing value - remove entire parenthetical expressions
                    const sanitizedExisting = existingValue
                        .replace(/\([^)]*\)/g, '') // Remove entire parenthetical expressions
                        .replace(/[()"`±]/g, '') // Remove any remaining problematic chars
                        .replace(/\s+/g, ' ') // Normalize whitespace
                        .trim();
                    
                    // Replace fragmented values with single clean value
                    subItem.splice(2, valueElementsCount, sanitizedExisting);
                }

                // If there's a new value to set, replace the old value string(s)
                if (newValue !== undefined) {
                    // Find the first node index again after sanitization
                    firstNodeIndex = -1;
                    for (let k = 2; k < subItem.length; k++) {
                        if (Array.isArray(subItem[k])) {
                            firstNodeIndex = k;
                            break;
                        }
                    }

                    // Determine the number of elements representing the old value
                    const newValueElementsCount = (firstNodeIndex === -1) ? (subItem.length - 2) : (firstNodeIndex - 2);

                    // Replace the old value elements with the single new value
                    if (newValueElementsCount >= 0) { // Ensure we don't splice negative count
                        subItem.splice(2, Math.max(0, newValueElementsCount), newValue); // Use Math.max to ensure count is not negative
                    } else {
                        // This case should theoretically not happen if structure is [prop, name, value...]
                        // If it does, just insert at index 2
                        subItem.splice(2, 0, newValue);
                    }
                }

                // Apply back-side transformations for property elements
                if (component.pcb?.side === 'back') {
                    applyBackSideTransform(subItem);
                }

            }

            // Update Text Elements (Content and Rotation)
            else if (itemType === 'fp_text') {
                const textType = String(subItem[1]).toLowerCase();
                if (textType === 'reference' && component.reference !== undefined) {
                    subItem[2] = `\`${component.reference}\``;
                } else if (textType === 'value' && component.value !== undefined) {
                    subItem[2] = `\`${component.value}\``;
                }

                // Apply back-side transformations for text elements
                if (component.pcb?.side === 'back') {
                    applyBackSideTransform(subItem);
                }
            }

            // Update Pad Rotation (Relative to component)
            else if (itemType === 'pad') {
                // Extract pad number for net resolution
                const padNumber = subItem.length > 1 ? String(subItem[1]).replace(/["`]/g, '') : '';
                
                // Resolve net for this pad
                const netResolution = resolveNet(
                    component.reference || '',
                    padNumber,
                    undefined, // No UUID for regular component pads
                    boardNetNameToCodeMap
                );

                // Find and transform the pad's 'at' node
                for (let k = 2; k < subItem.length; k++) {
                    if (Array.isArray(subItem[k]) && subItem[k][0] === 'at') {
                        const padAtNode = subItem[k];
                        
                        // Apply back-side Y-coordinate flipping for pads
                        if (component.pcb?.side === 'back' && padAtNode.length >= 3) {
                            padAtNode[2] = -parseFloat(String(padAtNode[2]));
                        }
                        
                        // If pad has no rotation, add component rotation
                        if (padAtNode.length === 3) {
                            let rotation = component.pcb.rotation || 0;
                            // For back-side components, mirror the rotation
                            if (component.pcb?.side === 'back') {
                                rotation = (360 - rotation) % 360;
                            }
                            padAtNode.push(rotation);
                        } else if (padAtNode.length === 4) {
                            // If pad has rotation, calculate final rotation considering component rotation and back-side mirroring
                            let componentRotation = component.pcb.rotation || 0;
                            const padRotation = parseFloat(String(padAtNode[3]));
                            
                            if (component.pcb?.side === 'back') {
                                // For back-side: mirror both component and pad rotations, then combine
                                const mirroredComponentRotation = (360 - componentRotation) % 360;
                                const mirroredPadRotation = (360 - padRotation) % 360;
                                padAtNode[3] = (mirroredComponentRotation + mirroredPadRotation) % 360;
                            } else {
                                padAtNode[3] = componentRotation - padRotation;
                            }
                        }
                        break;
                    }
                }

                // Transform pad layers (this is where paste, mask, and other layers are defined)
                for (let k = 2; k < subItem.length; k++) {
                    if (Array.isArray(subItem[k]) && subItem[k][0] === 'layers') {

                        const layersNode = subItem[k];
                        let transformationOccurred = false;
                        
                        // Process all layer elements in the layers array (skip index 0 which is "layers")
                        for (let layerIdx = 1; layerIdx < layersNode.length; layerIdx++) {
                            const layerElement = layersNode[layerIdx];
                            if (typeof layerElement === 'string') {
                                // Clean the layer name (remove quotes and backticks)
                                const cleanLayerName = String(layerElement).replace(/[`\"]/g, '');
                                const transformedLayer = mapLayerToSide(cleanLayerName, component.pcb?.side);
                                
                                if (transformedLayer !== cleanLayerName) {
                                    // Preserve the original quoting style
                                    const originalQuoting = layerElement.match(/^[`\"]/)?.[0] || '"';
                                    layersNode[layerIdx] = originalQuoting + transformedLayer + (originalQuoting === '`' ? '`' : '"');
                                    transformationOccurred = true;
                                }
                            }
                        }

                        if (!transformationOccurred) {
                        } else {
                        }
                        break;
                    }
                }

                // Add or update net information
                let netNodeFound = false;
                let pintypeNodeFound = false;

                for (let k = 2; k < subItem.length; k++) {
                    if (Array.isArray(subItem[k])) {
                        if (subItem[k][0] === 'net') {
                            // Update existing net node
                            subItem[k][1] = netResolution.netCode;
                            subItem[k][2] = netResolution.netName ? `\`${netResolution.netName}\`` : '``';
                            netNodeFound = true;
                        } else if (subItem[k][0] === 'pintype') {
                            // Update existing pintype node
                            subItem[k][1] = '`passive`'; // Default to passive for now
                            pintypeNodeFound = true;
                        }
                    }
                }

                // Add net node if not found
                if (!netNodeFound) {
                    subItem.push(['net', netResolution.netCode, netResolution.netName ? `\`${netResolution.netName}\`` : '``']);
                }

                // Add pintype node if not found
                if (!pintypeNodeFound) {
                    subItem.push(['pintype', '`passive`']);
                }

                // Handle chamfer direction transformation for back-side components
                if (component.pcb?.side === 'back') {
                    for (let k = 2; k < subItem.length; k++) {
                        if (Array.isArray(subItem[k]) && subItem[k][0] === 'chamfer' && subItem[k].length > 1) {
                            const originalDirection = subItem[k][1];
                            const mirroredDirection = mirrorChamferDirection(originalDirection);
                            if (mirroredDirection !== originalDirection) {
                                // Preserve original quoting style
                                const originalQuoting = String(originalDirection).match(/^[`"]/)?.[0] || '';
                                const cleanMirrored = mirroredDirection.replace(/[`"]/g, '');
                                subItem[k][1] = originalQuoting ? originalQuoting + cleanMirrored + originalQuoting : cleanMirrored;
                            }
                        }
                    }
                }
            }

            // Handle footprint graphics (fp_line, fp_circle, fp_arc, fp_poly, fp_text, etc.) for back-side transformation
            else if (component.pcb?.side === 'back' && (itemType === 'fp_line' || itemType === 'fp_circle' || itemType === 'fp_arc' || itemType === 'fp_rect' || itemType === 'fp_poly' || itemType === 'fp_text' || itemType === 'fp_text_box' || itemType === 'fp_curve')) {
                for (let k = 0; k < subItem.length; k++) {
                    if (Array.isArray(subItem[k])) {
                        const nodeType = subItem[k][0];
                        
                        // Handle start/end coordinates in fp_line, fp_arc, fp_rect
                        if ((nodeType === 'start' || nodeType === 'end') && subItem[k].length >= 3) {
                            subItem[k][2] = -parseFloat(String(subItem[k][2])); // Flip Y coordinate
                        }
                        // Handle center coordinates in fp_circle, fp_arc
                        else if (nodeType === 'center' && subItem[k].length >= 3) {
                            subItem[k][2] = -parseFloat(String(subItem[k][2])); // Flip Y coordinate
                        }
                        // Handle mid coordinates in fp_arc
                        else if (nodeType === 'mid' && subItem[k].length >= 3) {
                            subItem[k][2] = -parseFloat(String(subItem[k][2])); // Flip Y coordinate
                        }
                        // Handle pts section in fp_poly and fp_curve
                        else if (nodeType === 'pts') {
                            for (let j = 1; j < subItem[k].length; j++) {
                                if (Array.isArray(subItem[k][j]) && subItem[k][j][0] === 'xy' && subItem[k][j].length >= 3) {
                                    subItem[k][j][2] = -parseFloat(String(subItem[k][j][2])); // Flip Y coordinate
                                }
                            }
                        }
                    }
                }
                
                // Special handling for fp_text and fp_text_box elements
                if (itemType === 'fp_text' || itemType === 'fp_text_box') {
                    // Find and transform the 'at' node (for fp_text)
                    for (let k = 0; k < subItem.length; k++) {
                        if (Array.isArray(subItem[k]) && subItem[k][0] === 'at') {
                            const atNode = subItem[k];
                            if (atNode.length >= 3) {
                                // Flip Y coordinate for back-side
                                atNode[2] = -parseFloat(String(atNode[2]));
                                // Add or update rotation (180° for back-side)
                                if (atNode.length === 3) {
                                    atNode.push(180);
                                } else if (atNode.length === 4) {
                                    atNode[3] = (parseFloat(String(atNode[3])) + 180) % 360;
                                }
                            }
                            break;
                        }
                    }

                    // Find and add mirror justification to effects (for fp_text)
                    for (let k = 0; k < subItem.length; k++) {
                        if (Array.isArray(subItem[k]) && subItem[k][0] === 'effects') {
                            const effectsNode = subItem[k];
                            // Check if justify already exists
                            let justifyFound = false;
                            for (let j = 0; j < effectsNode.length; j++) {
                                if (Array.isArray(effectsNode[j]) && effectsNode[j][0] === 'justify') {
                                    // Add mirror to existing justify
                                    if (!effectsNode[j].includes('mirror')) {
                                        effectsNode[j].push('mirror');
                                    }
                                    justifyFound = true;
                                    break;
                                }
                            }
                            if (!justifyFound) {
                                // Add new justify mirror
                                effectsNode.push(['justify', 'mirror']);
                            }
                            break;
                        }
                    }
                }
            }

        
}

export function updateFootprintNode(node: any[], component: Component, resolveNet: (ref: string, pin: string, uuid?: string, map?: Map<string, number>) => import("./pcb_interfaces.js").INetResolution, boardNetNameToCodeMap?: Map<string, number>): any[] {
        // Ensure component rotation is defined (default to 0)
        component.pcb.rotation = component.pcb.rotation ?? 0;

        // Ensure UUID exists and is correct
        let uuidNodeFound = false;
        for (let i = 0; i < node.length; i++) {
            if (Array.isArray(node[i]) && node[i][0] === 'uuid') {
                node[i] = ['uuid', `\`${component.uuid}\``]; // Update just in case, though should match
                uuidNodeFound = true;
                break;
            }
        }
        if (!uuidNodeFound) {
            node.splice(2, 0, [`uuid \`${component.uuid}\``]); // Add if missing
        }

        // Update footprint name
        node[1] = `\`${component.footprint}\``;
        
        // Update the main layer of the footprint
        const mainFootprintLayer = component.pcb?.side === 'back' ? '"B.Cu"' : '"F.Cu"';
        let layerNodeFound = false;
        for(let i = 0; i < node.length; i++) {
            if(Array.isArray(node[i]) && node[i][0] === 'layer') {
                node[i][1] = mainFootprintLayer;
                layerNodeFound = true;
                break;
            }
        }
        if (!layerNodeFound) {
            // Insert after footprint name and before 'at' or 'uuid' typically
            let layerInsertPos = 2; // Default after name
            for(let i=0; i < node.length; ++i) { // Try to place it after name, before uuid/at
                if (Array.isArray(node[i]) && (node[i][0] === 'uuid' || node[i][0] === 'at')) {
                    layerInsertPos = i;
                    break;
                }
                if (i > 1 && typeof node[i-1] === 'string' && node[i-1].includes(component.footprint)) { // after name
                    layerInsertPos = i;
                }
            }
            node.splice(layerInsertPos, 0, ['layer', mainFootprintLayer]);
        }

        // Find and update the main 'at' node for the footprint itself
        let mainAtNodeUpdated = false;
        for (let i = 0; i < node.length; i++) {
            if (Array.isArray(node[i]) && node[i][0] === 'at') {
                node[i][1] = component.pcb.x;
                node[i][2] = component.pcb.y;
                if (node[i].length > 3) { // If rotation field exists
                    node[i][3] = component.pcb.rotation;
                } else { // If 'at' node was just (at x y)
                    node[i].push(component.pcb.rotation);
                }
                mainAtNodeUpdated = true;
                break;
            }
        }
        if (!mainAtNodeUpdated && typeof component.pcb.x === 'number' && typeof component.pcb.y === 'number') {
            let atInsertPos = 2;
            for (let i = 0; i < node.length; ++i) {
                if (Array.isArray(node[i]) && node[i][0] === 'uuid') {
                    atInsertPos = i + 1;
                    break;
                } else if (Array.isArray(node[i]) && node[i][0] === 'layer') {
                     atInsertPos = i + 1; // Prefer after layer if uuid not found yet
                }
            }
            node.splice(atInsertPos, 0, ['at', component.pcb.x, component.pcb.y, component.pcb.rotation]);
        }

        // Recursively transform layers for all sub-elements before specific updates
        for (let i = 0; i < node.length; i++) {
            if (Array.isArray(node[i])) {
                // Skip transforming the main 'layer' node we just set/updated.
                if (node[i][0] === 'layer' && (node[i][1] === '"F.Cu"' || node[i][1] === '"B.Cu"')) {
                     let isMainCuLayer = false;
                     if (node.indexOf(node[i]) < 5 && (node[i][1] === mainFootprintLayer)) {
                         isMainCuLayer = true;
                     }
                     if (!isMainCuLayer) {
                          node[i] = transformSexprLayers(node[i], component.pcb?.side);
                     }
                } else {
                    node[i] = transformSexprLayers(node[i], component.pcb?.side);
                }
            }
        }

        // Loop through and update properties, text, pads, etc. (original logic for content)
        let hasCodeProperty: boolean = false;
        // Detect if a Code property already exists on this footprint
        for (let i = 0; i < node.length; i++) {
            const it = node[i];
            if (Array.isArray(it) && it[0] === 'property') {
                const nameStr = String(it[1]).replace(/[`\"]/g, '');
                if (nameStr === 'Code') { hasCodeProperty = true; break; }
            }
        }
        for (let i = 0; i < node.length; i++) {
            const subItem = node[i];
            if (!Array.isArray(subItem)) continue;
            processFootprintItem(subItem, component, resolveNet, boardNetNameToCodeMap);
        }

        // Ensure Code property exists and is well-formed
        {
            const formatted = formatSourceInfoForProperty(component.sourceInfo);
            const valueToken = (formatted && formatted.length > 0) ? `\`${formatted}\`` : '``'; // write "" if blank

            if (hasCodeProperty) {
                // Update existing Code property value and ensure required child nodes
                for (let j = 0; j < node.length; j++) {
                    if (Array.isArray(node[j]) && node[j][0] === 'property') {
                        const nameStr = String(node[j][1]).replace(/[`\"]/g, '');
                        if (nameStr === 'Code') {
                            // Replace existing value elements with single valueToken
                            let firstNodeIndex = -1;
                            for (let k = 2; k < node[j].length; k++) {
                                if (Array.isArray(node[j][k])) { firstNodeIndex = k; break; }
                            }
                            const valueElementsCount = (firstNodeIndex === -1) ? (node[j].length - 2) : (firstNodeIndex - 2);
                            node[j].splice(2, Math.max(0, valueElementsCount), valueToken);

                            // Ensure (hide yes)
                            let hasHide = false;
                            let hasLayer = false;
                            let hasEffects = false;
                            let hasAt = false;
                            let hasUuid = false;
                            for (let k = 2; k < node[j].length; k++) {
                                if (Array.isArray(node[j][k])) {
                                    const t = node[j][k][0];
                                    if (t === 'hide') hasHide = true;
                                    if (t === 'layer') hasLayer = true;
                                    if (t === 'effects') hasEffects = true;
                                    if (t === 'at') hasAt = true;
                                    if (t === 'uuid') hasUuid = true;
                                }
                            }
                            if (!hasHide) node[j].push(['hide', 'yes']);
                            if (!hasLayer) node[j].push(['layer', '"F.Fab"']);
                            if (!hasAt) node[j].push(['at', 0, 0, 0]);
                            if (!hasUuid) node[j].push(['uuid', `\`${generateUuid()}\``]);
                            if (!hasEffects) node[j].push(['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]]);
                            break;
                        }
                    }
                }
            } else {
                // Insert well-formed Code property near other properties if possible; otherwise, append
                let insertPos = node.length;
                for (let j = 0; j < node.length; j++) {
                    if (Array.isArray(node[j]) && node[j][0] === 'property') insertPos = j + 1;
                }
                const codeProp = ['property', '`Code`', valueToken,
                    ['at', 0, 0, 0],
                    ['layer', '"F.Fab"'],
                    ['hide', 'yes'],
                    ['uuid', `\`${generateUuid()}\``],
                    ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]]
                ];
                node.splice(insertPos, 0, codeProp);
            }
        }

        return node;
    }



    
    /**
     * Formats sourceInfo for safe insertion into a KiCad property string.
     * Uses single quotes inside to avoid conflicts with KiCad's double-quoted strings.
     */
  
    /**
     * Creates a new footprint S-expression node from a component.
     * Reads the .kicad_mod file, parses it, and inserts component data.
     * @param component The component to create the node for.
     * @param boardNetNameToCodeMap Map of existing board net names to their codes.
     * @returns The new S-expression node array.
     * @throws Error if the .kicad_mod file is missing, empty, or parsing fails.
     * @private
     */

    /**
     * Creates a new footprint S-expression node from a component.
     * Reads the .kicad_mod file, parses it, and inserts component data.
     * @param component The component to create the node for.
     * @param boardNetNameToCodeMap Map of existing board net names to their codes.
     * @returns The new S-expression node array.
     * @throws Error if the .kicad_mod file is missing, empty, or parsing fails.
     * @private
     */
export function createFootprintNode(component: Component, resolveNet: (ref: string, pin: string, uuid?: string, map?: Map<string, number>) => import("./pcb_interfaces.js").INetResolution, boardNetNameToCodeMap?: Map<string, number>): any[] {
        let footprint_contents: string;
        try {
            footprint_contents = component.footprint_lib(component.footprint!).replaceAll('"', "`");
        } catch (e: any) {
            // The footprint_lib method now throws proper errors, so we can catch and re-throw them
            // with additional context about the component
            throw new BoardCreationError(`[${component.reference || 'Unknown'}, ${component.value || 'Unknown'}, ${component.footprint}] Failed to create footprint node. ${e.message}`);
        }

        let l: any[];
        try {
            l = fsexp(footprint_contents).pop();
            if (l === undefined || !Array.isArray(l)) {
                throw new BoardCreationError("Parsed footprint is undefined or not an array");
            }
        } catch (e: any) {
            throw new BoardCreationError(`[${component.reference || 'Unknown'}, ${component.value || 'Unknown'}, ${component.footprint}] Failed to parse footprint: ${e.message}`);
        }


        // TypeCAD will always insert the rotation, even if it is 0
        // Ensure component rotation is defined (default to 0)
        component.pcb.rotation = component.pcb.rotation ?? 0;

        l.splice(2, 0, [`at ${component.pcb.x} ${component.pcb.y} ${component.pcb.rotation}`]);

        // Add uuid field to each component
        l.splice(2, 0, [`uuid \`${component.uuid}\``]); // Use backticks for SExpr parser

        // Set the main layer of the footprint
        const mainFootprintLayer = component.pcb?.side === 'back' ? '"B.Cu"' : '"F.Cu"';
        let layerNodeFound = false;
        for(let i = 0; i < l.length; i++) {
            if(Array.isArray(l[i]) && l[i][0] === 'layer') {
                l[i][1] = mainFootprintLayer;
                layerNodeFound = true;
                break;
            }
        }
        if (!layerNodeFound) {
            // Insert after footprint name and before 'at' or 'uuid' typically
            // (footprint "name" (layer "F.Cu") (uuid "...") (at ...))
            l.splice(2, 0, ['layer', mainFootprintLayer]);
        }
        
        // Correct footprint name (use component's, not the one from the lib file)
        l[1] = `\`${component.footprint}\``;

        // Recursively transform layers for all sub-elements
        for (let i = 0; i < l.length; i++) {
            if (Array.isArray(l[i])) {
                 // Skip transforming the main 'layer' node we just set, if it's encountered again.
                 // The recursive transform handles nested 'layer' tags.
                if (l[i][0] === 'layer' && (l[i][1] === '"F.Cu"' || l[i][1] === '"B.Cu"')) {
                    // This is likely the main footprint layer, already set.
                    // However, allow transformation if it's a different layer type (e.g. F.SilkS)
                    let isMainCuLayer = false;
                    if (l.indexOf(l[i]) < 5 && (l[i][1] === mainFootprintLayer)) { // Heuristic: main layer is usually early
                        isMainCuLayer = true;
                    }
                    if (!isMainCuLayer) {
                         l[i] = transformSexprLayers(l[i], component.pcb?.side);
                    }
                } else {
                    l[i] = transformSexprLayers(l[i], component.pcb?.side);
                }
            }
        }

        // Loop through and replace references, values, and update rotations (original logic)
        for (var ii in l) {
            if (!Array.isArray(l[ii])) continue;
            processFootprintItem(l[ii], component, resolveNet, boardNetNameToCodeMap);
        }

        // Add Code property with sourceInfo
        const formatted = formatSourceInfoForProperty(component.sourceInfo);
        const valueToken = (formatted && formatted.length > 0) ? `\`${formatted}\`` : '``';

        // Check if Code property already exists in the footprint
        let hasCodeProperty = false;
        for (let i = 0; i < l.length; i++) {
            if (Array.isArray(l[i]) && l[i][0] === 'property') {
                const propName = String(l[i][1]).replace(/[`\"]/g, '');
                if (propName === 'Code') {
                    hasCodeProperty = true;
                    // Update existing Code property
                    let firstNodeIndex = -1;
                    for (let k = 2; k < l[i].length; k++) {
                        if (Array.isArray(l[i][k])) { firstNodeIndex = k; break; }
                    }
                    const valueElementsCount = (firstNodeIndex === -1) ? (l[i].length - 2) : (firstNodeIndex - 2);
                    l[i].splice(2, Math.max(0, valueElementsCount), valueToken);
                    break;
                }
            }
        }

        if (!hasCodeProperty) {
            // Add new Code property
            let insertPos = l.length;
            for (let j = 0; j < l.length; j++) {
                if (Array.isArray(l[j]) && l[j][0] === 'property') insertPos = j + 1;
            }
            const codeProp = ['property', '`Code`', valueToken,
                ['at', 0, 0, 0],
                ['layer', '"F.Fab"'],
                ['hide', 'yes'],
                ['uuid', `\`${generateUuid()}\``],
                ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]]
            ];
            l.splice(insertPos, 0, codeProp);
        }

        // Add or update custom text properties from component.text array
        if (component.text && component.text.length > 0) {
            for (const textItem of component.text) {
                const propNameWithBackticks = `\`${textItem.property}\``;
                const fontSize = textItem.fontSize ?? 1.27;
                // Use width/height if provided, otherwise fall back to fontSize
                const fontWidth = textItem.width ?? fontSize;
                const fontHeight = textItem.height ?? fontSize;
                const thickness = textItem.thickness ?? 0.15;
                const rotation = textItem.rotation ?? 0;
                const layer = textItem.layer ?? 'F.Fab';
                // If show is true, hide is "no"; if show is false or undefined, hide is "no" (default visible)
                const hideValue = textItem.show === false ? 'yes' : 'no';

                // Check if this property already exists in the footprint
                let existingPropIndex = -1;
                for (let j = 0; j < l.length; j++) {
                    if (Array.isArray(l[j]) && l[j][0] === 'property') {
                        const existingPropName = String(l[j][1]);
                        if (existingPropName === propNameWithBackticks) {
                            existingPropIndex = j;
                            break;
                        }
                    }
                }

                if (existingPropIndex >= 0) {
                    // Property exists - update it in place
                    const existingProp = l[existingPropIndex];

                    // Update the value (text)
                    const newValueForSexpr = `\`${textItem.text}\``;
                    let firstNodeIndex = -1;
                    for (let k = 2; k < existingProp.length; k++) {
                        if (Array.isArray(existingProp[k])) {
                            firstNodeIndex = k;
                            break;
                        }
                    }
                    const valueElementsCount = (firstNodeIndex === -1) ? (existingProp.length - 2) : (firstNodeIndex - 2);
                    existingProp.splice(2, Math.max(0, valueElementsCount), newValueForSexpr);

                    // Update or add the 'at' node
                    let atNodeIndex = -1;
                    for (let k = 0; k < existingProp.length; k++) {
                        if (Array.isArray(existingProp[k]) && existingProp[k][0] === 'at') {
                            atNodeIndex = k;
                            break;
                        }
                    }
                    if (atNodeIndex >= 0) {
                        existingProp[atNodeIndex] = ['at', textItem.x, textItem.y, rotation];
                    } else {
                        existingProp.splice(3, 0, ['at', textItem.x, textItem.y, rotation]);
                    }

                    // Update or add the 'layer' node
                    let layerNodeIndex = -1;
                    for (let k = 0; k < existingProp.length; k++) {
                        if (Array.isArray(existingProp[k]) && existingProp[k][0] === 'layer') {
                            layerNodeIndex = k;
                            break;
                        }
                    }
                    if (layerNodeIndex >= 0) {
                        existingProp[layerNodeIndex] = ['layer', `"${layer}"`];
                    } else {
                        // Insert layer after 'at' if it exists, otherwise after value
                        const insertAfterAt = existingProp.findIndex((item: any, idx: number) => idx > 2 && Array.isArray(item) && item[0] === 'at');
                        existingProp.splice(insertAfterAt >= 0 ? insertAfterAt + 1 : 3, 0, ['layer', `"${layer}"`]);
                    }

                    // Update or add the 'effects' node
                    let effectsNodeIndex = -1;
                    for (let k = 0; k < existingProp.length; k++) {
                        if (Array.isArray(existingProp[k]) && existingProp[k][0] === 'effects') {
                            effectsNodeIndex = k;
                            break;
                        }
                    }
                    if (effectsNodeIndex >= 0) {
                        existingProp[effectsNodeIndex] = ['effects', ['font', ['size', fontWidth, fontHeight], ['thickness', thickness]]];
                    } else {
                        existingProp.push(['effects', ['font', ['size', fontWidth, fontHeight], ['thickness', thickness]]]);
                    }

                    // Update or add the 'hide' node
                    let hideNodeIndex = -1;
                    for (let k = 0; k < existingProp.length; k++) {
                        if (Array.isArray(existingProp[k]) && existingProp[k][0] === 'hide') {
                            hideNodeIndex = k;
                            break;
                        }
                    }
                    if (hideNodeIndex >= 0) {
                        existingProp[hideNodeIndex] = ['hide', hideValue];
                    } else {
                        existingProp.push(['hide', hideValue]);
                    }

                } else {
                    // Property doesn't exist - add it as new
                    // Find the insertion position (after the last property)
                    let insertPos = l.length;
                    for (let j = 0; j < l.length; j++) {
                        if (Array.isArray(l[j]) && l[j][0] === 'property') insertPos = j + 1;
                    }

                    const textProp = ['property', propNameWithBackticks, `\`${textItem.text}\``,
                        ['at', textItem.x, textItem.y, rotation],
                        ['layer', `"${layer}"`],
                        ['uuid', `\`${generateUuid()}\``],
                        ['effects', ['font', ['size', fontWidth, fontHeight], ['thickness', thickness]]],
                        ['hide', hideValue]
                    ];
                    l.splice(insertPos, 0, textProp);
                }
            }
        }

        return l;
    }

    /**
     * Creates and saves the board to a file.
     * @param items - Components and TrackBuilder instances to add to the board before creating.
     */
