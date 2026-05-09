import { PCB } from '../pcb/pcb.js';
import { TrackBuilder } from '../pcb/pcb_track_builder.js';
import { parseSExpr } from '../utils/sexpr_parse.js';
import { findNodes } from '../utils/sexpr_walk.js';
import logger from '../../logging.js';
import fs from 'node:fs';
import chalk from 'chalk';

interface KicadSegment {
    start: { x: number; y: number };
    end: { x: number; y: number };
    width: number;
    layer: string;
    net?: number;
}

interface KicadNet {
    number: number;
    name: string;
}

function parseSexprItem(item: unknown[]): KicadSegment | null {
    if (!Array.isArray(item) || item[0] !== 'segment') {
        return null;
    }
    let start: { x: number; y: number } | undefined;
    let end: { x: number; y: number } | undefined;
    let width: number = 0.2;
    let layer: string = "F.Cu";
    let net: number | undefined;
    for (let i = 1; i < item.length; i++) {
        const element = item[i];
        if (Array.isArray(element) && element.length > 0) {
            const key = element[0];
            const value = element.slice(1);
            switch (key) {
                case 'start':
                    if (value.length === 2) {
                        const x = parseFloat(value[0] as string);
                        const y = parseFloat(value[1] as string);
                        if (!isNaN(x) && !isNaN(y)) {
                            start = { x, y };
                        }
                    }
                    break;
                case 'end':
                    if (value.length === 2) {
                        const x = parseFloat(value[0] as string);
                        const y = parseFloat(value[1] as string);
                        if (!isNaN(x) && !isNaN(y)) {
                            end = { x, y };
                        }
                    }
                    break;
                case 'width':
                    if (value.length === 1) {
                        const w = parseFloat(value[0] as string);
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
                        const n = parseInt(value[0] as string, 10);
                        if (!isNaN(n)) {
                            net = n;
                        }
                    }
                    break;
            }
        }
    }
    if (start && end) {
        return { start, end, width, layer, net };
    }
    return null;
}

function parseNetItem(item: unknown[]): KicadNet | null {
    if (!Array.isArray(item) || item[0] !== 'net') {
        return null;
    }
    if (item.length >= 3) {
        const number = parseInt(item[1] as string, 10);
        const name = typeof item[2] === 'string' ? item[2].replace(/"/g, '') : '';
        if (!isNaN(number)) {
            return { number, name };
        }
    }
    return null;
}

function sanitizeNetNameForVariable(netName: string): string {
    let sanitized = netName.replace(/[^a-zA-Z0-9_]/g, '_');
    sanitized = sanitized.replace(/^_+|_+$/g, '');
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
    variableName?: string;
}

function parseFootprintItem(item: unknown[]): KicadComponentPlacement | null {
    if (!Array.isArray(item) || item[0] !== 'footprint') {
        return null;
    }

    let reference: string | undefined;
    let x: number | undefined;
    let y: number | undefined;
    let rotation: number = 0;

    for (let i = 1; i < item.length; i++) {
        const element = item[i];
        if (Array.isArray(element) && element.length > 0) {
            const key = element[0].toString().replace(/"/g, '');
            const values = element.slice(1);

            switch (key) {
                case 'at':
                    if (values.length >= 2) {
                        x = parseFloat(values[0] as string);
                        y = parseFloat(values[1] as string);
                        if (values.length > 2) {
                            rotation = parseFloat(values[2] as string);
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
                                    return null; // variableName handled below
                                }
                            }
                        }
                    }
                    break;
            }
        }
    }

    // Second pass to get variableName
    let variableName: string | undefined;
    for (let i = 1; i < item.length; i++) {
        const element = item[i];
        if (Array.isArray(element) && element.length > 0) {
            const key = element[0].toString().replace(/"/g, '');
            const values = element.slice(1);
            if (key === 'property' && values.length > 1 && typeof values[0] === 'string') {
                const propName = values[0].replace(/"/g, '');
                if (propName === 'Code' && typeof values[1] === 'string') {
                    const match = (values[1] as string).match(/'variable':'([^']+)'/);
                    if (match && match[1]) {
                        variableName = match[1];
                    }
                }
            }
        }
    }

    if (reference && x !== undefined && y !== undefined) {
        return { reference, x, y, rotation, variableName };
    }
    return null;
}

interface KicadVia {
    at: { x: number; y: number };
    size: number;
    drill: number;
}

function parseViaItem(item: unknown[]): KicadVia | null {
    if (!Array.isArray(item) || item[0] !== 'via') {
        return null;
    }
    let at: { x: number; y: number } | undefined;
    let size: number | undefined;
    let drill: number | undefined;

    for (let i = 1; i < item.length; i++) {
        const element = item[i];
        if (Array.isArray(element) && element.length > 0) {
            const key = element[0].toString().replace(/"/g, '');
            const values = element.slice(1);
            switch (key) {
                case 'at':
                    if (values.length === 2) {
                        const x = parseFloat(values[0] as string);
                        const y = parseFloat(values[1] as string);
                        if (!isNaN(x) && !isNaN(y)) at = { x, y };
                    }
                    break;
                case 'size':
                    if (values.length === 1) {
                        const s = parseFloat(values[0] as string);
                        if (!isNaN(s)) size = s;
                    }
                    break;
                case 'drill':
                    if (values.length === 1) {
                        const d = parseFloat(values[0] as string);
                        if (!isNaN(d)) drill = d;
                    }
                    break;
            }
        }
    }

    if (at && size !== undefined && drill !== undefined) {
        return { at, size, drill };
    }
    return null;
}

interface KicadBoardOutline {
    type: 'rect' | 'line' | 'arc' | 'circle';
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    center?: { x: number; y: number };
    mid?: { x: number; y: number };
    width?: number;
    height?: number;
}

function parseOutlineItem(item: unknown[]): KicadBoardOutline | null {
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

    for (let i = 1; i < item.length; i++) {
        const element = item[i];
        if (Array.isArray(element) && element.length > 0) {
            const key = element[0].toString().replace(/"/g, '');
            const values = element.slice(1);

            switch (key) {
                case 'start':
                    if (values.length === 2) {
                        const x = parseFloat(values[0] as string);
                        const y = parseFloat(values[1] as string);
                        if (!isNaN(x) && !isNaN(y)) start = { x, y };
                    }
                    break;
                case 'end':
                    if (values.length === 2) {
                        const x = parseFloat(values[0] as string);
                        const y = parseFloat(values[1] as string);
                        if (!isNaN(x) && !isNaN(y)) end = { x, y };
                    }
                    break;
                case 'center':
                    if (values.length === 2) {
                        const x = parseFloat(values[0] as string);
                        const y = parseFloat(values[1] as string);
                        if (!isNaN(x) && !isNaN(y)) center = { x, y };
                    }
                    break;
                case 'mid':
                    if (values.length === 2) {
                        const x = parseFloat(values[0] as string);
                        const y = parseFloat(values[1] as string);
                        if (!isNaN(x) && !isNaN(y)) mid = { x, y };
                    }
                    break;
                case 'layer':
                    if (values.length === 1 && typeof values[0] === 'string') {
                        layer = values[0].replace(/"/g, '');
                    }
                    break;
            }
        }
    }

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
                return { type, start, end, width, height };
            }
            break;
        case 'gr_line':
            type = 'line';
            if (start && end) {
                return { type, start, end };
            }
            break;
        case 'gr_arc':
            type = 'arc';
            if (start && end) {
                return { type, start, end, center, mid };
            }
            break;
        case 'gr_circle':
            type = 'circle';
            if (center && end) {
                return { type, center, end };
            }
            break;
    }

    return null;
}

export async function kicadDataToTypeCAD(filePath: string) {
    let sExpressionText: string;
    const sourceDescription: string = `File: ${filePath}`;

    try {
        logger.info(`Reading from ${sourceDescription}`);
        if (!fs.existsSync(filePath)) {
            logger.error(`Error: File not found at ${filePath}`);
            return;
        }
        sExpressionText = fs.readFileSync(filePath, 'utf-8');

        if (!sExpressionText.trim()) {
            logger.info(`${sourceDescription} is empty.`);
            return;
        }

        let rootElement: unknown;
        try {
            rootElement = parseSExpr(sExpressionText);
        } catch (error: unknown) {
            logger.error(`Failed to parse S-expression from ${sourceDescription}: ${(error as Error).message}`);
            return;
        }

        if (!rootElement) {
            logger.error(`Parsed data from ${sourceDescription} is empty or invalid.`);
            return;
        }

        const pcb = new PCB("KicadImportFromFile");

        const chKey = chalk.cyan;
        const chProp = chalk.magenta;
        const chStr = chalk.green;
        const chNum = chalk.yellow;
        const chPunc = chalk.gray;
        const chVar = chalk.blueBright;

        const nets = findNodes(rootElement, 'net')
            .map(item => parseNetItem(item as unknown[]))
            .filter((n): n is KicadNet => n !== null);

        const segments = findNodes(rootElement, 'segment')
            .map(item => parseSexprItem(item as unknown[]))
            .filter((s): s is KicadSegment => s !== null);

        const trackVariableNames: string[] = [];

        if (segments.length > 0) {
            console.log(`Found ${segments.length} segments. Generating TrackBuilder chains organized by nets from ${sourceDescription}.`);

            const netMap = new Map<number, string>();
            nets.forEach(net => {
                netMap.set(net.number, net.name);
            });

            const segmentsByNet = new Map<number, KicadSegment[]>();
            segments.forEach(segment => {
                const netNum = segment.net ?? 0;
                if (!segmentsByNet.has(netNum)) {
                    segmentsByNet.set(netNum, []);
                }
                segmentsByNet.get(netNum)!.push(segment);
            });

            const allNetTrackLogs: string[] = [];

            segmentsByNet.forEach((netSegments, netNum) => {
                const netName = netMap.get(netNum) || '';

                const isUnnamedNet = !netName || netName.startsWith('net') || netName === '';

                let variableName: string;
                if (isUnnamedNet) {
                    variableName = 'unnamed_Track';
                } else {
                    variableName = `track_${sanitizeNetNameForVariable(netName)}`;
                }

                if (!trackVariableNames.includes(variableName)) {
                    trackVariableNames.push(variableName);
                }

                if (isUnnamedNet) {
                    allNetTrackLogs.push(chalk.gray(`// Unnamed nets (net${netNum})`));
                } else {
                    allNetTrackLogs.push(chalk.gray(`// Net: ${netName}`));
                }
                allNetTrackLogs.push(`${chVar('let ' + variableName)}${chPunc(':')} ${chKey('TrackBuilder')}${chPunc('[]')} ${chPunc('=')} ${chPunc('[')}${chPunc(']')}${chPunc(';')}`);

                let currentTrackBuilder: TrackBuilder | null = null;
                let lastEndPoint: { x: number; y: number } | null = null;
                let currentChainLog: string = "";

                netSegments.forEach((segment) => {
                    if (!currentTrackBuilder || !lastEndPoint || lastEndPoint.x !== segment.start.x || lastEndPoint.y !== segment.start.y) {
                        if (currentTrackBuilder && currentChainLog) {
                            allNetTrackLogs.push(currentChainLog + chPunc(')') + chPunc(';'));
                        }
                        currentTrackBuilder = pcb.track().from(segment.start, segment.layer, segment.width);
                        currentChainLog = `${chVar(variableName)}${chPunc('.')}${chKey('push')}${chPunc('(')}${chVar('typecad')}${chPunc('.')}${chKey('track')}${chPunc('()')}${chKey('.from')}${chPunc('(')}{ ${chProp('x')}${chPunc(':')} ${chNum(segment.start.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(segment.start.y)} }${chPunc(',')} ${chStr('"' + segment.layer + '"')}${chPunc(',')} ${chNum(segment.width)}${chPunc(')')}`;
                        currentTrackBuilder.to({ x: segment.end.x, y: segment.end.y, layer: segment.layer, width: segment.width });
                        currentChainLog += `${chKey('.to')}${chPunc('(')}{ ${chProp('x')}${chPunc(':')} ${chNum(segment.end.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(segment.end.y)}${chPunc(',')} ${chProp('layer')}${chPunc(':')} ${chStr('"' + segment.layer + '"')}${chPunc(',')} ${chProp('width')}${chPunc(':')} ${chNum(segment.width)} }${chPunc(')')}`;
                    } else {
                        currentTrackBuilder!.to({ x: segment.end.x, y: segment.end.y, layer: segment.layer, width: segment.width });
                        currentChainLog += `${chKey('.to')}${chPunc('(')}{ ${chProp('x')}${chPunc(':')} ${chNum(segment.end.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(segment.end.y)}${chPunc(',')} ${chProp('layer')}${chPunc(':')} ${chStr('"' + segment.layer + '"')}${chPunc(',')} ${chProp('width')}${chPunc(':')} ${chNum(segment.width)} }${chPunc(')')}`;
                    }
                    lastEndPoint = segment.end;
                });

                if (currentChainLog) {
                    allNetTrackLogs.push(currentChainLog + chPunc(')') + chPunc(';'));
                }

                allNetTrackLogs.push('');
            });

            if (allNetTrackLogs.length > 0) {
                console.log(chalk.bold(`\n--- Generated typeCAD TrackBuilder Code from ${sourceDescription} ---`));
                allNetTrackLogs.forEach(log => console.log(log));
                console.log(chalk.bold("---------------------------------------------------------"));
            }
        } else {
            console.log(`No segments found in ${sourceDescription} content.`);
        }

        const footprints = findNodes(rootElement, 'footprint')
            .map(item => parseFootprintItem(item as unknown[]))
            .filter((fp): fp is KicadComponentPlacement => fp !== null);

        if (footprints.length > 0) {
            console.log(`Found ${footprints.length} footprints. Generating placement code from ${sourceDescription}.`);

            const allPlacementLogs: string[] = [];
            footprints.forEach(fp => {
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

        const vias = findNodes(rootElement, 'via')
            .map(item => parseViaItem(item as unknown[]))
            .filter((v): v is KicadVia => v !== null);

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

        const outlines = findNodes(rootElement, ['gr_rect', 'gr_line', 'gr_arc', 'gr_circle'])
            .map(item => parseOutlineItem(item as unknown[]))
            .filter((o): o is KicadBoardOutline => o !== null);

        if (outlines.length > 0) {
            console.log(`Found ${outlines.length} board outline element(s) on Edge.Cuts layer. Generating typeCAD code from ${sourceDescription}.`);
            const allOutlineLogs: string[] = [];

            const rectOutlines = outlines.filter(o => o.type === 'rect');
            const lineOutlines = outlines.filter(o => o.type === 'line');

            if (rectOutlines.length === 1) {
                const rect = rectOutlines[0];
                if (rect.start && rect.end && rect.width && rect.height) {
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
                const arcOutlines = outlines.filter(o => o.type === 'arc');

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

                lineOutlines.forEach(line => {
                    if (line.start && line.end) {
                        minX = Math.min(minX, line.start.x, line.end.x);
                        minY = Math.min(minY, line.start.y, line.end.y);
                        maxX = Math.max(maxX, line.start.x, line.end.x);
                        maxY = Math.max(maxY, line.start.y, line.end.y);
                    }
                });

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
                    const width = Math.round((maxX - minX) * 1000) / 1000;
                    const height = Math.round((maxY - minY) * 1000) / 1000;

                    let filletRadius: number | null = null;
                    if (arcOutlines.length === 4) {
                        const radii = arcOutlines.map(arc => {
                            if (arc.start && arc.end && arc.mid) {
                                const ax = arc.start.x;
                                const ay = arc.start.y;
                                const bx = arc.mid.x;
                                const by = arc.mid.y;
                                const cx = arc.end.x;
                                const cy = arc.end.y;

                                const a = Math.sqrt((bx - cx) * (bx - cx) + (by - cy) * (by - cy));
                                const b = Math.sqrt((ax - cx) * (ax - cx) + (ay - cy) * (ay - cy));
                                const c = Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

                                const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;

                                if (area > 0) {
                                    const radius = (a * b * c) / (4 * area);
                                    return radius;
                                }
                            }
                            return 0;
                        }).filter(r => r > 0);

                        if (radii.length > 0) {
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

        const componentReferences: string[] = [];
        footprints.forEach(fp => {
            const variableName = fp.variableName || fp.reference;
            componentReferences.push(variableName);
        });

        if (componentReferences.length > 0 || trackVariableNames.length > 0) {
            console.log(chalk.bold(`\n--- Generated typecad.create() Statement from ${sourceDescription} ---`));

            let createStatement = `${chVar('typecad')}${chPunc('.')}${chKey('create')}${chPunc('(')}`;

            const allItems: string[] = [];

            componentReferences.forEach(ref => {
                allItems.push(`${chVar(ref)}`);
            });

            trackVariableNames.forEach(trackVar => {
                allItems.push(`${chPunc('...')}${chVar(trackVar)}`);
            });

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

    } catch (error: unknown) {
        logger.error(`Error processing data from ${sourceDescription}: ${(error as Error).message}`);
    }
}
