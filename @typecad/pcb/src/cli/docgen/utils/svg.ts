import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { KiCAD } from '../../../kicad.js';
import { buildKiCADArgs } from '../../../kicad_commands.js';
import { tempManager } from './tempFileManager.js';
import { renderNativeDrillSvg, renderNativeLayerSvg } from './nativeRender.js';

const execFileAsync = promisify(execFile);

let imageSeq = 0;

/** id prefix unique to one inlined doc image (keeps SVG symbol ids from
 *  colliding when several images land in the same HTML document — the
 *  sequence number keeps two images with the same file basename apart). */
function svgIdPrefix(imagePath: string): string {
  const slug = path
    .basename(imagePath, path.extname(imagePath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `img-${++imageSeq}-${slug || 'layer'}`;
}

/**
 * Drill map image for `![{Drill}](…)`: natively plotted Excellon holes over
 * the board outline — no kicad-cli.
 */
export async function renderDrillMap(pcbFilePath: string, imagePath: string): Promise<string> {
  return renderNativeDrillSvg(pcbFilePath, svgIdPrefix(imagePath));
}

/**
 * Layer-combination image for `![{F.Cu,F.Mask}](…)` layers: native gerber
 * plot + native SVG render — no kicad-cli. Back-side combinations mirror
 * (kicad-cli `--mirror` parity).
 */
export async function renderLayerImage(
  layerNames: string[],
  pcbFilePath: string,
  theme: string,
  imagePath: string,
): Promise<string> {
  return renderNativeLayerSvg(pcbFilePath, layerNames, theme, svgIdPrefix(imagePath));
}

/**
 * 3D render for `![{Render/side/x/y/z}](…)` — the one doc image that still
 * needs kicad-cli (no native 3D renderer). Returns null (image skipped,
 * caller warns) when no KiCad install is discoverable; genuine render
 * failures still throw.
 */
export async function renderKicad3DView(
  renderSpec: { side: string; x: string; y: string; z: string },
  pcbFilePath: string,
): Promise<Buffer | null> {
  if (!KiCAD.isAvailable()) return null;

  const tempOutputPath = tempManager.createTempFilePath('.png');

  const { executable, execArgs } = buildKiCADArgs('pcb', [
    'render',
    '--preset',
    'follow_pcb_editor',
    '--perspective',
    '--quality',
    'high',
    '--side',
    renderSpec.side,
    '--background',
    'transparent',
    '--rotate',
    `${renderSpec.x},${renderSpec.y},${renderSpec.z}`,
    '--output',
    tempOutputPath,
    pcbFilePath,
  ]);
  await execFileAsync(executable, execArgs);

  const buffer = await fs.readFile(tempOutputPath);
  await tempManager.cleanupFileAsync(tempOutputPath);
  return buffer;
}
