import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pathExists, ensureDir } from './fs.js';
import { tempManager } from './tempFileManager.js';

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

export function cropSvg(svgContent: string, padding: number = 2): string {
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

    if (allCoords.length === 0) return svgContent;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of allCoords) {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x);
        maxY = Math.max(maxY, c.y);
    }

    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const w = maxX - minX;
    const h = maxY - minY;
    const newViewBox = `${minX.toFixed(4)} ${minY.toFixed(4)} ${w.toFixed(4)} ${h.toFixed(4)}`;

    let result = svgContent;
    result = result.replace(
        /(<svg\b[^>]*?)\bviewBox="[^"]*"/,
        `$1viewBox="${newViewBox}"`
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

export async function writeStringToFile(content: string, outputPath: string): Promise<string> {
    const outputDir = path.dirname(outputPath);
    const dirExists = await pathExists(outputDir);
    if (!dirExists) {
        await ensureDir(outputDir);
    }
    await fs.writeFile(outputPath, content, 'utf-8');
    return outputPath;
}

export async function writeBufferToFile(buffer: Buffer, outputPath: string): Promise<string> {
    const outputDir = path.dirname(outputPath);
    const dirExists = await pathExists(outputDir);
    if (!dirExists) {
        await ensureDir(outputDir);
    }
    await fs.writeFile(outputPath, buffer);
    return outputPath;
}

export async function executeKicadSvgExport(
    kicadCliPath: string,
    pcbFilePath: string,
    layer: string,
    theme: string
): Promise<string> {
    const tempSvgPath = tempManager.createTempFilePath('.svg');
    let bMirror = false;
    if (layer.includes('B.')) {
        bMirror = true;
    }
    await execFileAsync(kicadCliPath, [
        'pcb', 'export', 'svg',
        '--theme', theme,
        ...(bMirror ? ['--mirror'] : []),
        '--drill-shape-opt', '0',
        '--cdnp',
        '--exclude-drawing-sheet',
        '--page-size-mode', '2',
        '--layers', layer,
        '--mode-single',
        '--output', tempSvgPath,
        pcbFilePath
    ]);

    const svgContent = await fs.readFile(tempSvgPath, 'utf-8');
    await tempManager.cleanupFileAsync(tempSvgPath);

    return cropSvg(svgContent);
}

export async function executeKicadDrillExport(
    kicadCliPath: string,
    pcbFilePath: string
): Promise<string> {
    const pcbFileName = path.basename(pcbFilePath, path.extname(pcbFilePath));
    const tempDir = tempManager.createTempDirPath();

    await ensureDir(tempDir);

    await execFileAsync(kicadCliPath, [
        'pcb', 'export', 'drill',
        '--generate-map',
        '--map-format', 'svg',
        '--output', tempDir + path.sep,
        pcbFilePath
    ]);

    const srcPath = path.join(tempDir, `${pcbFileName}-drl_map.svg`);
    const srcExists = await pathExists(srcPath);
    if (!srcExists) {
        throw new Error(`KiCad drill export did not produce expected file: ${srcPath}`);
    }

    const rawSvg = await fs.readFile(srcPath, 'utf-8');

    const drlPath = path.join(tempDir, `${pcbFileName}.drl`);
    await fs.unlink(drlPath).catch(() => {});

    return cropSvg(rawSvg);
}

export async function processKicadSvgLayers(
    layerNames: string[],
    pcbFilePath: string,
    kicadCliPath: string,
    theme: string
): Promise<string> {
    if (layerNames.length === 0) {
        throw new Error('No PCB layers specified for processing');
    }

    const layers = layerNames.join(',');

    const tempSvgPath = tempManager.createTempFilePath('.svg');

    let bMirror = false;
    if (layers.includes('B.')) {
        bMirror = true;
    }

    await execFileAsync(kicadCliPath, [
        'pcb', 'export', 'svg',
        '--theme', theme,
        ...(bMirror ? ['--mirror'] : []),
        '--drill-shape-opt', '0',
        '--cdnp',
        '--exclude-drawing-sheet',
        '--page-size-mode', '2',
        '--layers', layers,
        '--mode-single',
        '--output', tempSvgPath,
        pcbFilePath
    ]);

    const svgContent = await fs.readFile(tempSvgPath, 'utf-8');
    await tempManager.cleanupFileAsync(tempSvgPath);

    return cropSvg(svgContent);
}

export async function renderKicad3DView(
    renderSpec: { side: string, x: string, y: string, z: string },
    pcbFilePath: string,
    kicadCliPath: string
): Promise<Buffer> {
    const tempOutputPath = tempManager.createTempFilePath('.png');

    await execFileAsync(kicadCliPath, [
        'pcb', 'render',
        '--preset', 'follow_pcb_editor',
        '--perspective',
        '--quality', 'high',
        '--side', renderSpec.side,
        '--background', 'transparent',
        '--rotate', `${renderSpec.x},${renderSpec.y},${renderSpec.z}`,
        '--output', tempOutputPath,
        pcbFilePath
    ]);

    const buffer = await fs.readFile(tempOutputPath);
    await tempManager.cleanupFileAsync(tempOutputPath);
    return buffer;
}
