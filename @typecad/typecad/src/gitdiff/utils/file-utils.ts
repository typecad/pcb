import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as crypto from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { parse, SNode, isList } from '../../sexpr/index.js';
import logger from '../../utils/logging.js';
import { buildKiCADArgs } from '../../kicad_commands.js';
import { getFlatpakSafeTempDir } from '../../kicad.js';

const execFileAsync = promisify(execFile);

const MAX_CACHE_SIZE = 256;

const svgCache = new Map<string, string>();
const fileHashCache = new Map<string, string>();

function evictIfNeeded(cache: Map<string, unknown>): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    const keysIter = cache.keys();
    const toDelete = Math.floor(MAX_CACHE_SIZE / 4);
    for (let i = 0; i < toDelete; i++) {
      const { value } = keysIter.next();
      if (value === undefined) break;
      cache.delete(value);
    }
  }
}

export function getFileHash(filePath: string): string {
  if (!fileHashCache.has(filePath)) {
    const content = fs.readFileSync(filePath);
    evictIfNeeded(fileHashCache);
    fileHashCache.set(filePath, crypto.createHash('sha256').update(content).digest('hex'));
  }
  return fileHashCache.get(filePath)!;
}

function getCacheKey(pcbFile: string, layer: string, theme?: string): string {
  return `${getFileHash(pcbFile)}:${layer}:${theme || ''}`;
}

export function clearCache(): void {
  svgCache.clear();
  for (const key of fileHashCache.keys()) {
    if (!key.startsWith('__')) {
      fileHashCache.delete(key);
    }
  }
}

export function detectInnerCopperLayers(pcbFile: string): string[] {
  const content = fs.readFileSync(pcbFile, 'utf8');
  try {
    const parsed = parse(content);
    if (!isList(parsed)) return [];
    const tree = SNode.from(parsed);
    const layersNode = tree.child('layers');
    if (!layersNode) return [];
    const inner: string[] = [];
    for (const child of layersNode.children()) {
      const name = child.getString(1);
      if (name && /^In\d+\.Cu$/.test(name)) {
        inner.push(name);
      }
    }
    return inner.sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      return na - nb;
    });
  } catch {
    return [];
  }
}

function extractPathCoords(d: string): { x: number; y: number }[] {
  const coords: { x: number; y: number }[] = [];
  const cleaned = d.replace(/[Zz]/g, ' ');
  const parts = cleaned.split(/[MLHVCSQTAmlhvcsqta]/);
  const cmds = cleaned.match(/[MLHVCSQTAmlhvcsqta]/g) || [];

  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i].toUpperCase();
    const nums = (parts[i + 1] || '').match(/-?\d+\.?\d*/g);
    if (!nums) continue;

    if (cmd === 'M' || cmd === 'L' || cmd === 'T') {
      for (let j = 0; j + 1 < nums.length; j += 2) {
        coords.push({ x: parseFloat(nums[j]), y: parseFloat(nums[j + 1]) });
      }
    } else if (cmd === 'H') {
      for (const n of nums) coords.push({ x: parseFloat(n), y: 0 });
    } else if (cmd === 'V') {
      for (const n of nums) coords.push({ x: 0, y: parseFloat(n) });
    } else if (cmd === 'C' || cmd === 'S' || cmd === 'Q') {
      for (let j = 0; j + 1 < nums.length; j += 2) {
        coords.push({ x: parseFloat(nums[j]), y: parseFloat(nums[j + 1]) });
      }
    } else if (cmd === 'A') {
      for (let j = 5; j + 1 < nums.length; j += 7) {
        coords.push({ x: parseFloat(nums[j]), y: parseFloat(nums[j + 1]) });
      }
    }
  }
  return coords;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function computeSvgBBox(svgContent: string, padding: number = 2): BBox | null {
  const allCoords: { x: number; y: number }[] = [];

  const pathRegex = /d="([\s\S]*?)"/g;
  let match;
  while ((match = pathRegex.exec(svgContent)) !== null) {
    allCoords.push(...extractPathCoords(match[1]));
  }

  const circleRegex = /<circle\b[^>]*>/gi;
  while ((match = circleRegex.exec(svgContent)) !== null) {
    const el = match[0];
    const cx = el.match(/\bcx="(-?\d+\.?\d*)"/);
    const cy = el.match(/\bcy="(-?\d+\.?\d*)"/);
    const r = el.match(/\br="(-?\d+\.?\d*)"/);
    if (cx && cy) {
      const x = parseFloat(cx[1]);
      const y = parseFloat(cy[1]);
      const radius = r ? parseFloat(r[1]) : 0;
      allCoords.push({ x: x - radius, y: y - radius }, { x: x + radius, y: y + radius });
    }
  }

  const rectRegex = /<rect\b[^>]*>/gi;
  while ((match = rectRegex.exec(svgContent)) !== null) {
    const el = match[0];
    const xM = el.match(/\bx="(-?\d+\.?\d*)"/);
    const yM = el.match(/\by="(-?\d+\.?\d*)"/);
    const wM = el.match(/\bwidth="(-?\d+\.?\d*)"/);
    const hM = el.match(/\bheight="(-?\d+\.?\d*)"/);
    const x = xM ? parseFloat(xM[1]) : 0;
    const y = yM ? parseFloat(yM[1]) : 0;
    const w = wM ? parseFloat(wM[1]) : 0;
    const h = hM ? parseFloat(hM[1]) : 0;
    allCoords.push({ x, y }, { x: x + w, y: y + h });
  }

  const lineRegex = /<line\b[^>]*>/gi;
  while ((match = lineRegex.exec(svgContent)) !== null) {
    const el = match[0];
    const x1 = el.match(/\bx1="(-?\d+\.?\d*)"/);
    const y1 = el.match(/\by1="(-?\d+\.?\d*)"/);
    const x2 = el.match(/\bx2="(-?\d+\.?\d*)"/);
    const y2 = el.match(/\by2="(-?\d+\.?\d*)"/);
    if (x1 && y1) allCoords.push({ x: parseFloat(x1[1]), y: parseFloat(y1[1]) });
    if (x2 && y2) allCoords.push({ x: parseFloat(x2[1]), y: parseFloat(y2[1]) });
  }

  const textRegex = /<text\b[^>]*>/gi;
  while ((match = textRegex.exec(svgContent)) !== null) {
    const el = match[0];
    const xM = el.match(/\bx="(-?\d+\.?\d*)"/);
    const yM = el.match(/\by="(-?\d+\.?\d*)"/);
    if (xM && yM) allCoords.push({ x: parseFloat(xM[1]), y: parseFloat(yM[1]) });
  }

  if (allCoords.length === 0) return null;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const c of allCoords) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }

  return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
}

export function cropSvg(svgContent: string, padding: number = 2): string {
  const bbox = computeSvgBBox(svgContent, padding);
  if (!bbox) return svgContent;

  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  const newViewBox = `${bbox.minX.toFixed(4)} ${bbox.minY.toFixed(4)} ${w.toFixed(4)} ${h.toFixed(4)}`;

  return applyViewBox(svgContent, newViewBox);
}

export function cropSvgToBBox(svgContent: string, bbox: BBox): string {
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  const newViewBox = `${bbox.minX.toFixed(4)} ${bbox.minY.toFixed(4)} ${w.toFixed(4)} ${h.toFixed(4)}`;

  return applyViewBox(svgContent, newViewBox);
}

function applyViewBox(svgContent: string, viewBox: string): string {
  let result = svgContent;
  result = result.replace(/(<svg\b[^>]*?)\bviewBox="[^"]*"/, `$1viewBox="${viewBox}"`);
  result = result.replace(/(<svg\b[^>]*?)\bwidth="[^"]*"/, `$1width="100%"`);
  result = result.replace(/(<svg\b[^>]*?)\bheight="[^"]*"/, `$1height="100%"`);
  return result;
}

export async function executeKicadSvgExport(layer: string, pcbFile: string, theme?: string): Promise<string> {
  const pcbBasename = path.basename(pcbFile, '.kicad_pcb');
  const tempSvgPath = createTempFilePath(`gitdiff_${pcbBasename}_`, `${layer}.svg`);

  try {
    const { executable, execArgs } = buildKiCADArgs('pcb', [
      'export',
      'svg',
      ...(theme ? ['--theme', theme] : []),
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
      pcbFile,
    ]);
    await execFileAsync(executable, execArgs);

    if (!fs.existsSync(tempSvgPath)) {
      return '';
    }

    return sanitizeSvg(fs.readFileSync(tempSvgPath, 'utf-8'));
  } finally {
    cleanupTempFiles([tempSvgPath]);
  }
}

export function createTempFilePath(prefix: string, suffix: string): string {
  const uniqueId = crypto.randomUUID();
  return path.join(getFlatpakSafeTempDir(), `${prefix}${uniqueId}_${suffix}`);
}

export function parseHexColor(hexColor: string): { r: number; g: number; b: number } {
  const hex = hexColor.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`Invalid hex color "${hexColor}". Expected format: #RRGGBB (e.g., #ff6600)`);
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return { r, g, b };
}

export function sanitizeSvg(svgContent: string): string {
  let result = svgContent;
  result = result.replace(/<script[\s\S]*?<\/script>/gi, '');
  result = result.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  result = result.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '');
  result = result.replace(/\bhref\s*=\s*["']\s*javascript\s*:/gi, "href=''");
  result = result.replace(/\bxlink:href\s*=\s*["']\s*javascript\s*:/gi, "xlink:href=''");
  return result;
}

export async function executeKicadSvgExportCached(layer: string, pcbFile: string, theme?: string): Promise<string> {
  const key = getCacheKey(pcbFile, layer, theme);
  const cached = svgCache.get(key);
  if (cached !== undefined) return cached;
  const svg = await executeKicadSvgExport(layer, pcbFile, theme);
  evictIfNeeded(svgCache);
  svgCache.set(key, svg);
  return svg;
}

export function cleanupTempFiles(filePaths: string[]): number {
  let cleanedCount = 0;
  for (const filePath of filePaths) {
    try {
      if (filePath.startsWith(getFlatpakSafeTempDir()) && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        cleanedCount++;
      }
    } catch (cleanupError) {
      logger.error(`Failed to delete temporary file: ${filePath}`, cleanupError);
    }
  }
  return cleanedCount;
}
