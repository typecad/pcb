import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pathExists, ensureDir } from './fs.js';
import logger from '../../../utils/logging.js';
import { tempManager } from './tempFileManager.js';
import { cropSvg } from '../../../gitdiff/utils/file-utils.js';
import { buildKiCADArgs } from '../../../kicad_commands.js';

const execFileAsync = promisify(execFile);

export { cropSvg };

export async function writeStringToFile(content: string, outputPath: string): Promise<string> {
  const outputDir = path.dirname(outputPath);
  const dirExists = await pathExists(outputDir);
  if (!dirExists) {
    await ensureDir(outputDir);
  }
  await fs.writeFile(outputPath, content, 'utf-8');
  return outputPath;
}

export async function executeKicadSvgExport(pcbFilePath: string, layer: string, theme: string): Promise<string> {
  const tempSvgPath = tempManager.createTempFilePath('.svg');
  let bMirror = false;
  if (layer.includes('B.')) {
    bMirror = true;
  }
  const { executable, execArgs } = buildKiCADArgs('pcb', [
    'export',
    'svg',
    '--theme',
    theme,
    ...(bMirror ? ['--mirror'] : []),
    '--drill-shape-opt',
    '0',
    '--cdnp',
    '--exclude-drawing-sheet',
    '--page-size-mode',
    '2',
    '--layers',
    layer,
    '--mode-single',
    '--output',
    tempSvgPath,
    pcbFilePath,
  ]);
  await execFileAsync(executable, execArgs);

  const svgContent = await fs.readFile(tempSvgPath, 'utf-8');
  await tempManager.cleanupFileAsync(tempSvgPath);

  return cropSvg(svgContent);
}

export async function executeKicadDrillExport(pcbFilePath: string): Promise<string> {
  const pcbFileName = path.basename(pcbFilePath, path.extname(pcbFilePath));
  const tempDir = tempManager.createTempDirPath();

  await ensureDir(tempDir);

  const { executable, execArgs } = buildKiCADArgs('pcb', [
    'export',
    'drill',
    '--generate-map',
    '--map-format',
    'svg',
    '--output',
    tempDir + path.sep,
    pcbFilePath,
  ]);
  await execFileAsync(executable, execArgs);

  const srcPath = path.join(tempDir, `${pcbFileName}-drl_map.svg`);
  const srcExists = await pathExists(srcPath);
  if (!srcExists) {
    throw new Error(`KiCad drill export did not produce expected file: ${srcPath}`);
  }

  const rawSvg = await fs.readFile(srcPath, 'utf-8');

  const drlPath = path.join(tempDir, `${pcbFileName}.drl`);
  await fs.unlink(drlPath).catch(() => {
    logger.debug('svg: failed to delete temp drl file', drlPath);
  });

  return cropSvg(rawSvg);
}

export async function processKicadSvgLayers(layerNames: string[], pcbFilePath: string, theme: string): Promise<string> {
  if (layerNames.length === 0) {
    throw new Error('No PCB layers specified for processing');
  }

  const layers = layerNames.join(',');

  const tempSvgPath = tempManager.createTempFilePath('.svg');

  let bMirror = false;
  if (layers.includes('B.')) {
    bMirror = true;
  }

  const { executable, execArgs } = buildKiCADArgs('pcb', [
    'export',
    'svg',
    '--theme',
    theme,
    ...(bMirror ? ['--mirror'] : []),
    '--drill-shape-opt',
    '0',
    '--cdnp',
    '--exclude-drawing-sheet',
    '--page-size-mode',
    '2',
    '--layers',
    layers,
    '--mode-single',
    '--output',
    tempSvgPath,
    pcbFilePath,
  ]);
  await execFileAsync(executable, execArgs);

  const svgContent = await fs.readFile(tempSvgPath, 'utf-8');
  await tempManager.cleanupFileAsync(tempSvgPath);

  return cropSvg(svgContent);
}

export async function renderKicad3DView(
  renderSpec: { side: string; x: string; y: string; z: string },
  pcbFilePath: string,
): Promise<Buffer> {
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
