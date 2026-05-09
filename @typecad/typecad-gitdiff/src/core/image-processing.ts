/**
 * Image processing functions for typecad-gitdiff
 */

import sharp from 'sharp';
import { PNG } from 'pngjs';

/**
 * Creates a grayscale mask from an image buffer preserving anti-aliasing
 */
export async function createGrayscaleMaskFromSharp(imageBuffer: Buffer): Promise<Uint8Array> {
    const { data, info } = await sharp(imageBuffer)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const mask = new Uint8Array(width * height);

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const alpha = data[i + 3];
        
        // Use luminance calculation weighted by alpha to preserve anti-aliasing
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
        mask[i / 4] = Math.round((luminance * alpha) / 255);
    }

    return mask;
}

/**
 * Creates a binary mask from an image buffer using sharp (legacy function)
 */
export async function createBinaryMaskFromSharp(imageBuffer: Buffer): Promise<Uint8Array> {
    const { data, info } = await sharp(imageBuffer)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const mask = new Uint8Array(width * height);

    let nonZeroAlpha = 0;
    let alphaValues = new Set<number>();

    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        alphaValues.add(alpha);
        // Preserve alpha values instead of binarizing to maintain smooth edges
        mask[i / 4] = alpha;
        if (alpha > 0) nonZeroAlpha++;
    }

    return mask;
}







/**
 * Advanced anti-aliased PNG comparison with edge smoothing
 */
export function compareDirectPngWithAntiAliasing(
    png1: PNG,
    png2: PNG,
    colorModified: { r: number; g: number; b: number } = { r: 255, g: 102, b: 0 },
    colorNew: { r: number; g: number; b: number } = { r: 0, g: 255, b: 0 }
): PNG {
    // Use the maximum dimensions and align images from top-left (PCB coordinate system)
    const width = Math.max(png1.width, png2.width);
    const height = Math.max(png1.height, png2.height);
    const diff = new PNG({ width, height });
    
    // For PCB images, use top-left alignment instead of center alignment
    // This preserves the PCB coordinate system where (0,0) is typically top-left
    const offset1X = 0;
    const offset1Y = 0;
    const offset2X = 0;
    const offset2Y = 0;

    // First pass: detect differences with sub-pixel accuracy
    const diffMask = new Float32Array(width * height);
    const changeType = new Uint8Array(width * height); // 0=no change, 1=modified, 2=new
    const threshold = 25; // Lower threshold for better sensitivity

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            
            // Calculate aligned positions for both images
            const x1 = x - offset1X;
            const y1 = y - offset1Y;
            const x2 = x - offset2X;
            const y2 = y - offset2Y;
            
            // Check bounds and get pixel values with proper alignment
            let r1 = 0, g1 = 0, b1 = 0, a1 = 0;
            let r2 = 0, g2 = 0, b2 = 0, a2 = 0;
            
            if (x1 >= 0 && x1 < png1.width && y1 >= 0 && y1 < png1.height) {
                const idx1 = (y1 * png1.width + x1) << 2;
                r1 = png1.data[idx1];
                g1 = png1.data[idx1 + 1];
                b1 = png1.data[idx1 + 2];
                a1 = png1.data[idx1 + 3];
            }
            
            if (x2 >= 0 && x2 < png2.width && y2 >= 0 && y2 < png2.height) {
                const idx2 = (y2 * png2.width + x2) << 2;
                r2 = png2.data[idx2];
                g2 = png2.data[idx2 + 1];
                b2 = png2.data[idx2 + 2];
                a2 = png2.data[idx2 + 3];
            }

            // Perceptual color difference with alpha weighting
            const colorDiff = Math.sqrt(
                0.299 * Math.pow(r1 - r2, 2) + 
                0.587 * Math.pow(g1 - g2, 2) + 
                0.114 * Math.pow(b1 - b2, 2) + 
                0.5 * Math.pow(a1 - a2, 2)
            );

            if (colorDiff > threshold) {
                diffMask[idx] = Math.min(colorDiff / 100.0, 1.0); // Normalize to 0-1
                
                // Determine change type based on alpha and luminance
                const lum1 = (0.299 * r1 + 0.587 * g1 + 0.114 * b1) * (a1 / 255);
                const lum2 = (0.299 * r2 + 0.587 * g2 + 0.114 * b2) * (a2 / 255);
                
                changeType[idx] = lum2 > lum1 ? 2 : 1; // 2=new, 1=modified
            }
        }
    }

    // Second pass: apply anti-aliasing to difference edges
    const smoothedMask = applyEdgeAntiAliasing(diffMask, width, height);

    // Third pass: generate final image with smooth edges
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) << 2;
            const maskIdx = y * width + x;
            
            // Calculate aligned position for png1
            const x1 = x - offset1X;
            const y1 = y - offset1Y;
            
            const intensity = smoothedMask[maskIdx];
            
            if (intensity > 0.1) {
                // Get original pixel values with proper alignment
                let r1 = 0, g1 = 0, b1 = 0, a1 = 0;
                if (x1 >= 0 && x1 < png1.width && y1 >= 0 && y1 < png1.height) {
                    const idx1 = (y1 * png1.width + x1) << 2;
                    r1 = png1.data[idx1];
                    g1 = png1.data[idx1 + 1];
                    b1 = png1.data[idx1 + 2];
                    a1 = png1.data[idx1 + 3];
                }

                const changeColor = changeType[maskIdx] === 2 ? colorNew : colorModified;
                
                // Smooth blending for anti-aliasing
                const blendFactor = Math.min(intensity, 1.0);
                diff.data[idx] = Math.round(r1 * (1 - blendFactor) + changeColor.r * blendFactor);
                diff.data[idx + 1] = Math.round(g1 * (1 - blendFactor) + changeColor.g * blendFactor);
                diff.data[idx + 2] = Math.round(b1 * (1 - blendFactor) + changeColor.b * blendFactor);
                diff.data[idx + 3] = Math.max(a1, Math.round(255 * blendFactor));
            } else {
                // No significant change - copy original with proper alignment
                let r1 = 0, g1 = 0, b1 = 0, a1 = 0;
                if (x1 >= 0 && x1 < png1.width && y1 >= 0 && y1 < png1.height) {
                    const idx1 = (y1 * png1.width + x1) << 2;
                    r1 = png1.data[idx1];
                    g1 = png1.data[idx1 + 1];
                    b1 = png1.data[idx1 + 2];
                    a1 = png1.data[idx1 + 3];
                }
                diff.data[idx] = r1;
                diff.data[idx + 1] = g1;
                diff.data[idx + 2] = b1;
                diff.data[idx + 3] = a1;
            }
        }
    }

    return diff;
}

/**
 * Apply Gaussian-based edge anti-aliasing to smooth difference edges
 */
function applyEdgeAntiAliasing(diffMask: Float32Array, width: number, height: number): Float32Array {
    const smoothed = new Float32Array(diffMask.length);
    const kernel = generateGaussianKernel(1.5); // Sigma = 1.5 for good anti-aliasing
    const kernelSize = kernel.length;
    const radius = Math.floor(kernelSize / 2);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const centerIdx = y * width + x;
            
            // Skip if no difference at center
            if (diffMask[centerIdx] === 0) {
                smoothed[centerIdx] = 0;
                continue;
            }

            let weightedSum = 0;
            let totalWeight = 0;

            // Apply 2D Gaussian kernel
            for (let ky = 0; ky < kernelSize; ky++) {
                for (let kx = 0; kx < kernelSize; kx++) {
                    const ny = y + ky - radius;
                    const nx = x + kx - radius;

                    if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                        const neighborIdx = ny * width + nx;
                        const weight = kernel[ky] * kernel[kx];
                        
                        weightedSum += diffMask[neighborIdx] * weight;
                        totalWeight += weight;
                    }
                }
            }

            smoothed[centerIdx] = totalWeight > 0 ? weightedSum / totalWeight : diffMask[centerIdx];
        }
    }

    return smoothed;
}

/**
 * Generate 1D Gaussian kernel for anti-aliasing
 */
function generateGaussianKernel(sigma: number): Float32Array {
    const size = Math.ceil(sigma * 3) * 2 + 1; // 3-sigma rule
    const kernel = new Float32Array(size);
    const center = Math.floor(size / 2);
    let sum = 0;

    for (let i = 0; i < size; i++) {
        const x = i - center;
        kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
        sum += kernel[i];
    }

    // Normalize
    for (let i = 0; i < size; i++) {
        kernel[i] /= sum;
    }

    return kernel;
}

/**
 * Compares two binary masks with anti-aliased edge rendering
 */
export function compareBinaryMasksWithFilter(
    originalPng: PNG,
    mask1: Uint8Array,
    mask2: Uint8Array,
    filteredDiffMask: Uint8Array,
    width: number,
    height: number,
    colorModified: { r: number; g: number; b: number } = { r: 255, g: 102, b: 0 },
    colorNew: { r: number; g: number; b: number } = { r: 0, g: 255, b: 0 }
): PNG {
    // Use the maximum dimensions and align from top-left
    const actualWidth = Math.max(width, originalPng.width);
    const actualHeight = Math.max(height, originalPng.height);
    
    const diff = new PNG({ width: actualWidth, height: actualHeight });
    
    // For PCB images, use top-left alignment to preserve coordinate system
    const offsetX = 0;
    const offsetY = 0;
    const maskOffsetX = 0;
    const maskOffsetY = 0;

    // Create distance field for smooth edges
    const distanceField = createDistanceField(filteredDiffMask, width, height);

    for (let y = 0; y < actualHeight; y++) {
        for (let x = 0; x < actualWidth; x++) {
            const idx = (y * actualWidth + x) << 2;
            
            // Calculate aligned positions for mask and PNG
            const maskX = x - maskOffsetX;
            const maskY = y - maskOffsetY;
            const pngX = x - offsetX;
            const pngY = y - offsetY;
            
            const maskIdx = maskY * width + maskX;
            
            // Check bounds for mask access
            const inMaskBounds = maskX >= 0 && maskX < width && maskY >= 0 && maskY < height;
            const inPngBounds = pngX >= 0 && pngX < originalPng.width && pngY >= 0 && pngY < originalPng.height;

            if (inMaskBounds && maskIdx < filteredDiffMask.length && filteredDiffMask[maskIdx] > 0) {
                const mask1Value = maskIdx < mask1.length ? mask1[maskIdx] : 0;
                const mask2Value = maskIdx < mask2.length ? mask2[maskIdx] : 0;

                // Get anti-aliasing factor from distance field
                const antiAliasFactor = Math.min(distanceField[maskIdx], 1.0);
                
                // Original pixel values with proper alignment
                let origR = 0, origG = 0, origB = 0, origA = 0;
                if (inPngBounds) {
                    const pngIdx = (pngY * originalPng.width + pngX) << 2;
                    origR = originalPng.data[pngIdx];
                    origG = originalPng.data[pngIdx + 1];
                    origB = originalPng.data[pngIdx + 2];
                    origA = originalPng.data[pngIdx + 3];
                }

                if (mask1Value > mask2Value) {
                    // Modified/removed content with anti-aliasing
                    diff.data[idx] = Math.round(origR * (1 - antiAliasFactor) + colorModified.r * antiAliasFactor);
                    diff.data[idx + 1] = Math.round(origG * (1 - antiAliasFactor) + colorModified.g * antiAliasFactor);
                    diff.data[idx + 2] = Math.round(origB * (1 - antiAliasFactor) + colorModified.b * antiAliasFactor);
                    diff.data[idx + 3] = Math.max(origA, Math.round(255 * antiAliasFactor));
                } else {
                    // New content with anti-aliasing
                    diff.data[idx] = Math.round(origR * (1 - antiAliasFactor) + colorNew.r * antiAliasFactor);
                    diff.data[idx + 1] = Math.round(origG * (1 - antiAliasFactor) + colorNew.g * antiAliasFactor);
                    diff.data[idx + 2] = Math.round(origB * (1 - antiAliasFactor) + colorNew.b * antiAliasFactor);
                    diff.data[idx + 3] = Math.max(origA, Math.round(255 * antiAliasFactor));
                }
            } else {
                // No significant change, copy original image with proper alignment
                let origR = 0, origG = 0, origB = 0, origA = 0;
                if (inPngBounds) {
                    const pngIdx = (pngY * originalPng.width + pngX) << 2;
                    origR = originalPng.data[pngIdx];
                    origG = originalPng.data[pngIdx + 1];
                    origB = originalPng.data[pngIdx + 2];
                    origA = originalPng.data[pngIdx + 3];
                }
                diff.data[idx] = origR;
                diff.data[idx + 1] = origG;
                diff.data[idx + 2] = origB;
                diff.data[idx + 3] = origA;
            }
        }
    }

    return diff;
}

/**
 * Create a distance field for smooth anti-aliasing at edges
 */
function createDistanceField(mask: Uint8Array, width: number, height: number): Float32Array {
    const distanceField = new Float32Array(mask.length);
    const maxDistance = 2.0; // Maximum distance for anti-aliasing effect

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            
            if (mask[idx] === 0) {
                distanceField[idx] = 0;
                continue;
            }

            // Find minimum distance to edge (where mask transitions from 1 to 0)
            let minDistance = maxDistance;
            
            for (let dy = -Math.ceil(maxDistance); dy <= Math.ceil(maxDistance); dy++) {
                for (let dx = -Math.ceil(maxDistance); dx <= Math.ceil(maxDistance); dx++) {
                    const ny = y + dy;
                    const nx = x + dx;
                    
                    if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                        const neighborIdx = ny * width + nx;
                        
                        // If neighbor is not in mask, calculate distance
                        if (mask[neighborIdx] === 0) {
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            minDistance = Math.min(minDistance, distance);
                        }
                    }
                }
            }

            // Convert distance to anti-aliasing factor (1.0 = full intensity, 0.0 = no intensity)
            distanceField[idx] = minDistance >= maxDistance ? 1.0 : 
                                Math.max(0.3, 1.0 - (minDistance / maxDistance) * 0.7);
        }
    }

    return distanceField;
}

/**
 * Detects edge pixels in a binary mask
 */
function detectEdgePixels(mask: Uint8Array, width: number, height: number): Uint8Array {
    const edgeMask = new Uint8Array(mask.length);
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            
            // Check if this pixel has different values in its neighborhood
            const currentValue = mask[idx];
            let hasEdge = false;
            
            // Check 4-connected neighbors
            const neighbors = [
                mask[(y-1) * width + x],     // top
                mask[(y+1) * width + x],     // bottom
                mask[y * width + (x-1)],     // left
                mask[y * width + (x+1)]      // right
            ];
            
            for (const neighborValue of neighbors) {
                if (neighborValue !== currentValue) {
                    hasEdge = true;
                    break;
                }
            }
            
            if (hasEdge) {
                edgeMask[idx] = 1;
            }
        }
    }
    
    return edgeMask;
}



/**
 * Sharp, direct color image comparison that preserves image clarity
 */
export async function compareColorImagesSharp(
    image1: PNG, 
    image2: PNG,
    colorModified: { r: number; g: number; b: number } = { r: 255, g: 102, b: 0 },
    colorNew: { r: number; g: number; b: number } = { r: 0, g: 255, b: 0 }
): Promise<PNG> {
    // Use the maximum dimensions and align images from top-left (PCB coordinate system)
    const width = Math.max(image1.width, image2.width);
    const height = Math.max(image1.height, image2.height);

    const diff = new PNG({ width, height });
    
    // For PCB images, use top-left alignment instead of center alignment
    // This preserves the PCB coordinate system where (0,0) is typically top-left
    const offset1X = 0;
    const offset1Y = 0;
    const offset2X = 0;
    const offset2Y = 0;

    // Use simple, direct pixel comparison with minimal filtering
    const diffMask = new Uint8Array(width * height);
    
    // Simple threshold-based comparison that preserves sharpness
    const colorThreshold = 45; // Lower threshold for more sensitivity
    const alphaThreshold = 45;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) << 2;
            const maskIdx = y * width + x;

            // Calculate aligned positions for both images
            const x1 = x - offset1X;
            const y1 = y - offset1Y;
            const x2 = x - offset2X;
            const y2 = y - offset2Y;
            
            // Get pixel values with proper bounds checking
            let r1 = 0, g1 = 0, b1 = 0, a1 = 0;
            let r2 = 0, g2 = 0, b2 = 0, a2 = 0;
            
            if (x1 >= 0 && x1 < image1.width && y1 >= 0 && y1 < image1.height) {
                const idx1 = (y1 * image1.width + x1) << 2;
                r1 = image1.data[idx1];
                g1 = image1.data[idx1 + 1];
                b1 = image1.data[idx1 + 2];
                a1 = image1.data[idx1 + 3];
            }
            
            if (x2 >= 0 && x2 < image2.width && y2 >= 0 && y2 < image2.height) {
                const idx2 = (y2 * image2.width + x2) << 2;
                r2 = image2.data[idx2];
                g2 = image2.data[idx2 + 1];
                b2 = image2.data[idx2 + 2];
                a2 = image2.data[idx2 + 3];
            }

            // Simple color difference calculation
            const colorDiff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
            const alphaDiff = Math.abs(a1 - a2);

            if (colorDiff > colorThreshold || alphaDiff > alphaThreshold) {
                diffMask[maskIdx] = 1;
            }
        }
    }

    // Apply only minimal filtering to preserve sharpness
    const { filterSmallDifferences } = await import('./mask-operations.js');
    const filteredDiffMask = filterSmallDifferences(diffMask, width, height, 3); // Very conservative filtering

    // Generate the final diff image with sharp, high-contrast output
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) << 2;
            const maskIdx = y * width + x;

            // Calculate aligned positions for both images
            const x1 = x - offset1X;
            const y1 = y - offset1Y;
            const x2 = x - offset2X;
            const y2 = y - offset2Y;
            
            // Get pixel values with proper bounds checking
            let r1 = 0, g1 = 0, b1 = 0, a1 = 0;
            let r2 = 0, g2 = 0, b2 = 0, a2 = 0;
            
            if (x1 >= 0 && x1 < image1.width && y1 >= 0 && y1 < image1.height) {
                const idx1 = (y1 * image1.width + x1) << 2;
                r1 = image1.data[idx1];
                g1 = image1.data[idx1 + 1];
                b1 = image1.data[idx1 + 2];
                a1 = image1.data[idx1 + 3];
            }
            
            if (x2 >= 0 && x2 < image2.width && y2 >= 0 && y2 < image2.height) {
                const idx2 = (y2 * image2.width + x2) << 2;
                r2 = image2.data[idx2];
                g2 = image2.data[idx2 + 1];
                b2 = image2.data[idx2 + 2];
                a2 = image2.data[idx2 + 3];
            }

            if (filteredDiffMask[maskIdx] > 0) {
                // Significant change detected, determine if it's an addition or removal
                // Check if pixel is more present in image2 (new feature) or image1 (old feature)
                if ((r2 + g2 + b2) * a2 > (r1 + g1 + b1) * a1) {
                    // New feature - use custom new color
                    diff.data[idx] = colorNew.r;       // Red
                    diff.data[idx + 1] = colorNew.g; // Green
                    diff.data[idx + 2] = colorNew.b;   // Blue
                    diff.data[idx + 3] = 255; // Alpha
                } else {
                    // Old feature - use custom modified color
                    diff.data[idx] = colorModified.r;     // Red
                    diff.data[idx + 1] = colorModified.g; // Green
                    diff.data[idx + 2] = colorModified.b; // Blue
                    diff.data[idx + 3] = 255; // Alpha
                }
            } else {
                // No significant change - copy original pixel at FULL opacity for sharpness
                diff.data[idx] = r1;
                diff.data[idx + 1] = g1;
                diff.data[idx + 2] = b1;
                diff.data[idx + 3] = a1; // Full opacity preserves sharpness
            }
        }
    }

    return diff;
}

/**
 * Compares two color images and generates a visual diff
 */
export async function compareColorImages(
    image1: PNG, 
    image2: PNG,
    colorModified: { r: number; g: number; b: number } = { r: 255, g: 102, b: 0 },
    colorNew: { r: number; g: number; b: number } = { r: 0, g: 255, b: 0 }
): Promise<PNG> {
    // Use the sharp comparison for crisp diff images
    return compareColorImagesSharp(image1, image2, colorModified, colorNew);
}

/**
 * Checks if two masks are identical, accounting for visual artifacts
 */
export async function areMasksIdentical(mask1: Uint8Array, mask2: Uint8Array, width: number, height: number): Promise<boolean> {
    if (mask1.length !== mask2.length) {
        return false;
    }

    let diffCount = 0;
    const tolerance = 0; // Use exact matching since we're now using binary masks (0 or 255)

    // Create a difference mask first
    const diffMask = new Uint8Array(mask1.length);
    for (let i = 0; i < mask1.length; i++) {
        const diff = Math.abs(mask1[i] - mask2[i]);
        if (diff > tolerance) {
            diffMask[i] = 1;
            diffCount++;
        }
    }

    if (diffCount === 0) {
        return true;
    }

    // Import the filterVisualArtifacts function from mask-operations
    // Using dynamic import for ES modules
    const filterVisualArtifacts = (await import('./mask-operations.js')).filterVisualArtifacts;

    // Apply more sophisticated filtering for visual artifacts
    const filteredDiffMask = filterVisualArtifacts(diffMask, width, height);
    const filteredDiffCount = filteredDiffMask.reduce((sum: number, val: number) => sum + val, 0);

    // Removed percentage-based threshold - rely only on visual artifact filtering

    if (filteredDiffCount === 0) {
        return true;
    }

    return false;
}