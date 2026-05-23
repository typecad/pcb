import * as fs from 'fs/promises';
import { pathExists } from './fs.js';
import {
    svgToPng,
    svgToPngBuffer,
    writeBufferToFile
} from './svg.js';
import { PCBConfig, SVGConfig, CacheConfig } from './config.js';

interface Layer {
    name: string;
    type: string;
    color?: string;
    thickness?: number;
    material?: string;
    epsilon_r?: number;
    loss_tangent?: number;
}

interface Stackup {
    layers: Layer[];
    copperFinish: string;
    dielectricConstraints: boolean;
}

interface CacheEntry {
    content?: string;
    stackup?: Stackup;
    parsedExpr?: SExpr[];
    timestamp: number;
}

const pcbCache = new Map<string, CacheEntry>();

type SExpr = string | SExpr[];

function isStringSExpr(expr: SExpr): expr is string {
    return typeof expr === 'string';
}

function isArraySExpr(expr: SExpr): expr is SExpr[] {
    return Array.isArray(expr);
}

function getSExprString(expr: SExpr): string {
    return isStringSExpr(expr) ? expr : '';
}

function parseSExpression(expr: string): SExpr {
    const quotedStrings: string[] = [];
    const exprWithPlaceholders = expr.replace(/"([^"]*)"/g, (match, content) => {
        quotedStrings.push(content);
        return `"${quotedStrings.length - 1}"`;
    });

    const tokens = exprWithPlaceholders.match(/\(|\)|[^()\s]+/g) || [];
    const stack: SExpr[][] = [];
    let depth = 0;

    for (const token of tokens) {
        if (token === '(') {
            stack.push([]);
            depth++;
        } else if (token === ')') {
            depth--;
            if (depth < 0) {
                throw new Error('Unexpected closing parenthesis in S-expression');
            }
            const top = stack.pop();
            if (stack.length > 0) {
                stack[stack.length - 1].push(top!);
            } else {
                return top!;
            }
        } else {
            const match = token.match(/^"(\d+)"$/);
            if (match) {
                const index = parseInt(match[1]);
                if (index >= quotedStrings.length) {
                    throw new Error(`Invalid string placeholder index ${index} in S-expression`);
                }
                if (stack.length > 0) {
                    stack[stack.length - 1].push(quotedStrings[index]);
                }
            } else {
                if (stack.length > 0) {
                    stack[stack.length - 1].push(token);
                }
            }
        }
    }

    if (depth > 0) {
        throw new Error(`Unterminated parenthesis in S-expression (${depth} unclosed)`);
    }

    return stack[0];
}

function cleanupCache() {
    const now = Date.now();
    for (const [key, value] of pcbCache.entries()) {
        if (value.timestamp && now - value.timestamp > CacheConfig.ttl) {
            pcbCache.delete(key);
        }
    }

    if (pcbCache.size > CacheConfig.maxSize) {
        const entries = Array.from(pcbCache.entries())
            .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

        while (pcbCache.size > CacheConfig.maxSize) {
            const [key] = entries.pop()!;
            pcbCache.delete(key);
        }
    }
}

async function getPCBContent(pcbFilePath: string): Promise<string> {
    cleanupCache();

    const cache = pcbCache.get(pcbFilePath);
    if (cache?.content) return cache.content;

    const content = await fs.readFile(pcbFilePath, 'utf-8');
    const existing = pcbCache.get(pcbFilePath);
    pcbCache.set(pcbFilePath, {
        ...existing,
        content,
        timestamp: Date.now()
    });
    return content;
}

interface Result<T, E = Error> {
    success: boolean;
    data?: T;
    error?: E;
}

export async function extractStackup(pcbFilePath: string, forceReparse: boolean = false): Promise<Result<Stackup>> {
    try {
        if (!forceReparse && pcbCache.has(pcbFilePath)) {
            const cached = pcbCache.get(pcbFilePath)!;
            if (cached.stackup) {
                return { success: true, data: cached.stackup };
            }
        }

        const pcbContent = await getPCBContent(pcbFilePath);
        const parsed = parseSExpression(pcbContent);

        let stackupNode: SExpr[] | undefined;

        function findStackup(node: SExpr): SExpr[] | undefined {
            if (isArraySExpr(node) && node[0] === 'stackup') {
                return node;
            }
            if (isArraySExpr(node)) {
                for (const child of node) {
                    const found = findStackup(child);
                    if (found) return found;
                }
            }
            return undefined;
        }

        stackupNode = isArraySExpr(parsed) ? parsed.find((node): node is SExpr[] =>
            isArraySExpr(node) && node[0] === 'stackup'
        ) : undefined;

        if (!stackupNode) {
            stackupNode = findStackup(parsed);
        }

        if (!stackupNode) {
            throw new Error('No stackup information found in PCB file');
        }

        const layers: Layer[] = [];
        let copperFinish = '';
        let dielectricConstraints = false;

        for (const node of stackupNode.slice(1)) {
            if (node[0] === 'layer') {
                const layerName = isStringSExpr(node[1]) ? node[1].replace(/"/g, '') : '';
                let layerType: string;

                layerType = isArraySExpr(node[2]) ?
                    node[2].slice(1).map(getSExprString).join(' ').replace(/"/g, '') :
                    getSExprString(node[2]).replace(/"/g, '');

                if (layerName.startsWith('dielectric')) {
                    layerType = 'dielectric';
                }

                const layer: Layer = {
                    name: layerName,
                    type: layerType
                };

                for (let i = 3; i < node.length; i++) {
                    const property = node[i];
                    if (Array.isArray(property)) {
                        const key = getSExprString(property[0]).toLowerCase();
                        const value = property.slice(1).map(getSExprString).join(' ').replace(/"/g, '');

                        switch (key) {
                            case 'color':
                                layer.color = value;
                                break;
                            case 'thickness':
                                layer.thickness = parseFloat(value);
                                break;
                            case 'material':
                                layer.material = value;
                                break;
                            case 'epsilon_r':
                                layer.epsilon_r = parseFloat(value);
                                break;
                            case 'loss_tangent':
                                layer.loss_tangent = parseFloat(value);
                                break;
                        }
                    }
                }

                layers.push(layer);
            } else if (node[0] === 'copper_finish') {
                copperFinish = isStringSExpr(node[1]) ? node[1].replace(/"/g, '') : '';
            } else if (node[0] === 'dielectric_constraints') {
                dielectricConstraints = node[1] === 'yes';
            }
        }

        const stackup = { layers, copperFinish, dielectricConstraints };

        const existing = pcbCache.get(pcbFilePath);
        pcbCache.set(pcbFilePath, {
            ...existing,
            stackup,
            timestamp: Date.now()
        });

        return { success: true, data: stackup };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error : new Error('Unknown error')
        };
    }
}

function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function generateStackupSVG(stackup: Stackup, darkMode: boolean = false): string {

    function getLayerColor(layer: Layer): string {
        const type = layer.type.toLowerCase();
        const material = layer.material?.toLowerCase() || '';

        if (layer.color) {
            if (type.includes('silk s') || type.includes('mask')) {
                return layer.color;
            }
        }

        if (type.includes('silk s')) {
            return darkMode ? '#333333' : PCBConfig.colors.silkscreen;
        } else if (type.includes('paste')) {
            return darkMode ? '#444444' : '#f0f0f0';
        } else if (type.includes('mask')) {
            return darkMode ? '#005533' : PCBConfig.colors.solderMask;
        } else if (type.includes('copper')) {
            return darkMode ? '#cc6600' : PCBConfig.colors.copper;
        } else if (material.includes('fr4')) {
            return darkMode ? '#4a4a3a' : PCBConfig.colors.fr4;
        } else if (material.includes('ptfe')) {
            return darkMode ? '#a0a0a0' : PCBConfig.colors.ptfe;
        } else if (material.includes('polyimide')) {
            return darkMode ? '#8b5a00' : PCBConfig.colors.polyimide;
        } else if (material.includes('phenolic')) {
            return darkMode ? '#3a0a04' : PCBConfig.colors.phenolic;
        } else if (material.includes('aluminum')) {
            return darkMode ? '#a0a0a0' : PCBConfig.colors.aluminum;
        }
        return darkMode ? '#505050' : PCBConfig.colors.default;
    }

    function getLayerHeight(layer: Layer): number {
        const type = layer.type.toLowerCase();
        if (type.includes('silk s')) {
            return PCBConfig.layerHeights.silkscreen;
        } else if (type.includes('paste')) {
            return PCBConfig.layerHeights.paste;
        } else if (type.includes('mask')) {
            return PCBConfig.layerHeights.mask;
        } else if (type.includes('copper')) {
            return PCBConfig.layerHeights.copper;
        } else if (type.includes('core')) {
            return PCBConfig.layerHeights.core;
        } else if (type.includes('prepreg')) {
            return PCBConfig.layerHeights.prepreg;
        }
        return PCBConfig.layerHeights.default;
    }

    const padding = 10;
    const layerWidth = 200;
    const labelOffset = 140;
    const xOffset = labelOffset + 10;
    const yOffset = padding + 20;

    const rightTextOffset = 40;
    const maxRightTextWidth = 240;

    const totalWidth = padding * 2 + labelOffset + layerWidth + rightTextOffset + maxRightTextWidth;

    let currentY = yOffset;
    const layers = stackup.layers;
    const layerSpacing = 16;

    layers.forEach(layer => {
        const layerHeight = getLayerHeight(layer);
        currentY += layerHeight + layerSpacing;
    });

    const totalHeight = currentY + padding + 45;

    const bgColor = darkMode ? '#121212' : 'white';
    const textColor = darkMode ? '#e0e0e0' : '#000000';
    const connectorColor = darkMode ? '#888888' : '#666666';
    const dotColor = darkMode ? '#888888' : '#666666';
    const borderColor = darkMode ? '#444444' : 'black';

    let svg = `
    <svg width="${totalWidth}" height="${totalHeight}"
         viewBox="0 0 ${totalWidth} ${totalHeight}"
         preserveAspectRatio="xMidYMid meet"
         xmlns="http://www.w3.org/2000/svg">
        <style>
            .layer-text { font-family: Arial; font-size: 14px; fill: ${textColor}; }
            .title { font-family: Arial; font-size: 18px; font-weight: bold; fill: ${textColor}; }
            .connector-line { stroke: ${connectorColor}; stroke-width: 1; }
        </style>
        <text x="${totalWidth/2}" y="${padding + 10}" class="title" text-anchor="middle">PCB Layer Stackup</text>`;

    currentY = yOffset;

    layers.forEach((layer, index) => {
        const layerHeight = getLayerHeight(layer);
        const color = getLayerColor(layer);
        const centerY = currentY + layerHeight/2;

        svg += `
        <text x="${labelOffset}" y="${centerY + 5}" class="layer-text" text-anchor="end">
            ${escapeXml(layer.type)}
        </text>
        <line
            x1="${labelOffset + 5}"
            y1="${centerY}"
            x2="${xOffset - 5}"
            y2="${centerY}"
            class="connector-line"
        />
        <circle cx="${labelOffset + 5}" cy="${centerY}" r="1.5" fill="${dotColor}"/>
        <circle cx="${xOffset - 5}" cy="${centerY}" r="1.5" fill="${dotColor}"/>`;

        svg += `
        <rect x="${xOffset}" y="${currentY}" width="${layerWidth}" height="${layerHeight}"
              fill="${color}" stroke="${borderColor}" stroke-width="0.5"/>`;

        const properties: string[] = [];
        if (layer.material) properties.push(layer.material);
        if (layer.type.toLowerCase().includes('copper')) properties.push('Cu 18um + plating');
        if (layer.thickness) properties.push(`${layer.thickness}mm`);

        if (layer.type.toLowerCase().includes('mask') && layer.color) {
            const colorInfo = `${layer.color} ${layer.material || ''} - ${layer.thickness}mm`;
            properties.length = 0;
            properties.push(colorInfo);
        }

        if (layer.type.toLowerCase().includes('silk') && layer.color) {
            const colorInfo = `${layer.color} ${layer.material || ''}${layer.thickness ? ` - ${layer.thickness}mm` : ''}`;
            properties.length = 0;
            properties.push(colorInfo);
        }

        if (properties.length > 0) {
            svg += `
            <text x="${xOffset + layerWidth + rightTextOffset}" y="${centerY + 5}" class="layer-text">
                ${escapeXml(properties.join(' - '))}
            </text>
            <line
                x1="${xOffset + layerWidth + 5}"
                y1="${centerY}"
                x2="${xOffset + layerWidth + rightTextOffset - 5}"
                y2="${centerY}"
                class="connector-line"
            />
            <circle cx="${xOffset + layerWidth + 5}" cy="${centerY}" r="1.5" fill="${dotColor}"/>
            <circle cx="${xOffset + layerWidth + rightTextOffset - 5}" cy="${centerY}" r="1.5" fill="${dotColor}"/>`;
        }

        currentY += layerHeight + layerSpacing;
    });

    const totalThickness = stackup.layers
        .reduce((sum, layer) => sum + (layer.thickness || 0), 0);

    svg += `
        <text x="${totalWidth/2}" y="${currentY + 5}" class="layer-text" text-anchor="middle">
            Finished PCB thickness: ${totalThickness.toFixed(2)}mm ±10%
        </text>
        <text x="${totalWidth/2}" y="${currentY + 25}" class="layer-text" text-anchor="middle">
            Copper finish: ${escapeXml(stackup.copperFinish || 'Copper finish unspecified')}
        </text>
        <text x="${totalWidth/2}" y="${currentY + 45}" class="layer-text" text-anchor="middle">
            Impedance Controlled: ${stackup.dielectricConstraints === true ? 'yes' : stackup.dielectricConstraints === false ? 'no' : '-'}
        </text>
    </svg>`;

    return svg;
}

export async function renderPCBLayers(pcbFilePath: string, outputPath: string, darkMode: boolean = false): Promise<string> {
    const stackup = await extractStackup(pcbFilePath);
    if (!stackup.success || !stackup.data) {
        console.error('⚠️ No stackup information found in PCB file, skipping stackup image');
        return outputPath;
    }
    const svgContent = generateStackupSVG(stackup.data, darkMode);

    return await svgToPng(svgContent, outputPath, {
        width: SVGConfig.defaultWidth,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
    });
}

export async function generateStackupSvgFromFile(pcbFilePath: string, darkMode: boolean = false): Promise<string> {
    const stackup = await extractStackup(pcbFilePath);
    if (!stackup.success || !stackup.data) {
        throw stackup.error || new Error('No stackup data found in PCB file');
    }

    return generateStackupSVG(stackup.data, darkMode);
}

export async function generateStackupFiles(
    pcbFilePath: string,
    svgOutputPath?: string,
    pngOutputPath?: string
): Promise<{svgPath?: string, pngPath?: string}> {
    const svgContent = await generateStackupSvgFromFile(pcbFilePath);
    const result: {svgPath?: string, pngPath?: string} = {};

    const tasks: Promise<void>[] = [];

    if (svgOutputPath) {
        tasks.push(
            writeBufferToFile(Buffer.from(svgContent), svgOutputPath)
                .then(path => { result.svgPath = path; })
        );
    }

    if (pngOutputPath) {
        tasks.push(
            svgToPng(svgContent, pngOutputPath, {
                width: 3000,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }).then(path => { result.pngPath = path; })
        );
    }

    await Promise.all(tasks);

    return result;
}
