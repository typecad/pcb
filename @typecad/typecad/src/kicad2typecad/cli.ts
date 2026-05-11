import { PCB } from '../pcb/pcb.js';
import { TrackBuilder } from '../pcb/pcb_track_builder.js';
import { parseSExpr } from '../utils/sexpr_parse.js';
import { findNodes } from '../utils/sexpr_walk.js';
import logger from '../../logging.js';
import fs from 'node:fs';
import chalk from 'chalk';
import { checkbox } from '@inquirer/prompts';

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
                        layer = value[0].replace(/["`]/g, '');
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
        const name = typeof item[2] === 'string' ? item[2].replace(/["`]/g, '') : '';
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

interface ReferencePropertyInfo {
    x: number;
    y: number;
    rotation: number;
    layer: string;
    width: number;
    height: number;
    thickness: number;
}

interface KicadComponentPlacement {
    reference: string;
    x: number;
    y: number;
    rotation: number;
    side?: 'front' | 'back';
    variableName?: string;
    filePath?: string;
    isThis?: boolean;
    sourceLine?: number;
    footprintName?: string;
    referenceProperty?: ReferencePropertyInfo;
    fabTextProperty?: ReferencePropertyInfo;
}

function parseFootprintItem(item: unknown[]): KicadComponentPlacement | null {
    if (!Array.isArray(item) || item[0] !== 'footprint') {
        return null;
    }

    let reference: string | undefined;
    let x: number | undefined;
    let y: number | undefined;
    let rotation: number = 0;
    let layer: string | undefined;
    let footprintName: string | undefined;
    let referenceProperty: ReferencePropertyInfo | undefined;
    let fabTextProperty: ReferencePropertyInfo | undefined;

    // Extract footprint name from (footprint "Name" ...)
    if (item.length > 1 && typeof item[1] === 'string') {
        footprintName = item[1].replace(/["`]/g, '');
    }

    for (let i = 1; i < item.length; i++) {
        const element = item[i];
        if (Array.isArray(element) && element.length > 0) {
            const key = element[0].toString().replace(/["`]/g, '');
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
                case 'layer':
                    if (values.length >= 1 && typeof values[0] === 'string') {
                        layer = values[0].replace(/["`]/g, '');
                    }
                    break;
                case 'property':
                    if (values.length > 1 && typeof values[0] === 'string') {
                        const propName = values[0].replace(/["`]/g, '');
                        if (propName === 'Reference') {
                            if (typeof values[1] === 'string') {
                                reference = values[1].replace(/["`]/g, '');
                            }
                            // Extract Reference property positioning
                            let refX: number | undefined;
                            let refY: number | undefined;
                            let refRotation: number = 0;
                            let refLayer: string = 'F.SilkS';
                            let refWidth: number = 1;
                            let refHeight: number = 1;
                            let refThickness: number = 0.15;

                            for (let vi = 2; vi < values.length; vi++) {
                                const sub = values[vi];
                                if (Array.isArray(sub) && sub.length > 0) {
                                    const subKey = typeof sub[0] === 'string' ? sub[0].replace(/["`]/g, '') : '';
                                    if (subKey === 'at') {
                                        if (sub.length >= 3) {
                                            refX = parseFloat(sub[1] as string);
                                            refY = parseFloat(sub[2] as string);
                                            if (sub.length > 3) refRotation = parseFloat(sub[3] as string);
                                        }
                                    } else if (subKey === 'layer') {
                                        if (sub.length >= 2 && typeof sub[1] === 'string') {
                                            refLayer = sub[1].replace(/["`]/g, '');
                                        }
                                    } else if (subKey === 'effects') {
                                        for (const eff of sub.slice(1)) {
                                            if (Array.isArray(eff) && typeof eff[0] === 'string' && eff[0].replace(/["`]/g, '') === 'font') {
                                                for (const fontChild of eff.slice(1)) {
                                                    if (Array.isArray(fontChild)) {
                                                        const fk = typeof fontChild[0] === 'string' ? fontChild[0].replace(/["`]/g, '') : '';
                                                        if (fk === 'size' && fontChild.length >= 3) {
                                                            refHeight = parseFloat(fontChild[1] as string);
                                                            refWidth = parseFloat(fontChild[2] as string);
                                                        } else if (fk === 'thickness' && fontChild.length >= 2) {
                                                            refThickness = parseFloat(fontChild[1] as string);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            if (refX !== undefined && refY !== undefined) {
                                referenceProperty = { x: refX, y: refY, rotation: refRotation, layer: refLayer, width: refWidth, height: refHeight, thickness: refThickness };
                            }
                        } else if (propName === 'Code') {
                            if (typeof values[1] === 'string') {
                                const codeStr = values[1];
                                const match = codeStr.match(/'variable':'([^']+)'/);
                                if (match && match[1]) {
                                    // variableName handled below in second pass
                                    break;
                                }
                            }
                        }
                    }
                    break;
                case 'fp_text':
                    if (values.length > 1 && typeof values[0] === 'string' && values[0] === 'user') {
                        const textContent = typeof values[1] === 'string' ? values[1].replace(/["`]/g, '') : '';
                        if (textContent === '${REFERENCE}') {
                            let fabX: number | undefined;
                            let fabY: number | undefined;
                            let fabRotation: number = 0;
                            let fabWidth: number = 1;
                            let fabHeight: number = 1;
                            let fabThickness: number = 0.15;

                            for (let vi = 2; vi < values.length; vi++) {
                                const sub = values[vi];
                                if (Array.isArray(sub) && sub.length > 0) {
                                    const subKey = typeof sub[0] === 'string' ? sub[0].replace(/["`]/g, '') : '';
                                    if (subKey === 'at') {
                                        if (sub.length >= 3) {
                                            fabX = parseFloat(sub[1] as string);
                                            fabY = parseFloat(sub[2] as string);
                                            if (sub.length > 3) fabRotation = parseFloat(sub[3] as string);
                                        }
                                    } else if (subKey === 'effects') {
                                        for (const eff of sub.slice(1)) {
                                            if (Array.isArray(eff) && typeof eff[0] === 'string' && eff[0].replace(/["`]/g, '') === 'font') {
                                                for (const fontChild of eff.slice(1)) {
                                                    if (Array.isArray(fontChild)) {
                                                        const fk = typeof fontChild[0] === 'string' ? fontChild[0].replace(/["`]/g, '') : '';
                                                        if (fk === 'size' && fontChild.length >= 3) {
                                                            fabHeight = parseFloat(fontChild[1] as string);
                                                            fabWidth = parseFloat(fontChild[2] as string);
                                                        } else if (fk === 'thickness' && fontChild.length >= 2) {
                                                            fabThickness = parseFloat(fontChild[1] as string);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            if (fabX !== undefined && fabY !== undefined) {
                                fabTextProperty = { x: fabX, y: fabY, rotation: fabRotation, layer: 'F.Fab', width: fabWidth, height: fabHeight, thickness: fabThickness };
                            }
                        }
                    }
                    break;
            }
        }
    }

    // Second pass to get variableName and other source info
    let variableName: string | undefined;
    let filePath: string | undefined;
    let isThis: boolean | undefined;
    let sourceLine: number | undefined;
    for (let i = 1; i < item.length; i++) {
        const element = item[i];
        if (Array.isArray(element) && element.length > 0) {
            const key = element[0].toString().replace(/"/g, '');
            const values = element.slice(1);
            if (key === 'property' && values.length > 1 && typeof values[0] === 'string') {
                const propName = values[0].replace(/["`]/g, '');
                if (propName === 'Code' && typeof values[1] === 'string') {
                    const codeStr = values[1] as string;
                    const varMatch = codeStr.match(/'variable':'([^']+)'/);
                    const fileMatch = codeStr.match(/'file':'([^']+)'/);
                    const isThisMatch = codeStr.match(/'isThis':(true|false)/);
                    const lineMatch = codeStr.match(/'line':(\d+)/);

                    if (varMatch && varMatch[1]) {
                        variableName = varMatch[1];
                    }
                    if (fileMatch && fileMatch[1]) {
                        filePath = fileMatch[1];
                    }
                    if (isThisMatch && isThisMatch[1]) {
                        isThis = isThisMatch[1] === 'true';
                    }
                    if (lineMatch && lineMatch[1]) {
                        sourceLine = parseInt(lineMatch[1], 10);
                    }
                }
            }
        }
    }

    if (reference && x !== undefined && y !== undefined) {
        const side: 'front' | 'back' | undefined = layer?.startsWith('B.') ? 'back' : layer?.startsWith('F.') ? 'front' : undefined;
        return { reference, x, y, rotation, side, variableName, filePath, isThis, sourceLine, footprintName, referenceProperty, fabTextProperty };
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
            const key = element[0].toString().replace(/["`]/g, '');
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

    const elementType = item[0].toString().replace(/["`]/g, '');
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
            const key = element[0].toString().replace(/["`]/g, '');
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
                        layer = values[0].replace(/["`]/g, '');
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

interface KicadTextElement {
    text: string;
    x: number;
    y: number;
    rotation: number;
    layer: string;
    fontSize?: [number, number];
    fontFace?: string;
    thickness?: number;
    bold?: boolean;
    italic?: boolean;
    justify?: {
        horizontal?: 'left' | 'right' | 'center';
        vertical?: 'top' | 'bottom' | 'middle';
        mirror?: boolean;
    };
    hide?: boolean;
}

function parseGrTextItem(item: unknown[]): KicadTextElement | null {
    if (!Array.isArray(item) || item[0] !== 'gr_text') {
        return null;
    }

    // Text content may be split across multiple string elements (spaces in quoted strings)
    // Collect all consecutive string elements after 'gr_text' until we hit an array
    const textParts: string[] = [];
    for (let i = 1; i < item.length; i++) {
        if (typeof item[i] === 'string') {
            textParts.push((item[i] as string).replace(/["`]/g, ''));
        } else {
            break;
        }
    }
    const text = textParts.join(' ');
    if (!text) return null;

    let x: number | undefined;
    let y: number | undefined;
    let rotation: number = 0;
    let layer: string = 'F.SilkS';
    let fontSize: [number, number] | undefined;
    let fontFace: string | undefined;
    let thickness: number | undefined;
    let bold: boolean = false;
    let italic: boolean = false;
    let justify: { horizontal?: 'left' | 'right' | 'center'; vertical?: 'top' | 'bottom' | 'middle'; mirror?: boolean } | undefined;
    let hide: boolean = false;

    for (let i = 2; i < item.length; i++) {
        const element = item[i];
        if (Array.isArray(element) && element.length > 0) {
            const key = element[0].toString().replace(/["`]/g, '');
            const values = element.slice(1);

            switch (key) {
                case 'at':
                    if (values.length >= 2) {
                        x = parseFloat(values[0] as string);
                        y = parseFloat(values[1] as string);
                        if (values.length > 2) {
                            rotation = parseFloat(values[2] as string);
                        }
                        if (isNaN(x) || isNaN(y)) { x = undefined; y = undefined; }
                        if (isNaN(rotation)) rotation = 0;
                    }
                    break;
                case 'layer':
                    if (values.length >= 1 && typeof values[0] === 'string') {
                        layer = values[0].replace(/["`]/g, '');
                    }
                    break;
                case 'effects': {
                    for (const sub of values) {
                        if (Array.isArray(sub)) {
                            const subKey = typeof sub[0] === 'string' ? sub[0].replace(/["`]/g, '') : '';
                            if (subKey === 'font') {
                                for (const fontChild of sub.slice(1)) {
                                    if (Array.isArray(fontChild)) {
                                        const fk = fontChild[0].toString().replace(/["`]/g, '');
                                        if (fk === 'size' && fontChild.length >= 3) {
                                            const h = parseFloat(fontChild[1] as string);
                                            const w = parseFloat(fontChild[2] as string);
                                            if (!isNaN(h) && !isNaN(w)) fontSize = [h, w];
                                        } else if (fk === 'face' && fontChild.length >= 2) {
                                            // Join all string tokens after 'face' (spaces may split the font name)
                                            const faceParts: string[] = [];
                                            for (let fi = 1; fi < fontChild.length; fi++) {
                                                if (typeof fontChild[fi] === 'string') {
                                                    faceParts.push((fontChild[fi] as string).replace(/["`]/g, ''));
                                                }
                                            }
                                            fontFace = faceParts.join(' ');
                                        } else if (fk === 'thickness' && fontChild.length >= 2) {
                                            const t = parseFloat(fontChild[1] as string);
                                            if (!isNaN(t)) thickness = t;
                                        }
                                    } else if (typeof fontChild === 'string') {
                                        if (fontChild === 'bold') bold = true;
                                        if (fontChild === 'italic') italic = true;
                                    }
                                }
                            } else if (subKey === 'justify') {
                                justify = {};
                                for (const jv of sub.slice(1)) {
                                    if (typeof jv === 'string') {
                                        const clean = jv.replace(/["`]/g, '');
                                        if (clean === 'left' || clean === 'right' || clean === 'center') {
                                            justify.horizontal = clean;
                                        } else if (clean === 'top' || clean === 'bottom' || clean === 'middle') {
                                            justify.vertical = clean;
                                        } else if (clean === 'mirror') {
                                            justify.mirror = true;
                                        }
                                    }
                                }
                            }
                        } else if (typeof sub === 'string' && sub === 'hide') {
                            hide = true;
                        }
                    }
                    if (values.some(v => typeof v === 'string' && v === 'hide')) {
                        hide = true;
                    }
                    break;
                }
            }
        } else if (typeof element === 'string' && element === 'hide') {
            hide = true;
        }
    }

    if (x !== undefined && y !== undefined) {
        return { text, x, y, rotation, layer, fontSize, fontFace, thickness, bold, italic, justify, hide };
    }
    return null;
}

interface PositionChange {
    oldX: number; oldY: number; oldRotation: number;
    newX: number; newY: number; newRotation: number;
}

interface PendingChange {
    filePath: string;
    variableName: string;
    prefix: string;
    sourceLine: number;
    oldX: number | null;
    oldY: number | null;
    oldRotation: number | null;
    oldSide: 'front' | 'back' | null;
    newX: number;
    newY: number;
    newRotation: number;
    newSide: 'front' | 'back';
    existingPcbLine: number | null; // 1-indexed line of existing .pcb assignment, or null
    refPositionChange?: PositionChange;
    fabPositionChange?: PositionChange;
    label: string;
}

async function applyChangesToSource(footprints: KicadComponentPlacement[]): Promise<void> {
    // Only consider footprints that have source metadata
    const sourced = footprints.filter(fp => fp.filePath && fp.sourceLine && fp.variableName);
    if (sourced.length === 0) {
        console.log(chalk.yellow('No footprints with source metadata found. Cannot apply changes.'));
        return;
    }

    // Group by source file to batch reads
    const byFile: Record<string, KicadComponentPlacement[]> = {};
    for (const fp of sourced) {
        const f = fp.filePath!;
        if (!byFile[f]) byFile[f] = [];
        byFile[f].push(fp);
    }

    const changes: PendingChange[] = [];

    for (const [filePath, fps] of Object.entries(byFile)) {
        let content: string;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        } catch {
            console.log(chalk.yellow(`  Skipping ${filePath} (file not found)`));
            continue;
        }
        const lines = content.split('\n');

        for (const fp of fps) {
            const variable = fp.variableName!;

            // Find the creation line by searching for the variable assignment pattern.
            // This is robust to line number shifts from prior edits.
            // Matches: this.X = new ... or X = new ...
            const creationRegex = new RegExp(`^\\s*(let|const|var|)\\s*(this\\.)?\\s*${variable}\\s*=\\s*new\\s+`);
            let creationIdx = -1; // 0-indexed
            let prefix = fp.isThis ? 'this.' : '';

            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(creationRegex);
                if (m) {
                    creationIdx = i;
                    prefix = m[2] ? 'this.' : '';
                    break;
                }
            }
            if (creationIdx === -1) continue; // variable not found in file

            // Find the end of the creation statement (line ending with ;)
            let statementEndIdx = creationIdx;
            for (let i = creationIdx; i < Math.min(lines.length, creationIdx + 20); i++) {
                if (lines[i].match(/;\s*$/)) {
                    statementEndIdx = i;
                    break;
                }
            }

            // Search for existing .pcb = { ... } assignment after the statement end
            let existingPcbLine: number | null = null;
            let oldX: number | null = null;
            let oldY: number | null = null;
            let oldRotation: number | null = null;
            let oldSide: 'front' | 'back' | null = null;

            const escapedPrefix = prefix.replace('.', '\\.');
            const pcbRegex = new RegExp(
                `^\\s*${escapedPrefix}\\s*${variable}\\.pcb\\s*=\\s*\\{([^}]+)\\}`
            );

            for (let i = statementEndIdx + 1; i < Math.min(lines.length, statementEndIdx + 5); i++) {
                const pcbMatch = lines[i]?.match(pcbRegex);
                if (pcbMatch) {
                    existingPcbLine = i + 1; // 1-indexed
                    const inner = pcbMatch[1];
                    const xm = inner.match(/x:\s*(-?[\d.]+)/);
                    const ym = inner.match(/y:\s*(-?[\d.]+)/);
                    const rm = inner.match(/rotation:\s*(-?[\d.]+)/);
                    const sm = inner.match(/side:\s*['"](front|back)['"]/);
                    oldX = xm ? parseFloat(xm[1]) : null;
                    oldY = ym ? parseFloat(ym[1]) : null;
                    oldRotation = rm ? parseFloat(rm[1]) : null;
                    oldSide = sm ? (sm[1] as 'front' | 'back') : null;
                    break;
                }
            }

            // Check if coordinates or side actually changed
            // Skip if source has no .pcb and KiCad coords are default (0, 0, 0) with front side
            const newSide = fp.side || 'front';
            const effectiveOldSide = oldSide || 'front'; // null means no side property = front (default)
            const isDefaultPosition = fp.x === 0 && fp.y === 0 && fp.rotation === 0 && newSide === 'front';
            const coordsChanged = existingPcbLine !== null
                ? (oldX !== fp.x || oldY !== fp.y || oldRotation !== fp.rotation || effectiveOldSide !== newSide)
                : !isDefaultPosition;

            // Check reference/fab position changes within the Component constructor
            let refPositionChange: PositionChange | undefined;
            let fabPositionChange: PositionChange | undefined;

            if (fp.referenceProperty) {
                const rp = fp.referenceProperty;
                // Search for reference: line within creation statement
                for (let i = creationIdx; i <= statementEndIdx; i++) {
                    if (lines[i]?.match(/reference:\s*\[/)) {
                        const inner = lines[i].match(/\{\s*x:\s*(-?[\d.]+)\s*,\s*y:\s*(-?[\d.]+)(?:\s*,\s*rotation:\s*(-?[\d.]+))?/);
                        if (inner) {
                            const oldRefX = parseFloat(inner[1]);
                            const oldRefY = parseFloat(inner[2]);
                            const oldRefR = inner[3] ? parseFloat(inner[3]) : 0;
                            if (oldRefX !== rp.x || oldRefY !== rp.y || oldRefR !== rp.rotation) {
                                refPositionChange = { oldX: oldRefX, oldY: oldRefY, oldRotation: oldRefR, newX: rp.x, newY: rp.y, newRotation: rp.rotation };
                            }
                        }
                        break;
                    }
                }
            }

            // Search for fab: line and compare with kicad_pcb fab text position
            if (fp.fabTextProperty) {
                const fabPcb = fp.fabTextProperty;
                for (let i = creationIdx; i <= statementEndIdx; i++) {
                    if (lines[i]?.match(/\bfab:\s*\{/)) {
                        const inner = lines[i].match(/\{\s*x:\s*(-?[\d.]+)\s*,\s*y:\s*(-?[\d.]+)(?:\s*,\s*rotation:\s*(-?[\d.]+))?/);
                        if (inner) {
                            const oldFabX = parseFloat(inner[1]);
                            const oldFabY = parseFloat(inner[2]);
                            const oldFabR = inner[3] ? parseFloat(inner[3]) : 0;
                            if (oldFabX !== fabPcb.x || oldFabY !== fabPcb.y || oldFabR !== fabPcb.rotation) {
                                fabPositionChange = { oldX: oldFabX, oldY: oldFabY, oldRotation: oldFabR, newX: fabPcb.x, newY: fabPcb.y, newRotation: fabPcb.rotation };
                            }
                        }
                        break;
                    }
                }
            }

            if (!coordsChanged && !refPositionChange && !fabPositionChange) continue;

            const sideChanged = effectiveOldSide !== newSide;
            const shortFile = filePath.replace(/\\/g, '/').split('/').slice(-2).join('/');

            // Build label parts
            const labelParts: string[] = [`${prefix}${variable}`, `${shortFile}:${creationIdx + 1}`];
            if (coordsChanged) {
                const oldStr = existingPcbLine !== null ? `(${oldX}, ${oldY})` : '(not set)';
                const sideInfo = sideChanged ? ` [${effectiveOldSide} → ${newSide}]` : '';
                labelParts.push(`pcb: ${oldStr} → (${fp.x}, ${fp.y})${sideInfo}`);
            }
            if (refPositionChange) {
                const rotInfo = refPositionChange.oldRotation !== refPositionChange.newRotation ? ` r:${refPositionChange.oldRotation}→${refPositionChange.newRotation}` : '';
                labelParts.push(`ref: (${refPositionChange.oldX}, ${refPositionChange.oldY}) → (${refPositionChange.newX}, ${refPositionChange.newY})${rotInfo}`);
            }
            if (fabPositionChange) {
                const rotInfo = fabPositionChange.oldRotation !== fabPositionChange.newRotation ? ` r:${fabPositionChange.oldRotation}→${fabPositionChange.newRotation}` : '';
                labelParts.push(`fab: (${fabPositionChange.oldX}, ${fabPositionChange.oldY}) → (${fabPositionChange.newX}, ${fabPositionChange.newY})${rotInfo}`);
            }
            changes.push({
                filePath,
                variableName: variable,
                prefix,
                sourceLine: statementEndIdx + 1, // 1-indexed, points to statement end
                oldX, oldY, oldRotation, oldSide,
                newX: fp.x,
                newY: fp.y,
                newRotation: fp.rotation,
                newSide,
                existingPcbLine,
                refPositionChange,
                fabPositionChange,
                label: labelParts.join('  ')
            });
        }
    }

    if (changes.length === 0) {
        console.log(chalk.green('\nAll component positions are up to date. No changes needed.'));
        return;
    }

    // Show summary
    console.log(chalk.bold(`\n${changes.length} component(s) have new positions:\n`));
    const byFileChange: Record<string, PendingChange[]> = {};
    for (const c of changes) {
        if (!byFileChange[c.filePath]) byFileChange[c.filePath] = [];
        byFileChange[c.filePath].push(c);
    }
    for (const [file, fileChanges] of Object.entries(byFileChange)) {
        const shortFile = file.replace(/\\/g, '/').split('/').slice(-2).join('/');
        console.log(chalk.yellow(`  ${shortFile}:`));
        for (const c of fileChanges) {
            const oldStr = c.existingPcbLine !== null ? `(${c.oldX}, ${c.oldY})` : '(not set)';
            const effectiveOldSide = c.oldSide || 'front';
            const sideChanged = effectiveOldSide !== c.newSide;
            const sideInfo = sideChanged ? ` ${chalk.magenta(`[${effectiveOldSide} → ${c.newSide}]`)}` : '';
            console.log(`    ${chalk.blueBright(c.prefix + c.variableName.padEnd(14))} ${oldStr} → (${c.newX}, ${c.newY})${sideInfo}`);
        }
    }

    // Interactive selection
    const selected = await checkbox({
        message: 'Select changes to apply:',
        choices: changes.map(c => ({
            name: c.label,
            value: c
        })),
    });

    if (selected.length === 0) {
        console.log(chalk.gray('\nNo changes selected.'));
        return;
    }

    // Apply selected changes, grouped by file.
    // Use string-based replacement to avoid line-shift issues from splice.
    const selectedByFile: Record<string, PendingChange[]> = {};
    for (const c of selected) {
        if (!selectedByFile[c.filePath]) selectedByFile[c.filePath] = [];
        selectedByFile[c.filePath].push(c);
    }

    let filesModified = 0;
    for (const [filePath, fileChanges] of Object.entries(selectedByFile)) {
        let content = fs.readFileSync(filePath, 'utf-8');

        // Sort by sourceLine descending so later changes are applied first.
        fileChanges.sort((a, b) => b.sourceLine - a.sourceLine);

        for (const change of fileChanges) {
            const lines = content.split('\n');
            const escapedPrefix = change.prefix.replace('.', '\\.');
            const varName = change.variableName;

            if (change.existingPcbLine !== null) {
                // Re-find the .pcb line by regex (robust to line shifts)
                const pcbRegex = new RegExp(
                    `^\\s*${escapedPrefix}\\s*${varName}\\.pcb\\s*=\\s*\\{([^}]+)\\}`
                );
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].match(pcbRegex)) {
                        lines[i] = lines[i]
                            .replace(/x:\s*-?[\d.]+/, `x: ${change.newX}`)
                            .replace(/y:\s*-?[\d.]+/, `y: ${change.newY}`)
                            .replace(/rotation:\s*-?[\d.]+/, `rotation: ${change.newRotation}`);
                        // Handle side property: add, update, or remove
                        if (change.newSide === 'back') {
                            if (lines[i].match(/side:\s*['"](front|back)['"]/)) {
                                lines[i] = lines[i].replace(/side:\s*['"](?:front|back)['"]/, `side: 'back'`);
                            } else {
                                lines[i] = lines[i].replace(/(\})/, `, side: 'back'$1`);
                            }
                        } else if (change.newSide === 'front' && lines[i].match(/side:\s*['"]back['"]/)) {
                            // Remove side: 'back' since front is default
                            lines[i] = lines[i].replace(/,\s*side:\s*['"]back['"]/, '');
                            if (!lines[i].match(/side:/)) {
                                // Also handle case where side was first property after rotation
                                lines[i] = lines[i].replace(/side:\s*['"]back['"]\s*,\s*/, '');
                            }
                        }
                        break;
                    }
                }

                // Apply reference position changes
                if (change.refPositionChange) {
                    const rc = change.refPositionChange;
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].match(/reference:\s*\[/)) {
                            // Update x, y, rotation within the inner { } of the reference tuple
                            lines[i] = lines[i]
                                .replace(/(reference:\s*\[[\s\S]*?\{[^}]*?)x:\s*-?[\d.]+/, `$1x: ${rc.newX}`)
                                .replace(/(reference:\s*\[[\s\S]*?\{[^}]*?)y:\s*-?[\d.]+/, `$1y: ${rc.newY}`);
                            if (rc.newRotation !== 0) {
                                if (lines[i].match(/(reference:\s*\[[\s\S]*?\{[^}]*?)rotation:\s*-?[\d.]+/)) {
                                    lines[i] = lines[i].replace(/(reference:\s*\[[\s\S]*?\{[^}]*?)rotation:\s*-?[\d.]+/, `$1rotation: ${rc.newRotation}`);
                                }
                            }
                            break;
                        }
                    }
                }

                // Apply fab position changes
                if (change.fabPositionChange) {
                    const fc = change.fabPositionChange;
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].match(/\bfab:\s*\{/)) {
                            lines[i] = lines[i]
                                .replace(/(fab:\s*\{[^}]*?)x:\s*-?[\d.]+/, `$1x: ${fc.newX}`)
                                .replace(/(fab:\s*\{[^}]*?)y:\s*-?[\d.]+/, `$1y: ${fc.newY}`);
                            if (fc.newRotation !== 0) {
                                if (lines[i].match(/(fab:\s*\{[^}]*?)rotation:\s*-?[\d.]+/)) {
                                    lines[i] = lines[i].replace(/(fab:\s*\{[^}]*?)rotation:\s*-?[\d.]+/, `$1rotation: ${fc.newRotation}`);
                                }
                            }
                            break;
                        }
                    }
                }

                content = lines.join('\n');
            } else {
                // Find the creation line and statement end by searching the file
                const creationRegex = new RegExp(`^\\s*(let|const|var|)\\s*${escapedPrefix}\\s*${varName}\\s*=\\s*new\\s+`);
                let insertIdx = -1;
                let indent = '';
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].match(creationRegex)) {
                        indent = lines[i].match(/^(\s*)/)?.[1] || '';
                        // Find end of this statement
                        for (let j = i; j < Math.min(lines.length, i + 20); j++) {
                            if (lines[j].match(/;\s*$/)) {
                                insertIdx = j;
                                break;
                            }
                        }
                        break;
                    }
                }
                if (insertIdx === -1) continue;

                const sidePart = change.newSide === 'back' ? `, side: 'back'` : '';
                const newLine = `${indent}${change.prefix}${varName}.pcb = { x: ${change.newX}, y: ${change.newY}, rotation: ${change.newRotation}${sidePart} };`;                lines.splice(insertIdx + 1, 0, newLine);
                content = lines.join('\n');
            }
        }

        const original = fs.readFileSync(filePath, 'utf-8');
        fs.writeFileSync(filePath + '.backup', original, 'utf-8');
        fs.writeFileSync(filePath, content, 'utf-8');
        filesModified++;
    }

    console.log(chalk.green(`\n✓ Applied ${selected.length} change(s) to ${filesModified} file(s). Rebuild with: npm run build`));
}

interface PendingTextChange {
    filePath: string;
    sourceTextContent: string;
    newPcbText: string;
    lineIdx: number;
    endIdx: number;
    callText: string;
    // Position
    oldX: number; oldY: number; oldRotation: number;
    newX: number; newY: number; newRotation: number;
    // Layer
    oldLayer: string; newLayer: string;
    // Font
    oldFont: string | undefined; newFont: string | undefined;
    oldWidth: number | undefined; newWidth: number | undefined;
    oldHeight: number | undefined; newHeight: number | undefined;
    oldThickness: number | undefined; newThickness: number | undefined;
    // Style
    oldBold: boolean; newBold: boolean;
    oldItalic: boolean; newItalic: boolean;
    // Justify
    oldJustify: { horizontal?: string; vertical?: string; mirror?: boolean } | undefined;
    newJustify: { horizontal?: string; vertical?: string; mirror?: boolean } | undefined;
    // Computed
    label: string;
    changedProps: string[];
}

function parseSourceJustify(raw: string): { horizontal?: string; vertical?: string; mirror?: boolean } {
    const result: { horizontal?: string; vertical?: string; mirror?: boolean } = {};
    const hm = raw.match(/horizontal:\s*['"](\w+)['"]/);
    const vm = raw.match(/vertical:\s*['"](\w+)['"]/);
    const mm = raw.match(/mirror:\s*(true)/);
    if (hm) result.horizontal = hm[1];
    if (vm) result.vertical = vm[1];
    if (mm) result.mirror = true;
    return result;
}

function justifyEquals(
    a: { horizontal?: string; vertical?: string; mirror?: boolean } | undefined,
    b: { horizontal?: string; vertical?: string; mirror?: boolean } | undefined
): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (a.horizontal ?? undefined) === (b.horizontal ?? undefined) &&
           (a.vertical ?? undefined) === (b.vertical ?? undefined) &&
           (a.mirror ?? false) === (b.mirror ?? false);
}

function textFuzzyMatch(sourceText: string, pcbText: string): boolean {
    if (sourceText === pcbText) return true;
    // Prefix match: source "typecad 1hz" matches PCB "typecad 1hzaaa"
    if (pcbText.startsWith(sourceText) || sourceText.startsWith(pcbText)) return true;
    // Substring match
    if (pcbText.includes(sourceText) || sourceText.includes(pcbText)) return true;
    return false;
}

async function applyTextChangesToSource(textElements: KicadTextElement[], sourceFiles: string[]): Promise<void> {
    if (textElements.length === 0) return;

    interface SourceTextCall {
        filePath: string;
        lineIdx: number;
        endIdx: number;
        callText: string;
        sourceText: string;
        x: number; y: number; rotation: number;
        layer: string;
        font: string | undefined;
        width: number | undefined;
        height: number | undefined;
        thickness: number | undefined;
        bold: boolean;
        italic: boolean;
        justify: { horizontal?: string; vertical?: string; mirror?: boolean } | undefined;
    }
    const sourceCalls: SourceTextCall[] = [];

    for (const filePath of sourceFiles) {
        let content: string;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        } catch {
            continue;
        }
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            if (!lines[i].match(/\.text\s*\(/)) continue;

            let callText = lines[i];
            let endIdx = i;
            if (!lines[i].match(/\}\s*\)/)) {
                for (let j = i + 1; j < Math.min(lines.length, i + 30); j++) {
                    callText += '\n' + lines[j];
                    if (lines[j].match(/\}\s*\)/)) {
                        endIdx = j;
                        break;
                    }
                }
            }

            const textMatch = callText.match(/text:\s*["']([^"']+)["']/);
            if (!textMatch) continue;

            const xm = callText.match(/x:\s*(-?[\d.]+)/);
            const ym = callText.match(/y:\s*(-?[\d.]+)/);
            const rm = callText.match(/rotation:\s*(-?[\d.]+)/);
            const lm = callText.match(/layer:\s*["']([^"']+)["']/);
            const fm = callText.match(/font:\s*["']([^"']+)["']/);
            const wm = callText.match(/width:\s*(-?[\d.]+)/);
            const hm = callText.match(/height:\s*(-?[\d.]+)/);
            const tm = callText.match(/thickness:\s*(-?[\d.]+)/);
            const bm = callText.match(/\bbold:\s*(true|false)/);
            const im = callText.match(/\bitalic:\s*(true|false)/);
            const jm = callText.match(/justify:\s*\{([^}]*)\}/);

            sourceCalls.push({
                filePath,
                lineIdx: i,
                endIdx,
                callText,
                sourceText: textMatch[1],
                x: xm ? parseFloat(xm[1]) : 0,
                y: ym ? parseFloat(ym[1]) : 0,
                rotation: rm ? parseFloat(rm[1]) : 0,
                layer: lm ? lm[1] : 'F.SilkS',
                font: fm ? fm[1] : undefined,
                width: wm ? parseFloat(wm[1]) : undefined,
                height: hm ? parseFloat(hm[1]) : undefined,
                thickness: tm ? parseFloat(tm[1]) : undefined,
                bold: bm ? bm[1] === 'true' : false,
                italic: im ? im[1] === 'true' : false,
                justify: jm ? parseSourceJustify(jm[1]) : undefined,
            });
        }
    }

    if (sourceCalls.length === 0) return;

    // Match source calls to PCB texts
    const matchedSourceIdxs = new Set<number>();
    const matchedPcbTexts = new Set<string>();
    const pairs: { source: SourceTextCall; pcb: KicadTextElement }[] = [];

    for (let si = 0; si < sourceCalls.length; si++) {
        const src = sourceCalls[si];
        for (const t of textElements) {
            if (matchedPcbTexts.has(t.text)) continue;
            if (textFuzzyMatch(src.sourceText, t.text)) {
                pairs.push({ source: src, pcb: t });
                matchedSourceIdxs.add(si);
                matchedPcbTexts.add(t.text);
                break;
            }
        }
    }

    // Pass 2: position proximity fallback
    const unmatchedSource = sourceCalls.filter((_, i) => !matchedSourceIdxs.has(i));
    const unmatchedPcb = textElements.filter(t => !matchedPcbTexts.has(t.text));

    if (unmatchedSource.length > 0 && unmatchedPcb.length > 0) {
        const usedPcb = new Set<number>();
        for (const src of unmatchedSource) {
            let bestDist = Infinity;
            let bestPcbIdx = -1;
            for (let pi = 0; pi < unmatchedPcb.length; pi++) {
                if (usedPcb.has(pi)) continue;
                const t = unmatchedPcb[pi];
                const dist = Math.sqrt(Math.pow(src.x - t.x, 2) + Math.pow(src.y - t.y, 2));
                if (dist < bestDist) {
                    bestDist = dist;
                    bestPcbIdx = pi;
                }
            }
            if (bestPcbIdx >= 0 && bestDist < 200) {
                pairs.push({ source: src, pcb: unmatchedPcb[bestPcbIdx] });
                usedPcb.add(bestPcbIdx);
            }
        }
    }

    // Build pending changes from pairs
    const changes: PendingTextChange[] = [];
    for (const { source: src, pcb } of pairs) {
        const pcbWidth = pcb.fontSize ? pcb.fontSize[1] : undefined;
        const pcbHeight = pcb.fontSize ? pcb.fontSize[0] : undefined;

        const xChanged = Math.abs(src.x - pcb.x) > 0.001;
        const yChanged = Math.abs(src.y - pcb.y) > 0.001;
        const rChanged = Math.abs(src.rotation - pcb.rotation) > 0.001;
        const textChanged = src.sourceText !== pcb.text;
        const layerChanged = src.layer !== pcb.layer;
        const fontChanged = src.font !== pcb.fontFace;
        const widthChanged = src.width !== pcbWidth && (src.width !== undefined || pcbWidth !== undefined);
        const heightChanged = src.height !== pcbHeight && (src.height !== undefined || pcbHeight !== undefined);
        const thicknessChanged = src.thickness !== pcb.thickness && (src.thickness !== undefined || pcb.thickness !== undefined);
        const boldChanged = src.bold !== (pcb.bold || false);
        const italicChanged = src.italic !== (pcb.italic || false);
        const justifyChanged = !justifyEquals(src.justify, pcb.justify);

        if (!xChanged && !yChanged && !rChanged && !textChanged && !layerChanged &&
            !fontChanged && !widthChanged && !heightChanged && !thicknessChanged &&
            !boldChanged && !italicChanged && !justifyChanged) continue;

        const changedProps: string[] = [];
        if (xChanged || yChanged) changedProps.push('position');
        if (rChanged) changedProps.push('rotation');
        if (textChanged) changedProps.push('text');
        if (layerChanged) changedProps.push('layer');
        if (fontChanged) changedProps.push('font');
        if (widthChanged || heightChanged) changedProps.push('size');
        if (thicknessChanged) changedProps.push('thickness');
        if (boldChanged) changedProps.push('bold');
        if (italicChanged) changedProps.push('italic');
        if (justifyChanged) changedProps.push('justify');

        const shortFile = src.filePath.replace(/\\/g, '/').split('/').slice(-2).join('/');
        const posStr = `(${src.x}, ${src.y}) → (${pcb.x}, ${pcb.y})`;
        const propsStr = changedProps.filter(p => p !== 'position').join(', ');
        const labelParts = [`text "${src.sourceText}"`, `${shortFile}:${src.lineIdx + 1}`, posStr];
        if (propsStr) labelParts.push(`[${propsStr}]`);
        if (textChanged) labelParts.push(`[text: "${src.sourceText}" → "${pcb.text}"]`);

        changes.push({
            filePath: src.filePath,
            sourceTextContent: src.sourceText,
            newPcbText: pcb.text,
            lineIdx: src.lineIdx,
            endIdx: src.endIdx,
            callText: src.callText,
            oldX: src.x, oldY: src.y, oldRotation: src.rotation,
            newX: pcb.x, newY: pcb.y, newRotation: pcb.rotation,
            oldLayer: src.layer, newLayer: pcb.layer,
            oldFont: src.font, newFont: pcb.fontFace,
            oldWidth: src.width, newWidth: pcbWidth,
            oldHeight: src.height, newHeight: pcbHeight,
            oldThickness: src.thickness, newThickness: pcb.thickness,
            oldBold: src.bold, newBold: pcb.bold || false,
            oldItalic: src.italic, newItalic: pcb.italic || false,
            oldJustify: src.justify, newJustify: pcb.justify,
            label: labelParts.join('  '),
            changedProps,
        });
    }

    if (changes.length === 0) {
        console.log(chalk.green('\nAll text positions are up to date.'));
        return;
    }

    console.log(chalk.bold(`\n${changes.length} text element(s) have changes:\n`));
    for (const c of changes) {
        const propsStr = c.changedProps.length > 0 ? ` ${chalk.magenta(`[${c.changedProps.join(', ')}]`)}` : '';
        console.log(`    ${chalk.blueBright(`"${c.sourceTextContent}"`)}  (${c.oldX}, ${c.oldY}) → (${c.newX}, ${c.newY})${propsStr}`);
    }

    const selected = await checkbox({
        message: 'Select text changes to apply:',
        choices: changes.map(c => ({
            name: c.label,
            value: c
        })),
    });

    if (selected.length === 0) {
        console.log(chalk.gray('\nNo text changes selected.'));
        return;
    }

    const selectedByFile: Record<string, PendingTextChange[]> = {};
    for (const c of selected) {
        if (!selectedByFile[c.filePath]) selectedByFile[c.filePath] = [];
        selectedByFile[c.filePath].push(c);
    }

    let filesModified = 0;
    for (const [filePath, fileChanges] of Object.entries(selectedByFile)) {
        let content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        // Sort by line index descending to avoid shift issues
        fileChanges.sort((a, b) => b.lineIdx - a.lineIdx);

        for (const change of fileChanges) {
            // Re-find the line by looking for .text( then matching text content
            const escapedSourceText = change.sourceTextContent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            for (let i = 0; i < lines.length; i++) {
                if (!lines[i].match(/\.text\s*\(/)) continue;

                // Gather full call text
                let callBlock = lines[i];
                let endLine = i;
                if (!lines[i].match(/\}\s*\)/)) {
                    for (let j = i + 1; j < Math.min(lines.length, i + 20); j++) {
                        callBlock += '\n' + lines[j];
                        if (lines[j].match(/\}\s*\)/)) {
                            endLine = j;
                            break;
                        }
                    }
                }

                // Check if this call contains our source text
                const textMatch = callBlock.match(new RegExp(`text:\\s*["']${escapedSourceText}["']`));
                if (!textMatch) continue;

                // Replace properties in the call block
                let updated = callBlock;

                // Text content
                if (change.sourceTextContent !== change.newPcbText) {
                    updated = updated.replace(change.sourceTextContent, change.newPcbText);
                }
                // Position
                if (Math.abs(change.oldX - change.newX) > 0.001) {
                    updated = updated.replace(/x:\s*-?[\d.]+/, `x: ${change.newX}`);
                }
                if (Math.abs(change.oldY - change.newY) > 0.001) {
                    updated = updated.replace(/y:\s*-?[\d.]+/, `y: ${change.newY}`);
                }
                if (Math.abs(change.oldRotation - change.newRotation) > 0.001) {
                    if (updated.match(/rotation:\s*-?[\d.]+/)) {
                        updated = updated.replace(/rotation:\s*-?[\d.]+/, `rotation: ${change.newRotation}`);
                    }
                }
                // Layer
                if (change.oldLayer !== change.newLayer && change.newLayer !== 'F.SilkS') {
                    if (updated.match(/layer:\s*["'][^"']+["']/)) {
                        updated = updated.replace(/layer:\s*["'][^"']+["']/, `layer: '${change.newLayer}'`);
                    }
                }
                // Font face
                if (change.oldFont !== change.newFont) {
                    if (change.newFont) {
                        if (updated.match(/font:\s*["'][^"']+["']/)) {
                            updated = updated.replace(/font:\s*["'][^"']+["']/, `font: '${change.newFont}'`);
                        }
                    }
                }
                // Width / Height (from fontSize)
                if (change.newWidth !== undefined && change.oldWidth !== change.newWidth) {
                    if (updated.match(/width:\s*-?[\d.]+/)) {
                        updated = updated.replace(/width:\s*-?[\d.]+/, `width: ${change.newWidth}`);
                    }
                }
                if (change.newHeight !== undefined && change.oldHeight !== change.newHeight) {
                    if (updated.match(/height:\s*-?[\d.]+/)) {
                        updated = updated.replace(/height:\s*-?[\d.]+/, `height: ${change.newHeight}`);
                    }
                }
                // Thickness
                if (change.newThickness !== undefined && change.oldThickness !== change.newThickness) {
                    if (updated.match(/thickness:\s*-?[\d.]+/)) {
                        updated = updated.replace(/thickness:\s*-?[\d.]+/, `thickness: ${change.newThickness}`);
                    }
                }
                // Bold
                if (change.oldBold !== change.newBold) {
                    if (updated.match(/\bbold:\s*(true|false)/)) {
                        updated = updated.replace(/\bbold:\s*(true|false)/, `bold: ${change.newBold}`);
                    }
                }
                // Italic
                if (change.oldItalic !== change.newItalic) {
                    if (updated.match(/\bitalic:\s*(true|false)/)) {
                        updated = updated.replace(/\bitalic:\s*(true|false)/, `italic: ${change.newItalic}`);
                    }
                }
                // Justify
                if (!justifyEquals(change.oldJustify, change.newJustify) && change.newJustify) {
                    const j = change.newJustify;
                    const newParts: string[] = [];
                    if (j.horizontal) newParts.push(`horizontal: '${j.horizontal}'`);
                    if (j.vertical) newParts.push(`vertical: '${j.vertical}'`);
                    if (j.mirror) newParts.push('mirror: true');
                    if (newParts.length > 0) {
                        const newJustifyStr = `justify: { ${newParts.join(', ')} }`;
                        if (updated.match(/justify:\s*\{[^}]*\}/)) {
                            updated = updated.replace(/justify:\s*\{[^}]*\}/, newJustifyStr);
                        }
                    }
                }

                // Replace the lines in the array
                const updatedLines = updated.split('\n');
                lines.splice(i, endLine - i + 1, ...updatedLines);
                break;
            }
        }

        content = lines.join('\n');
        const original = fs.readFileSync(filePath, 'utf-8');
        fs.writeFileSync(filePath + '.backup', original, 'utf-8');
        fs.writeFileSync(filePath, content, 'utf-8');
        filesModified++;
    }

    console.log(chalk.green(`\n✓ Applied ${selected.length} text change(s) to ${filesModified} file(s). Rebuild with: npm run build`));
}
export async function kicadDataToTypeCAD(filePath: string, options?: { apply?: boolean }) {
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

        const rawFootprints = findNodes(rootElement, 'footprint');
        console.log(`[kicad2typecad] findNodes returned ${rawFootprints.length} footprints`);

        const parsedFootprints = rawFootprints.map(item => {
            const parsed = parseFootprintItem(item as unknown[]);
            return parsed;
        });
        
        const footprints = parsedFootprints.filter((fp): fp is KicadComponentPlacement => fp !== null);

        // --apply mode: interactively inject coordinate changes into source files
        if (options?.apply) {
            await applyChangesToSource(footprints);

            // Also handle text elements
            const textElements = findNodes(rootElement, 'gr_text')
                .map(item => parseGrTextItem(item as unknown[]))
                .filter((t): t is KicadTextElement => t !== null);

            if (textElements.length > 0) {
                // Collect unique source files from footprints
                const sourceFiles = [...new Set(
                    footprints.filter(fp => fp.filePath).map(fp => fp.filePath!)
                )];
                await applyTextChangesToSource(textElements, sourceFiles);
            }

            return;
        }

        if (footprints.length > 0) {
            console.log(`Found ${footprints.length} footprints. Generating placement code from ${sourceDescription}.`);

            // Group by file
            const groups: Record<string, KicadComponentPlacement[]> = {};
            footprints.forEach(fp => {
                const file = fp.filePath || 'Unknown File';
                if (!groups[file]) groups[file] = [];
                groups[file].push(fp);
            });

            console.log(chalk.bold(`\n--- Generated Component Placement Code from ${sourceDescription} ---`));

            for (const [file, fps] of Object.entries(groups)) {
                console.log(chalk.yellow(`\n// File: ${file}`));
                fps.forEach(fp => {
                    const variableName = fp.variableName || fp.reference;
                    const prefix = fp.isThis ? 'this.' : '';
                    let placementLog = `${chVar(prefix + variableName)}${chPunc('.')}${chProp('pcb')} ${chPunc('=')} ${chPunc('{')}`;
                    placementLog += ` ${chProp('x')}${chPunc(':')} ${chNum(fp.x)}${chPunc(',')}`;
                    placementLog += ` ${chProp('y')}${chPunc(':')} ${chNum(fp.y)}${chPunc(',')}`;
                    placementLog += ` ${chProp('rotation')}${chPunc(':')} ${chNum(fp.rotation)}`;
                    if (fp.side === 'back') {
                        placementLog += `${chPunc(',')} ${chProp('side')}${chPunc(':')} ${chStr("'back'")}`;
                    }
                    placementLog += ` ${chPunc('}')}${chPunc(';')}`;
                    console.log(placementLog);
                });
            }
            console.log(chalk.bold("\n-------------------------------------------------------------"));
        } else {
            console.log(`No footprints found in ${sourceDescription} content.`);
        }

        // --- Component constructors with reference/fab options ---
        const componentsWithRefProps = footprints.filter(fp => fp.referenceProperty && (fp.referenceProperty.x !== 0 || fp.referenceProperty.rotation !== 0));
        if (componentsWithRefProps.length > 0) {
            console.log(`Found ${componentsWithRefProps.length} component(s) with custom reference positioning. Generating Component constructor code.`);
            console.log(chalk.bold(`\n--- Generated Component Constructor Code from ${sourceDescription} ---`));

            componentsWithRefProps.forEach(fp => {
                const variableName = fp.variableName || fp.reference;
                const prefix = fp.isThis ? 'this.' : '';
                const rp = fp.referenceProperty!;
                const refPosObj = `{ ${chProp('x')}${chPunc(':')} ${chNum(rp.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(rp.y)}${chPunc(',')} ${chProp('rotation')}${chPunc(':')} ${chNum(rp.rotation)}${chPunc(',')} ${chProp('thickness')}${chPunc(':')} ${chNum(rp.thickness)}${chPunc(',')} ${chProp('width')}${chPunc(':')} ${chNum(rp.width)}${chPunc(',')} ${chProp('height')}${chPunc(':')} ${chNum(rp.height)} }`;

                const fab = fp.fabTextProperty;
                const fabPosObj = fab
                    ? `{ ${chProp('x')}${chPunc(':')} ${chNum(fab.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(fab.y)}${chPunc(',')} ${chProp('rotation')}${chPunc(':')} ${chNum(fab.rotation)}${chPunc(',')} ${chProp('thickness')}${chPunc(':')} ${chNum(fab.thickness)}${chPunc(',')} ${chProp('width')}${chPunc(':')} ${chNum(fab.width)}${chPunc(',')} ${chProp('height')}${chPunc(':')} ${chNum(fab.height)} }`
                    : refPosObj;

                console.log(`${chVar(prefix + variableName)} ${chPunc('=')} ${chKey('new')} ${chKey('Component')}({`);
                if (fp.footprintName) {
                    console.log(`    ${chProp('footprint')}${chPunc(':')} ${chStr("'" + fp.footprintName + "'")}${chPunc(',')}`);
                }
                console.log(`    ${chProp('reference')}${chPunc(':')} [${chStr("'" + fp.reference + "'")}, ${refPosObj}]${chPunc(',')}`);
                console.log(`    ${chProp('fab')}${chPunc(':')} ${fabPosObj},`);
                console.log(`${chPunc(')};')}`);
            });
            console.log(chalk.bold("\n-------------------------------------------------------------"));
        }

        // --- Text elements (gr_text) ---
        const textElements = findNodes(rootElement, 'gr_text')
            .map(item => parseGrTextItem(item as unknown[]))
            .filter((t): t is KicadTextElement => t !== null);

        if (textElements.length > 0) {
            console.log(`Found ${textElements.length} text element(s). Generating typeCAD code from ${sourceDescription}.`);
            console.log(chalk.bold(`\n--- Generated Text Element Code from ${sourceDescription} ---`));
            textElements.forEach(t => {
                console.log(chalk.gray(`// Text: "${t.text}"`));
                let textLog = `${chVar('typecad')}${chPunc('.')}${chKey('text')}${chPunc('({ ')}`;
                textLog += `${chProp('text')}${chPunc(':')} ${chStr('"' + t.text + '"')}${chPunc(',')}`;
                textLog += ` ${chProp('x')}${chPunc(':')} ${chNum(t.x)}${chPunc(',')}`;
                textLog += ` ${chProp('y')}${chPunc(':')} ${chNum(t.y)}${chPunc(',')}`;
                if (t.rotation !== 0) {
                    textLog += ` ${chProp('rotation')}${chPunc(':')} ${chNum(t.rotation)}${chPunc(',')}`;
                }
                if (t.layer !== 'F.SilkS') {
                    textLog += ` ${chProp('layer')}${chPunc(':')} ${chStr('"' + t.layer + '"')}${chPunc(',')}`;
                }
                if (t.fontFace) {
                    textLog += ` ${chProp('font')}${chPunc(':')} ${chStr('"' + t.fontFace + '"')}${chPunc(',')}`;
                }
                if (t.fontSize) {
                    textLog += ` ${chProp('height')}${chPunc(':')} ${chNum(t.fontSize[0])}${chPunc(',')}`;
                    textLog += ` ${chProp('width')}${chPunc(':')} ${chNum(t.fontSize[1])}${chPunc(',')}`;
                }
                if (t.thickness !== undefined) {
                    textLog += ` ${chProp('thickness')}${chPunc(':')} ${chNum(t.thickness)}${chPunc(',')}`;
                }
                if (t.bold) {
                    textLog += ` ${chProp('bold')}${chPunc(':')} ${chVar('true')}${chPunc(',')}`;
                }
                if (t.italic) {
                    textLog += ` ${chProp('italic')}${chPunc(':')} ${chVar('true')}${chPunc(',')}`;
                }
                if (t.justify) {
                    const parts: string[] = [];
                    if (t.justify.horizontal) parts.push(`${chProp('horizontal')}${chPunc(':')} ${chStr("'" + t.justify.horizontal + "'")}`);
                    if (t.justify.vertical) parts.push(`${chProp('vertical')}${chPunc(':')} ${chStr("'" + t.justify.vertical + "'")}`);
                    if (t.justify.mirror) parts.push(`${chProp('mirror')}${chPunc(':')} ${chVar('true')}`);
                    if (parts.length > 0) {
                        textLog += ` ${chProp('justify')}${chPunc(':')} { ${parts.join(`${chPunc(',')}`)} }${chPunc(',')}`;
                    }
                }
                // Remove trailing comma
                textLog = textLog.replace(/,$/, '');
                textLog += ` ${chPunc('})')}${chPunc(';')}`;
                console.log(textLog);
            });
            console.log(chalk.bold("----------------------------------------------------------"));
        } else {
            console.log(`No text elements found in ${sourceDescription} content.`);
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
