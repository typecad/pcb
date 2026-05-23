import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pathExists, ensureDir } from './fs.js';
import { tempManager } from './tempFileManager.js';

const execFileAsync = promisify(execFile);

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

    return svgContent;
}

export async function executeKicadDrillExport(
    kicadCliPath: string,
    pcbFilePath: string,
    outputPath: string
): Promise<string> {
    const pcbFileName = path.basename(pcbFilePath, path.extname(pcbFilePath));

    const outputDir = path.dirname(outputPath);
    const dirExists = await pathExists(outputDir);
    if (!dirExists) {
        await ensureDir(outputDir);
    }

    await execFileAsync(kicadCliPath, [
        'pcb', 'export', 'drill',
        '--generate-map',
        '--map-format', 'svg',
        '--output', path.join(outputDir, '/'),
        pcbFilePath
    ]);

    const srcPath = path.join(outputDir, `${pcbFileName}-drl_map.svg`);
    const srcExists = await pathExists(srcPath);
    if (srcExists && srcPath !== outputPath) {
        await fs.rename(srcPath, outputPath);
    } else if (srcExists) {
        return outputPath;
    } else {
        throw new Error(`KiCad drill export did not produce expected file: ${srcPath}`);
    }

    const drlPath = path.join(outputDir, `${pcbFileName}.drl`);
    const drlExists = await pathExists(drlPath);
    if (drlExists) {
        await fs.unlink(drlPath);
    }

    return outputPath;
}

export async function processKicadSvgLayers(
    layerNames: string[],
    pcbFilePath: string,
    outputPath: string,
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

    return await writeStringToFile(svgContent, outputPath);
}

export async function renderKicad3DView(
    renderSpec: { side: string, x: string, y: string, z: string },
    pcbFilePath: string,
    outputPath: string,
    kicadCliPath: string
): Promise<string> {
    const outputDir = path.dirname(outputPath);
    const dirExists = await pathExists(outputDir);
    if (!dirExists) {
        await ensureDir(outputDir);
    }

    await execFileAsync(kicadCliPath, [
        'pcb', 'render',
        '--preset', 'follow_pcb_editor',
        '--perspective',
        '--quality', 'high',
        '--side', renderSpec.side,
        '--background', 'transparent',
        '--rotate', `${renderSpec.x},${renderSpec.y},${renderSpec.z}`,
        '--output', outputPath,
        pcbFilePath
    ]);

    return outputPath;
}
