/**
 * Mask operations for typecad-gitdiff
 * Contains functions for filtering and morphological operations on binary masks
 */

/**
 * Filters small differences in a binary mask
 */
export function filterSmallDifferences(diffMask: Uint8Array, width: number, height: number, minClusterSize: number = 4): Uint8Array {
    const filtered = new Uint8Array(diffMask.length);
    const visited = new Array(diffMask.length).fill(false);

    // Find connected components of differences
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (diffMask[idx] > 0 && !visited[idx]) {
                // Found a difference pixel, check cluster size
                const cluster = [];
                const stack = [idx];

                while (stack.length > 0) {
                    const currentIdx = stack.pop()!;
                    if (visited[currentIdx]) continue;

                    visited[currentIdx] = true;
                    cluster.push(currentIdx);

                    // Check 8-connected neighbors
                    const cy = Math.floor(currentIdx / width);
                    const cx = currentIdx % width;

                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue;

                            const ny = cy + dy;
                            const nx = cx + dx;

                            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                                const neighborIdx = ny * width + nx;
                                if (diffMask[neighborIdx] > 0 && !visited[neighborIdx]) {
                                    stack.push(neighborIdx);
                                }
                            }
                        }
                    }
                }

                // Only keep clusters larger than minimum size
                if (cluster.length >= minClusterSize) {
                    for (const clusterIdx of cluster) {
                        filtered[clusterIdx] = diffMask[clusterIdx];
                    }
                }
            }
        }
    }

    return filtered;
}



/**
 * Advanced Gaussian blur for smoothing edge artifacts
 */


/**
 * Simple edge artifact reduction filter
 */
export function reduceEdgeArtifacts(mask: Uint8Array, width: number, height: number): Uint8Array {
    const filtered = new Uint8Array(mask.length);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (mask[idx] === 0) {
                continue;
            }
            
            // For edge pixels, require at least one neighbor to reduce isolated artifacts
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                let hasNeighbor = false;
                for (let dy = -1; dy <= 1 && !hasNeighbor; dy++) {
                    for (let dx = -1; dx <= 1 && !hasNeighbor; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const ny = y + dy;
                        const nx = x + dx;
                        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                            if (mask[ny * width + nx] > 0) {
                                hasNeighbor = true;
                            }
                        }
                    }
                }
                if (hasNeighbor) {
                    filtered[idx] = mask[idx];
                }
            } else {
                // Interior pixels are kept as-is
                filtered[idx] = mask[idx];
            }
        }
    }
    
    return filtered;
}

/**
 * Edge-preserving bilateral-style filter for binary masks
 */
export function bilateralStyleFilter(mask: Uint8Array, width: number, height: number): Uint8Array {
    const filtered = new Uint8Array(mask.length);
    const radius = 1; // Small radius to avoid over-smoothing
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const centerValue = mask[idx];
            
            if (centerValue === 0) {
                continue; // Skip background pixels
            }
            
            let weightSum = 0;
            let valueSum = 0;
            
            // Check neighborhood
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const ny = y + dy;
                    const nx = x + dx;
                    
                    if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                        const neighborIdx = ny * width + nx;
                        const neighborValue = mask[neighborIdx];
                        
                        // Spatial weight (Gaussian-like)
                        const spatialDist = dx * dx + dy * dy;
                        const spatialWeight = Math.exp(-spatialDist / 2.0);
                        
                        // Range weight (edge-preserving)
                        const rangeDiff = Math.abs(centerValue - neighborValue);
                        const rangeWeight = rangeDiff === 0 ? 1.0 : 0.1; // Strong penalty for different values
                        
                        const totalWeight = spatialWeight * rangeWeight;
                        weightSum += totalWeight;
                        valueSum += neighborValue * totalWeight;
                    }
                }
            }
            
            // Only update if we have significant support from similar neighbors
            if (weightSum > 0) {
                const filteredValue = valueSum / weightSum;
                filtered[idx] = filteredValue > 0.5 ? 1 : 0;
            }
        }
    }
    
    return filtered;
}

/**
 * Advanced connected component analysis with feature characterization
 */
export function advancedConnectedComponentAnalysis(mask: Uint8Array, width: number, height: number): Uint8Array {
    const filtered = new Uint8Array(mask.length);
    const visited = new Array(mask.length).fill(false);
    const labels = new Array(mask.length).fill(0);
    let currentLabel = 1;

    // Find all connected components and analyze their characteristics
    const components: Array<{
        pixels: number[];
        size: number;
        boundingBox: { minX: number; maxX: number; minY: number; maxY: number };
        aspectRatio: number;
        density: number;
        isLinear: boolean;
        isDiagonalLine: boolean;
    }> = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (mask[idx] > 0 && !visited[idx]) {
                // Found a new component, analyze it
                const component = [];
                const stack = [idx];
                let minX = x, maxX = x, minY = y, maxY = y;

                while (stack.length > 0) {
                    const currentIdx = stack.pop()!;
                    if (visited[currentIdx]) continue;

                    visited[currentIdx] = true;
                    labels[currentIdx] = currentLabel;
                    component.push(currentIdx);

                    const cy = Math.floor(currentIdx / width);
                    const cx = currentIdx % width;
                    
                    minX = Math.min(minX, cx);
                    maxX = Math.max(maxX, cx);
                    minY = Math.min(minY, cy);
                    maxY = Math.max(maxY, cy);

                    // Check 8-connected neighbors
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue;

                            const ny = cy + dy;
                            const nx = cx + dx;

                            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                                const neighborIdx = ny * width + nx;
                                if (mask[neighborIdx] > 0 && !visited[neighborIdx]) {
                                    stack.push(neighborIdx);
                                }
                            }
                        }
                    }
                }

                // Analyze component characteristics
                const bbWidth = maxX - minX + 1;
                const bbHeight = maxY - minY + 1;
                const bbArea = bbWidth * bbHeight;
                const aspectRatio = Math.max(bbWidth, bbHeight) / Math.min(bbWidth, bbHeight);
                const density = component.length / bbArea;
                
                // Check if component is linear (typical of PCB traces)
                const isLinear = (aspectRatio > 3 && density > 0.3) || 
                                (aspectRatio > 6 && density > 0.2) ||
                                (component.length > 20 && aspectRatio > 2);

                // Additional check for diagonal lines
                let isDiagonalLine = false;
                if (isLinear && component.length >= 8) {
                    // Check if the component forms a roughly diagonal pattern
                    let diagonalScore = 0;
                    for (const pixelIdx of component) {
                        const py = Math.floor(pixelIdx / width);
                        const px = pixelIdx % width;
                        
                        // Count diagonal neighbors
                        const diagonalNeighbors = [
                            ((py > 0 && px > 0) ? component.includes((py-1) * width + (px-1)) : false),
                            ((py > 0 && px < width-1) ? component.includes((py-1) * width + (px+1)) : false),
                            ((py < height-1 && px > 0) ? component.includes((py+1) * width + (px-1)) : false),
                            ((py < height-1 && px < width-1) ? component.includes((py+1) * width + (px+1)) : false)
                        ];
                        
                        const orthogonalNeighbors = [
                            ((py > 0) ? component.includes((py-1) * width + px) : false),
                            ((py < height-1) ? component.includes((py+1) * width + px) : false),
                            ((px > 0) ? component.includes(py * width + (px-1)) : false),
                            ((px < width-1) ? component.includes(py * width + (px+1)) : false)
                        ];
                        
                        const diagCount = diagonalNeighbors.filter(Boolean).length;
                        const orthCount = orthogonalNeighbors.filter(Boolean).length;
                        
                        if (diagCount > orthCount) {
                            diagonalScore++;
                        }
                    }
                    
                    // Consider it diagonal if >40% of pixels have more diagonal than orthogonal connections
                    isDiagonalLine = (diagonalScore / component.length) > 0.4;
                }

                components.push({
                    pixels: component,
                    size: component.length,
                    boundingBox: { minX, maxX, minY, maxY },
                    aspectRatio,
                    density,
                    isLinear,
                    isDiagonalLine
                });

                currentLabel++;
            }
        }
    }

    // Filter components based on sophisticated criteria
    for (const comp of components) {
        let keepComponent = false;

        if (comp.isLinear) {
            if (comp.isDiagonalLine) {
                // Be more lenient with diagonal lines as they're more prone to artifacts
                keepComponent = comp.size >= 4; // Lower threshold for diagonal lines
            } else {
                // Keep regular linear components that are likely PCB traces
                keepComponent = comp.size >= 6;
            }
        } else {
            // For non-linear components, use more conservative thresholds
            keepComponent = comp.size >= 12 && comp.density > 0.4;
        }

        // Special handling for very small but dense components (could be vias/pads)
        if (!keepComponent && comp.size >= 4 && comp.density > 0.8) {
            keepComponent = true;
        }

        if (keepComponent) {
            for (const pixelIdx of comp.pixels) {
                filtered[pixelIdx] = mask[pixelIdx];
            }
        }
    }

    return filtered;
}

/**
 * Diagonal-aware morphological erosion
 */
export function diagonalAwareMorphologicalErosion(mask: Uint8Array, width: number, height: number, kernelSize: number): Uint8Array {
    const result = new Uint8Array(mask.length);
    const radius = Math.floor(kernelSize / 2);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (mask[idx] === 0) continue;

            // Check if this might be part of a diagonal line
            let isDiagonalFeature = false;
            if (radius > 0) {
                // Check diagonal neighbors
                const diagonalNeighbors = [
                    (y > 0 && x > 0) ? mask[(y-1) * width + (x-1)] : 0,      // NW
                    (y > 0 && x < width-1) ? mask[(y-1) * width + (x+1)] : 0, // NE
                    (y < height-1 && x > 0) ? mask[(y+1) * width + (x-1)] : 0, // SW
                    (y < height-1 && x < width-1) ? mask[(y+1) * width + (x+1)] : 0 // SE
                ];
                
                const diagonalCount = diagonalNeighbors.filter(n => n > 0).length;
                const orthogonalNeighbors = [
                    (y > 0) ? mask[(y-1) * width + x] : 0,      // N
                    (y < height-1) ? mask[(y+1) * width + x] : 0, // S
                    (x > 0) ? mask[y * width + (x-1)] : 0,      // W
                    (x < width-1) ? mask[y * width + (x+1)] : 0  // E
                ];
                const orthogonalCount = orthogonalNeighbors.filter(n => n > 0).length;
                
                // Consider it diagonal if more diagonal than orthogonal connections
                isDiagonalFeature = diagonalCount > orthogonalCount;
            }

            let keepPixel = true;
            
            if (isDiagonalFeature) {
                // For diagonal features, be more lenient - only require most neighbors
                let nonZeroCount = 0;
                let totalCount = 0;
                
                for (let dy = -radius; dy <= radius && keepPixel; dy++) {
                    for (let dx = -radius; dx <= radius && keepPixel; dx++) {
                        const ny = y + dy;
                        const nx = x + dx;
                        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                            const neighborIdx = ny * width + nx;
                            totalCount++;
                            if (mask[neighborIdx] > 0) {
                                nonZeroCount++;
                            }
                        }
                    }
                }
                // For diagonal features, require 70% of neighbors instead of 100%
                keepPixel = nonZeroCount >= Math.ceil(totalCount * 0.7);
            } else {
                // Standard erosion for non-diagonal features
                for (let dy = -radius; dy <= radius && keepPixel; dy++) {
                    for (let dx = -radius; dx <= radius && keepPixel; dx++) {
                        const ny = y + dy;
                        const nx = x + dx;
                        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                            const neighborIdx = ny * width + nx;
                            if (mask[neighborIdx] === 0) {
                                keepPixel = false;
                            }
                        } else {
                            // Treat out-of-bounds as zero
                            keepPixel = false;
                        }
                    }
                }
            }

            if (keepPixel) {
                result[idx] = mask[idx];
            }
        }
    }

    return result;
}

/**
 * Diagonal-aware morphological opening
 */
export function diagonalAwareMorphologicalOpening(mask: Uint8Array, width: number, height: number, kernelSize: number): Uint8Array {
    // Use diagonal-aware erosion followed by regular dilation
    const eroded = diagonalAwareMorphologicalErosion(mask, width, height, kernelSize);
    return morphologicalDilation(eroded, width, height, kernelSize);
}

/**
 * Improved frequency domain filtering that preserves diagonal features
 */
export function improvedFrequencyDomainFilter(mask: Uint8Array, width: number, height: number): Uint8Array {
    const filtered = new Uint8Array(mask.length);
    
    // Modified kernel that better preserves diagonal features
    const kernel = [
        1/12, 1/8,  1/12,
        1/8,  1/3,  1/8,
        1/12, 1/8,  1/12
    ];
    
    // Apply convolution
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            
            // Check if this might be a diagonal feature
            const diagonalNeighbors = [
                mask[(y-1) * width + (x-1)], // NW
                mask[(y-1) * width + (x+1)], // NE
                mask[(y+1) * width + (x-1)], // SW
                mask[(y+1) * width + (x+1)]  // SE
            ];
            const orthogonalNeighbors = [
                mask[(y-1) * width + x],     // N
                mask[(y+1) * width + x],     // S
                mask[y * width + (x-1)],     // W
                mask[y * width + (x+1)]      // E
            ];
            
            const diagonalCount = diagonalNeighbors.filter(n => n > 0).length;
            const orthogonalCount = orthogonalNeighbors.filter(n => n > 0).length;
            const isDiagonal = diagonalCount > orthogonalCount;
            
            let sum = 0;
            for (let ky = 0; ky < 3; ky++) {
                for (let kx = 0; kx < 3; kx++) {
                    const neighborIdx = (y + ky - 1) * width + (x + kx - 1);
                    sum += mask[neighborIdx] * kernel[ky * 3 + kx];
                }
            }
            
            // Use lower threshold for diagonal features to preserve them
            const threshold = isDiagonal ? 0.2 : 0.3;
            filtered[idx] = sum > threshold ? 1 : 0;
        }
    }
    
    // Copy border pixels as-is
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                filtered[y * width + x] = mask[y * width + x];
            }
        }
    }
    
    return filtered;
}

/**
 * Multi-scale morphological filtering with diagonal awareness
 */
export function multiScaleMorphologicalDiagonalAware(mask: Uint8Array, width: number, height: number): Uint8Array {
    // Apply morphological operations at different scales and combine
    const scales = [1, 2];
    const results: Uint8Array[] = [];
    
    for (const scale of scales) {
        let processed = diagonalAwareMorphologicalOpening(mask, width, height, scale);
        // For larger scales, be more conservative
        if (scale > 1) {
            processed = morphologicalClosing(processed, width, height, scale);
        }
        results.push(processed);
    }
    
    // Combine results - a pixel is kept if it survives in any scale
    const combined = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
        combined[i] = results.some(result => result[i] > 0) ? 1 : 0;
    }
    
    return combined;
}

/**
 * Morphological closing (dilation followed by erosion)
 */
export function morphologicalClosing(mask: Uint8Array, width: number, height: number, kernelSize: number): Uint8Array {
    // Dilation followed by erosion to fill small gaps
    const dilated = morphologicalDilation(mask, width, height, kernelSize);
    return morphologicalErosion(dilated, width, height, kernelSize);
}

/**
 * Applies morphological opening (erosion followed by dilation) to a binary mask
 */
export function morphologicalOpening(mask: Uint8Array, width: number, height: number, kernelSize: number): Uint8Array {
    // Erosion followed by dilation to remove small features
    const eroded = morphologicalErosion(mask, width, height, kernelSize);
    return morphologicalDilation(eroded, width, height, kernelSize);
}

/**
 * Applies morphological erosion to a binary mask
 */
export function morphologicalErosion(mask: Uint8Array, width: number, height: number, kernelSize: number): Uint8Array {
    const result = new Uint8Array(mask.length);
    const radius = Math.floor(kernelSize / 2);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (mask[idx] === 0) continue;

            let keepPixel = true;
            // Check if all pixels in kernel are non-zero
            for (let dy = -radius; dy <= radius && keepPixel; dy++) {
                for (let dx = -radius; dx <= radius && keepPixel; dx++) {
                    const ny = y + dy;
                    const nx = x + dx;
                    if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                        const neighborIdx = ny * width + nx;
                        if (mask[neighborIdx] === 0) {
                            keepPixel = false;
                        }
                    } else {
                        // Treat out-of-bounds as zero
                        keepPixel = false;
                    }
                }
            }

            if (keepPixel) {
                result[idx] = mask[idx];
            }
        }
    }

    return result;
}

/**
 * Applies morphological dilation to a binary mask
 */
export function morphologicalDilation(mask: Uint8Array, width: number, height: number, kernelSize: number): Uint8Array {
    const result = new Uint8Array(mask.length);
    const radius = Math.floor(kernelSize / 2);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;

            // Check if any pixel in kernel is non-zero
            let hasNonZero = false;
            for (let dy = -radius; dy <= radius && !hasNonZero; dy++) {
                for (let dx = -radius; dx <= radius && !hasNonZero; dx++) {
                    const ny = y + dy;
                    const nx = x + dx;
                    if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                        const neighborIdx = ny * width + nx;
                        if (mask[neighborIdx] > 0) {
                            hasNonZero = true;
                        }
                    }
                }
            }

            if (hasNonZero) {
                result[idx] = 1;
            }
        }
    }

    return result;
}

/**
 * Filters anti-aliasing artifacts from a binary mask
 */
export function filterAntiAliasingArtifacts(mask: Uint8Array, width: number, height: number): Uint8Array {
    const filtered = new Uint8Array(mask.length);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (mask[idx] === 0) continue;

            // Count non-zero neighbors in 3x3 window
            let neighborCount = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const neighborIdx = (y + dy) * width + (x + dx);
                    if (mask[neighborIdx] > 0) {
                        neighborCount++;
                    }
                }
            }

            // Be less aggressive - only filter completely isolated pixels (0 neighbors)
            // This reduces over-filtering while still removing obvious artifacts
            if (neighborCount >= 1) {
                filtered[idx] = mask[idx];
            }
        }
    }

    return filtered;
}

/**
 * Applies a series of filters to remove visual artifacts from a difference mask
 */
export function filterVisualArtifacts(diffMask: Uint8Array, width: number, height: number): Uint8Array {
    // Apply improved frequency domain filtering first to remove high-frequency noise while preserving diagonals
    let filtered = improvedFrequencyDomainFilter(diffMask, width, height);
    
    // Apply advanced connected component analysis instead of simple small difference filtering
    filtered = advancedConnectedComponentAnalysis(filtered, width, height);
    
    // Apply diagonal-aware multi-scale morphological filtering
    filtered = multiScaleMorphologicalDiagonalAware(filtered, width, height);
    
    // Apply bilateral-style filtering to reduce noise while preserving edges
    filtered = bilateralStyleFilter(filtered, width, height);

    // Apply simple edge artifact reduction (only affects image borders)
    filtered = reduceEdgeArtifacts(filtered, width, height);

    // Apply conservative edge-aware filtering
    filtered = filterAntiAliasingArtifacts(filtered, width, height);

    return filtered;
}