import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import sharp from 'sharp';
import { exec } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { promisify } from 'node:util';
import * as fs from 'fs';
import * as path from 'path';
import { tempManager } from './tempFileManager.js';

// Convert Node.js callback-based APIs to Promise-based
const execAsync = promisify(exec);
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);
const existsAsync = promisify(fs.exists);

/**
 * SVG manipulation and conversion utilities
 */

/**
 * Resizes an SVG string by modifying its dimensions
 * @param svgContent SVG content as string
 * @param width Target width in pixels
 * @returns Modified SVG content as string
 */
function calculateNewDimensions(viewBox: string, targetWidth: number) {
    const [minX, minY, vbWidth, vbHeight] = viewBox.split(' ').map(parseFloat);
    const aspectRatio = vbHeight / vbWidth;
    return {
        width: targetWidth,
        height: Math.round(targetWidth * aspectRatio)
    };
}

export function resizeSvg(svgContent: string, width: number = 5000): string {
    const svgDoc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
    if (!svgDoc.documentElement) return svgContent;

    const viewBox = svgDoc.documentElement.getAttribute('viewBox');
    if (!viewBox) return svgContent;

    const { width: newWidth, height: newHeight } = calculateNewDimensions(viewBox, width);
    svgDoc.documentElement.setAttribute('width', newWidth.toString());
    svgDoc.documentElement.setAttribute('height', newHeight.toString());

    return new XMLSerializer().serializeToString(svgDoc);
}

/**
 * Combines multiple SVG strings into a single SVG
 * @param svgContents Array of SVG content strings
 * @returns Combined SVG as string
 */
export function combineSvgLayers(svgContents: string[]): string {
    try {
        if (svgContents.length === 0) {
            return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
        }

        // Create SVG DOM documents from the content
        const svgDocs = svgContents.map(content =>
            new DOMParser().parseFromString(content, 'image/svg+xml')
        );

        // Create new SVG document
        const document = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'image/svg+xml');
        const rootSvg = document.documentElement;

        // Copy attributes from the first SVG
        if (rootSvg && svgDocs.length > 0) {
            const firstSvg = svgDocs[0].documentElement;
            if (firstSvg) {
                // Set viewBox and dimensions in one operation
                const viewBox = firstSvg.getAttribute('viewBox') || '0 0 5000 5000';
                rootSvg.setAttribute('viewBox', viewBox);
                rootSvg.setAttribute('width', '5000');

                // Calculate height based on viewBox aspect ratio
                const [, , vbWidth, vbHeight] = viewBox.split(' ').map(parseFloat);
                rootSvg.setAttribute('height', Math.round(5000 * (vbHeight / vbWidth)).toString());
            }
        }

        // Append layers in order
        const fragment = document.createDocumentFragment();
        svgDocs.forEach((svgDoc) => {
            if (svgDoc.documentElement) {
                const children = svgDoc.documentElement.childNodes;
                for (let i = 0; i < children.length; i++) {
                    const node = children.item(i);
                    if (node && node.nodeType === 1) { // Element node
                        fragment.appendChild(document.importNode(node, true));
                    }
                }
            }
        });

        if (rootSvg) {
            rootSvg.appendChild(fragment);
        }

        // Serialize to SVG string
        const serializer = new XMLSerializer();
        return serializer.serializeToString(document);
    } catch (error) {
        console.error('❌ Failed to combine PCB layers. Please check layer compatibility:', error);
        return '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20" fill="red">Error combining layers</text></svg>';
    }
}

/**
 * Converts SVG string to PNG buffer directly in memory, trimming whitespace.
 * @param svgContent SVG content as string
 * @param options Sharp conversion options
 * @returns Promise resolving to PNG buffer
 */
export async function svgToPngBuffer(svgContent: string, options: {width?: number; trim?: boolean; background?: sharp.Color;} = {}): Promise<Buffer> {
    const svgDoc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
    if (!svgDoc.documentElement) {
        throw new Error('Failed to parse SVG content');
    }

    const currentViewBox = svgDoc.documentElement.getAttribute('viewBox');
    if (!currentViewBox) return Buffer.from(svgContent);

    const [minX, minY, vbWidth, vbHeight] = currentViewBox.split(' ').map(parseFloat);
    const aspectRatio = vbHeight / vbWidth;
    const targetWidth = options.width || 5000;
    const targetHeight = Math.round(targetWidth * aspectRatio);

    let sharpInstance = sharp(Buffer.from(svgContent)).resize({
        width: targetWidth,
        height: targetHeight,
        fit: 'inside', // Changed from 'fill' to 'inside' to preserve aspect ratio
        background: options.background || { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent background
        kernel: sharp.kernel.lanczos3,
    });

    if (options.trim) {
        sharpInstance = sharpInstance.trim({
            threshold: 5, // Adjust threshold as needed
            background: { r: 255, g: 255, b: 255, alpha: 0 }
        });
    }

    return await sharpInstance
        .png({ quality: 10, compressionLevel: 9 })
        .withMetadata({ density: 600 })
        .toBuffer();
}

/**
 * Writes a buffer to a file, ensuring the output directory exists
 * @param buffer Data buffer
 * @param outputPath Output file path
 * @returns Promise resolving to the output path
 */
export async function writeBufferToFile(buffer: Buffer, outputPath: string): Promise<string> {
    const outputDir = path.dirname(outputPath);

    // Check if directory exists - use async exists
    const dirExists = await existsAsync(outputDir);
    if (!dirExists) {
        await mkdirAsync(outputDir, { recursive: true });
    }

    // Write file asynchronously
    await writeFileAsync(outputPath, buffer);
    return outputPath;
}

/**
 * Executes KiCad CLI command to export layers and returns SVG content directly
 * @param kicadCliPath Path to KiCad CLI executable
 * @param pcbFilePath Path to PCB file
 * @param layer Layer name to export
 * @param theme KiCad theme to use
 * @returns Promise resolving to SVG content as string
 */
export async function executeKicadSvgExport(
    kicadCliPath: string,
    pcbFilePath: string,
    layer: string,
    theme: string
): Promise<string> {
    try {
        const tempSvgPath = tempManager.createTempFilePath('.svg');
        let bMirror = false;
        if (layer.includes('B.')) {
            bMirror = true;
        }
        await execAsync(
            `"${kicadCliPath}" pcb export svg --theme "${theme}" ${bMirror ? '--mirror' : ''} --drill-shape-opt 0 --cdnp --exclude-drawing-sheet --page-size-mode 2 --layers "${layer}" --output "${tempSvgPath}" ${pcbFilePath}`
        );

        // Read the content immediately and delete the temp file
        const svgContent = await readFileAsync(tempSvgPath, 'utf-8');
        await tempManager.cleanupFileAsync(tempSvgPath);

        return svgContent;

    } catch (error) {
        console.error(`❌ Could not export layer '${layer}'. Please verify the layer exists:`, error);
        return '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20" fill="red">Error exporting layer</text></svg>';
    }
}

/**
 * Exports drill layer from KiCad PCB and returns SVG content
 * @param kicadCliPath Path to KiCad CLI executable
 * @param pcbFilePath Path to PCB file
 * @param theme KiCad theme to use
 * @returns Promise resolving to SVG content as string
 */
export async function executeKicadDrillExport(
    kicadCliPath: string,
    pcbFilePath: string,
    theme: string
): Promise<string> {
    try {
        // Create a temporary directory for the output
        const tempDir = tempManager.createTempDir('drill-export');
        
        // Get the PCB filename without extension and path
        const pcbFileName = path.basename(pcbFilePath, path.extname(pcbFilePath));
        
        // Determine output directory based on whether the output path contains a directory
        const outputDir = path.dirname(pcbFilePath);
        const outputArg = outputDir === '.' ? '' : `--output "${outputDir}/"`;
        
        await execAsync(
            `"${kicadCliPath}" pcb export drill --generate-map --map-format svg ${outputArg} ${pcbFilePath}`
        );

        // The SVG file will be named <pcbFileName>-drl_map.svg
        const svgPath = path.join(outputDir, `${pcbFileName}-drl_map.svg`);
        
        // Read the SVG content
        const svgContent = await readFileAsync(svgPath, 'utf-8');
        
        // Clean up the temporary .drl file
        const drlPath = path.join(outputDir, `${pcbFileName}.drl`);
        await tempManager.cleanupFileAsync(drlPath);
        
        // Clean up the SVG file after reading it
        await tempManager.cleanupFileAsync(svgPath);
        
        // Clean up the temporary directory
        await tempManager.cleanupDirectoryAsync(tempDir);

        return svgContent;

    } catch (error) {
        console.error(`❌ Could not export drill layer. Please verify the PCB file:`, error);
        return '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20" fill="red">Error exporting drill layer</text></svg>';
    }
}

/**
 * Processes multiple KiCad layers into a single PNG
 * @param layerNames Layer names to process
 * @param pcbFilePath PCB file path
 * @param outputPath Output PNG path
 * @param kicadCliPath KiCad CLI path
 * @param theme KiCad theme
 * @returns Path to generated PNG
 */
export async function processKicadSvgLayers(
    layerNames: string[],
    pcbFilePath: string,
    outputPath: string,
    kicadCliPath: string,
    theme: string
): Promise<string> {
    try {
        if (layerNames.length === 0) {
            console.error('⚠️ No PCB layers specified for processing. Please select at least one layer.');
            return outputPath;
        }

        // Export SVG for each layer in parallel
        const svgContents = await Promise.all(
            layerNames.map(layer => executeKicadSvgExport(kicadCliPath, pcbFilePath, layer, theme))
        );

        // Combine all SVG layers in memory
        const combinedSvg = combineSvgLayers(svgContents);

        // Convert directly to PNG buffer
        const pngBuffer = await svgToPngBuffer(combinedSvg, {
            width: 5000,
            trim: true
        });

        // Write the buffer to file (only disk I/O operation in the entire process)
        return await writeBufferToFile(pngBuffer, outputPath);
    } catch (error) {
        console.error('❌ Failed to process PCB layers. Please check your layer configuration:', error);
        return outputPath;
    }
}

/**
 * Renders a KiCad PCB 3D view directly to PNG buffer without unnecessary temp files
 * @param renderSpec Configuration for the 3D render
 * @param pcbFilePath Path to PCB file
 * @param outputPath Output PNG file path
 * @param kicadCliPath Path to KiCad CLI executable
 * @returns Promise resolving to output path
 */
export async function renderKicad3DView(
    renderSpec: { side: string, x: string, y: string, z: string },
    pcbFilePath: string,
    outputPath: string,
    kicadCliPath: string
): Promise<string> {
    try {
        // For 3D renders, we need to use a temporary file because KiCad CLI likely can't output
        // rendered images directly to stdout. We'll minimize the lifetime of the temp file.
        const tempRenderPath = tempManager.createTempFilePath('.png');

        await execAsync(
            `"${kicadCliPath}" pcb render --preset follow_pcb_editor --perspective --quality high --side ${renderSpec.side} --rotate "${renderSpec.x},${renderSpec.y},${renderSpec.z}" --output "${tempRenderPath}" ${pcbFilePath}`
        );

        // Process the render with sharp to trim it, keeping it in memory
        const inputBuffer = await readFileAsync(tempRenderPath);
        await tempManager.cleanupFileAsync(tempRenderPath); // Delete temp file immediately after reading

        // Process in memory
        const outputBuffer = await sharp(inputBuffer)
            .trim()
            .toBuffer();

        // Write final output (only disk I/O operation)
        return await writeBufferToFile(outputBuffer, outputPath);
    } catch (error) {
        console.error('❌ Could not render 3D view. Please verify KiCad is installed correctly:', error);
        return outputPath;
    }
}

/**
 * Creates SVG and PNG in a single operation for a stackup
 * @param svgContent The SVG content as a string
 * @param pngOutputPath Where to write the PNG output
 * @param options Options for PNG generation
 * @returns Promise resolving to the output path
 */
export async function svgToPng(
    svgContent: string,
    pngOutputPath: string,
    options: {
        width?: number;
        trim?: boolean;
        background?: sharp.Color;
    } = {}
): Promise<string> {
    try {
        // Process SVG to PNG in memory
        const pngBuffer = await svgToPngBuffer(svgContent, options);

        // Write PNG to disk (single I/O operation)
        return await writeBufferToFile(pngBuffer, pngOutputPath);
    } catch (error) {
        console.error('❌ Failed to convert SVG to PNG. Please check image dimensions:', error);
        return pngOutputPath;
    }
}