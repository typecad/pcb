import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { TextualDiff } from '../core/pcb-textual-diff.js';

export interface LayerInfo {
    name: string;
    originalSvg: string | null;
    modifiedSvg: string | null;
    hasDifferences: boolean;
}

function cleanSvgForInlining(svgContent: string): string {
    let svg = svgContent.replace(/<\?xml[^?]*\?>\s*/g, '');
    svg = svg.replace(/<!DOCTYPE[^>]*>\s*/g, '');
    svg = svg.replace(/(<svg\b[^>]*?)\bwidth="[^"]*"/, '$1width="100%"');
    svg = svg.replace(/(<svg\b[^>]*?)\bheight="[^"]*"/, '$1height="100%"');
    return svg.trim();
}

export async function generateHtmlReport(htmlLayers: LayerInfo[], textualDiff?: TextualDiff): Promise<string> {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.resolve(currentDir, '..', '..');
    const templatePath = path.join(projectRoot, 'diff-viewer.html');

    if (!fs.existsSync(templatePath)) {
        throw new Error(`Could not find diff-viewer.html template at: ${templatePath}`);
    }

    let htmlContent = fs.readFileSync(templatePath, 'utf8');

    const layerData = htmlLayers.map(layer => ({
        name: layer.name,
        originalSvg: layer.originalSvg ? cleanSvgForInlining(layer.originalSvg) : null,
        modifiedSvg: layer.modifiedSvg ? cleanSvgForInlining(layer.modifiedSvg) : null,
        hasDifferences: layer.hasDifferences
    }));

    const layerDataScript = `
    <script>
      document.addEventListener("DOMContentLoaded", function () {
        setLayerData(${JSON.stringify(layerData)});
        ${textualDiff ? `setTextualDiff(${JSON.stringify(textualDiff)});` : ''}
      });
    </script>
    `;

    htmlContent = htmlContent.replace('</body>', layerDataScript + '</body>');

    const timestamp = new Date().toISOString();
    const cacheId = Date.now();
    htmlContent = htmlContent.replace('<title>PCB Layer Diff Viewer</title>',
        `<title>PCB Layer Diff Viewer - ${timestamp}</title>`);

    htmlContent = htmlContent.replace('<meta name="viewport"',
        `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta http-equiv="Pragma" content="no-cache" />
        <meta http-equiv="Expires" content="0" />
        <meta name="cache-id" content="${cacheId}" />
        <meta name="viewport"`);

    return htmlContent;
}
