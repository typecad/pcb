/**
 * Diff generator for typecad-gitdiff
 * Handles the generation of visual diffs between PCB files
 */

import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { kicad_cli_path } from '@typecad/typecad';
import { allLayers, standardLayers } from '../constants.js';
import { createBinaryMaskFromSharp, compareColorImages, areMasksIdentical } from './image-processing.js';
        // Import mask operations dynamically
        import { convertSvgToPngBuffer, convertSvgToPngBufferWithFixedSize, getMaxSvgDimensions } from './svg-converter.js';
        import { exportLayerToSvg, createTempFilePath, cleanupTempFiles, parseHexColor } from '../utils/file-utils.js';
        import { LayerInfo, generateHtmlReport } from '../utils/html-generator.js';

/**
 * Options for generating diffs
 */
export interface DiffOptions {
    originalFile: string;
    modifiedFile: string;
    fullMode: boolean;
    theme?: string;
    colorModified?: string;
    colorNew?: string;
    outputHtmlPath?: string;
}

/**
 * Generates visual diffs between two PCB files
 */
export async function generateDiffs(options: DiffOptions): Promise<string> {
    const { originalFile, modifiedFile, fullMode, theme, colorModified, colorNew, outputHtmlPath } = options;
    const tempFiles: string[] = []; // Track all temporary files for cleanup
    const htmlLayers: LayerInfo[] = [];

    // Parse custom colors if provided, otherwise use defaults
    const modifiedColor = colorModified ? parseHexColor(colorModified) : { r: 255, g: 102, b: 0 };
    const newColor = colorNew ? parseHexColor(colorNew) : { r: 0, g: 255, b: 0 };

    try {
        // Select layers based on full mode
        const layers = fullMode ? allLayers : standardLayers;

        // Export SVGs for both boards to temporary files in parallel
        const exportPromises = layers.flatMap(layer => {
            const tempSvgPath1 = createTempFilePath('1_', `${layer}.svg`);
            const tempSvgPath2 = createTempFilePath('2_', `${layer}.svg`);
            tempFiles.push(tempSvgPath1, tempSvgPath2);
            return [
                exportLayerToSvg(kicad_cli_path!, layer, tempSvgPath1, originalFile, theme),
                exportLayerToSvg(kicad_cli_path!, layer, tempSvgPath2, modifiedFile, theme)
            ];
        });
        await Promise.all(exportPromises);

        // Generate paths for all SVGs
        const svgPaths1 = layers.map(layer => createTempFilePath('1_', `${layer}.svg`));
        const svgPaths2 = layers.map(layer => createTempFilePath('2_', `${layer}.svg`));

        // Convert all SVGs to PNG buffers in parallel with high-quality settings
        // First, determine the maximum dimensions needed across all SVG files
        const targetWidth = 2000; // Always use high resolution for best quality
        const maxDimensions = await getMaxSvgDimensions([...svgPaths1, ...svgPaths2], targetWidth);
        
        const [pngBuffers1, pngBuffers2] = await Promise.all([
            Promise.all(svgPaths1.map(svgPath => convertSvgToPngBufferWithFixedSize(svgPath, maxDimensions.width, maxDimensions.height))),
            Promise.all(svgPaths2.map(svgPath => convertSvgToPngBufferWithFixedSize(svgPath, maxDimensions.width, maxDimensions.height)))
        ]);

        // Render PNG files for "Render" layer
        // const renderPngPath1 = createTempFilePath('1_', 'render.png');
        // const renderPngPath2 = createTempFilePath('2_', 'render.png');
        // tempFiles.push(renderPngPath1, renderPngPath2);

        // Execute rendering commands for "Render" layer
        // await renderPcbToPng(kicad_cli_path!, renderPngPath1, originalFile);
        // await renderPcbToPng(kicad_cli_path!, renderPngPath2, modifiedFile);

        // Read the rendered PNG files into buffers (no trimming for render images)
        // const renderPngBuffer1 = fs.readFileSync(renderPngPath1);
        // const renderPngBuffer2 = fs.readFileSync(renderPngPath2);

        // Add "Render" layer to the layers array
        // layers.push("Render");

        // Process layers in parallel
        await Promise.all(layers.map(async (layer, index) => {
            let originalPng1, pngBuffer1, pngBuffer2;

            // if (layer === "Render") {
            //     // Use the rendered PNG buffers for the "Render" layer
            //     originalPng1 = PNG.sync.read(renderPngBuffer1);
            //     pngBuffer1 = renderPngBuffer1;
            //     pngBuffer2 = renderPngBuffer2;
            // } else {
            // Use the SVG-derived PNG buffers for other layers
            originalPng1 = PNG.sync.read(pngBuffers1[index]);
            pngBuffer1 = pngBuffers1[index];
            pngBuffer2 = pngBuffers2[index];
            // }

            // Save images as separate files instead of base64 to avoid string length limits
            const originalImagePath = createTempFilePath('original_', `${layer}.png`);
            const modifiedImagePath = createTempFilePath('modified_', `${layer}.png`);

            fs.writeFileSync(originalImagePath, pngBuffer1);
            fs.writeFileSync(modifiedImagePath, pngBuffer2);

            const originalImageSrc = `original_${layer}.png`;
            const modifiedImageSrc = `modified_${layer}.png`;

            // if (layer === "Render") {
            //     // Compare the two PNGs directly for the "Render" layer
            //     const diff = await compareColorImages(originalPng1, PNG.sync.read(pngBuffer2), modifiedColor, newColor);
            //     const diffBuffer = PNG.sync.write(diff); // Get the buffer of the difference image

            //     // Convert the buffer to a Base64-encoded string
            //     const diffImageBase64 = diffBuffer.toString('base64');
            //     const diffImageSrc = `data:image/png;base64,${diffImageBase64}`;

            //     htmlLayers.push({
            //         name: layer,
            //         originalImage: originalImageSrc,
            //         diffImage: diffImageSrc,
            //         modifiedImage: modifiedImageSrc
            //     });
            // } else {
            // Try high-quality direct PNG comparison first, fall back to mask-based comparison
            try {
                // Check if images have the same dimensions first
                const img1Info = await sharp(pngBuffer1).metadata();
                const img2Info = await sharp(pngBuffer2).metadata();

                // If dimensions don't match, skip resizing to avoid blurriness - log warning instead
                if (img1Info.width !== img2Info.width || img1Info.height !== img2Info.height) {
                    console.warn(`Dimension mismatch for layer ${layer}: ${img1Info.width}x${img1Info.height} vs ${img2Info.width}x${img2Info.height}`);
                    
                    // Use original buffers without resizing to preserve sharpness
                    // The comparison will handle small dimension differences
                }

                // Use original PNG data for sharp results
                const originalPng1Processed = PNG.sync.read(pngBuffer1);
                const originalPng2 = PNG.sync.read(pngBuffer2);
                
                // Quick buffer comparison
                const buffersIdentical = pngBuffer1.equals(pngBuffer2);
                
                if (buffersIdentical) {
                    htmlLayers.push({
                        name: layer,
                        originalImage: originalImageSrc,
                        diffImage: null,
                        modifiedImage: modifiedImageSrc
                    });
                    return;
                }

                // Try high-quality direct PNG comparison first
                const { compareDirectPngWithAntiAliasing } = await import('./image-processing.js');
                const directDiff = compareDirectPngWithAntiAliasing(originalPng1Processed, originalPng2, modifiedColor, newColor);
                
                // Check if direct comparison found significant differences
                let hasSignificantDifferences = false;
                for (let i = 3; i < directDiff.data.length; i += 4) {
                    if (directDiff.data[i] === 255 && (
                        (directDiff.data[i-3] === modifiedColor.r && directDiff.data[i-2] === modifiedColor.g && directDiff.data[i-1] === modifiedColor.b) ||
                        (directDiff.data[i-3] === newColor.r && directDiff.data[i-2] === newColor.g && directDiff.data[i-1] === newColor.b)
                    )) {
                        hasSignificantDifferences = true;
                        break;
                    }
                }

                if (hasSignificantDifferences) {
                    // Use high-quality direct comparison result
                    const diffBuffer = PNG.sync.write(directDiff);
                    const diffImageBase64 = diffBuffer.toString('base64');
                    const diffImageSrc = `data:image/png;base64,${diffImageBase64}`;

                    htmlLayers.push({
                        name: layer,
                        originalImage: originalImageSrc,
                        diffImage: diffImageSrc,
                        modifiedImage: modifiedImageSrc
                    });
                    return;
                }

                // Fall back to mask-based comparison for edge cases
                const [mask1, mask2] = await Promise.all([
                    createBinaryMaskFromSharp(pngBuffer1),
                    createBinaryMaskFromSharp(pngBuffer2)
                ]);

                if (await areMasksIdentical(mask1, mask2, img1Info.width!, img1Info.height!)) {
                    htmlLayers.push({
                        name: layer,
                        originalImage: originalImageSrc,
                        diffImage: null,
                        modifiedImage: modifiedImageSrc
                    });
                    return;
                }

                // Create filtered difference mask for visualization with minimal filtering to preserve sharpness
                const diffMask = new Uint8Array(mask1.length);
                const tolerance = 10; // Use small tolerance to account for anti-aliasing
                for (let i = 0; i < mask1.length; i++) {
                    const diff = Math.abs(mask1[i] - mask2[i]);
                    if (diff > tolerance) {
                        diffMask[i] = 1;
                    }
                }
                
                // Apply minimal filtering to preserve image sharpness - reduce cluster size requirement
                const { filterSmallDifferences } = await import('./mask-operations.js');
                const filteredDiffMask = filterSmallDifferences(diffMask, img1Info.width!, img1Info.height!, 2); // Even more conservative filtering

                // Generate diff image using filtered differences and processed PNG
                const { compareBinaryMasksWithFilter } = await import('./image-processing.js');
                const diff = compareBinaryMasksWithFilter(originalPng1Processed, mask1, mask2, filteredDiffMask, originalPng1Processed.width, originalPng1Processed.height, modifiedColor, newColor);
                const diffBuffer = PNG.sync.write(diff);

                // Convert the buffer to a Base64-encoded string
                const diffImageBase64 = diffBuffer.toString('base64');
                const diffImageSrc = `data:image/png;base64,${diffImageBase64}`;

                htmlLayers.push({
                    name: layer,
                    originalImage: originalImageSrc,
                    diffImage: diffImageSrc,
                    modifiedImage: modifiedImageSrc
                });

            } catch (error) {
                console.error(`Error processing layer ${layer}:`, error);
                // Fallback: show images without diff
                htmlLayers.push({
                    name: layer,
                    originalImage: originalImageSrc,
                    diffImage: null,
                    modifiedImage: modifiedImageSrc
                });
                return;
            }
            // }
        }));

        // Determine the HTML file path
        const htmlFilePath = outputHtmlPath || createTempFilePath('', 'results.html');
        const outputDir = path.dirname(htmlFilePath);
        
        // Move image files to the same directory as the HTML file
        for (const layer of htmlLayers) {
            if (layer.originalImage && !layer.originalImage.startsWith('data:')) {
                const tempImagePath = createTempFilePath('original_', `${layer.name}.png`);
                const finalImagePath = path.join(outputDir, layer.originalImage);
                if (fs.existsSync(tempImagePath)) {
                    fs.copyFileSync(tempImagePath, finalImagePath);
                    // Don't add to cleanup - these files need to stay with the HTML
                }
            }
            if (layer.modifiedImage && !layer.modifiedImage.startsWith('data:')) {
                const tempImagePath = createTempFilePath('modified_', `${layer.name}.png`);
                const finalImagePath = path.join(outputDir, layer.modifiedImage);
                if (fs.existsSync(tempImagePath)) {
                    fs.copyFileSync(tempImagePath, finalImagePath);
                    // Don't add to cleanup - these files need to stay with the HTML
                }
            }
        }
        
        // Generate HTML file with embedded images and enhanced styling
        const htmlContent = await generateHtmlReport(htmlLayers, modifiedColor, newColor, outputDir);
        
        fs.writeFileSync(htmlFilePath, htmlContent);
        
        console.log(`HTML report generated at: ${htmlFilePath}`);
        
        return htmlFilePath;

    } catch (error) {
        console.error('Error:', error);
        throw error;
    } finally {
        // Clean up temporary files (SVGs and intermediate PNGs)
        // Note: HTML file and final image files are kept for user viewing
        cleanupTempFiles(tempFiles);
    }
}