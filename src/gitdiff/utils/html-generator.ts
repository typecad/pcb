import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { TextualDiff, NetlistDiff, BomDiff } from '../core/pcb-textual-diff.js';
import { sanitizeSvg } from './file-utils.js';

export interface LayerInfo {
  name: string;
  originalSvg: string | null;
  modifiedSvg: string | null;
  annotatedOriginalSvg: string | null;
  annotatedModifiedSvg: string | null;
  hasDifferences: boolean;
}

function cleanSvgForInlining(svgContent: string): string {
  let svg = sanitizeSvg(svgContent);
  svg = svg.replace(/<\?xml[^?]*\?>\s*/g, '');
  svg = svg.replace(/<!DOCTYPE[^>]*>\s*/g, '');
  svg = svg.replace(/(<svg\b[^>]*?)\bwidth="[^"]*"/, '$1width="100%"');
  svg = svg.replace(/(<svg\b[^>]*?)\bheight="[^"]*"/, '$1height="100%"');
  return svg.trim();
}

export async function generateHtmlReport(
  htmlLayers: LayerInfo[],
  textualDiff?: TextualDiff,
  netlistDiff?: NetlistDiff,
  bomDiff?: BomDiff,
  fileNames?: { original: string; modified: string },
  svgOffset?: { x: number; y: number },
): Promise<string> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const templatePath = path.join(currentDir, '..', 'diff-viewer.html');

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Could not find diff-viewer.html template at: ${templatePath}`);
  }

  let htmlContent = fs.readFileSync(templatePath, 'utf8');

  const layerData = htmlLayers.map((layer) => ({
    name: layer.name,
    originalSvg: layer.originalSvg ? cleanSvgForInlining(layer.originalSvg) : null,
    modifiedSvg: layer.modifiedSvg ? cleanSvgForInlining(layer.modifiedSvg) : null,
    annotatedOriginalSvg: layer.annotatedOriginalSvg ? cleanSvgForInlining(layer.annotatedOriginalSvg) : null,
    annotatedModifiedSvg: layer.annotatedModifiedSvg ? cleanSvgForInlining(layer.annotatedModifiedSvg) : null,
    hasDifferences: layer.hasDifferences,
  }));

  function safeJson(value: unknown): string {
    return JSON.stringify(value).replace(/<\/script>/gi, '<\\/script>');
  }

  const layerDataScript = `
    <script>
      document.addEventListener("DOMContentLoaded", function () {
        setLayerData(${safeJson(layerData)});
        ${svgOffset ? `setSvgOffset(${svgOffset.x}, ${svgOffset.y});` : ''}
        ${textualDiff ? `setTextualDiff(${safeJson(textualDiff)});` : ''}
        ${netlistDiff ? `setNetlistDiff(${safeJson(netlistDiff)});` : ''}
        ${bomDiff ? `setBomDiff(${safeJson(bomDiff)});` : ''}
      });
    </script>
    `;

  htmlContent = htmlContent.replace('</body>', layerDataScript + '</body>');

  const timestamp = new Date().toISOString();
  const cacheId = Date.now();
  const titleBase = fileNames
    ? `${path.basename(fileNames.original)} vs ${path.basename(fileNames.modified)}`
    : 'PCB Layer Diff Viewer';
  htmlContent = htmlContent.replace(
    '<title>PCB Layer Diff Viewer</title>',
    `<title>${titleBase} - ${timestamp}</title>`,
  );

  htmlContent = htmlContent.replace(
    '<meta name="viewport"',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:;" />
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta http-equiv="Pragma" content="no-cache" />
        <meta http-equiv="Expires" content="0" />
        <meta name="cache-id" content="${cacheId}" />
        <meta name="viewport"`,
  );

  return htmlContent;
}
