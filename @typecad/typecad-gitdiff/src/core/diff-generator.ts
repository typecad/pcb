import * as fs from 'fs';
import * as path from 'path';
import { kicad_cli_path } from '@typecad/typecad';
import { allLayers, standardLayers } from '../constants.js';
import { executeKicadSvgExport, computeSvgBBox, cropSvgToBBox, type BBox } from '../utils/file-utils.js';
import { LayerInfo, generateHtmlReport } from '../utils/html-generator.js';
import { computeTextualDiff, type TextualDiff } from './pcb-textual-diff.js';

export interface DiffOptions {
    originalFile: string;
    modifiedFile: string;
    fullMode: boolean;
    theme?: string;
    colorModified?: string;
    colorNew?: string;
    outputHtmlPath?: string;
}

function normalizeSvg(svg: string): string {
    return svg.replace(/<title>[\s\S]*?<\/title>/g, '').replace(/\s+/g, ' ').trim();
}

function unionBBoxes(a: BBox | null, b: BBox | null): BBox | null {
    if (!a) return b;
    if (!b) return a;
    return {
        minX: Math.min(a.minX, b.minX),
        minY: Math.min(a.minY, b.minY),
        maxX: Math.max(a.maxX, b.maxX),
        maxY: Math.max(a.maxY, b.maxY),
    };
}

export async function generateDiffs(options: DiffOptions): Promise<string> {
    const { originalFile, modifiedFile, fullMode, theme, outputHtmlPath } = options;
    const htmlLayers: LayerInfo[] = [];

    try {
        const layers = fullMode ? allLayers : standardLayers;

        const exportPromises = layers.flatMap(layer => [
            executeKicadSvgExport(kicad_cli_path!, layer, originalFile, theme),
            executeKicadSvgExport(kicad_cli_path!, layer, modifiedFile, theme)
        ]);
        const results = await Promise.all(exportPromises);

        let sharedBBox: BBox | null = null;
        for (const svg of results) {
            if (svg) {
                sharedBBox = unionBBoxes(sharedBBox, computeSvgBBox(svg));
            }
        }

        for (let i = 0; i < layers.length; i++) {
            const originalSvg = results[i * 2];
            const modifiedSvg = results[i * 2 + 1];

            if (!originalSvg && !modifiedSvg) {
                continue;
            }

            const hasDifferences = originalSvg !== modifiedSvg
                && normalizeSvg(originalSvg || '') !== normalizeSvg(modifiedSvg || '');

            const croppedOriginal = originalSvg && sharedBBox ? cropSvgToBBox(originalSvg, sharedBBox) : originalSvg;
            const croppedModified = modifiedSvg && sharedBBox ? cropSvgToBBox(modifiedSvg, sharedBBox) : modifiedSvg;

            htmlLayers.push({
                name: layers[i],
                originalSvg: croppedOriginal,
                modifiedSvg: croppedModified,
                hasDifferences
            });

            if (hasDifferences && croppedOriginal && croppedModified) {
                const debugDir = path.join(path.dirname(modifiedFile), '_debug_svgs');
                if (!fs.existsSync(debugDir)) {
                    fs.mkdirSync(debugDir, { recursive: true });
                }
                const safeName = layers[i].replace(/\./g, '_');
                const baseName = path.basename(modifiedFile, '.kicad_pcb');
                fs.writeFileSync(path.join(debugDir, `${baseName}_${safeName}_original.svg`), croppedOriginal);
                fs.writeFileSync(path.join(debugDir, `${baseName}_${safeName}_modified.svg`), croppedModified);
            }
        }

        const htmlFilePath = outputHtmlPath || path.join(path.dirname(modifiedFile), 'gitdiff-results.html');

        let textualDiff: TextualDiff | undefined;
        try {
            const origContent = fs.readFileSync(originalFile, 'utf8');
            const modContent = fs.readFileSync(modifiedFile, 'utf8');
            textualDiff = computeTextualDiff(origContent, modContent);
        } catch {
            // Textual diff is optional — don't block the main flow
        }

        const htmlContent = await generateHtmlReport(htmlLayers, textualDiff);
        fs.writeFileSync(htmlFilePath, htmlContent);

        console.log(`HTML report generated at: ${htmlFilePath}`);
        return htmlFilePath;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}
