import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'node:crypto';
import { KiCAD } from '../../kicad.js';
import { allLayers, standardLayers } from '../constants.js';
import {
  executeKicadSvgExportCached,
  computeSvgBBox,
  cropSvgToBBox,
  detectInnerCopperLayers,
  type BBox,
} from '../utils/file-utils.js';
import { LayerInfo, generateHtmlReport } from '../utils/html-generator.js';
import {
  computeTextualDiff,
  computeNetlistDiff,
  computeBomDiff,
  computePcbBBox,
  type TextualDiff,
  type NetlistDiff,
  type BomDiff,
} from './pcb-textual-diff.js';
import { annotateLayerSvgs } from './svg-diff-annotator.js';
import logger from '../../utils/logging.js';

export interface DiffOptions {
  originalFile: string;
  modifiedFile: string;
  fullMode: boolean;
  theme?: string;
  outputHtmlPath?: string;
}

function normalizeSvg(svg: string): string {
  const normalized = svg
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
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
    const baseLayers = fullMode ? allLayers : standardLayers;

    const copperLayers = [...detectInnerCopperLayers(originalFile), ...detectInnerCopperLayers(modifiedFile)];
    const uniqueCopperLayers = [...new Set(copperLayers)];

    const layers = [...baseLayers];
    for (const cl of uniqueCopperLayers) {
      if (!layers.includes(cl)) {
        layers.push(cl);
      }
    }

    const allSvgResults: Array<{ originalSvg: string; modifiedSvg: string } | null> = [];

    if (!KiCAD.cliPath) {
      throw new Error(
        'KiCAD CLI not found. Ensure KiCAD is installed and accessible. You may need to run `new KiCAD()` before calling generateDiffs().',
      );
    }
    for (const layer of layers) {
      let orig = '';
      let mod = '';
      try {
        orig = await executeKicadSvgExportCached(layer, originalFile, theme);
      } catch (e) {
        logger.warn(`Warning: failed to export layer "${layer}" from original file:`, e);
      }
      try {
        mod = await executeKicadSvgExportCached(layer, modifiedFile, theme);
      } catch (e) {
        logger.warn(`Warning: failed to export layer "${layer}" from modified file:`, e);
      }
      allSvgResults.push(orig || mod ? { originalSvg: orig, modifiedSvg: mod } : null);
    }

    let sharedBBox: BBox | null = null;
    for (const result of allSvgResults) {
      if (result) {
        if (result.originalSvg) sharedBBox = unionBBoxes(sharedBBox, computeSvgBBox(result.originalSvg));
        if (result.modifiedSvg) sharedBBox = unionBBoxes(sharedBBox, computeSvgBBox(result.modifiedSvg));
      }
    }

    for (let i = 0; i < layers.length; i++) {
      const result = allSvgResults[i];
      if (!result) continue;

      const { originalSvg, modifiedSvg } = result;
      if (!originalSvg && !modifiedSvg) continue;

      let hasDifferences =
        originalSvg !== modifiedSvg && normalizeSvg(originalSvg || '') !== normalizeSvg(modifiedSvg || '');

      const croppedOriginal = originalSvg && sharedBBox ? cropSvgToBBox(originalSvg, sharedBBox) : originalSvg;
      const croppedModified = modifiedSvg && sharedBBox ? cropSvgToBBox(modifiedSvg, sharedBBox) : modifiedSvg;

      let annotatedOriginalSvg: string | null = null;
      let annotatedModifiedSvg: string | null = null;

      if (hasDifferences && croppedOriginal && croppedModified) {
        try {
          const annotation = annotateLayerSvgs(croppedOriginal, croppedModified);
          if (annotation) {
            annotatedOriginalSvg = annotation.annotatedOriginal;
            annotatedModifiedSvg = annotation.annotatedModified;
          } else {
            hasDifferences = false;
          }
        } catch (e) {
          logger.warn(`Warning: annotation failed for layer "${layers[i]}":`, e);
        }
      }

      htmlLayers.push({
        name: layers[i],
        originalSvg: croppedOriginal,
        modifiedSvg: croppedModified,
        annotatedOriginalSvg,
        annotatedModifiedSvg,
        hasDifferences,
      });
    }

    const htmlFilePath = outputHtmlPath || path.join(path.dirname(modifiedFile), 'gitdiff-results.html');

    let textualDiff: TextualDiff | undefined;
    let netlistDiff: NetlistDiff | undefined;
    let bomDiff: BomDiff | undefined;
    let svgOffset: { x: number; y: number } | undefined;
    try {
      const origContent = fs.readFileSync(originalFile, 'utf8');
      const modContent = fs.readFileSync(modifiedFile, 'utf8');
      textualDiff = computeTextualDiff(origContent, modContent);
      netlistDiff = computeNetlistDiff(origContent, modContent);
      bomDiff = computeBomDiff(origContent, modContent);

      if (sharedBBox) {
        const origBBox = computePcbBBox(origContent);
        const modBBox = computePcbBBox(modContent);
        let pcbBBox: { minX: number; minY: number } | null = null;
        if (origBBox && modBBox) {
          pcbBBox = {
            minX: Math.min(origBBox.minX, modBBox.minX),
            minY: Math.min(origBBox.minY, modBBox.minY),
          };
        } else {
          pcbBBox = origBBox || modBBox;
        }

        if (pcbBBox) {
          // computeSvgBBox adds 2mm padding; undo it for the coordinate offset
          const SVG_BBOX_PADDING = 2;
          svgOffset = {
            x: sharedBBox.minX - pcbBBox.minX + SVG_BBOX_PADDING,
            y: sharedBBox.minY - pcbBBox.minY + SVG_BBOX_PADDING,
          };
        } else {
        }
      } else {
      }
    } catch (e) {
      logger.debug('diff-generator: SVG offset calculation failed', e);
    }

    const htmlContent = await generateHtmlReport(
      htmlLayers,
      textualDiff,
      netlistDiff,
      bomDiff,
      { original: originalFile, modified: modifiedFile },
      svgOffset,
    );
    fs.writeFileSync(htmlFilePath, htmlContent);

    const diffSvgDir = path.join(path.dirname(modifiedFile), '_diff_svgs');
    if (fs.existsSync(diffSvgDir)) {
      try {
        fs.rmSync(diffSvgDir, { recursive: true, force: true });
      } catch (cleanupError) {
        logger.warn(`Warning: Failed to clean up _diff_svgs directory:`, cleanupError);
      }
    }

    logger.info(`HTML report generated at: ${htmlFilePath}`);
    return htmlFilePath;
  } catch (error) {
    logger.error('Error:', error);
    throw error;
  }
}
