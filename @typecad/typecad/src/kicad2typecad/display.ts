import chalk from 'chalk';
import type { PCB } from '../pcb/pcb.js';
import type { TrackBuilder } from '../pcb/pcb_track_builder.js';
import { DEFAULT_NET_PREFIX } from '../constants.js';
import type {
    KicadIR,
    KicadFootprintIR,
    KicadSegmentIR,
    KicadTextIR,
    KicadViaIR,
    KicadNetIR,
    KicadOutlineIR,
} from './types.js';

/** Helper for colored console output */
export interface ChalkHelpers {
    chKey: (s: string) => string;
    chProp: (s: string) => string;
    chStr: (s: string) => string;
    chNum: (n: number) => string;
    chPunc: (s: string) => string;
    chVar: (s: string) => string;
}

/** Default chalk helpers */
export const DEFAULT_CH: ChalkHelpers = {
    chKey: chalk.cyan,
    chProp: chalk.magenta,
    chStr: chalk.green,
    chNum: chalk.yellow,
    chPunc: chalk.gray,
    chVar: chalk.blueBright,
};

/**
 * Generate TrackBuilder code display from IR segments and nets.
 * Returns the generated track variable names for use in create() statements.
 */
export function generateTrackCode(
    ir: KicadIR,
    pcb: PCB,
    sourceDescription: string,
    ch: ChalkHelpers = DEFAULT_CH
): string[] {
    const { chKey, chProp, chStr, chNum, chPunc, chVar } = ch;
    const segments = ir.segments;
    const nets = ir.nets;
    const trackVariableNames: string[] = [];

    if (segments.length > 0) {
        console.log(`Found ${segments.length} segments. Generating TrackBuilder chains organized by nets from ${sourceDescription}.`);

        const netMap = new Map<number, string>();
        nets.forEach(net => { netMap.set(net.number, net.name); });

        const segmentsByNet = new Map<number, KicadSegmentIR[]>();
        segments.forEach(segment => {
            const netNum = segment.net ?? 0;
            if (!segmentsByNet.has(netNum)) segmentsByNet.set(netNum, []);
            segmentsByNet.get(netNum)!.push(segment);
        });

        const allNetTrackLogs: string[] = [];

        segmentsByNet.forEach((netSegments, netNum) => {
            const netName = netMap.get(netNum) || '';
            const isUnnamedNet = !netName || netName.startsWith(DEFAULT_NET_PREFIX) || netName === '';

            let variableName: string;
            if (isUnnamedNet) {
                variableName = 'unnamed_Track';
            } else {
                variableName = `track_${sanitizeNetNameForVariable(netName)}`;
            }

            if (!trackVariableNames.includes(variableName)) trackVariableNames.push(variableName);

            if (isUnnamedNet) {
                allNetTrackLogs.push(chalk.gray(`// Unnamed nets (net${netNum})`));
            } else {
                allNetTrackLogs.push(chalk.gray(`// Net: ${netName}`));
            }
            allNetTrackLogs.push(
                `${chVar('let ' + variableName)}${chPunc(':')} ${chKey('TrackBuilder')}${chPunc('[]')} ${chPunc('=')} ${chPunc('[')}${chPunc(']')}${chPunc(';')}`
            );

            let currentTrackBuilder: TrackBuilder | null = null;
            let lastEndPoint: { x: number; y: number } | null = null;
            let currentChainLog = '';

            netSegments.forEach((segment) => {
                if (!currentTrackBuilder || !lastEndPoint ||
                    lastEndPoint.x !== segment.start.x || lastEndPoint.y !== segment.start.y) {
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

            if (currentChainLog) allNetTrackLogs.push(currentChainLog + chPunc(')') + chPunc(';'));
            allNetTrackLogs.push('');
        });

        if (allNetTrackLogs.length > 0) {
            console.log(chalk.bold(`\n--- Generated typeCAD TrackBuilder Code from ${sourceDescription} ---`));
            allNetTrackLogs.forEach(log => console.log(log));
            console.log(chalk.bold('---------------------------------------------------------'));
        }
    } else {
        console.log(`No segments found in ${sourceDescription} content.`);
    }

    return trackVariableNames;
}

/**
 * Generate placement code display from IR footprints.
 * Shows `.pcb = { ... }` assignments and Component constructor code.
 */
export function generatePlacementCode(
    footprints: KicadFootprintIR[],
    sourceDescription: string,
    ch: ChalkHelpers = DEFAULT_CH
): void {
    const { chKey, chProp, chStr, chNum, chPunc, chVar } = ch;

    if (footprints.length > 0) {
        console.log(`Found ${footprints.length} footprints. Generating placement code from ${sourceDescription}.`);
        const groups: Record<string, KicadFootprintIR[]> = {};

        // Group by any available source hint (footprint name for display)
        footprints.forEach(fp => {
            const key = fp.footprintName || 'Unknown';
            if (!groups[key]) groups[key] = [];
            groups[key].push(fp);
        });

        console.log(chalk.bold(`\n--- Generated Component Placement Code from ${sourceDescription} ---`));
        for (const [key, fps] of Object.entries(groups)) {
            console.log(chalk.yellow(`\n// Footprint: ${key}`));
            fps.forEach(fp => {
                const variableName = fp.reference;
                const prefix = '';
                let placementLog = `${chVar(prefix + variableName)}${chPunc('.')}${chProp('pcb')} ${chPunc('=')} ${chPunc('{')}`;
                placementLog += ` ${chProp('x')}${chPunc(':')} ${chNum(fp.position.x)}${chPunc(',')}`;
                placementLog += ` ${chProp('y')}${chPunc(':')} ${chNum(fp.position.y)}${chPunc(',')}`;
                placementLog += ` ${chProp('rotation')}${chPunc(':')} ${chNum(fp.position.rotation)}`;
                if (fp.side === 'back') placementLog += `${chPunc(',')} ${chProp('side')}${chPunc(':')} ${chStr("'back'")}`;
                placementLog += ` ${chPunc('}')}${chPunc(';')}`;
                console.log(placementLog);
            });
        }
        console.log(chalk.bold('\n-------------------------------------------------------------'));
    } else {
        console.log(`No footprints found in ${sourceDescription} content.`);
    }

    // Component constructors with reference/fab options
    const componentsWithRefProps = footprints.filter(
        fp => fp.referenceProperty && (fp.referenceProperty.x !== 0 || fp.referenceProperty.rotation !== 0)
    );
    if (componentsWithRefProps.length > 0) {
        console.log(
            `Found ${componentsWithRefProps.length} component(s) with custom reference positioning. Generating Component constructor code.`
        );
        console.log(chalk.bold(`\n--- Generated Component Constructor Code from ${sourceDescription} ---`));

        componentsWithRefProps.forEach(fp => {
            const variableName = fp.reference;
            const prefix = '';
            const rp = fp.referenceProperty!;
            const refPosObj = formatPosObj(rp, chProp, chPunc, chNum);

            const fab = fp.fabTextProperty;
            const fabArg = fab
                ? (fab.text && fab.text !== '${REFERENCE}'
                    ? `[${chStr("'" + fab.text + "'")}, ${formatPosObj(fab, chProp, chPunc, chNum)}]`
                    : formatPosObj(fab, chProp, chPunc, chNum))
                : null;

            console.log(`${chVar(prefix + variableName)} ${chPunc('=')} ${chKey('new')} ${chKey('Component')}({`);
            if (fp.footprintName) {
                console.log(`    ${chProp('footprint')}${chPunc(':')} ${chStr("'" + fp.footprintName + "'")}${chPunc(',')}`);
            }
            console.log(`    ${chProp('reference')}${chPunc(':')} [${chStr("'" + fp.reference + "'")}, ${refPosObj}]${chPunc(',')}`);
            if (fabArg) console.log(`    ${chProp('fab')}${chPunc(':')} ${fabArg},`);
            console.log(`${chPunc(')};')}`);
        });
        console.log(chalk.bold('\n-------------------------------------------------------------'));
    }
}

/**
 * Generate text element code display from IR text elements.
 */
export function generateTextCode(
    ir: KicadIR,
    sourceDescription: string,
    ch: ChalkHelpers = DEFAULT_CH
): void {
    const { chKey, chProp, chStr, chNum, chPunc, chVar } = ch;
    const textElements = ir.textElements;

    if (textElements.length > 0) {
        console.log(`Found ${textElements.length} text element(s). Generating typeCAD code from ${sourceDescription}.`);
        console.log(chalk.bold(`\n--- Generated Text Element Code from ${sourceDescription} ---`));
        textElements.forEach(t => {
            console.log(chalk.gray(`// Text: "${t.text}"`));
            let textLog = `${chVar('typecad')}${chPunc('.')}${chKey('text')}${chPunc('({ ')}`;
            textLog += `${chProp('text')}${chPunc(':')} ${chStr('"' + t.text + '"')}${chPunc(',')}`;
            textLog += ` ${chProp('x')}${chPunc(':')} ${chNum(t.x)}${chPunc(',')}`;
            textLog += ` ${chProp('y')}${chPunc(':')} ${chNum(t.y)}${chPunc(',')}`;
            if (t.rotation !== 0) textLog += ` ${chProp('rotation')}${chPunc(':')} ${chNum(t.rotation)}${chPunc(',')}`;
            if (t.layer !== 'F.SilkS') textLog += ` ${chProp('layer')}${chPunc(':')} ${chStr('"' + t.layer + '"')}${chPunc(',')}`;
            if (t.fontFace) textLog += ` ${chProp('font')}${chPunc(':')} ${chStr('"' + t.fontFace + '"')}${chPunc(',')}`;
            if (t.fontSize) {
                textLog += ` ${chProp('height')}${chPunc(':')} ${chNum(t.fontSize[0])}${chPunc(',')}`;
                textLog += ` ${chProp('width')}${chPunc(':')} ${chNum(t.fontSize[1])}${chPunc(',')}`;
            }
            if (t.thickness !== undefined) textLog += ` ${chProp('thickness')}${chPunc(':')} ${chNum(t.thickness)}${chPunc(',')}`;
            if (t.bold) textLog += ` ${chProp('bold')}${chPunc(':')} ${chVar('true')}${chPunc(',')}`;
            if (t.italic) textLog += ` ${chProp('italic')}${chPunc(':')} ${chVar('true')}${chPunc(',')}`;
            if (t.justify) {
                const parts: string[] = [];
                if (t.justify.horizontal) parts.push(`${chProp('horizontal')}${chPunc(':')} ${chStr("'" + t.justify.horizontal + "'")}`);
                if (t.justify.vertical) parts.push(`${chProp('vertical')}${chPunc(':')} ${chStr("'" + t.justify.vertical + "'")}`);
                if (t.justify.mirror) parts.push(`${chProp('mirror')}${chPunc(':')} ${chVar('true')}`);
                if (parts.length > 0) textLog += ` ${chProp('justify')}${chPunc(':')} { ${parts.join(`${chPunc(',')}`)} }${chPunc(',')}`;
            }
            textLog = textLog.replace(/,$/, '');
            textLog += ` ${chPunc('})')}${chPunc(';')}`;
            console.log(textLog);
        });
        console.log(chalk.bold('----------------------------------------------------------'));
    } else {
        console.log(`No text elements found in ${sourceDescription} content.`);
    }
}

/**
 * Generate via code display from IR vias.
 */
export function generateViaCode(
    ir: KicadIR,
    sourceDescription: string,
    ch: ChalkHelpers = DEFAULT_CH
): void {
    const { chKey, chProp, chNum, chPunc, chVar } = ch;
    const vias = ir.vias;

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
            console.log(chalk.bold('-----------------------------------------------------'));
        }
    } else {
        console.log(`No vias found in ${sourceDescription} content.`);
    }
}

/**
 * Generate board outline code display from IR outlines.
 */
export function generateOutlineCode(
    ir: KicadIR,
    sourceDescription: string,
    ch: ChalkHelpers = DEFAULT_CH
): void {
    const { chKey, chNum, chPunc, chVar } = ch;
    const outlines = ir.outlines;

    if (outlines.length > 0) {
        console.log(
            `Found ${outlines.length} board outline element(s) on Edge.Cuts layer. Generating typeCAD code from ${sourceDescription}.`
        );
        const allOutlineLogs: string[] = [];

        const rectOutlines = outlines.filter(o => o.type === 'rect');
        const lineOutlines = outlines.filter(o => o.type === 'line');

        if (rectOutlines.length === 1) {
            const rect = rectOutlines[0];
            if (rect.start && rect.end && rect.width && rect.height) {
                const x = Math.min(rect.start.x, rect.end.x);
                const y = Math.min(rect.start.y, rect.end.y);
                let outlineLog = `${chVar('typecad')}${chPunc('.')}${chKey('outline')}${chPunc('(')}`;
                outlineLog += `${chNum(x)}${chPunc(',')} ${chNum(y)}${chPunc(',')} ${chNum(rect.width)}${chPunc(',')} ${chNum(rect.height)}`;
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
                            const ax = arc.start.x, ay = arc.start.y;
                            const bx = arc.mid.x, by = arc.mid.y;
                            const cx = arc.end.x, cy = arc.end.y;
                            const a = Math.sqrt((bx - cx) ** 2 + (by - cy) ** 2);
                            const b = Math.sqrt((ax - cx) ** 2 + (ay - cy) ** 2);
                            const c = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
                            const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
                            if (area > 0) return (a * b * c) / (4 * area);
                        }
                        return 0;
                    }).filter(r => r > 0);
                    if (radii.length > 0) {
                        filletRadius = Math.round(radii.reduce((a, b) => a + b, 0) / radii.length * 1000) / 1000;
                    }
                }

                let outlineLog = `${chVar('typecad')}${chPunc('.')}${chKey('outline')}${chPunc('(')}`;
                outlineLog += `${chNum(minX)}${chPunc(',')} ${chNum(minY)}${chPunc(',')} ${chNum(width)}${chPunc(',')} ${chNum(height)}`;
                if (filletRadius !== null && filletRadius > 0) outlineLog += `${chPunc(',')} ${chNum(filletRadius)}`;
                outlineLog += `${chPunc(')')}${chPunc(';')}`;
                allOutlineLogs.push(outlineLog);
            }
        } else {
            outlines.forEach((outline, index) => {
                let comment = `${chalk.gray('// Board outline element ' + (index + 1) + ': ')}`;
                switch (outline.type) {
                    case 'rect':
                        if (outline.start && outline.end) {
                            comment += chalk.gray(
                                `Rectangle from (${outline.start.x}, ${outline.start.y}) to (${outline.end.x}, ${outline.end.y})`
                            );
                        }
                        break;
                    case 'line':
                        if (outline.start && outline.end) {
                            comment += chalk.gray(
                                `Line from (${outline.start.x}, ${outline.start.y}) to (${outline.end.x}, ${outline.end.y})`
                            );
                        }
                        break;
                    case 'arc':
                        if (outline.start && outline.end) {
                            comment += chalk.gray(
                                `Arc from (${outline.start.x}, ${outline.start.y}) to (${outline.end.x}, ${outline.end.y})`
                            );
                        }
                        break;
                    case 'circle':
                        if (outline.center && outline.end) {
                            const radius = Math.sqrt(
                                (outline.end.x - outline.center.x) ** 2 + (outline.end.y - outline.center.y) ** 2
                            );
                            comment += chalk.gray(
                                `Circle at (${outline.center.x}, ${outline.center.y}) with radius ${radius.toFixed(3)}`
                            );
                        }
                        break;
                }
                allOutlineLogs.push(comment);
            });
            allOutlineLogs.push(
                chalk.yellow(
                    '// Note: Complex board outlines with multiple elements or curves may need manual conversion to TypeCAD'
                )
            );
        }

        if (allOutlineLogs.length > 0) {
            console.log(chalk.bold(`\n--- Generated typeCAD Board Outline Code from ${sourceDescription} ---`));
            allOutlineLogs.forEach(log => console.log(log));
            console.log(chalk.bold('---------------------------------------------------------------'));
        }
    } else {
        console.log(`No board outline found in ${sourceDescription} content (looking for Edge.Cuts layer).`);
    }
}

/**
 * Generate the `typecad.create(...)` statement that assembles all components and tracks.
 */
export function generateCreateStatement(
    footprints: KicadFootprintIR[],
    trackVariableNames: string[],
    sourceDescription: string,
    ch: ChalkHelpers = DEFAULT_CH
): void {
    const { chKey, chPunc, chVar } = ch;
    const componentReferences = footprints.map(fp => fp.reference);

    if (componentReferences.length > 0 || trackVariableNames.length > 0) {
        console.log(chalk.bold(`\n--- Generated typecad.create() Statement from ${sourceDescription} ---`));
        let createStatement = `${chVar('typecad')}${chPunc('.')}${chKey('create')}${chPunc('(')}`;
        const allItems: string[] = [
            ...componentReferences.map(ref => `${chVar(ref)}`),
            ...trackVariableNames.map(trackVar => `${chPunc('...')}${chVar(trackVar)}`),
        ];
        if (allItems.length > 0) {
            createStatement += '\n';
            allItems.forEach((item, index) => {
                createStatement += `    ${item}`;
                createStatement += index < allItems.length - 1 ? `${chPunc(',')}\n` : '\n';
            });
        }
        createStatement += `${chPunc(')')}${chPunc(';')}`;
        console.log(createStatement);
        console.log(chalk.bold('--------------------------------------------------------------'));
    }
}

// === Utility helpers ===

function formatPosObj(
    pos: { x: number; y: number; rotation: number; thickness: number; width: number; height: number },
    chProp: (s: string) => string,
    chPunc: (s: string) => string,
    chNum: (n: number) => string
): string {
    return `{ ${chProp('x')}${chPunc(':')} ${chNum(pos.x)}${chPunc(',')} ${chProp('y')}${chPunc(':')} ${chNum(pos.y)}${chPunc(',')} ${chProp('rotation')}${chPunc(':')} ${chNum(pos.rotation)}${chPunc(',')} ${chProp('thickness')}${chPunc(':')} ${chNum(pos.thickness)}${chPunc(',')} ${chProp('width')}${chPunc(':')} ${chNum(pos.width)}${chPunc(',')} ${chProp('height')}${chPunc(':')} ${chNum(pos.height)} }`;
}

function sanitizeNetNameForVariable(netName: string): string {
    // Strip quotes and replace non-alphanumeric chars with underscores
    return netName
        .replace(/[`'"]/g, '')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '');
}
