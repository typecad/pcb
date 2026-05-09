import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';
import { generateStackupSvgFromFile } from './pcbLayerRenderer.js';

interface ProcessingContext {
    basePath: string;
    outputPath: string;
}

export async function processSpecialDirectives(content: string, context: ProcessingContext): Promise<string> {
    // Process ![{Stackup}](path/to/output.png =width) directives
    const regex = /!\[{Stackup}\]\(([^)]+?)(?:\s*=\s*(\d+))?\)/g;
    const matches = content.matchAll(regex);
    
    for (const match of matches) {
        const [fullMatch, outputPath, width] = match;
        try {
            // Get input file from process.argv[3]
            const inputFile = process.argv[3];
            if (!inputFile) {
                throw new Error('No input PCB file specified (expected as process.argv[3])');
            }

            // Clean up and resolve the output path
            const cleanOutputPath = outputPath.trim();
            const absoluteOutputPath = path.resolve(context.basePath, cleanOutputPath);
            
            // Ensure output directory exists
            const outputDir = path.dirname(absoluteOutputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // First generate SVG
            const tempSvgPath = absoluteOutputPath.replace(/\.png$/, '_temp.svg');
            generateStackupSvgFromFile(inputFile);

            // Convert SVG to PNG using sharp
            const svgBuffer = fs.readFileSync(tempSvgPath);
            
            // Set width if specified
            const sharpOptions: any = {};
            if (width) {
                sharpOptions.width = parseInt(width);
                sharpOptions.fit = 'contain';
                sharpOptions.background = { r: 255, g: 255, b: 255, alpha: 1 };
            }

            await sharp(svgBuffer)
                .resize(sharpOptions)
                .png()
                .toFile(absoluteOutputPath);

            // Clean up temporary SVG
            fs.unlinkSync(tempSvgPath);

            // Replace the match in content
            content = content.replace(fullMatch, fullMatch);
        } catch (error) {
            console.error(`Error processing Stackup directive:`, error);
            content = content.replace(fullMatch, '[Error generating PCB Layer Stackup]');
        }
    }

    // Add other special directives here ({layer}, {Render}, etc.)

    return content;
} 