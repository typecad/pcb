/**
 * SVG to PNG conversion utilities for typecad-gitdiff
 */

import * as fs from 'fs';
import sharp from 'sharp';
import { DOMParser } from '@xmldom/xmldom';

/**
 * Gets the maximum dimensions needed across multiple SVG files
 */
export async function getMaxSvgDimensions(svgPaths: string[], targetWidth: number): Promise<{ width: number; height: number }> {
    let maxAspectRatio = 1; // Default to square
    
    for (const svgPath of svgPaths) {
        try {
            const svgContent = fs.readFileSync(svgPath, 'utf-8');
            const svgDoc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
            
            if (svgDoc.documentElement) {
                const viewBox = svgDoc.documentElement.getAttribute('viewBox');
                if (viewBox) {
                    const [, , vbWidth, vbHeight] = viewBox.split(' ').map(parseFloat);
                    const aspectRatio = vbHeight / vbWidth;
                    maxAspectRatio = Math.max(maxAspectRatio, aspectRatio);
                }
            }
        } catch (error) {
            console.warn(`Failed to parse SVG dimensions for ${svgPath}:`, error);
        }
    }
    
    return {
        width: targetWidth,
        height: Math.round(targetWidth * maxAspectRatio)
    };
}

/**
 * Converts an SVG file to a PNG buffer with fixed dimensions for perfect alignment
 */
export async function convertSvgToPngBufferWithFixedSize(svgPath: string, targetWidth: number, targetHeight: number): Promise<Buffer> {
    try {
        // Read SVG content
        const svgContent = fs.readFileSync(svgPath, 'utf-8');

        // Use the provided fixed dimensions for consistent sizing

        // Use maximum quality SVG rendering with fixed dimensions
        const sharpInstance = sharp(Buffer.from(svgContent), {
            density: 2400, // Very high density for maximum quality
            unlimited: true // Allow processing of large images
        })
        .resize({
            width: targetWidth,
            height: targetHeight,
            fit: 'contain', // Fit the SVG within the fixed dimensions, preserving aspect ratio
            background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent background
            kernel: sharp.kernel.lanczos3, // High-quality kernel for better results
            position: 'left top' // Align to top-left for consistent positioning
        });

        // Configure PNG output with maximum quality settings
        return await sharpInstance
            .png({
                quality: 100, // Maximum quality to reduce compression artifacts
                compressionLevel: 1, // Light compression for consistency
                adaptiveFiltering: false, // Disable adaptive filtering for consistency
                palette: false, // Force RGB mode for consistent color handling
                progressive: false, // Disable progressive for consistency
                force: true // Force PNG output even if input is already PNG
            })
            .withMetadata({ density: 600 }) // Match render density
            .toBuffer();

    } catch (error) {
        console.error(`Failed to convert SVG to PNG: ${svgPath}`, error);
        // Return a fallback error image buffer with the provided fixed dimensions
        const errorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}">
            <rect width="${targetWidth}" height="${targetHeight}" fill="#f8f8f8" stroke="#ddd"/>
            <text x="${targetWidth/2}" y="${targetHeight/2}" text-anchor="middle" fill="red" font-family="Arial" font-size="16">
                Error processing SVG
            </text>
        </svg>`;

        return await sharp(Buffer.from(errorSvg))
            .png({ 
                quality: 100, 
                compressionLevel: 1,
                adaptiveFiltering: false,
                palette: false
            })
            .toBuffer();
    }
}

/**
 * Converts an SVG file to a PNG buffer with various options
 */
export async function convertSvgToPngBuffer(svgPath: string, options: { width?: number; trim?: boolean; background?: sharp.Color; preSmooth?: boolean } = {}): Promise<Buffer> {
    try {
        // Read SVG content
        const svgContent = fs.readFileSync(svgPath, 'utf-8');

        // Use docgen's approach: parse SVG with DOMParser to extract viewBox
        const svgDoc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
        if (!svgDoc.documentElement) {
            throw new Error('Failed to parse SVG content');
        }

        const currentViewBox = svgDoc.documentElement.getAttribute('viewBox');
        if (!currentViewBox) {
            // If no viewBox, return the SVG as-is converted to PNG with consistent settings
            let sharpInstance = sharp(Buffer.from(svgContent), {
                density: 600 // Consistent with main rendering (commented out)
            });
            
            // Apply light pre-smoothing if requested (reduced for diagonal line preservation)
            if (options.preSmooth) {
                sharpInstance = sharpInstance.blur(0.4); // Reduced from 0.7 to preserve diagonal details
            }
            
            return await sharpInstance
                .png({ 
                    quality: 100, 
                    compressionLevel: 1, 
                    adaptiveFiltering: false, 
                    palette: false 
                })
                .withMetadata({ density: 600 })
                .toBuffer();
        }

        // Extract dimensions from viewBox (docgen approach)
        const [, , vbWidth, vbHeight] = currentViewBox.split(' ').map(parseFloat);
        // Calculate aspect ratio and target dimensions (docgen approach)
        const aspectRatio = vbHeight / vbWidth;
        const targetWidth = options.width || 1000; // Reduced from 5000 to 1000 for smaller file sizes
        const targetHeight = Math.round(targetWidth * aspectRatio);

        // Use maximum quality SVG rendering for anti-aliasing preservation
        let sharpInstance = sharp(Buffer.from(svgContent), {
            density: 2400, // Very high density for maximum quality
            unlimited: true // Allow processing of large images
        })
        .resize({
            width: targetWidth,
            height: targetHeight,
            fit: 'inside', // Preserves aspect ratio, no distortion
            background: options.background || { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent background
            kernel: sharp.kernel.lanczos3, // High-quality kernel for better results
            fastShrinkOnLoad: false, // Disable fast shrinking to preserve quality
            withoutEnlargement: false // Allow enlargement for consistent sizing
        });

        // Apply trimming with more conservative settings to preserve edges
        if (options.trim) {
            sharpInstance = sharpInstance.trim({
                threshold: 5, // Less aggressive trimming to preserve edge details
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            });
        }

        // Skip pre-smoothing to maintain maximum sharpness
        // Pre-smoothing is disabled to preserve crisp edges and prevent pixelation

        // Configure PNG output with balanced quality settings
        return await sharpInstance
            .png({
                quality: 100, // Maximum quality to reduce compression artifacts
                compressionLevel: 1, // Light compression for consistency
                adaptiveFiltering: false, // Disable adaptive filtering for consistency
                palette: false, // Force RGB mode for consistent color handling
                progressive: false, // Disable progressive for consistency
                force: true // Force PNG output even if input is already PNG
            })
            .withMetadata({ density: 600 }) // Match render density (commented out)
            .toBuffer();

    } catch (error) {
        console.error(`Failed to convert SVG to PNG: ${svgPath}`, error);
        // Return a fallback error image buffer
        const errorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
            <rect width="400" height="300" fill="#f8f8f8" stroke="#ddd"/>
            <text x="200" y="150" text-anchor="middle" fill="red" font-family="Arial" font-size="16">
                Error processing SVG
            </text>
        </svg>`;

        return await sharp(Buffer.from(errorSvg))
            .png({ 
                quality: 100, 
                compressionLevel: 1,
                adaptiveFiltering: false,
                palette: false
            })
            .toBuffer();
    }
}