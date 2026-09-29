import * as crypto from 'node:crypto';
import * as fs from 'fs';
import { parse, SNode, isList } from '../../sexpr/index.js';
import logger from '../../utils/logging.js';
import { canonicalLayerName } from '../../gerber_export/layers.js';
import { renderBoardLayerSvg } from '../../board_layer_images.js';

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

function getFileHash(filePath: string): string {
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

  // native renders flash pads as polygons with absolute points
  const polygonRegex = /<(polygon|polyline)\b[^>]*>/gi;
  while ((match = polygonRegex.exec(svgContent)) !== null) {
    const pts = match[0].match(/\bpoints="([^"]*)"/)?.[1] ?? '';
    for (const pair of pts.match(/-?\d+\.?\d*[,\s]+-?\d+\.?\d*/g) ?? []) {
      const [x, y] = pair.split(/[,\s]+/);
      allCoords.push({ x: parseFloat(x), y: parseFloat(y) });
    }
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
  return cropSvgToBBox(svgContent, bbox);
}

export function cropSvgToBBox(svgContent: string, bbox: BBox): string {
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  let x0 = bbox.minX;
  let y0 = bbox.minY;
  // native layer renders carry a scale(1,-1) flip group: leaf coordinates
  // must be negated to address the same content through the viewBox (and
  // mirrored renders additionally flip x). kicad-cli SVGs have no flip —
  // leaf space IS screen space there.
  if (/transform="scale\(1,-1\)"/.test(svgContent)) {
    y0 = -bbox.maxY;
    if (/transform="scale\(-1,1\)"/.test(svgContent)) {
      x0 = -bbox.maxX;
    }
  }
  const newViewBox = `${x0.toFixed(4)} ${y0.toFixed(4)} ${w.toFixed(4)} ${h.toFixed(4)}`;

  return applyViewBox(svgContent, newViewBox);
}

function applyViewBox(svgContent: string, viewBox: string): string {
  let result = svgContent;
  result = result.replace(/(<svg\b[^>]*?)\bviewBox="[^"]*"/, `$1viewBox="${viewBox}"`);
  result = result.replace(/(<svg\b[^>]*?)\bwidth="[^"]*"/, `$1width="100%"`);
  result = result.replace(/(<svg\b[^>]*?)\bheight="[^"]*"/, `$1height="100%"`);
  return result;
}

async function renderLayerSvg(layer: string, pcbFile: string, theme?: string): Promise<string> {
  // native plot + render (no kicad-cli): inline flashes keep every leaf
  // shape absolute-coordinate so the geometry annotator can diff pads.
  // Layer inks default to the typeCAD theme — the same house palette the
  // VS Code addon's board viewer shows (it leads the theme list there).
  try {
    const canonical = canonicalLayerName(layer);
    const svg = renderBoardLayerSvg(pcbFile, [layer], {
      themeName: theme ?? 'typecad',
      mirrorX: canonical.startsWith('B.'),
      // unique per layer — the report embeds one SVG per layer panel
      idPrefix: `gd-${canonical.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      inlineFlashes: true,
    });
    return svg ? sanitizeSvg(svg) : '';
  } catch (e) {
    logger.warn(`Warning: native layer render failed for "${layer}":`, e);
    return '';
  }
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

/** Native per-layer render, cached by board file hash + layer + theme. */
export async function renderLayerSvgCached(layer: string, pcbFile: string, theme?: string): Promise<string> {
  const key = getCacheKey(pcbFile, layer, theme);
  const cached = svgCache.get(key);
  if (cached !== undefined) return cached;
  const svg = await renderLayerSvg(layer, pcbFile, theme);
  evictIfNeeded(svgCache);
  svgCache.set(key, svg);
  return svg;
}
