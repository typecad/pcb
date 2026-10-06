// ---------------------------------------------------------------------------
// Board artwork manifest: every Image the build placed, written to
// build/<board>_images.json beside the board (the pads manifest's shape).
// The layout view reads it through the page's data islands so APPLIED
// artwork becomes a selectable object — click to select, E to move/resize/
// flip/replace, Del to remove from source.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { getBuildDir } from '../utils/constants.js';
import { addOutputPath } from '../cli/pending_summary.js';
import logger from '../utils/logging.js';
import type { Image } from './pcb_image.js';

export interface ImagesManifestEntry {
  /** project-relative path as written in the Image statement */
  file: string;
  /** artwork center, board frame mm */
  x: number;
  y: number;
  /** placed box, mm (aspect already applied) */
  w: number;
  h: number;
  side: 'front' | 'back';
}

export function writeImagesManifest(images: Image[], boardName: string): void {
  try {
    const entries: ImagesManifestEntry[] = images.map((img) => {
      const box = img.placementBox();
      return {
        file: box.file,
        x: +box.x.toFixed(4),
        y: +box.y.toFixed(4),
        w: +box.w.toFixed(4),
        h: +box.h.toFixed(4),
        side: box.side,
      };
    });
    const outPath = path.join(getBuildDir(), `${boardName}_images.json`);
    fs.mkdirSync(getBuildDir(), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ images: entries }, null, 2));
    if (entries.length > 0) {
      addOutputPath(outPath);
      logger.info(`images manifest: ${entries.length} artwork(s) -> ${outPath}`);
    }
  } catch (error) {
    logger.warn(`could not write images manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
}
