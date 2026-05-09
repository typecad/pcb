/**
 * HTML generation utilities for typecad-gitdiff
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

/**
 * Layer information for HTML generation
 */
export interface LayerInfo {
    name: string;
    originalImage: string | null;
    diffImage: string | null;
    modifiedImage: string | null;
}

/**
 * Fetches content from a URL
 */
async function fetchUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Converts a file path to a base64 data URL
 */
function fileToDataUrl(filePath: string): string {
    try {
        if (fs.existsSync(filePath)) {
            const buffer = fs.readFileSync(filePath);
            const base64 = buffer.toString('base64');
            const ext = path.extname(filePath).toLowerCase();
            let mimeType = 'image/png'; // default
            
            // Determine MIME type based on file extension
            switch (ext) {
                case '.png':
                    mimeType = 'image/png';
                    break;
                case '.jpg':
                case '.jpeg':
                    mimeType = 'image/jpeg';
                    break;
                case '.svg':
                    mimeType = 'image/svg+xml';
                    break;
                case '.gif':
                    mimeType = 'image/gif';
                    break;
                case '.webp':
                    mimeType = 'image/webp';
                    break;
            }
            
            return `data:${mimeType};base64,${base64}`;
        }
    } catch (error) {
        console.warn(`Failed to convert file to data URL: ${filePath}`, error);
    }
    return '';
}

/**
 * Converts all image paths in LayerInfo to base64 data URLs
 */
function convertImagesToDataUrls(layers: LayerInfo[], outputDir: string): LayerInfo[] {
    return layers.map(layer => {
        const convertedLayer: LayerInfo = {
            name: layer.name,
            originalImage: null,
            diffImage: layer.diffImage, // Already a data URL
            modifiedImage: null
        };

        // Convert original image if it's a file path
        if (layer.originalImage && !layer.originalImage.startsWith('data:')) {
            const originalImagePath = path.join(outputDir, layer.originalImage);
            convertedLayer.originalImage = fileToDataUrl(originalImagePath);
        } else {
            convertedLayer.originalImage = layer.originalImage;
        }

        // Convert modified image if it's a file path
        if (layer.modifiedImage && !layer.modifiedImage.startsWith('data:')) {
            const modifiedImagePath = path.join(outputDir, layer.modifiedImage);
            convertedLayer.modifiedImage = fileToDataUrl(modifiedImagePath);
        } else {
            convertedLayer.modifiedImage = layer.modifiedImage;
        }

        return convertedLayer;
    });
}

/**
 * Generates HTML content for the comparison results using the new diff viewer
 */
export async function generateHtmlReport(
    htmlLayers: LayerInfo[],
    colorModified: { r: number; g: number; b: number } = { r: 255, g: 102, b: 0 },
    colorNew: { r: number; g: number; b: number } = { r: 0, g: 255, b: 0 },
    outputDir?: string
): Promise<string> {
    // Find the template file - it should be in the project root
    // Use the directory where this script is located to find the project root
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.resolve(currentDir, '..', '..');
    const templatePath = path.join(projectRoot, 'diff-viewer.html');

    if (!fs.existsSync(templatePath)) {
        throw new Error(`Could not find diff-viewer.html template at: ${templatePath}`);
    }

    let htmlContent = fs.readFileSync(templatePath, 'utf8');

    // Convert all image paths to base64 data URLs if outputDir is provided
    const processedLayers = outputDir ? convertImagesToDataUrls(htmlLayers, outputDir) : htmlLayers;

    // Inject the layer data into the HTML
    const layerDataScript = `
    <script>
      // Override the loadLayerData function with actual data
      document.addEventListener("DOMContentLoaded", function () {
        const actualLayerData = ${JSON.stringify(processedLayers)};
        setLayerData(actualLayerData);
      });
    </script>
    `;

    // Insert the script before the closing body tag
    htmlContent = htmlContent.replace('</body>', layerDataScript + '</body>');

    // Add cache-busting and unique identifier
    const timestamp = new Date().toISOString();
    const cacheId = Date.now();
    htmlContent = htmlContent.replace('<title>PCB Layer Diff Viewer</title>',
        `<title>PCB Layer Diff Viewer - ${timestamp}</title>`);

    // Add cache-busting meta tag
    htmlContent = htmlContent.replace('<meta name="viewport"',
        `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta http-equiv="Pragma" content="no-cache" />
        <meta http-equiv="Expires" content="0" />
        <meta name="cache-id" content="${cacheId}" />
        <meta name="viewport"`);

    // Inject custom colors into the CSS
    const modifiedColorHex = `#${colorModified.r.toString(16).padStart(2, '0')}${colorModified.g.toString(16).padStart(2, '0')}${colorModified.b.toString(16).padStart(2, '0')}`;
    const newColorHex = `#${colorNew.r.toString(16).padStart(2, '0')}${colorNew.g.toString(16).padStart(2, '0')}${colorNew.b.toString(16).padStart(2, '0')}`;

    // Replace the hardcoded colors in the CSS
    htmlContent = htmlContent.replace(
        'background-color: #f97316; /* Orange for removed features */',
        `background-color: ${modifiedColorHex}; /* Custom color for removed features */`
    );
    htmlContent = htmlContent.replace(
        'background-color: #22c55e; /* Green for added features */',
        `background-color: ${newColorHex}; /* Custom color for added features */`
    );

    return htmlContent;
}