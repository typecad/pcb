import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { executeKiCADCommand } from '../../../kicad_commands.js';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import { buildDirPath, findBoardFile } from '../pipeline.js';
import {
  plotCopperLayers,
  plotGraphicsLayersFromSource,
  plotDrillFromSource,
  plotJobFromSource,
} from '../../../gerber_export/index.js';
import { GRAPHIC_LAYERS } from '../../../gerber_export/layers.js';
import { copperLayers } from '../../../gerber_export/copper.js';
import { fillZone } from '../../../pcb/pcb_zone_fill_engine.js';
import { parse, SNode } from '../../../sexpr/index.js';
import type { SExpr } from '../../../sexpr/index.js';

function findPcbFile(argPath?: string): string | null {
  if (argPath) {
    const resolved = path.resolve(argPath);
    if (fs.existsSync(resolved)) return resolved;
    return null;
  }

  return findBoardFile();
}

function getOutputDir(parsed: ParsedArgs, defaultDir: string): string {
  const output = parsed.args['output'];
  if (typeof output === 'string' && output) return path.resolve(output);
  const o = parsed.args['o'] ?? parsed.args['out'];
  if (typeof o === 'string' && o) return path.resolve(o);
  return defaultDir;
}

const VALID_SUBCOMMANDS = ['gerbers', 'drill'];

let cachedKicadMajor = Number.NaN;

/**
 * KiCad major version from `kicad-cli --version`, cached. 0 when the CLI
 * can't be reached or the output isn't understood — callers then skip
 * version-gated flags. KiCad 9 added zone refilling to headless exports;
 * KiCad 8 lacks it.
 */
export async function kicadMajorVersion(): Promise<number> {
  if (!Number.isNaN(cachedKicadMajor)) return cachedKicadMajor;
  try {
    const out = await executeKiCADCommand('--version', [], { stdio: 'pipe' });
    // output is a bare semver ("10.0.0") on current KiCad; older builds
    // prefixed it — match the first number either way
    cachedKicadMajor = Number.parseInt(/(\d+)/.exec(out)?.[1] ?? '0', 10);
  } catch {
    cachedKicadMajor = 0;
  }
  return cachedKicadMajor;
}

async function runGerbers(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const pcbArg = parsed.positional[0];
  const pcbPath = findPcbFile(pcbArg);

  if (!pcbPath) {
    if (pcbArg) {
      throw new Error(`PCB file not found: ${pcbArg}`);
    }
    throw new Error(
      `No .kicad_pcb file found in ${buildDirPath()}.\n` +
        'Run `typecad-pcb build` first, or specify a path: typecad-pcb export gerbers <path/to/board.kicad_pcb>',
    );
  }

  const buildDir = buildDirPath();
  const outputDir = getOutputDir(parsed, path.join(buildDir, 'gerbers'));
  fs.mkdirSync(outputDir, { recursive: true });

  if (!json) {
    logger.log(chalk.white.bold('typecad-pcb export gerbers') + ' - Export Gerber files\n');
    logger.log(`  PCB:    ${pcbPath}`);
    logger.log(`  Output: ${outputDir}\n`);
  }

  // Zone fills are the consumer's responsibility now — the build writes
  // declarations only, so gerber plotting always refills in memory
  // (--check-zones, KiCad ≥ 9) to include pour copper in the output.
  const refillZones = (await kicadMajorVersion()) >= 9;
  if (refillZones && !json) {
    logger.log(chalk.gray('  Zones:  refilled on export (--check-zones)'));
  }

  const args = [
    'export',
    'gerbers',
    '--output',
    outputDir,
    ...(refillZones ? ['--check-zones'] : []),
    ...parsed.passthrough,
    pcbPath,
  ];

  await executeKiCADCommand('pcb', args, { stdio: 'inherit' });

  const gerberFiles = fs
    .readdirSync(outputDir)
    .filter(
      (f) =>
        f.endsWith('.gbr') ||
        f.endsWith('.gtl') ||
        f.endsWith('.gbl') ||
        f.endsWith('.gts') ||
        f.endsWith('.gbs') ||
        f.endsWith('.gbo') ||
        f.endsWith('.gto') ||
        f.endsWith('.gko') ||
        f.endsWith('.gm1'),
    );

  if (json) {
    logger.log(
      JSON.stringify(
        {
          pcb: pcbPath,
          outputDir,
          files: gerberFiles,
        },
        null,
        2,
      ),
    );
  } else {
    logger.log('');
    logger.log(chalk.green(`Exported ${gerberFiles.length} Gerber file(s) to ${outputDir}`));
  }
}

async function runDrill(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const pcbArg = parsed.positional[0];
  const pcbPath = findPcbFile(pcbArg);

  if (!pcbPath) {
    if (pcbArg) {
      throw new Error(`PCB file not found: ${pcbArg}`);
    }
    throw new Error(
      `No .kicad_pcb file found in ${buildDirPath()}.\n` +
        'Run `typecad-pcb build` first, or specify a path: typecad-pcb export drill <path/to/board.kicad_pcb>',
    );
  }

  const buildDir = buildDirPath();
  const outputDir = getOutputDir(parsed, path.join(buildDir, 'gerbers'));
  fs.mkdirSync(outputDir, { recursive: true });

  if (!json) {
    logger.log(chalk.white.bold('typecad-pcb export drill') + ' - Export drill files\n');
    logger.log(`  PCB:    ${pcbPath}`);
    logger.log(`  Output: ${outputDir}\n`);
  }

  // native writer by default; --kicad opts into the legacy plotter
  if (parsed.args['kicad'] !== true) {
    const source = fs.readFileSync(pcbPath, 'utf8');
    const copperCount = countCopperLayers(source);
    const written = plotDrillFromSource(source, pcbPath, {
      outDir: outputDir,
      copperLayerCount: copperCount,
    });
    reportDrill(parsed, pcbPath, outputDir, [path.basename(written)], true);
    return;
  }

  const args = ['export', 'drill', '--output', outputDir, ...parsed.passthrough, pcbPath];

  await executeKiCADCommand('pcb', args, { stdio: 'inherit' });

  const drillFiles = fs.readdirSync(outputDir).filter((f) => f.endsWith('.drl') || f.endsWith('.xln'));

  if (json) {
    logger.log(
      JSON.stringify(
        {
          pcb: pcbPath,
          outputDir,
          files: drillFiles,
        },
        null,
        2,
      ),
    );
  } else {
    logger.log('');
    logger.log(chalk.green(`Exported ${drillFiles.length} drill file(s) to ${outputDir}`));
  }
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const sub = parsed.subcommand;

  if (!sub) {
    const help = await import('../help.js');
    help.showExportHelp();
    return;
  }

  if (!VALID_SUBCOMMANDS.includes(sub)) {
    if (parsed.json) {
      logger.log(
        JSON.stringify({
          error: true,
          message: `Unknown subcommand 'export ${sub}'. Use '${VALID_SUBCOMMANDS.join("' or '")}'.`,
          code: 'UNKNOWN_SUBCOMMAND',
        }),
      );
    } else {
      logger.error(chalk.red(`Unknown subcommand 'export ${sub}'. Use '${VALID_SUBCOMMANDS.join("' or '")}'.`));
    }
    process.exit(1);
  }

  if (sub === 'gerbers') {
    // native export is the default; --kicad opts back into the legacy
    // kicad-cli plotter
    if (parsed.args['kicad'] === true) {
      await runGerbers(parsed);
      return;
    }
    await runNativeGerbers(parsed);
  } else {
    await runDrill(parsed);
  }
}

/**
 * `export gerbers` (native) — plot copper, graphics, drill and job files
 * with typeCAD's own writer (no kicad-cli). Parity with kicad-cli 10
 * goldens is enforced by gerber_spec/tools/parity.ts (text layers diverge
 * by design: public-domain Hershey font vs KiCad's GPL newstroke).
 */
/** copper layer count from a board source (for the drill file's span). */
function countCopperLayers(source: string): number {
  return copperLayers(SNode.from(parse(source) as SExpr[])).length;
}

function reportDrill(
  parsed: ParsedArgs,
  pcbPath: string,
  outputDir: string,
  files: string[],
  native: boolean,
): void {
  if (parsed.json) {
    logger.log(JSON.stringify({ pcb: pcbPath, outputDir, native, files }, null, 2));
  } else {
    logger.log(chalk.green(`Exported ${files.length} drill file(s) to ${outputDir}`));
  }
}

/**
 * Compute zone fills with the native engine and inject them into the board
 * source as `filled_polygon` children (keyhole rings, KiCad-readable).
 * Returns the new source, or null when no zone could be filled.
 */
function refillZoneFills(source: string): string | null {
  const root = SNode.from(parse(source) as SExpr[]);
  const zones = root.children('zone'); // one array: SNode wrappers are not
  // reference-stable across children() calls, so the ordinal is the handle
  let out = stripFilledPolygons(source);
  let filledAny = false;
  for (let z = 0; z < zones.length; z++) {
    const zone = zones[z]!;
    const layerNode = zone.child('layer') ?? zone.child('layers');
    const layerNames = layerNode
      ? layerNode.raw.slice(1).filter((v): v is string => typeof v === 'string')
      : [];
    const layers = layerNames.length ? layerNames : ['F.Cu'];
    const blocks: string[] = [];
    for (const layer of layers) {
      const res = fillZone(root, zone, layer);
      if (!res) continue;
      for (const isl of res.islands) {
        const pts = isl.ring
          .reduce((s, v, i) => (i % 2 === 0 ? s + `(xy ${v.toFixed(6)} ` : s + `${v.toFixed(6)}) `), '')
          .trim();
        blocks.push(`(filled_polygon (layer "${layer}") (pts ${pts}))`);
      }
    }
    if (blocks.length === 0) continue;
    filledAny = true;
    // inject before the zone's final closing paren: locate this zone's
    // balanced region in the current source and splice
    const zoneStart = nthZoneStart(out, z);
    if (zoneStart < 0) continue;
    const closeIdx = balancedClose(out, zoneStart);
    if (closeIdx < 0) continue;
    const indent = '\n    ';
    out =
      out.slice(0, closeIdx) +
      indent +
      blocks.join(indent) +
      out.slice(closeIdx);
  }
  return filledAny ? out : null;
}

function nthZoneStart(source: string, ordinal: number): number {
  let at = -1;
  for (let i = 0; i <= ordinal; i++) {
    at = source.indexOf('(zone', at + 1);
    if (at < 0) return -1;
  }
  return at;
}

/** Remove every (filled_polygon …) block so a refill replaces stale fills. */
function stripFilledPolygons(source: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const j = source.indexOf('(filled_polygon', i);
    if (j < 0) break;
    const close = balancedClose(source, j);
    if (close < 0) break;
    out += source.slice(i, j);
    i = close + 1;
  }
  if (out === '') return source;
  return out + source.slice(i);
}

function countZones(source: string): number {
  let n = 0;
  let at = -1;
  for (;;) {
    at = source.indexOf('(zone', at + 1);
    if (at < 0) return n;
    n++;
  }
}

function balancedClose(source: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

interface UnfilledZone {
  net: string;
  layers: string;
}

function findUnfilledZones(source: string): UnfilledZone[] {
  const zones = [...source.matchAll(/\(zone[\s\S]{0,600}?\(layer[s]?\s+"[^)]*"\)/g)];
  const out: UnfilledZone[] = [];
  for (const z of zones) {
    const seg = z[0]! + source.slice(z.index!, z.index! + 4000);
    const hasFill = /\(filled_polygon/.test(seg);
    if (hasFill) continue;
    const net =
      /\(net_name\s+"([^"]*)"/.exec(seg)?.[1] ?? /\(net\s+"([^"]+)"\)/.exec(seg)?.[1] ?? '(unnamed)';
    const layers = /\(layer[s]?\s+([^)]*)\)/.exec(seg)?.[1]?.trim() ?? '?';
    out.push({ net, layers });
  }
  return out;
}
async function runNativeGerbers(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const pcbArg = parsed.positional[0];
  const pcbPath = findPcbFile(pcbArg);

  if (!pcbPath) {
    if (pcbArg) throw new Error(`PCB file not found: ${pcbArg}`);
    throw new Error(
      `No .kicad_pcb file found in ${buildDirPath()}.
` +
        'Run `typecad-pcb build` first, or specify a path: typecad-pcb export gerbers <path/to/board.kicad_pcb>',
    );
  }

  const buildDir = buildDirPath();
  const outputDir = getOutputDir(parsed, path.join(buildDir, 'gerbers'));
  fs.mkdirSync(outputDir, { recursive: true });

  let source = fs.readFileSync(pcbPath, 'utf8');
  let boardPathForPlot = pcbPath;

  // Zones are REFILLED on export (the kicad-cli path's --check-zones
  // semantics): saved fills go stale whenever board geometry changes after
  // the last check, so plotting them as-is risks stale pours. --saved-fills
  // opts out to plot exactly what the board carries.
  const unfilledZones = findUnfilledZones(source);
  const zoneCount = countZones(source);
  if (zoneCount > 0 && parsed.args['saved-fills'] !== true) {
    const filledSource = refillZoneFills(source);
    if (filledSource !== null) {
      source = filledSource;
      const filledBoard = path.join(outputDir, path.basename(pcbPath));
      fs.writeFileSync(filledBoard, source);
      boardPathForPlot = filledBoard;
      if (!json) {
        logger.log(
          chalk.gray(
            `  Zones:  ${zoneCount} refilled natively${unfilledZones.length ? ` (${unfilledZones.length} had no saved fills)` : ''}`,
          ),
        );
      }
    } else if (!json) {
      logger.error(
        chalk.yellow.bold('Warning:') +
          ` ${zoneCount} zone(s) could not be filled — pour copper WILL BE MISSING.\n` +
          `  Run \`typecad-pcb check\` to materialize fills, then re-export.\n`,
      );
    }
  }

  const written = [
    ...plotCopperLayers(boardPathForPlot, { outDir: outputDir }),
    ...plotGraphicsLayersFromSource(source, boardPathForPlot, { outDir: outputDir }),
  ];
  const copperCount = written.filter((f) => /\.(gtl|gbl|g\d)$/.test(path.basename(f))).length;
  written.push(
    plotDrillFromSource(source, boardPathForPlot, { outDir: outputDir, copperLayerCount: copperCount }),
  );

  const fileFor = (fileStem: string): { fileFunction: string; filePolarity?: string } | null => {
    if (/^(F|B)_Cu$/.test(fileStem))
      return {
        fileFunction: fileStem === 'F_Cu' ? 'Copper,L1,Top' : `Copper,L${copperCount},Bot`,
        filePolarity: 'Positive',
      };
    const innerNum = /^In(\d+)_Cu$/.exec(fileStem);
    if (innerNum) return { fileFunction: `Copper,L${Number(innerNum[1]) + 1},Inr`, filePolarity: 'Positive' };
    const spec = GRAPHIC_LAYERS.find((l) => l.stem === fileStem);
    return spec ? { fileFunction: spec.fileFunction, filePolarity: spec.polarity } : null;
  };
  written.push(plotJobFromSource(source, pcbPath, fileFor, { outDir: outputDir }));

  const files = written.map((f) => path.basename(f)).sort();
    if (json) {
      logger.log(
        JSON.stringify(
          {
            pcb: pcbPath,
            outputDir,
            native: true,
            unfilledZones: unfilledZones.length,
            files,
          },
          null,
          2,
        ),
      );
  } else {
    logger.log(chalk.white.bold('typecad-pcb export gerbers') + ' - Native gerber export (no kicad-cli; --kicad for legacy)\n');
    logger.log(`  PCB:    ${pcbPath}`);
    logger.log(`  Output: ${outputDir}`);
    logger.log(chalk.gray('  Text:   public-domain Hershey stroke font (gerber_spec/SPEC.md)\n'));
    logger.log(chalk.green(`Exported ${files.length} fabrication file(s) to ${outputDir}`));
  }
}
