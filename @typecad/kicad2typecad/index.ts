#!/usr/bin/env tsx

/// <reference path="./fast-sexpr.d.ts" />

import { PCB } from '@typecad/typecad';
import { TrackBuilder } from '@typecad/typecad';
import fsexp from 'fast-sexpr';
import * as fs from 'node:fs';
import chalk from 'chalk';

interface KicadSegment {
    start: { x: number; y: number };
    end: { x: number; y: number };
    width: number;
    layer: string;
    net?: number;
    uuid?: string;
}

interface KicadNet {
    number: number;
    name: string;
}

function parseSexprItem(item: any[]): KicadSegment | null {
    if (!Array.isArray(item) || item[0] !== 'segment') {
        return null;
    }
    let start: { x: number; y: number } | undefined;
    let end: { x: number; y: number } | undefined;
    let width: number = 0.2;
    let layer: string = "F.Cu";
    let net: number | undefined;
    let uuid: string | undefined;
    for (let i = 1; i < item.length; i++) {
        const element = item[i];
        if (Array.isArray(element) && element.length > 0) {
            const key = element[0];
            const value = element.slice(1);
            switch (key) {
                case 'start':
                    if (value.length === 2) {
                        const x = parseFloat(value[0]);
                        const y = parseFloat(value[1]);
                        if (!isNaN(x) && !isNaN(y)) {
                            start = { x, y };
                        }
                    }
                    break;
                case 'end':
                    if (value.length === 2) {
                        const x = parseFloat(value[0]);
                        const y = parseFloat(value[1]);
                        if (!isNaN(x) && !isNaN(y)) {
                            end = { x, y };
                        }
                    }
                    break;
                case 'width':
                    if (value.length === 1) {
                        const w = parseFloat(value[0]);
                        if (!isNaN(w)) {
                            width = w;
                        }
                    }
                    break;
                case 'layer':
                    if (value.length === 1 && typeof value[0] === 'string') {
                        layer = value[0].replace(/"/g, '');
                    }
                    break;
                case 'net':
                    if (value.length === 1) {
                        const n = parseInt(value[0], 10);
                        if (!isNaN(n)) {
                            net = n;
                        }
                    }
                    break;
                case 'uuid':
                    if (value.length === 1 && typeof value[0] === 'string') {
                        uuid = value[0].replace(/"/g, '');
                    }
                    break;
            }
        }
    }
    if (start && end) {
        const result: KicadSegment = { start, end, width, layer, net, uuid };
        return result;
    }
    return null;
}

function findSegments(parsedData: any, depth = 0): KicadSegment[] {
    const segments: KicadSegment[] = [];
    if (Array.isArray(parsedData)) {
        for (let i = 0; i < parsedData.length; i++) {
            const item = parsedData[i];
            if (Array.isArray(item) && item.length > 0 && item[0] === 'segment') {
                const segment = parseSexprItem(item);
                if (segment) {
                    segments.push(segment);
                }
            } else if (Array.isArray(item)) {
                segments.push(...findSegments(item, depth + 1));
            }
        }
    }
    return segments;
}

function parseNetItem(item: any[]): KicadNet | null {
    if (!Array.isArray(item) || item[0] !== 'net') {
        return null;
    }
    if (item.length >= 3) {
        const number = parseInt(item[1], 10);
        const name = typeof item[2] === 'string' ? item[2].replace(/"/g, '') : '';
        if (!isNaN(number)) {
            return { number, name };
        }
    }
    return null;
}

function findNets(parsedData: any, depth = 0): KicadNet[] {
    const nets: KicadNet[] = [];
    if (Array.isArray(parsedData)) {
        for (let i = 0; i < parsedData.length; i++) {
            const item = parsedData[i];
            if (Array.isArray(item) && item.length > 0 && item[0] === 'net') {
                const net = parseNetItem(item);
                if (net) {
                    nets.push(net);
                }
            } else if (Array.isArray(item)) {
                nets.push(...findNets(item, depth + 1));
            }
        }
    }
    return nets;
}

function sanitizeNetNameForVariable(netName: string): string {
    // Convert net name to valid TypeScript variable name
    // Replace non-alphanumeric characters with underscores
    let sanitized = netName.replace(/[^a-zA-Z0-9_]/g, '_');
    // Remove leading/trailing underscores
    sanitized = sanitized.replace(/^_+|_+$/g, '');
    // If starts with number, prefix with underscore
    if (/^[0-9]/.test(sanitized)) {
        sanitized = '_' + sanitized;
    }
    return sanitized;
}

interface KicadComponentPlacement {
    reference: string;
    x: number;
    y: number;
    rotation: number;
    layer: string;
    variableName?: string;
}

function parseFootprintItem(item: any[]): KicadComponentPlacement | null {
    if (!Array.isArray(item) || item[0] !== 'footprint') {
        return null;
    }

    let reference: string | undefined;
    let x: number | undefined;
    let y: number | undefined;
    let rotation: number = 0;
    let layer: string | undefined;
    let variableName: string | undefined;

    for (let i = 1; i < item.length; i++) {
        const element = item[i];
        if (Array.isArray(element) && element.length > 0) {
            const key = element[0].toString().replace(/"/g, '');
            const values = element.slice(1);

            switch (key) {
                case 'layer':
                    if (typeof values[0] === 'string') {
                        layer = values[0].replace(/"/g, '');
                    }
                    break;
                case 'at':
                    if (values.length >= 2) {
                        x = parseFloat(values[0]);
                        y = parseFloat(values[1]);
                        if (values.length > 2) {
                            rotation = parseFloat(values[2]);
                        }
                        if (isNaN(x) || isNaN(y) || isNaN(rotation)) {
                            x = undefined; y = undefined; rotation = 0;
                        }
                    }
                    break;
                case 'property':
                    if (values.length > 1 && typeof values[0] === 'string') {
                        const propName = values[0].replace(/"/g, '');
                        if (propName === 'Reference') {
                            if (typeof values[1] === 'string') {
                                reference = values[1].replace(/"/g, '');
                            }
                        } else if (propName === 'Code') {
                            if (typeof values[1] === 'string') {
                                const codeStr = values[1];
                                const match = codeStr.match(/'variable':'([^']+)'/);
                                if (match && match[1]) {
                                    variableName = match[1];
                                }
                            }
                        }
                    }
                    break;
            }
        }
    }

    if (reference && x !== undefined && y !== undefined && layer) {
        return { reference, x, y, rotation, layer, variableName };
    }
    return null;
}

function findFootprints(parsedData: any, depth = 0): KicadComponentPlacement[] {
    const placements: KicadComponentPlacement[] = [];
    if (Array.isArray(parsedData)) {
        for (let i = 0; i < parsedData.length; i++) {
            const item = parsedData[i];
            if (Array.isArray(item) && item.length > 0 && item[0] === 'footprint') {
                const placement = parseFootprintItem(item);
                if (placement) {
                    placements.push(placement);
                }
            } else if (Array.isArray(item)) {
                placements.push(...findFootprints(item, depth + 1));
            }
        }
    }
    return placements;
}

interface KicadVia {
    at: { x: number; y: number };
    size: number;
    drill: number;
    layers?: string[];
    net?: number;
    uuid?: string;
}

interface KicadBoardOutline {
    type: 'rect' | 'line' | 'arc' | 'circle';
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    center?: { x: number; y: number };
    mid?: { x: number; y: number };
    width?: number;
    height?: number;
    layer: string;
    uuid?: string;
}

function parseViaItem(item: any[]): KicadVia | null {
    if (!Array.isArray(item) || item[0] !== 'via') {
        return null;
    }
    let at: { x: number; y: number } | undefined;
    let size: number | undefined;
    let drill: number | undefined;
    let layers: string[] | undefined;
    let net: number | undefined;
    let uuid: string | undefined;

    for (let i = 1; i < item.length; i++) {
        const element = item[i];
        if (Array.isArray(element) && element.length > 0) {
            const key = element[0].toString().replace(/"/g, '');
            const values = element.slice(1);
            switch (key) {
                case 'at':
                    if (values.length === 2) {
                        const x = parseFloat(values[0]);
                        const y = parseFloat(values[1]);
                        if (!isNaN(x) && !isNaN(y)) at = { x, y };
                    }
                    break;
                case 'size':
                    if (values.length === 1) {
                        const s = parseFloat(values[0]);
                        if (!isNaN(s)) size = s;
                    }
                    break;
                case 'drill':
                    if (values.length === 1) {
                        const d = parseFloat(values[0]);
                        if (!isNaN(d)) drill = d;
                    }
                    break;
                case 'layers':
                    if (Array.isArray(values) && values.every(v => typeof v === 'string')) {
                        layers = values.map(v => v.replace(/"/g, ''));
                    }
                    break;
                case 'net':
                    if (values.length === 1) {
                        const n = parseInt(values[0], 10);
                        if (!isNaN(n)) net = n;
                    }
                    break;
                case 'uuid':
                    if (values.length === 1 && typeof values[0] === 'string') {
                        uuid = values[0].replace(/"/g, '');
                    }
                    break;
            }
        }
    }

    if (at && size !== undefined && drill !== undefined) {
        return { at, size, drill, layers, net, uuid };
    }
    return null;
}

function findVias(parsedData: any, depth = 0): KicadVia[] {
    const vias: KicadVia[] = [];
    if (Array.isArray(parsedData)) {
        for (let i = 0; i < parsedData.length; i++) {
            const item = parsedData[i];
            if (Array.isArray(item) && item.length > 0 && item[0] === 'via') {
                const via = parseViaItem(item);
                if (via) {
                    vias.push(via);
                }
            } else if (Array.isArray(item)) {
                vias.push(...findVias(item, depth + 1));
            }
        }
    }
    return vias;
}

function parseOutlineItem(item: any[]): KicadBoardOutline | null {
    if (!Array.isArray(item) || item.length === 0) {
        return null;
    }

    const elementType = item[0].toString().replace(/"/g, '');
    if (!['gr_rect', 'gr_line', 'gr_arc', 'gr_circle'].includes(elementType)) {
        return null;
    }

    let start: { x: number; y: number } | undefined;
    let end: { x: number; y: number } | undefined;
    let center: { x: number; y: number } | undefined;
    let mid: { x: number; y: number } | undefined;
    let layer: string | undefined;
    let uuid: string | undefined;

    for (let i = 1; i < item.length; i++) {
        const element = item[i];
        if (Array.isArray(element) && element.length > 0) {
            const key = element[0].toString().replace(/"/g, '');
            const values = element.slice(1);

            switch (key) {
                case 'start':
                    if (values.length === 2) {
                        const x = parseFloat(values[0]);
                        const y = parseFloat(values[1]);
                        if (!isNaN(x) && !isNaN(y)) start = { x, y };
                    }
                    break;
                case 'end':
                    if (values.length === 2) {
                        const x = parseFloat(values[0]);
                        const y = parseFloat(values[1]);
                        if (!isNaN(x) && !isNaN(y)) end = { x, y };
                    }
                    break;
                case 'center':
                    if (values.length === 2) {
                        const x = parseFloat(values[0]);
                        const y = parseFloat(values[1]);
                        if (!isNaN(x) && !isNaN(y)) center = { x, y };
                    }
                    break;
                case 'mid':
                    if (values.length === 2) {
                        const x = parseFloat(values[0]);
                        const y = parseFloat(values[1]);
                        if (!isNaN(x) && !isNaN(y)) mid = { x, y };
                    }
                    break;
                case 'layer':
                    if (values.length === 1 && typeof values[0] === 'string') {
                        layer = values[0].replace(/"/g, '');
                    }
                    break;
                case 'uuid':
                    if (values.length === 1 && typeof values[0] === 'string') {
                        uuid = values[0].replace(/"/g, '');
                    }
                    break;
            }
        }
    }

    // Only process items on Edge.Cuts layer
    if (layer !== 'Edge.Cuts') {
        return null;
    }

    let type: 'rect' | 'line' | 'arc' | 'circle';
    switch (elementType) {
        case 'gr_rect':
            type = 'rect';
            if (start && end) {
                const width = Math.abs(end.x - start.x);
                const height = Math.abs(end.y - start.y);
                return { type, start, end, width, height, layer, uuid };
            }
            break;
        case 'gr_line':
            type = 'line';
            if (start && end) {
                return { type, start, end, layer, uuid };
            }
            break;
        case 'gr_arc':
            type = 'arc';
            if (start && end) {
                return { type, start, end, center, mid, layer, uuid };
            }
            break;
        case 'gr_circle':
            type = 'circle';
            if (center && end) {
                return { type, center, end, layer, uuid };
            }
            break;
    }

    return null;
}

function findBoardOutlines(parsedData: any, depth = 0): KicadBoardOutline[] {
    const outlines: KicadBoardOutline[] = [];
    if (Array.isArray(parsedData)) {
        for (let i = 0; i < parsedData.length; i++) {
            const item = parsedData[i];
            if (Array.isArray(item) && item.length > 0) {
                const elementType = item[0].toString().replace(/"/g, '');
                if (['gr_rect', 'gr_line', 'gr_arc', 'gr_circle'].includes(elementType)) {
                    const outline = parseOutlineItem(item);
                    if (outline) {
                        outlines.push(outline);
                    }
                } else {
                    outlines.push(...findBoardOutlines(item, depth + 1));
                }
            }
        }
    }
    return outlines;
}

// Legacy TypeScript-based name extraction removed.

// Legacy heuristic reference mapping removed.

async function kicadDataToTypeCAD(filePath: string) {
    let sExpressionText: string;
    const sourceDescription: string = `File: ${filePath}`;

    try {
        console.log(`Reading from ${sourceDescription}`);
        if (!fs.existsSync(filePath)) {
            console.error(`Error: File not found at ${filePath}`);
            return;
        }
        sExpressionText = fs.readFileSync(filePath, 'utf-8');

        if (!sExpressionText.trim()) {
            console.log(`${sourceDescription} is empty.`);
            return;
        }

        let rootElement;
        try {
            const wrappedText = `(${sExpressionText})`;
            const parsedArray = fsexp(wrappedText);
            if (Array.isArray(parsedArray) && parsedArray.length > 0) {
                rootElement = parsedArray.pop();
            } else {
                throw new Error("Parser did not return a valid array structure.");
            }
        } catch (error: any) {
            console.error(`Failed to parse S-expression from ${sourceDescription}: ${error.message}`);
            return;
        }

        if (!rootElement) {
            console.error(`Parsed data from ${sourceDescription} is empty or invalid (rootElement is null/undefined).`);
            return;
        }

        const pcb = new PCB("KicadImportFromFile");

        const chKey = chalk.cyan;
        const chProp = chalk.magenta;
        const chStr = chalk.green;
        const chNum = chalk.yellow;
        const chPunc = chalk.gray;
        const chVar = chalk.blueBright;

        const nets = findNets(rootElement);
        const segments = findSegments(rootElement);

        // Track which net variable names we created
        const trackVariableNames: string[] = [];

        if (segments.length > 0) {
            console.log(`Found ${segments.length} segments. Generating TrackBuilder chains organized by nets from ${sourceDescription}.`);

            // Create a map of net number to net name
            const netMap = new Map<number, string>();
            nets.forEach(net => {
                netMap.set(net.number, net.name);
            });

            // Group segments by net
            const segmentsByNet = new Map<number, KicadSegment[]>();
            segments.forEach(segment => {
                const netNum = segment.net ?? 0;
                if (!segmentsByNet.has(netNum)) {
                    segmentsByNet.set(netNum, []);
                }
                segmentsByNet.get(netNum)!.push(segment);
            });

            // Generate code organized by nets
            const allNetTrackLogs: string[] = [];

            segmentsByNet.forEach((netSegments, netNum) => {
                const netName = netMap.get(netNum) || '';

                // Determine if this is a named net or unnamed
                const isUnnamedNet = !netName || netName.startsWith('net') || netName === '';

                let variableName: string;
                if (isUnnamedNet) {
                    variableName = 'unnamed_Track';
                } else {
                    variableName = `track_${sanitizeNetNameForVariable(netName)}`;
                }

                // Track variable name for later use in typecad.create()
                if (!trackVariableNames.includes(variableName)) {
                    trackVariableNames.push(variableName);
                }

                // Add declaration comment
                if (isUnnamedNet) {
                    allNetTrackLogs.push(chalk.gray(`// Unnamed nets (net${netNum})`));
                } else {
                    allNetTrackLogs.push(chalk.gray(`// Net: ${netName}`));
                }
                allNetTrackLogs.push(`${chVar('let ' + variableName)}${chPunc(':')} ${chKey('TrackBuilder')}${chPunc('[]')} ${chPunc('=')} ${chPunc('[')}${chPunc(']')}${chPunc(';')}`);

                // Process segments for this net
                let currentTrackBuilder: TrackBuilder | null = null;
                let lastEndPoint: { x: number; y: number } | null = null;
                let currentChainLog: string = "";

                netSegments.forEach((segment) => {
                    if (!currentTrackBuilder || !lastEndPoint || lastEndPoint.x !== segment.start.x || lastEndPoint.y !== segment.start.y) {
                        // Start a new track chain
                        if (currentTrackBuilder && currentChainLog) {
                            allNetTrackLogs.push(currentChainLog + chPunc(')') + chPunc(';'));
                        }
                        currentTrackBuilder = pcb.track().from(segment.start, segment.layer, segment.width);
                        currentChainLog = `${chVar(variableName)}${chPunc('.')}${chKey('push')}${chPunc('(')}${chVar('typecad')}${chPunc('.')}${chKey('track')}${chPunc('()')}${chKey('.from')}${chPunc('(')}{ ${chProp('x')}${chPunc(':')} ${chNum(segment.start.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(segment.start.y)} }${chPunc(',')} ${chStr('"' + segment.layer + '"')}${chPunc(',')} ${chNum(segment.width)}${chPunc(')')}`;
                        currentTrackBuilder.to({ x: segment.end.x, y: segment.end.y, layer: segment.layer, width: segment.width });
                        currentChainLog += `${chKey('.to')}${chPunc('(')}{ ${chProp('x')}${chPunc(':')} ${chNum(segment.end.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(segment.end.y)}${chPunc(',')} ${chProp('layer')}${chPunc(':')} ${chStr('"' + segment.layer + '"')}${chPunc(',')} ${chProp('width')}${chPunc(':')} ${chNum(segment.width)} }${chPunc(')')}`;
                    } else {
                        // Continue existing track chain
                        currentTrackBuilder!.to({ x: segment.end.x, y: segment.end.y, layer: segment.layer, width: segment.width });
                        currentChainLog += `${chKey('.to')}${chPunc('(')}{ ${chProp('x')}${chPunc(':')} ${chNum(segment.end.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(segment.end.y)}${chPunc(',')} ${chProp('layer')}${chPunc(':')} ${chStr('"' + segment.layer + '"')}${chPunc(',')} ${chProp('width')}${chPunc(':')} ${chNum(segment.width)} }${chPunc(')')}`;
                    }
                    lastEndPoint = segment.end;
                });

                // Finish the last chain for this net
                if (currentChainLog) {
                    allNetTrackLogs.push(currentChainLog + chPunc(')') + chPunc(';'));
                }

                allNetTrackLogs.push(''); // Empty line between nets
            });

            if (allNetTrackLogs.length > 0) {
                console.log(chalk.bold(`\n--- Generated typeCAD TrackBuilder Code from ${sourceDescription} ---`));
                allNetTrackLogs.forEach(log => console.log(log));
                console.log(chalk.bold("---------------------------------------------------------"));
            }
        } else {
            console.log(`No segments found in ${sourceDescription} content.`);
        }

        const footprints = findFootprints(rootElement);
        if (footprints.length > 0) {
            console.log(`Found ${footprints.length} footprints. Generating placement code from ${sourceDescription}.`);
            
            const allPlacementLogs: string[] = [];
            footprints.forEach(fp => {
                // Prefer embedded variable name from footprint 'Code' property; fallback to KiCad reference
                const variableName = fp.variableName || fp.reference;
                let placementLog = `${chVar('this.' + variableName)}${chPunc('.')}${chProp('pcb')} ${chPunc('=')} ${chPunc('{')}`;
                placementLog += ` ${chProp('x')}${chPunc(':')} ${chNum(fp.x)}${chPunc(',')}`;
                placementLog += ` ${chProp('y')}${chPunc(':')} ${chNum(fp.y)}${chPunc(',')}`;
                placementLog += ` ${chProp('rotation')}${chPunc(':')} ${chNum(fp.rotation)}`;
                placementLog += ` ${chPunc('}')}${chPunc(';')}`;
                allPlacementLogs.push(placementLog);
            });

            if (allPlacementLogs.length > 0) {
                console.log(chalk.bold(`\n--- Generated Component Placement Code from ${sourceDescription} ---`));
                allPlacementLogs.forEach(log => console.log(log));
                console.log(chalk.bold("-------------------------------------------------------------"));
            }
        } else {
            console.log(`No footprints found in ${sourceDescription} content.`);
        }

        const vias = findVias(rootElement);
        if (vias.length > 0) {
            console.log(`Found ${vias.length} vias. Generating typeCAD code from ${sourceDescription}.`);
            const allViaLogs: string[] = [];
            vias.forEach((via, index) => {
                let viaLog = `${chVar('this.v' + (index + 1))} ${chPunc('=')} ${chVar('this.pcb')}${chPunc('.')}${chKey('via')}${chPunc('({')}`;
                viaLog += ` ${chProp('at')}${chPunc(': {')} ${chProp('x')}${chPunc(':')} ${chNum(via.at.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(via.at.y)} ${chPunc('}')}${chPunc(',')}`;
                viaLog += ` ${chProp('size')}${chPunc(':')} ${chNum(via.size)}${chPunc(',')}`;
                viaLog += ` ${chProp('drill')}${chPunc(':')} ${chNum(via.drill)}`;
                viaLog += ` ${chPunc('})')}${chPunc(';')}`;
                allViaLogs.push(viaLog);
            });

            if (allViaLogs.length > 0) {
                console.log(chalk.bold(`\n--- Generated typeCAD Via Code from ${sourceDescription} ---`));
                allViaLogs.forEach(log => console.log(log));
                console.log(chalk.bold("-----------------------------------------------------"));
            }
        } else {
            console.log(`No vias found in ${sourceDescription} content.`);
        }

        const outlines = findBoardOutlines(rootElement);
        if (outlines.length > 0) {
            console.log(`Found ${outlines.length} board outline element(s) on Edge.Cuts layer. Generating typeCAD code from ${sourceDescription}.`);
            const allOutlineLogs: string[] = [];

            // Try to detect if we have a simple rectangular board
            const rectOutlines = outlines.filter(o => o.type === 'rect');
            const lineOutlines = outlines.filter(o => o.type === 'line');

            if (rectOutlines.length === 1) {
                // Single rectangle - generate simple outline call
                const rect = rectOutlines[0];
                if (rect.start && rect.end && rect.width && rect.height) {
                    // Calculate position and dimensions
                    const x = Math.min(rect.start.x, rect.end.x);
                    const y = Math.min(rect.start.y, rect.end.y);
                    const width = rect.width;
                    const height = rect.height;

                    let outlineLog = `${chVar('typecad')}${chPunc('.')}${chKey('outline')}${chPunc('(')}`;
                    outlineLog += `${chNum(x)}${chPunc(',')} `;
                    outlineLog += `${chNum(y)}${chPunc(',')} `;
                    outlineLog += `${chNum(width)}${chPunc(',')} `;
                    outlineLog += `${chNum(height)}`;
                    outlineLog += `${chPunc(')')}${chPunc(';')}`;
                    allOutlineLogs.push(outlineLog);
                }
            } else if (lineOutlines.length === 4 || (lineOutlines.length + outlines.filter(o => o.type === 'arc').length >= 4)) {
                // Four lines forming a rectangle (or lines + arcs for rounded corners)
                const arcOutlines = outlines.filter(o => o.type === 'arc');

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

                // Calculate bounds from lines
                lineOutlines.forEach(line => {
                    if (line.start && line.end) {
                        minX = Math.min(minX, line.start.x, line.end.x);
                        minY = Math.min(minY, line.start.y, line.end.y);
                        maxX = Math.max(maxX, line.start.x, line.end.x);
                        maxY = Math.max(maxY, line.start.y, line.end.y);
                    }
                });

                // Include arc bounds
                arcOutlines.forEach(arc => {
                    if (arc.start && arc.end) {
                        minX = Math.min(minX, arc.start.x, arc.end.x);
                        minY = Math.min(minY, arc.start.y, arc.end.y);
                        maxX = Math.max(maxX, arc.start.x, arc.end.x);
                        maxY = Math.max(maxY, arc.start.y, arc.end.y);
                    }
                    if (arc.mid) {
                        minX = Math.min(minX, arc.mid.x);
                        minY = Math.min(minY, arc.mid.y);
                        maxX = Math.max(maxX, arc.mid.x);
                        maxY = Math.max(maxY, arc.mid.y);
                    }
                });

                if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
                    // Round to avoid floating point precision issues
                    const width = Math.round((maxX - minX) * 1000) / 1000;
                    const height = Math.round((maxY - minY) * 1000) / 1000;

                    // Detect corner fillet radius if arcs are present
                    let filletRadius: number | null = null;
                    if (arcOutlines.length === 4) {
                        // Calculate fillet radius from corner arcs using the proper formula
                        const radii = arcOutlines.map(arc => {
                            if (arc.start && arc.end && arc.mid) {
                                // Calculate radius from three points on the arc using the circumradius formula
                                const ax = arc.start.x;
                                const ay = arc.start.y;
                                const bx = arc.mid.x;
                                const by = arc.mid.y;
                                const cx = arc.end.x;
                                const cy = arc.end.y;

                                // Calculate side lengths
                                const a = Math.sqrt((bx - cx) * (bx - cx) + (by - cy) * (by - cy));
                                const b = Math.sqrt((ax - cx) * (ax - cx) + (ay - cy) * (ay - cy));
                                const c = Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

                                // Calculate area using cross product
                                const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;

                                // Radius = (a * b * c) / (4 * area)
                                if (area > 0) {
                                    const radius = (a * b * c) / (4 * area);
                                    return radius;
                                }
                            }
                            return 0;
                        }).filter(r => r > 0);

                        if (radii.length > 0) {
                            // Average the radii and round
                            const avgRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
                            filletRadius = Math.round(avgRadius * 1000) / 1000;
                        }
                    }

                    let outlineLog = `${chVar('typecad')}${chPunc('.')}${chKey('outline')}${chPunc('(')}`;
                    outlineLog += `${chNum(minX)}${chPunc(',')} `;
                    outlineLog += `${chNum(minY)}${chPunc(',')} `;
                    outlineLog += `${chNum(width)}${chPunc(',')} `;
                    outlineLog += `${chNum(height)}`;

                    if (filletRadius !== null && filletRadius > 0) {
                        outlineLog += `${chPunc(',')} ${chNum(filletRadius)}`;
                    }

                    outlineLog += `${chPunc(')')}${chPunc(';')}`;
                    allOutlineLogs.push(outlineLog);
                }
            } else {
                // Complex outline or multiple elements - document what was found
                outlines.forEach((outline, index) => {
                    let comment = `${chalk.gray('// Board outline element ' + (index + 1) + ': ')}`;
                    switch (outline.type) {
                        case 'rect':
                            if (outline.start && outline.end) {
                                comment += chalk.gray(`Rectangle from (${outline.start.x}, ${outline.start.y}) to (${outline.end.x}, ${outline.end.y})`);
                            }
                            break;
                        case 'line':
                            if (outline.start && outline.end) {
                                comment += chalk.gray(`Line from (${outline.start.x}, ${outline.start.y}) to (${outline.end.x}, ${outline.end.y})`);
                            }
                            break;
                        case 'arc':
                            if (outline.start && outline.end) {
                                comment += chalk.gray(`Arc from (${outline.start.x}, ${outline.start.y}) to (${outline.end.x}, ${outline.end.y})`);
                            }
                            break;
                        case 'circle':
                            if (outline.center && outline.end) {
                                const radius = Math.sqrt(
                                    Math.pow(outline.end.x - outline.center.x, 2) +
                                    Math.pow(outline.end.y - outline.center.y, 2)
                                );
                                comment += chalk.gray(`Circle at (${outline.center.x}, ${outline.center.y}) with radius ${radius.toFixed(3)}`);
                            }
                            break;
                    }
                    allOutlineLogs.push(comment);
                });
                allOutlineLogs.push(chalk.yellow('// Note: Complex board outlines with multiple elements or curves may need manual conversion to TypeCAD'));
            }

            if (allOutlineLogs.length > 0) {
                console.log(chalk.bold(`\n--- Generated typeCAD Board Outline Code from ${sourceDescription} ---`));
                allOutlineLogs.forEach(log => console.log(log));
                console.log(chalk.bold("---------------------------------------------------------------"));
            }
        } else {
            console.log(`No board outline found in ${sourceDescription} content (looking for Edge.Cuts layer).`);
        }

        // Generate typecad.create() statement
        const componentReferences: string[] = [];
        footprints.forEach(fp => {
            const variableName = fp.variableName || fp.reference;
            componentReferences.push(variableName);
        });

        if (componentReferences.length > 0 || trackVariableNames.length > 0) {
            console.log(chalk.bold(`\n--- Generated typecad.create() Statement from ${sourceDescription} ---`));

            let createStatement = `${chVar('typecad')}${chPunc('.')}${chKey('create')}${chPunc('(')}`;

            const allItems: string[] = [];

            // Add components
            componentReferences.forEach(ref => {
                allItems.push(`${chVar(ref)}`);
            });

            // Add track arrays with spread operator
            trackVariableNames.forEach(trackVar => {
                allItems.push(`${chPunc('...')}${chVar(trackVar)}`);
            });

            // Format the items with proper indentation
            if (allItems.length > 0) {
                createStatement += '\n';
                allItems.forEach((item, index) => {
                    createStatement += `    ${item}`;
                    if (index < allItems.length - 1) {
                        createStatement += `${chPunc(',')}\n`;
                    } else {
                        createStatement += '\n';
                    }
                });
            }

            createStatement += `${chPunc(')')}${chPunc(';')}`;

            console.log(createStatement);
            console.log(chalk.bold("--------------------------------------------------------------"));
        }

    } catch (error: any) {
        console.error(`Error processing data from ${sourceDescription}: ${error.message}`);
    }
}

const args = process.argv.slice(2);
const filePathArg = args[0];
// No optional TypeScript file arg needed anymore

if (filePathArg && filePathArg.trim() !== "") {
    kicadDataToTypeCAD(filePathArg);
} else {
    console.log("No KiCad file path provided. Please provide a file path as a command line argument.");
    console.log("Usage: npx tsx ./index.ts <path_to_kicad_pcb_file>");
    console.log("");
    console.log("Notes:");
    console.log("- Variable names are sourced from each footprint's 'Code' property.");
    console.log("- If missing, the KiCad reference is used (e.g., U1, R3).");
}


