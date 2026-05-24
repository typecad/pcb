import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'fs';
import * as path from 'path';
import tempDir from 'temp-dir';

const execFileAsync = promisify(execFile);

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

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
    result = result.replace(
        /(<svg\b[^>]*?)\bviewBox="[^"]*"/,
        `$1viewBox="${viewBox}"`
    );
    result = result.replace(
        /(<svg\b[^>]*?)\bwidth="[^"]*"/,
        `$1width="100%"`
    );
    result = result.replace(
        /(<svg\b[^>]*?)\bheight="[^"]*"/,
        `$1height="100%"`
    );
    return result;
}

export async function executeKicadSvgExport(
    kicadCliPath: string,
    layer: string,
    pcbFile: string,
    theme?: string
): Promise<string> {
    const pcbBasename = path.basename(pcbFile, '.kicad_pcb');
    const tempSvgPath = createTempFilePath(`gitdiff_${pcbBasename}_`, `${layer}.svg`);

    await execFileAsync(kicadCliPath, [
        'pcb', 'export', 'svg',
        ...(theme ? ['--theme', theme] : []),
        '--drill-shape-opt', '0',
        '--cdnp',
        '--exclude-drawing-sheet',
        '--page-size-mode', '2',
        '--layers', layer,
        '--mode-single',
        '--output', tempSvgPath,
        pcbFile
    ]);

    if (!fs.existsSync(tempSvgPath)) {
        return '';
    }

    const svgContent = fs.readFileSync(tempSvgPath, 'utf-8');

    const debugDir = path.join(path.dirname(pcbFile), '_debug_svgs');
    if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
    }
    const debugPath = path.join(debugDir, `${pcbBasename}_${layer}.svg`);
    fs.copyFileSync(tempSvgPath, debugPath);

    cleanupTempFiles([tempSvgPath]);

    return svgContent;
}

export function createTempFilePath(prefix: string, suffix: string): string {
    return path.join(tempDir, `${prefix}${suffix}`);
}

export function parseHexColor(hexColor: string): { r: number; g: number; b: number } {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return { r, g, b };
}

export function cleanupTempFiles(filePaths: string[]): number {
    let cleanedCount = 0;
    for (const filePath of filePaths) {
        try {
            if (filePath.startsWith(tempDir) && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                cleanedCount++;
            }
        } catch (cleanupError) {
            console.error(`Failed to delete temporary file: ${filePath}`, cleanupError);
        }
    }
    return cleanedCount;
}
