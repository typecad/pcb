import { Component } from "../component.js";
import { parse, Sym, yes, no, nameOf, sym } from "../sexpr/index.js";
import type { SExpr } from "../sexpr/types.js";
import type { SexprNode } from "../types/sexpr_types.js";
import { generateUuid, formatSourceInfoForProperty, getErrorMessage } from "./pcb_utils.js";
import { mapLayerToSide, transformSexprLayers, mirrorChamferDirection } from "./pcb_layer_utils.js";
import { BoardCreationError } from '../errors.js';
import type { INetResolution } from "./pcb_interfaces.js";

function stringifyTags(node: SexprNode): void {
    if (node.length > 0 && Sym.isSym(node[0])) {
        node[0] = (node[0] as Sym).name;
    }
    for (let i = 0; i < node.length; i++) {
        if (Array.isArray(node[i])) stringifyTags(node[i] as SexprNode);
    }
}

function symifyTags(node: SexprNode): void {
    if (node.length > 0 && typeof node[0] === 'string') {
        node[0] = Sym.for(node[0] as string);
    }
    for (let i = 0; i < node.length; i++) {
        if (Array.isArray(node[i])) symifyTags(node[i] as SexprNode);
    }
}

function applyBackSideTransform(subItem: SexprNode): void {
    for (let k = 0; k < subItem.length; k++) {
        if (Array.isArray(subItem[k]) && (subItem[k] as SexprNode)[0] === 'at') {
            const atNode = subItem[k] as SexprNode;
            if (atNode.length >= 3) {
                atNode[2] = -parseFloat(String(atNode[2]));
                if (atNode.length === 3) {
                    atNode.push(180);
                } else if (atNode.length === 4) {
                    atNode[3] = (parseFloat(String(atNode[3])) + 180) % 360;
                }
            }
            break;
        }
    }

    for (let k = 0; k < subItem.length; k++) {
        if (Array.isArray(subItem[k]) && (subItem[k] as SexprNode)[0] === 'effects') {
            const effectsNode = subItem[k] as SexprNode;
            let justifyFound = false;
            for (let j = 0; j < effectsNode.length; j++) {
                if (Array.isArray(effectsNode[j]) && (effectsNode[j] as SexprNode)[0] === 'justify') {
                    const justifyNode = effectsNode[j] as SexprNode;
                    if (!justifyNode.some(item => nameOf(item) === 'mirror')) {
                        justifyNode.push(sym('mirror'));
                    }
                    justifyFound = true;
                    break;
                }
            }
            if (!justifyFound) {
                effectsNode.push(['justify', sym('mirror')]);
            }
            break;
        }
    }
}

export function processFootprintItem(subItem: SexprNode, component: Component, resolveNet: (ref: string, pin: string, uuid?: string, map?: Map<string, number>) => INetResolution, boardNetNameToCodeMap?: Map<string, number>) {
    const itemType = subItem[0];

    if (itemType === 'property') {
        const propName = subItem[1];
        let newValue: string | undefined = undefined;

        if (propName === 'Reference' && component.reference !== undefined) {
            newValue = component.reference;
        } else if (propName === 'Value' && component.value !== undefined) {
            newValue = component.value;
        } else if (propName === 'Footprint' && component.footprint !== undefined) {
            newValue = component.footprint;
        } else if (propName === 'Datasheet' && component.datasheet !== undefined) {
            const sanitized = component.datasheet.replace(/[()"`±]/g, '').replace(/\s+/g, ' ').trim();
            newValue = sanitized;
        } else if (propName === 'Code') {
            newValue = String(subItem[2]);
        } else if (propName === 'Description' && component.description !== undefined) {
            const sanitized = component.description
                .replace(/\([^)]*\)/g, '')
                .replace(/[()"`±]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            newValue = sanitized;
        } else if (propName === 'MPN' && component.mpn !== undefined) {
            const sanitized = component.mpn.replace(/[()"`±]/g, '').replace(/\s+/g, ' ').trim();
            newValue = sanitized;
        }

        let firstNodeIndex = -1;
        for (let k = 2; k < subItem.length; k++) {
            if (Array.isArray(subItem[k])) {
                firstNodeIndex = k;
                break;
            }
        }

        const valueElementsCount = (firstNodeIndex === -1) ? (subItem.length - 2) : (firstNodeIndex - 2);

        if (valueElementsCount > 0) {
            let existingValue = '';
            for (let k = 2; k < 2 + valueElementsCount; k++) {
                if (typeof subItem[k] === 'string') {
                    existingValue += subItem[k];
                }
            }

            const sanitizedExisting = existingValue
                .replace(/\([^)]*\)/g, '')
                .replace(/[()"`±]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            subItem.splice(2, valueElementsCount, sanitizedExisting);
        }

        if (newValue !== undefined) {
            firstNodeIndex = -1;
            for (let k = 2; k < subItem.length; k++) {
                if (Array.isArray(subItem[k])) {
                    firstNodeIndex = k;
                    break;
                }
            }

            const newValueElementsCount = (firstNodeIndex === -1) ? (subItem.length - 2) : (firstNodeIndex - 2);

            if (newValueElementsCount >= 0) {
                subItem.splice(2, Math.max(0, newValueElementsCount), newValue);
            } else {
                subItem.splice(2, 0, newValue);
            }
        }

        if (component.pcb?.side === 'back') {
            applyBackSideTransform(subItem);
        }

    }

    else if (itemType === 'fp_text') {
        const textType = String(subItem[1]).toLowerCase();
        if (textType === 'reference' && component.reference !== undefined) {
            subItem[2] = component.reference;
        } else if (textType === 'value' && component.value !== undefined) {
            subItem[2] = component.value;
        } else if (textType === 'user' && component.fab) {
            const textContent = subItem.length > 2 ? String(subItem[2]) : '';
            if (textContent === '${REFERENCE}') {
                const fab = component.fab;
                if (fab.text) subItem[2] = fab.text;
                for (let k = 2; k < subItem.length; k++) {
                    if (Array.isArray(subItem[k]) && (subItem[k] as SexprNode)[0] === 'at') {
                        const atNode = subItem[k] as SexprNode;
                        atNode[1] = fab.x;
                        atNode[2] = fab.y;
                        if (fab.rotation !== undefined) {
                            if (atNode.length > 3) {
                                atNode[3] = fab.rotation;
                            } else {
                                atNode.push(fab.rotation);
                            }
                        }
                        break;
                    }
                }
                if (fab.width !== undefined || fab.height !== undefined || fab.thickness !== undefined) {
                    for (let k = 2; k < subItem.length; k++) {
                        if (Array.isArray(subItem[k]) && (subItem[k] as SexprNode)[0] === 'effects') {
                            const effectsNode = subItem[k] as SexprNode;
                            for (const eff of effectsNode.slice(1)) {
                                if (Array.isArray(eff) && (eff as SexprNode)[0] === 'font') {
                                    const fontNode = eff as SexprNode;
                                    for (let f = 1; f < fontNode.length; f++) {
                                        if (Array.isArray(fontNode[f]) && (fontNode[f] as SexprNode)[0] === 'size') {
                                            const sizeNode = fontNode[f] as SexprNode;
                                            if (fab.height !== undefined) sizeNode[1] = fab.height;
                                            if (fab.width !== undefined) sizeNode[2] = fab.width;
                                        } else if (Array.isArray(fontNode[f]) && (fontNode[f] as SexprNode)[0] === 'thickness') {
                                            const thickNode = fontNode[f] as SexprNode;
                                            if (fab.thickness !== undefined) thickNode[1] = fab.thickness;
                                        }
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
            }
        }

        if (component.pcb?.side === 'back') {
            applyBackSideTransform(subItem);
        }
    }

    else if (itemType === 'pad') {
        const padNumber = subItem.length > 1 ? String(subItem[1]) : '';

        const netResolution = resolveNet(
            component.reference || '',
            padNumber,
            undefined,
            boardNetNameToCodeMap
        );

        for (let k = 2; k < subItem.length; k++) {
            if (Array.isArray(subItem[k]) && (subItem[k] as SexprNode)[0] === 'at') {
                const padAtNode = subItem[k] as SexprNode;

                if (component.pcb?.side === 'back' && padAtNode.length >= 3) {
                    padAtNode[2] = -parseFloat(String(padAtNode[2]));
                }

                if (padAtNode.length === 3) {
                    let rotation = component.pcb.rotation || 0;
                    if (component.pcb?.side === 'back') {
                        rotation = (360 - rotation) % 360;
                    }
                    padAtNode.push(rotation);
                } else if (padAtNode.length === 4) {
                    let componentRotation = component.pcb.rotation || 0;
                    const padRotation = parseFloat(String(padAtNode[3]));

                    if (component.pcb?.side === 'back') {
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

        for (let k = 2; k < subItem.length; k++) {
            if (Array.isArray(subItem[k]) && (subItem[k] as SexprNode)[0] === 'layers') {
                const layersNode = subItem[k] as SexprNode;
                let transformationOccurred = false;

                for (let layerIdx = 1; layerIdx < layersNode.length; layerIdx++) {
                    const layerElement = layersNode[layerIdx];
                    if (typeof layerElement === 'string' || Sym.isSym(layerElement)) {
                        const cleanLayerName = String(layerElement);
                        const transformedLayer = mapLayerToSide(cleanLayerName, component.pcb?.side);

                        if (transformedLayer !== cleanLayerName) {
                            layersNode[layerIdx] = transformedLayer;
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

        let netNodeFound = false;
        let pintypeNodeFound = false;

        for (let k = 2; k < subItem.length; k++) {
            if (Array.isArray(subItem[k])) {
                const childNode = subItem[k] as SexprNode;
                if (childNode[0] === 'net') {
                    childNode[1] = netResolution.netCode;
                    childNode[2] = netResolution.netName || '';
                    netNodeFound = true;
                } else if (childNode[0] === 'pintype') {
                    childNode[1] = Sym.for('passive');
                    pintypeNodeFound = true;
                }
            }
        }

        if (!netNodeFound) {
            subItem.push(['net', netResolution.netCode, netResolution.netName || '']);
        }

        if (!pintypeNodeFound) {
            subItem.push(['pintype', Sym.for('passive')]);
        }

        if (component.pcb?.side === 'back') {
            for (let k = 2; k < subItem.length; k++) {
                if (Array.isArray(subItem[k]) && (subItem[k] as SexprNode)[0] === 'chamfer' && (subItem[k] as SexprNode).length > 1) {
                    const chamferNode = subItem[k] as SexprNode;
                    const originalDirection = chamferNode[1];
                    const mirroredDirection = mirrorChamferDirection(String(originalDirection));
                    if (mirroredDirection !== String(originalDirection)) {
                        chamferNode[1] = mirroredDirection;
                    }
                }
            }
        }
    }

    else if (component.pcb?.side === 'back' && (itemType === 'fp_line' || itemType === 'fp_circle' || itemType === 'fp_arc' || itemType === 'fp_rect' || itemType === 'fp_poly' || itemType === 'fp_text' || itemType === 'fp_text_box' || itemType === 'fp_curve')) {
        for (let k = 0; k < subItem.length; k++) {
            if (Array.isArray(subItem[k])) {
                const child = subItem[k] as SexprNode;
                const nodeType = child[0];

                if ((nodeType === 'start' || nodeType === 'end') && child.length >= 3) {
                    child[2] = -parseFloat(String(child[2]));
                }
                else if (nodeType === 'center' && child.length >= 3) {
                    child[2] = -parseFloat(String(child[2]));
                }
                else if (nodeType === 'mid' && child.length >= 3) {
                    child[2] = -parseFloat(String(child[2]));
                }
                else if (nodeType === 'pts') {
                    const ptsNode = child;
                    for (let j = 1; j < ptsNode.length; j++) {
                        if (Array.isArray(ptsNode[j]) && (ptsNode[j] as SexprNode)[0] === 'xy' && (ptsNode[j] as SexprNode).length >= 3) {
                            (ptsNode[j] as SexprNode)[2] = -parseFloat(String((ptsNode[j] as SexprNode)[2]));
                        }
                    }
                }
            }
        }

        if (itemType === 'fp_text' || itemType === 'fp_text_box') {
            for (let k = 0; k < subItem.length; k++) {
                if (Array.isArray(subItem[k]) && (subItem[k] as SexprNode)[0] === 'at') {
                    const atNode = subItem[k] as SexprNode;
                    if (atNode.length >= 3) {
                        atNode[2] = -parseFloat(String(atNode[2]));
                        if (atNode.length === 3) {
                            atNode.push(180);
                        } else if (atNode.length === 4) {
                            atNode[3] = (parseFloat(String(atNode[3])) + 180) % 360;
                        }
                    }
                    break;
                }
            }

            for (let k = 0; k < subItem.length; k++) {
                if (Array.isArray(subItem[k]) && (subItem[k] as SexprNode)[0] === 'effects') {
                    const effectsNode = subItem[k] as SexprNode;
                    let justifyFound = false;
                    for (let j = 0; j < effectsNode.length; j++) {
                        if (Array.isArray(effectsNode[j]) && (effectsNode[j] as SexprNode)[0] === 'justify') {
                            const justifyNode = effectsNode[j] as SexprNode;
                            if (!justifyNode.some(item => nameOf(item) === 'mirror')) {
                                justifyNode.push(sym('mirror'));
                            }
                            justifyFound = true;
                            break;
                        }
                    }
                    if (!justifyFound) {
                        effectsNode.push(['justify', sym('mirror')]);
                    }
                    break;
                }
            }
        }
    }
}

export function updateFootprintNode(node: SexprNode, component: Component, resolveNet: (ref: string, pin: string, uuid?: string, map?: Map<string, number>) => INetResolution, boardNetNameToCodeMap?: Map<string, number>): SexprNode {
    component.pcb.rotation = component.pcb.rotation ?? 0;

    for (let i = 0; i < node.length; i++) {
        if (Array.isArray(node[i])) {
            node[i] = transformSexprLayers(node[i], component.pcb?.side);
        }
    }

    stringifyTags(node);

    let uuidNodeFound = false;
    for (let i = 0; i < node.length; i++) {
        if (Array.isArray(node[i]) && (node[i] as SexprNode)[0] === 'uuid') {
            const uuidNode = node[i] as SexprNode;
            uuidNode[1] = component.uuid;
            uuidNodeFound = true;
            break;
        }
    }
    if (!uuidNodeFound) {
        node.splice(2, 0, ['uuid', component.uuid] as SexprNode);
    }

    node[1] = component.footprint;

    const mainFootprintLayer = component.pcb?.side === 'back' ? 'B.Cu' : 'F.Cu';
    let layerNodeFound = false;
    for (let i = 0; i < node.length; i++) {
        if (Array.isArray(node[i]) && (node[i] as SexprNode)[0] === 'layer') {
            (node[i] as SexprNode)[1] = mainFootprintLayer;
            layerNodeFound = true;
            break;
        }
    }
    if (!layerNodeFound) {
        let layerInsertPos = 2;
        for (let i = 0; i < node.length; ++i) {
            if (Array.isArray(node[i]) && ((node[i] as SexprNode)[0] === 'uuid' || (node[i] as SexprNode)[0] === 'at')) {
                layerInsertPos = i;
                break;
            }
            if (i > 1 && typeof node[i - 1] === 'string' && (node[i - 1] as string).includes(component.footprint)) {
                layerInsertPos = i;
            }
        }
        node.splice(layerInsertPos, 0, ['layer', mainFootprintLayer] as SexprNode);
    }

    let mainAtNodeUpdated = false;
    for (let i = 0; i < node.length; i++) {
        if (Array.isArray(node[i]) && (node[i] as SexprNode)[0] === 'at') {
            const atNode = node[i] as SexprNode;
            atNode[1] = component.pcb.x;
            atNode[2] = component.pcb.y;
            if (atNode.length > 3) {
                atNode[3] = component.pcb.rotation;
            } else {
                atNode.push(component.pcb.rotation);
            }
            mainAtNodeUpdated = true;
            break;
        }
    }
    if (!mainAtNodeUpdated && typeof component.pcb.x === 'number' && typeof component.pcb.y === 'number') {
        let atInsertPos = 2;
        for (let i = 0; i < node.length; ++i) {
            if (Array.isArray(node[i]) && (node[i] as SexprNode)[0] === 'uuid') {
                atInsertPos = i + 1;
                break;
            } else if (Array.isArray(node[i]) && (node[i] as SexprNode)[0] === 'layer') {
                atInsertPos = i + 1;
            }
        }
        node.splice(atInsertPos, 0, ['at', component.pcb.x, component.pcb.y, component.pcb.rotation] as SexprNode);
    }

    let hasCodeProperty: boolean = false;
    for (let i = 0; i < node.length; i++) {
        const it = node[i];
        if (Array.isArray(it) && (it as SexprNode)[0] === 'property') {
            const nameStr = String((it as SexprNode)[1]);
            if (nameStr === 'Code') { hasCodeProperty = true; break; }
        }
    }
    for (let i = 0; i < node.length; i++) {
        const subItem = node[i];
        if (!Array.isArray(subItem)) continue;
        processFootprintItem(subItem as SexprNode, component, resolveNet, boardNetNameToCodeMap);
    }

    {
        const formatted = formatSourceInfoForProperty(component.sourceInfo);
        const valueToken = (formatted && formatted.length > 0) ? formatted : '';

        if (hasCodeProperty) {
            for (let j = 0; j < node.length; j++) {
                if (Array.isArray(node[j]) && (node[j] as SexprNode)[0] === 'property') {
                    const propNode = node[j] as SexprNode;
                    const nameStr = String(propNode[1]);
                    if (nameStr === 'Code') {
                        let firstNodeIndex = -1;
                        for (let k = 2; k < propNode.length; k++) {
                            if (Array.isArray(propNode[k])) { firstNodeIndex = k; break; }
                        }
                        const valueElementsCount = (firstNodeIndex === -1) ? (propNode.length - 2) : (firstNodeIndex - 2);
                        propNode.splice(2, Math.max(0, valueElementsCount), valueToken);

                        let hasHide = false;
                        let hasLayer = false;
                        let hasEffects = false;
                        let hasAt = false;
                        let hasUuid = false;
                        for (let k = 2; k < propNode.length; k++) {
                            if (Array.isArray(propNode[k])) {
                                const t = (propNode[k] as SexprNode)[0];
                                if (t === 'hide') hasHide = true;
                                if (t === 'layer') hasLayer = true;
                                if (t === 'effects') hasEffects = true;
                                if (t === 'at') hasAt = true;
                                if (t === 'uuid') hasUuid = true;
                            }
                        }
                        if (!hasHide) propNode.push(['hide', yes()] as SexprNode);
                        if (!hasLayer) propNode.push(['layer', 'F.Fab'] as SexprNode);
                        if (!hasAt) propNode.push(['at', 0, 0, 0] as SexprNode);
                        if (!hasUuid) propNode.push(['uuid', generateUuid()] as SexprNode);
                        if (!hasEffects) propNode.push(['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]] as SexprNode);
                        break;
                    }
                }
            }
        } else {
            let insertPos = node.length;
            for (let j = 0; j < node.length; j++) {
                if (Array.isArray(node[j]) && (node[j] as SexprNode)[0] === 'property') insertPos = j + 1;
            }
            const codeProp: SexprNode = ['property', 'Code', valueToken,
                ['at', 0, 0, 0],
                ['layer', 'F.Fab'],
                ['hide', yes()],
                ['uuid', generateUuid()],
                ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]]
            ] as SexprNode;
            node.splice(insertPos, 0, codeProp);
        }
    }

    symifyTags(node);
    return node;
}

export function createFootprintNode(component: Component, resolveNet: (ref: string, pin: string, uuid?: string, map?: Map<string, number>) => INetResolution, boardNetNameToCodeMap?: Map<string, number>): SexprNode {
    let footprint_contents: string;
    try {
        footprint_contents = component.footprint_lib(component.footprint!);
    } catch (e: unknown) {
        throw new BoardCreationError(`[${component.reference || 'Unknown'}, ${component.value || 'Unknown'}, ${component.footprint}] Failed to create footprint node. ${getErrorMessage(e)}`);
    }

    let l: SexprNode;
    try {
        l = parse(footprint_contents) as SexprNode;
        if (l === undefined || !Array.isArray(l)) {
            throw new BoardCreationError("Parsed footprint is undefined or not an array");
        }
    } catch (e: unknown) {
        throw new BoardCreationError(`[${component.reference || 'Unknown'}, ${component.value || 'Unknown'}, ${component.footprint}] Failed to parse footprint: ${getErrorMessage(e)}`);
    }

    component.pcb.rotation = component.pcb.rotation ?? 0;

    for (let i = 0; i < l.length; i++) {
        if (Array.isArray(l[i])) {
            l[i] = transformSexprLayers(l[i], component.pcb?.side);
        }
    }

    stringifyTags(l);

    l.splice(2, 0, ['at', component.pcb.x, component.pcb.y, component.pcb.rotation] as SexprNode);

    l.splice(2, 0, ['uuid', component.uuid] as SexprNode);

    const codeValue = formatSourceInfoForProperty(
        component.sourceInfo,
        component.uuid,
        component.footprintHash
    );
    if (codeValue) {
        l.splice(2, 0, ['property', 'Code', codeValue,
            ['at', 0, 0, 0],
            ['layer', 'F.Fab'],
            ['hide', yes()],
            ['uuid', generateUuid()],
            ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]]
        ] as SexprNode);
    }

    const mainFootprintLayer = component.pcb?.side === 'back' ? 'B.Cu' : 'F.Cu';
    let layerNodeFound = false;
    for (let i = 0; i < l.length; i++) {
        if (Array.isArray(l[i]) && (l[i] as SexprNode)[0] === 'layer') {
            (l[i] as SexprNode)[1] = mainFootprintLayer;
            layerNodeFound = true;
            break;
        }
    }
    if (!layerNodeFound) {
        l.splice(2, 0, ['layer', mainFootprintLayer] as SexprNode);
    }

    l[1] = component.footprint;

    for (let i = 0; i < l.length; i++) {
        if (!Array.isArray(l[i])) continue;
        processFootprintItem(l[i] as SexprNode, component, resolveNet, boardNetNameToCodeMap);
    }

    const formatted = formatSourceInfoForProperty(component.sourceInfo);
    const valueToken = (formatted && formatted.length > 0) ? formatted : '';

    let hasCodeProperty = false;
    for (let i = 0; i < l.length; i++) {
        if (Array.isArray(l[i]) && (l[i] as SexprNode)[0] === 'property') {
            const propNode = l[i] as SexprNode;
            const propName = String(propNode[1]);
            if (propName === 'Code') {
                hasCodeProperty = true;
                let firstNodeIndex = -1;
                for (let k = 2; k < propNode.length; k++) {
                    if (Array.isArray(propNode[k])) { firstNodeIndex = k; break; }
                }
                const valueElementsCount = (firstNodeIndex === -1) ? (propNode.length - 2) : (firstNodeIndex - 2);
                propNode.splice(2, Math.max(0, valueElementsCount), valueToken);
                break;
            }
        }
    }

    if (!hasCodeProperty) {
        let insertPos = l.length;
        for (let j = 0; j < l.length; j++) {
            if (Array.isArray(l[j]) && (l[j] as SexprNode)[0] === 'property') insertPos = j + 1;
        }
        const codeProp: SexprNode = ['property', 'Code', valueToken,
            ['at', 0, 0, 0],
            ['layer', 'F.Fab'],
            ['hide', yes()],
            ['uuid', generateUuid()],
            ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]]
        ] as SexprNode;
        l.splice(insertPos, 0, codeProp);
    }

    if (component.text && component.text.length > 0) {
        for (const textItem of component.text) {
            const propName = textItem.property;
            const fontSize = textItem.fontSize ?? 1.27;
            const fontWidth = textItem.width ?? fontSize;
            const fontHeight = textItem.height ?? fontSize;
            const thickness = textItem.thickness ?? 0.15;
            const rotation = textItem.rotation ?? 0;
            const layer = textItem.layer ?? (textItem.property === 'Reference' ? 'F.SilkS' : 'F.Fab');
            const hideValue = textItem.show === false ? yes() : no();

            let existingPropIndex = -1;
            for (let j = 0; j < l.length; j++) {
                if (Array.isArray(l[j]) && (l[j] as SexprNode)[0] === 'property') {
                    const existingPropNode = l[j] as SexprNode;
                    const existingPropName = String(existingPropNode[1]);
                    if (existingPropName === propName) {
                        existingPropIndex = j;
                        break;
                    }
                }
            }

            if (existingPropIndex >= 0) {
                const existingProp = l[existingPropIndex] as SexprNode;

                const newValueForSexpr = textItem.text;
                let firstNodeIndex = -1;
                for (let k = 2; k < existingProp.length; k++) {
                    if (Array.isArray(existingProp[k])) {
                        firstNodeIndex = k;
                        break;
                    }
                }
                const valueElementsCount = (firstNodeIndex === -1) ? (existingProp.length - 2) : (firstNodeIndex - 2);
                existingProp.splice(2, Math.max(0, valueElementsCount), newValueForSexpr);

                let atNodeIndex = -1;
                for (let k = 0; k < existingProp.length; k++) {
                    if (Array.isArray(existingProp[k]) && (existingProp[k] as SexprNode)[0] === 'at') {
                        atNodeIndex = k;
                        break;
                    }
                }
                if (atNodeIndex >= 0) {
                    existingProp[atNodeIndex] = ['at', textItem.x, textItem.y, rotation] as SexprNode;
                } else {
                    existingProp.splice(3, 0, ['at', textItem.x, textItem.y, rotation] as SexprNode);
                }

                let layerNodeIndex = -1;
                for (let k = 0; k < existingProp.length; k++) {
                    if (Array.isArray(existingProp[k]) && (existingProp[k] as SexprNode)[0] === 'layer') {
                        layerNodeIndex = k;
                        break;
                    }
                }
                if (layerNodeIndex >= 0) {
                    existingProp[layerNodeIndex] = ['layer', layer] as SexprNode;
                } else {
                    const insertAfterAt = existingProp.findIndex((item: SExpr, idx: number) => idx > 2 && Array.isArray(item) && (item as SexprNode)[0] === 'at');
                    existingProp.splice(insertAfterAt >= 0 ? insertAfterAt + 1 : 3, 0, ['layer', layer] as SexprNode);
                }

                let effectsNodeIndex = -1;
                for (let k = 0; k < existingProp.length; k++) {
                    if (Array.isArray(existingProp[k]) && (existingProp[k] as SexprNode)[0] === 'effects') {
                        effectsNodeIndex = k;
                        break;
                    }
                }
                if (effectsNodeIndex >= 0) {
                    existingProp[effectsNodeIndex] = ['effects', ['font', ['size', fontWidth, fontHeight], ['thickness', thickness]]] as SexprNode;
                } else {
                    existingProp.push(['effects', ['font', ['size', fontWidth, fontHeight], ['thickness', thickness]]] as SexprNode);
                }

                let hideNodeIndex = -1;
                for (let k = 0; k < existingProp.length; k++) {
                    if (Array.isArray(existingProp[k]) && (existingProp[k] as SexprNode)[0] === 'hide') {
                        hideNodeIndex = k;
                        break;
                    }
                }
                if (hideNodeIndex >= 0) {
                    existingProp[hideNodeIndex] = ['hide', hideValue] as SexprNode;
                } else {
                    existingProp.push(['hide', hideValue] as SexprNode);
                }

            } else {
                let insertPos = l.length;
                for (let j = 0; j < l.length; j++) {
                    if (Array.isArray(l[j]) && (l[j] as SexprNode)[0] === 'property') insertPos = j + 1;
                }

                const textProp: SexprNode = ['property', propName, textItem.text,
                    ['at', textItem.x, textItem.y, rotation],
                    ['layer', layer],
                    ['uuid', generateUuid()],
                    ['effects', ['font', ['size', fontWidth, fontHeight], ['thickness', thickness]]],
                    ['hide', hideValue]
                ] as SexprNode;
                l.splice(insertPos, 0, textProp);
            }
        }
    }

    symifyTags(l);
    return l;
}
