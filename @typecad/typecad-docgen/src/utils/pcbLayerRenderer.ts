import * as fs from 'fs';
import { promisify } from 'util';
import { DOMParser } from '@xmldom/xmldom';
import { 
    svgToPng,
    svgToPngBuffer, 
    writeBufferToFile
} from './svg.js';
import { PCBConfig, SVGConfig, CacheConfig } from './config.js';

// Convert callback-based fs functions to promise-based
const readFileAsync = promisify(fs.readFile);

async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.stat(filePath);
        return true;
    } catch {
        return false;
    }
}

// Define interfaces for stackup data
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

// Use a single cache object
interface CacheEntry {
    content?: string;
    stackup?: Stackup;
    parsedExpr?: any;
    timestamp: number;
}

const pcbCache = new Map<string, CacheEntry>();

// Add proper types for S-expression parsing
type SExpr = string | SExpr[];

/**
 * Basic S-expression parser
 */
function parseSExpression(expr: string): SExpr {
    const quotedStrings: string[] = [];
    const exprWithPlaceholders = expr.replace(/"([^"]*)"/g, (match, content) => {
        quotedStrings.push(content);
        return `"${quotedStrings.length - 1}"`;
    });

    const tokens = exprWithPlaceholders.match(/\(|\)|[^()\s]+/g) || [];
    const stack: any[] = [];
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
                stack[stack.length - 1].push(top);
            } else {
                return top;
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

// Add cache management
function cleanupCache() {
    const now = Date.now();
    for (const [key, value] of pcbCache.entries()) {
        if (value.timestamp && now - value.timestamp > CacheConfig.ttl) {
            pcbCache.delete(key);
        }
    }
    
    // If still over max size, remove oldest entries
    if (pcbCache.size > CacheConfig.maxSize) {
        const entries = Array.from(pcbCache.entries())
            .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
        
        while (pcbCache.size > CacheConfig.maxSize) {
            const [key] = entries.pop()!;
            pcbCache.delete(key);
        }
    }
}

// Update cache access with timestamps
async function getPCBContent(pcbFilePath: string): Promise<string> {
    cleanupCache();
    
    const cache = pcbCache.get(pcbFilePath);
    if (cache?.content) return cache.content;

    const content = await readFileAsync(pcbFilePath, 'utf-8');
    pcbCache.set(pcbFilePath, { 
        content, 
        timestamp: Date.now() 
    });
    return content;
}

// Add proper error types
interface Result<T, E = Error> {
    success: boolean;
    data?: T;
    error?: E;
}

function isStringSExpr(expr: SExpr): expr is string {
    return typeof expr === 'string';
}

function isArraySExpr(expr: SExpr): expr is SExpr[] {
    return Array.isArray(expr);
}

function getSExprString(expr: SExpr): string {
    return isStringSExpr(expr) ? expr : '';
}

/**
 * Extracts stackup information from PCB file content asynchronously
 * @param pcbFilePath Path to the PCB file
 * @param forceReparse Whether to force re-parsing even if in cache
 * @returns Promise resolving to Stackup data structure
 */
export async function extractStackup(pcbFilePath: string, forceReparse: boolean = false): Promise<Result<Stackup>> {
    try {
        // Check if already in cache
        if (!forceReparse && pcbCache.has(pcbFilePath)) {
            return { success: true, data: pcbCache.get(pcbFilePath)!.stackup! };
        }
        
        const pcbContent = await getPCBContent(pcbFilePath);
        const parsed = parseSExpression(pcbContent);
        
        let stackupNode: SExpr[] | undefined;
        
        // Search for stackup node using depth-first search
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
        
        // First try direct search
        stackupNode = isArraySExpr(parsed) ? parsed.find((node): node is SExpr[] => 
            isArraySExpr(node) && node[0] === 'stackup'
        ) : undefined;
        
        // If not found, try searching in nested structures
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
                const layerName = isStringSExpr(node[1]) ? node[1].replace(/"/g, '') : ''; // Remove quotes from name
                let layerType: string;

                // Extract type for all layers
                layerType = isArraySExpr(node[2]) ? 
                    // If it's an array (e.g. ["type", "Top Silk Screen"]), take everything after "type"
                    node[2].slice(1).map(getSExprString).join(' ').replace(/"/g, '') : 
                    // If it's a single string, just use it as is
                    getSExprString(node[2]).replace(/"/g, '');

                // For dielectric layers, prepend "dielectric"
                if (layerName.startsWith('dielectric')) {
                    layerType = 'dielectric';
                }

                const layer: Layer = {
                    name: layerName,
                    type: layerType
                };
                
                // Extract additional properties
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
        
        // Store in cache for future use
        pcbCache.set(pcbFilePath, { 
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

/**
 * Generates SVG representation of PCB stackup
 * @param stackup Stackup data
 * @param darkMode Whether to use dark mode colors
 * @returns SVG string
 */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function generateStackupSVG(stackup: Stackup, darkMode: boolean = false): string {
    
    // Helper function to get layer color based on type and material
    function getLayerColor(layer: Layer): string {
        const type = layer.type.toLowerCase();
        const material = layer.material?.toLowerCase() || '';
        
        // Use the actual color property if available for silkscreen and mask layers
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

    // Helper function to get layer height based on type and thickness
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

    // Constants for layout
    const padding = 10;
    const layerWidth = 200;
    const labelOffset = 140;
    const xOffset = labelOffset + 10;
    const yOffset = padding + 20;

    // Increase right-side padding
    const rightTextOffset = 40; // Increased from 10 to 20
    const maxRightTextWidth = 240; // Increased from 180 to 200

    // Calculate total width needed
    const totalWidth = padding * 2 + labelOffset + layerWidth + rightTextOffset + maxRightTextWidth;

    // Calculate total height based on layers
    let currentY = yOffset;
    const layers = stackup.layers;
    const layerSpacing = 16; // Increased from 8px to 16px
    
    // First pass to calculate total height
    layers.forEach(layer => {
        const layerHeight = getLayerHeight(layer);
        currentY += layerHeight + layerSpacing; // Use increased spacing
    });

    // Add space for title and bottom text (thickness, copper finish, and impedance control)
    const totalHeight = currentY + padding + 45; // Increased from 20 to 65 to accommodate all text

    // Set colors based on dark mode
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
        <!-- Background rectangle removed to make it transparent -->
        <text x="${totalWidth/2}" y="${padding + 10}" class="title" text-anchor="middle">PCB Layer Stackup</text>`;

    // Reset currentY for actual drawing
    currentY = yOffset;
    
    // Draw each layer
    layers.forEach((layer, index) => {
        const layerHeight = getLayerHeight(layer);
        const color = getLayerColor(layer);
        const centerY = currentY + layerHeight/2;
        
        // Layer type on the left with connector line
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

        // Layer rectangle
        svg += `
        <rect x="${xOffset}" y="${currentY}" width="${layerWidth}" height="${layerHeight}" 
              fill="${color}" stroke="${borderColor}" stroke-width="0.5"/>`;

        // Layer properties on the right
        const properties: string[] = [];
        if (layer.material) properties.push(layer.material);
        if (layer.type.toLowerCase().includes('copper')) properties.push('Cu 18um + plating');
        if (layer.thickness) properties.push(`${layer.thickness}mm`);
        
        // Add color information for mask layers
        if (layer.type.toLowerCase().includes('mask') && layer.color) {
            // Format: "Green Epoxy - 0.01mm"
            const colorInfo = `${layer.color} ${layer.material || ''} - ${layer.thickness}mm`;
            // Replace the existing properties with the formatted color info
            properties.length = 0; // Clear existing properties
            properties.push(colorInfo);
        }
        
        // Add color information for silkscreen layers
        if (layer.type.toLowerCase().includes('silk') && layer.color) {
            // Format: "White Epoxy - 0.01mm"
            const colorInfo = `${layer.color} ${layer.material || ''}${layer.thickness ? ` - ${layer.thickness}mm` : ''}`;
            // Replace the existing properties with the formatted color info
            properties.length = 0; // Clear existing properties
            properties.push(colorInfo);
        }

        // Material/type text with connector line
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

        currentY += layerHeight + layerSpacing; // Use increased spacing
    });

    // Add total thickness at the bottom with less padding
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

/**
 * Renders PCB stackup to PNG
 * @param pcbFilePath Path to PCB file
 * @param outputPath Output path for PNG image
 * @param darkMode Whether to use dark mode colors
 * @returns Output path
 */
export async function renderPCBLayers(pcbFilePath: string, outputPath: string, darkMode: boolean = false): Promise<string> {
    try {
        const stackup = await extractStackup(pcbFilePath);
        if (!stackup.success || !stackup.data) {
            throw stackup.error || new Error('No stackup data found in PCB file');
        }
        const svgContent = generateStackupSVG(stackup.data, darkMode);
        
        return await svgToPng(svgContent, outputPath, {
            width: SVGConfig.defaultWidth,
            background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
        });
    } catch (error) {
        console.error('❌ Failed to generate PCB layer stackup. Please check your PCB file format:', error);
        return outputPath;
    }
}

/**
 * Generate and return a stackup diagram directly from a PCB file
 * @param pcbFilePath Path to PCB file
 * @param darkMode Whether to use dark mode colors
 * @returns Promise resolving to SVG content as string (no file I/O)
 */
export async function generateStackupSvgFromFile(pcbFilePath: string, darkMode: boolean = false): Promise<string> {
    try {
        // Get stackup data from cache or parse PCB file
        const stackup = await extractStackup(pcbFilePath);
        if (!stackup.success || !stackup.data) {
            throw stackup.error || new Error('No stackup data found in PCB file');
        }

        // Return SVG content directly - no file I/O
        return generateStackupSVG(stackup.data, darkMode);
    } catch (error) {
        console.error('❌ Failed to create stackup visualization. Please verify your PCB file:', error);
        return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100">
            <text x="10" y="50" fill="red">Error generating stackup</text>
        </svg>`;
    }
}

/**
 * Generate stackup diagram SVG and PNG in a single operation
 * @param pcbFilePath Path to PCB file
 * @param svgOutputPath Output path for SVG (optional)
 * @param pngOutputPath Output path for PNG (optional)
 * @returns Promise resolving to object with paths to generated files
 */
export async function generateStackupFiles(
    pcbFilePath: string, 
    svgOutputPath?: string, 
    pngOutputPath?: string
): Promise<{svgPath?: string, pngPath?: string}> {
    try {
        // Generate SVG content in memory
        const svgContent = await generateStackupSvgFromFile(pcbFilePath);
        const result: {svgPath?: string, pngPath?: string} = {};
        
        // Create parallel tasks for writing files
        const tasks: Promise<any>[] = [];
        
        // Write SVG if requested
        if (svgOutputPath) {
            tasks.push(
                writeBufferToFile(Buffer.from(svgContent), svgOutputPath)
                    .then(path => { result.svgPath = path; })
            );
        }
        
        // Generate PNG if requested
        if (pngOutputPath) {
            tasks.push(
                svgToPng(svgContent, pngOutputPath, {
                    width: 3000,
                    background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
                }).then(path => { result.pngPath = path; })
            );
        }
        
        // Wait for all file operations to complete
        await Promise.all(tasks);
        
        return result;
    } catch (error) {
        console.error('❌ Could not save stackup files. Please check your write permissions:', error);
        return {};
    }
}