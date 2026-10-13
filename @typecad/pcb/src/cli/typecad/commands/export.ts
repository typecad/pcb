import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import { executeKiCADCommand } from '../../../kicad_commands.js';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import {
  boardStemFromArgs,
  buildDirPath,
  findBoardFile,
  knownBoardsHint,
  listBoardFiles,
} from '../pipeline.js';
import { refreshPadsManifestFromBoard } from '../../../pcb/pcb_pads_writer.js';
import {
  plotCopperLayers,
  plotGraphicsLayersFromSource,
  plotDrillFromSource,
  plotJobFromSource,
} from '../../../gerber_export/index.js';
import { GRAPHIC_LAYERS } from '../../../gerber_export/layers.js';
import { copperLayers } from '../../../gerber_export/copper.js';
import { refillZoneFills } from '../../../pcb/pcb_zone_fill.js';
import { parse, SNode } from '../../../sexpr/index.js';
import type { SExpr } from '../../../sexpr/index.js';
import { buildBoardModel } from '../../typecad/board_model.js';
import {
  exportBom,
  exportPlacement,
  loadNetlistBesideBoard,
  resolveBomProfile,
  resolvePlacementProfile,
  zipStore,
} from '../../../assembly_export/index.js';
import type { BomExportOptions } from '../../../assembly_export/index.js';
import type { PlacementExportOptions } from '../../../assembly_export/index.js';

function findPcbFile(argPath?: string, stem?: string): string | null {
  if (argPath) {
    const resolved = path.resolve(argPath);
    if (fs.existsSync(resolved)) return resolved;
    return null;
  }

  const board = findBoardFile(stem);
  if (!board && stem) {
    logger.warn(chalk.yellow(`No board '${stem}' in build/ — ${knownBoardsHint()}`));
  }
  return board;
}

export { findPcbFile };

/**
 * The gerbers output dir for this board: `build/gerbers` for single-board
 * projects (unchanged), `build/gerbers/<stem>` once the manifest lists more
 * than one — mother/daughter boards must not share a fab dir (each board's
 * export prunes foreign stems, which would otherwise delete its sibling's
 * inner layers). An explicit --output wins either way.
 */
export function gerbersDirFor(parsed: ParsedArgs, buildDir: string, pcbPath: string): string {
  if (parsed.args['output'] || parsed.args['o'] || parsed.args['out']) {
    return getOutputDir(parsed, path.join(buildDir, 'gerbers'));
  }
  return defaultGerbersDir(buildDir, pcbPath);
}

/** The manifest-aware gerbers dir with no explicit override. */
export function defaultGerbersDir(buildDir: string, pcbPath: string): string {
  if (listBoardFiles(buildDir).length > 1) {
    return path.join(buildDir, 'gerbers', path.basename(pcbPath, '.kicad_pcb'));
  }
  return path.join(buildDir, 'gerbers');
}

function getOutputDir(parsed: ParsedArgs, defaultDir: string): string {
  const output = parsed.args['output'];
  if (typeof output === 'string' && output) return path.resolve(output);
  const o = parsed.args['o'] ?? parsed.args['out'];
  if (typeof o === 'string' && o) return path.resolve(o);
  return defaultDir;
}

/** Fabric-artifact extensions this command family owns in the output dir
 *  (inner copper plots as .g1–.g30 — those ride along too). */
const FAB_ARTIFACT_RE = /\.(gbr|gtl|gbl|gts|gbs|gto|gbo|gtp|gbp|gta|gba|gm1|gko|gbrjob|drl|xln|g\d{1,2})$/i;

/**
 * The fab dir is single-board: a leftover export under a DIFFERENT board stem
 * (fp upgrade tests, imports, temp boards) rides along otherwise —
 * gerber-viewer embeds every file in the dir, so one stray stem renders the
 * board twice (stale + fresh copies of every footprint and trace, moving
 * together). After exporting `boardPath`, remove other stems' artifacts.
 */
export function pruneForeignStemArtifacts(outputDir: string, boardPath: string): string[] {
  const stem = path.basename(boardPath, '.kicad_pcb').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ownRe = new RegExp(`^${stem}(-|\\.|$)`);
  const removed: string[] = [];
  for (const f of fs.readdirSync(outputDir)) {
    if (!FAB_ARTIFACT_RE.test(f) || ownRe.test(f)) continue;
    fs.rmSync(path.join(outputDir, f));
    removed.push(f);
  }
  return removed;
}

/** Prune + report: one log line, only when something was actually removed. */
function pruneAndReport(outputDir: string, boardPath: string, json: boolean): void {
  const removed = pruneForeignStemArtifacts(outputDir, boardPath);
  if (removed.length && !json) {
    logger.log(chalk.gray(`  Pruned ${removed.length} foreign-board artifact(s) from ${outputDir}`));
  }
}

const VALID_SUBCOMMANDS = ['gerbers', 'drill', 'pos', 'bom', 'assembly'];

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
  const pcbPath = findPcbFile(pcbArg, boardStemFromArgs(parsed));

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
  const outputDir = gerbersDirFor(parsed, buildDir, pcbPath);
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

  pruneAndReport(outputDir, pcbPath, json);

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
  const pcbPath = findPcbFile(pcbArg, boardStemFromArgs(parsed));

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
  const outputDir = gerbersDirFor(parsed, buildDir, pcbPath);
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
    pruneAndReport(outputDir, pcbPath, json);
    reportDrill(parsed, pcbPath, outputDir, [path.basename(written)], true);
    return;
  }

  const args = ['export', 'drill', '--output', outputDir, ...parsed.passthrough, pcbPath];

  await executeKiCADCommand('pcb', args, { stdio: 'inherit' });

  pruneAndReport(outputDir, pcbPath, json);

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

/** The `--help` screen for one export subcommand (shared with `export <sub> help`). */
async function showSubHelp(sub: string): Promise<void> {
  const help = await import('../help.js');
  if (sub === 'gerbers') help.showExportGerbersHelp();
  else if (sub === 'drill') help.showExportDrillHelp();
  else if (sub === 'pos') help.showExportPosHelp();
  else if (sub === 'bom') help.showExportBomHelp();
  else help.showExportAssemblyHelp();
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const sub = parsed.subcommand;

  // bare `export`, `export help`, and `export --help` all show the overview;
  // `export pos help` (help as the positional) shows that subcommand's screen
  if (!sub || sub === 'help') {
    const help = await import('../help.js');
    help.showExportHelp();
    return;
  }

  if (parsed.positional[0] === 'help') {
    await showSubHelp(sub);
    return;
  }

  if (!VALID_SUBCOMMANDS.includes(sub)) {
    if (parsed.json) {
      logger.log(
        JSON.stringify({
          error: true,
          message: `Unknown subcommand 'export ${sub}'. Use '${VALID_SUBCOMMANDS.join("' or '")}' or 'help'.`,
          code: 'UNKNOWN_SUBCOMMAND',
        }),
      );
    } else {
      logger.error(
        chalk.red(`Unknown subcommand 'export ${sub}'. Use '${VALID_SUBCOMMANDS.join("' or '")}' or 'help'.`),
      );
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
  } else if (sub === 'drill') {
    await runDrill(parsed);
  } else if (sub === 'pos') {
    await runPos(parsed);
  } else if (sub === 'bom') {
    await runBom(parsed);
  } else {
    await runAssembly(parsed);
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

// The refill core itself lives in pcb/pcb_zone_fill.ts (shared with
// materializeZoneFills); re-exported here for the export path and its
// existing importers.
export { refillZoneFills };

function countZones(source: string): number {
  return [...source.matchAll(/\(\s*zone(?![\w-])/g)].length;
}

interface UnfilledZone {
  net: string;
  layers: string;
}

function findUnfilledZones(source: string): UnfilledZone[] {
  const zones = [...source.matchAll(/\(\s*zone(?![\w-])[\s\S]{0,600}?\(layers?\s+"[^)]*"\)/g)];
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
export interface NativeGerbersResult {
  outputDir: string;
  files: string[];
  /** zones that had no saved fills before the in-memory refill */
  unfilledZones: number;
}

/**
 * The native gerbers/drill/job export as one programmatic call (the
 * `export gerbers` core, minus arg parsing) — the `viewer` command composes
 * it with the page build so one process does the whole render pipeline.
 * Writes copper + graphics + drill + job files into `outputDir` (or the
 * manifest-aware default), refills zones in memory, prunes foreign-stem
 * artifacts, and heals the pads manifest. `json` silences the human logs.
 */
export function exportNativeGerbers(
  pcbPath: string,
  opts: { outputDir?: string; savedFills?: boolean; json?: boolean } = {},
): NativeGerbersResult {
  const json = opts.json ?? false;
  const outputDir = opts.outputDir ?? defaultGerbersDir(buildDirPath(), pcbPath);
  fs.mkdirSync(outputDir, { recursive: true });

  let source = fs.readFileSync(pcbPath, 'utf8');
  let boardPathForPlot = pcbPath;

  // Zones are REFILLED on export (the kicad-cli path's --check-zones
  // semantics): saved fills go stale whenever board geometry changes after
  // the last check, so plotting them as-is risks stale pours. --saved-fills
  // opts out to plot exactly what the board carries.
  const unfilledZones = findUnfilledZones(source);
  const zoneCount = countZones(source);
  if (zoneCount > 0 && opts.savedFills !== true) {
    const filledSource = refillZoneFills(source);
    if (filledSource !== null) {
      source = filledSource;
      // the filled board is only the plot source — keep it out of the fab
      // dir (its basename still drives the output file naming)
      const filledBoard = path.join(os.tmpdir(), path.basename(pcbPath));
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
  // the filled temp board was only the plot source — never leak a copy per
  // export into the system temp dir
  if (boardPathForPlot !== pcbPath) {
    try {
      fs.unlinkSync(boardPathForPlot);
    } catch {
      // best-effort — a stale temp is harmless beside the plots
    }
  }
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

  pruneAndReport(outputDir, pcbPath, json);

  // The pads manifest is derived data (build/<stem>_pads.json, written with
  // the board). Exporting gerbers is the step that runs whenever the viewer
  // regenerates — a KiCad-side edit that flowed through sync without a full
  // rebuild reaches this point with a manifest one revision behind, and the
  // viewer would bake stale pad labels over fresh copper. Heal it here.
  refreshPadsManifestFromBoard(pcbPath);

  return {
    outputDir,
    files: written.map((f) => path.basename(f)).sort(),
    unfilledZones: unfilledZones.length,
  };
}

async function runNativeGerbers(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const pcbArg = parsed.positional[0];
  const pcbPath = findPcbFile(pcbArg, boardStemFromArgs(parsed));

  if (!pcbPath) {
    if (pcbArg) throw new Error(`PCB file not found: ${pcbArg}`);
    throw new Error(
      `No .kicad_pcb file found in ${buildDirPath()}.
` +
        'Run `typecad-pcb build` first, or specify a path: typecad-pcb export gerbers <path/to/board.kicad_pcb>',
    );
  }

  if (!json) {
    logger.log(chalk.white.bold('typecad-pcb export gerbers') + ' - Native gerber export (no kicad-cli; --kicad for legacy)\n');
    logger.log(`  PCB:    ${pcbPath}`);
  }

  const result = exportNativeGerbers(pcbPath, {
    outputDir: typeof (parsed.args['output'] ?? parsed.args['o'] ?? parsed.args['out']) === 'string'
      ? getOutputDir(parsed, path.join(buildDirPath(), 'gerbers'))
      : undefined,
    savedFills: parsed.args['saved-fills'] === true,
    json,
  });

  if (!json) {
    logger.log(`  Output: ${result.outputDir}`);
    logger.log(chalk.gray('  Text:   public-domain Hershey stroke font (gerber_spec/SPEC.md)\n'));
  }
  if (json) {
    logger.log(
      JSON.stringify(
        {
          pcb: pcbPath,
          outputDir: result.outputDir,
          native: true,
          unfilledZones: result.unfilledZones,
          files: result.files,
        },
        null,
        2,
      ),
    );
  } else {
    logger.log(chalk.green(`Exported ${result.files.length} fabrication file(s) to ${result.outputDir}`));
  }
}

// ---------------------------------------------------------------------------
// Assembly outputs: placement (centroid/PnP/CPL), BOM, and the zipped
// upload package — all native, driven by provider profiles.
// ---------------------------------------------------------------------------

/** The assembly artifacts root: `build/assembly`, stem-scoped like the
 *  gerbers dir when the manifest lists more than one board. */
export function assemblyDirFor(parsed: ParsedArgs, buildDir: string, pcbPath: string): string {
  if (parsed.args['output'] || parsed.args['o'] || parsed.args['out']) {
    return getOutputDir(parsed, path.join(buildDir, 'assembly'));
  }
  if (listBoardFiles(buildDir).length > 1) {
    return path.join(buildDir, 'assembly', path.basename(pcbPath, '.kicad_pcb'));
  }
  return path.join(buildDir, 'assembly');
}

function stringArg(parsed: ParsedArgs, name: string): string | undefined {
  const v = parsed.args[name];
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function enumArg<T extends string>(
  parsed: ParsedArgs,
  name: string,
  values: readonly T[],
): T | undefined {
  const v = stringArg(parsed, name);
  if (v === undefined) return undefined;
  if (!values.includes(v as T)) {
    throw new Error(`--${name}: '${v}' (expected ${values.join(' | ')})`);
  }
  return v as T;
}

function numberArg(parsed: ParsedArgs, name: string): number | undefined {
  const v = stringArg(parsed, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${name}: '${v}' is not a number`);
  return n;
}

/** Comma-separated ref globs: --exclude "FID*,MH*". */
function excludeArg(parsed: ParsedArgs): string[] | undefined {
  const v = stringArg(parsed, 'exclude');
  if (v === undefined) return undefined;
  return v
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

function requirePcb(parsed: ParsedArgs, sub: string): string {
  const pcbArg = parsed.positional[0];
  const pcbPath = findPcbFile(pcbArg, boardStemFromArgs(parsed));
  if (pcbPath) return pcbPath;
  if (pcbArg) throw new Error(`PCB file not found: ${pcbArg}`);
  throw new Error(
    `No .kicad_pcb file found in ${buildDirPath()}.\n` +
      `Run \`typecad-pcb build\` first, or specify a path: typecad-pcb export ${sub} <path/to/board.kicad_pcb>`,
  );
}

function placementOptionsFrom(parsed: ParsedArgs, outputDir: string): PlacementExportOptions {
  return {
    profileId: stringArg(parsed, 'profile'),
    side: enumArg(parsed, 'side', ['front', 'back', 'both'] as const),
    centroid: enumArg(parsed, 'centroid', ['anchor', 'pads', 'body'] as const),
    origin: enumArg(parsed, 'origin', ['board', 'aux'] as const),
    units: enumArg(parsed, 'units', ['mm', 'in', 'mils'] as const),
    decimals: numberArg(parsed, 'decimals'),
    rotationDecimals: numberArg(parsed, 'rotation-decimals'),
    rotationOffset: numberArg(parsed, 'rotation-offset'),
    bottomRotation: numberArg(parsed, 'bottom-rotation'),
    exclude: excludeArg(parsed),
    includeDnp: parsed.args['include-dnp'] === true ? true : undefined,
    freshBoardXml: parsed.args['fresh-board'] === true ? true : undefined,
    outputDir,
  };
}

async function runPos(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const pcbPath = requirePcb(parsed, 'pos');
  const outputDir = assemblyDirFor(parsed, buildDirPath(), pcbPath);

  // resolve before any work so a typo in --profile fails fast with the list
  const profile = resolvePlacementProfile(stringArg(parsed, 'profile'));

  if (!json) {
    logger.log(chalk.white.bold('typecad-pcb export pos') + ` - Placement/centroid file (${profile.label})\n`);
    logger.log(`  PCB:    ${pcbPath}`);
  }

  const board = buildBoardModel(pcbPath);
  const result = exportPlacement(board, placementOptionsFrom(parsed, outputDir));

  if (!json) {
    logger.log(`  Output: ${result.file}`);
    if (result.boardFile) {
      const m = result.boardMerge;
      const note = m
        ? ` — ${m.preserved} association(s) preserved, ${m.added} new` +
          (m.keptExisting.length ? `, ${m.keptExisting.length} kept only in OpenPnP (${m.keptExisting.join(', ')})` : '') +
          (m.dropped.length ? `, dropped (no longer on board): ${m.dropped.join(', ')}` : '')
        : " (open directly in OpenPnP's Boards tab)";
      logger.log(`  Board:  ${result.boardFile}${note}`);
      logger.log(
        chalk.gray(
          `  Defs:   ${result.packagesFile} + ${result.partsFile} (packages/parts the board's part-ids reference)`,
        ),
      );
    }
    logger.log(
      chalk.gray(
        `  Datum:  ${result.centroid} centroid, ${result.origin} origin, ${result.rows.length} placed` +
          (result.skipped.length ? `, ${result.skipped.length} skipped` : '') + '\n',
      ),
    );
    logger.log(chalk.green(`Exported ${result.rows.length} placement row(s) to ${result.file}`));
  } else {
    logger.log(
      JSON.stringify(
        {
          pcb: pcbPath,
          outputDir,
          file: result.file,
          boardFile: result.boardFile,
          packagesFile: result.packagesFile,
          partsFile: result.partsFile,
          boardMerge: result.boardMerge,
          profile: result.profile.id,
          centroid: result.centroid,
          origin: result.origin,
          rows: result.rows.length,
          skipped: result.skipped,
        },
        null,
        2,
      ),
    );
  }
}

async function runBom(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const pcbPath = requirePcb(parsed, 'bom');
  const outputDir = assemblyDirFor(parsed, buildDirPath(), pcbPath);

  const placementProfileId = stringArg(parsed, 'profile');
  const profile = resolveBomProfile(stringArg(parsed, 'bom-profile'), placementProfileId);

  if (!json) {
    logger.log(chalk.white.bold('typecad-pcb export bom') + ` - Bill of materials (${profile.label})\n`);
    logger.log(`  PCB:    ${pcbPath}`);
  }

  const board = buildBoardModel(pcbPath);
  const netlist = loadNetlistBesideBoard(pcbPath);
  const opts: BomExportOptions = {
    profileId: stringArg(parsed, 'bom-profile'),
    fallbackProfileId: stringArg(parsed, 'profile'),
    grouped:
      parsed.args['ungrouped'] === true
        ? false
        : parsed.args['grouped'] === true
          ? true
          : undefined,
    exclude: excludeArg(parsed),
    outputDir,
  };
  const result = exportBom(board, netlist, opts);

  if (!json) {
    logger.log(`  Output: ${result.file}`);
    logger.log(
      chalk.gray(
        `  Rows:   ${result.rows.length} (${result.rows.reduce((a, r) => a + r.refs.length, 0)} references)` +
          (netlist ? '' : '; no netlist beside the board — MPN/datasheet columns stay empty') + '\n',
      ),
    );
    logger.log(chalk.green(`Exported BOM to ${result.file}`));
  } else {
    logger.log(
      JSON.stringify(
        {
          pcb: pcbPath,
          outputDir,
          file: result.file,
          profile: result.profile.id,
          grouped: opts.grouped ?? profile.grouped,
          rows: result.rows.length,
          skipped: result.skipped,
          netlist: result.netlist,
        },
        null,
        2,
      ),
    );
  }
}

/** `export assembly` — the one-shot provider package: native gerbers +
 *  drill + job + placement + BOM, zipped into the shop's upload file. */
export interface AssemblyExportResult {
  stagingDir: string;
  zipPath: string | null;
  gerberFiles: string[];
  placementFile: string;
  /** Native OpenPnP board file when the profile writes one. */
  placementBoardFile: string | null;
  /** OpenPnP packages.xml (bottom-vision footprints), same condition. */
  placementPackagesFile: string | null;
  /** OpenPnP parts.xml matching the board's part-ids, same condition. */
  placementPartsFile: string | null;
  bomFile: string;
  placementRows: number;
  bomRows: number;
}

export function exportAssembly(
  pcbPath: string,
  opts: {
    rootDir: string;
    profileId?: string;
    bomProfileId?: string;
    side?: 'front' | 'back' | 'both';
    centroid?: 'anchor' | 'pads' | 'body';
    origin?: 'board' | 'aux';
    units?: 'mm' | 'in' | 'mils';
    rotationOffset?: number;
    bottomRotation?: number;
    exclude?: string[];
    includeDnp?: boolean;
    freshBoardXml?: boolean;
    zip?: boolean;
    json?: boolean;
  },
): AssemblyExportResult {
  const json = opts.json ?? false;
  const profile = resolvePlacementProfile(opts.profileId);
  const stem = path.basename(pcbPath, '.kicad_pcb');
  const staging = path.join(opts.rootDir, `${stem}-${profile.id}`);

  // The staging wipe below would destroy a board.xml the user edited in
  // OpenPnP — capture it first so the merge can carry their work over.
  let existingBoardXml: string | undefined;
  if (opts.freshBoardXml !== true) {
    try {
      existingBoardXml = fs.readFileSync(path.join(staging, `${stem}.board.xml`), 'utf8');
    } catch {
      // first run — nothing to preserve
    }
  }

  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  if (!json) {
    logger.log(chalk.white.bold('typecad-pcb export assembly') + ` - Provider package (${profile.label})\n`);
    logger.log(`  PCB:    ${pcbPath}`);
  }

  const gerbers = exportNativeGerbers(pcbPath, { outputDir: staging, json });
  const board = buildBoardModel(pcbPath);
  const placement = exportPlacement(board, {
    profileId: opts.profileId,
    side: opts.side,
    centroid: opts.centroid,
    origin: opts.origin,
    units: opts.units,
    rotationOffset: opts.rotationOffset,
    bottomRotation: opts.bottomRotation,
    exclude: opts.exclude,
    includeDnp: opts.includeDnp,
    freshBoardXml: opts.freshBoardXml,
    existingBoardXml,
    outputDir: staging,
  });
  const netlist = loadNetlistBesideBoard(pcbPath);
  const bom = exportBom(board, netlist, {
    // the placement profile's family is the BOM fallback (jlcpcb → the JLC
    // shape); openpnp/pcbway/seeed carry none of their own → generic
    profileId: opts.bomProfileId,
    fallbackProfileId: profile.id,
    exclude: opts.exclude,
    outputDir: staging,
  });

  let zipPath: string | null = null;
  if (opts.zip !== false) {
    const entries = fs
      .readdirSync(staging)
      .filter((f) => fs.statSync(path.join(staging, f)).isFile())
      .sort()
      .map((f) => ({ name: f, data: new Uint8Array(fs.readFileSync(path.join(staging, f))) }));
    zipPath = path.join(opts.rootDir, `${stem}-${profile.id}.zip`);
    fs.writeFileSync(zipPath, zipStore(entries));
  }

  if (!json) {
    logger.log(`  Output: ${zipPath ?? staging}`);
    if (placement.boardFile && placement.boardMerge) {
      const m = placement.boardMerge;
      logger.log(
        chalk.gray(
          `  Board:  ${m.preserved} association(s) preserved, ${m.added} new` +
            (m.keptExisting.length ? `, ${m.keptExisting.length} kept only in OpenPnP` : '') +
            (m.dropped.length ? `, dropped: ${m.dropped.join(', ')}` : ''),
        ),
      );
    }
    logger.log(
      chalk.gray(
        `  Staged: ${gerbers.files.length} fab file(s) + placement (${placement.rows.length} rows)` +
          ` + BOM (${bom.rows.length} rows) in ${staging}\n`,
      ),
    );
    logger.log(
      chalk.green(
        zipPath
          ? `Exported assembly package to ${zipPath}`
          : `Exported assembly files to ${staging} (--no-zip)`,
      ),
    );
  }

  return {
    stagingDir: staging,
    zipPath,
    gerberFiles: gerbers.files,
    placementFile: placement.file,
    placementBoardFile: placement.boardFile ?? null,
    placementPackagesFile: placement.packagesFile ?? null,
    placementPartsFile: placement.partsFile ?? null,
    bomFile: bom.file,
    placementRows: placement.rows.length,
    bomRows: bom.rows.length,
  };
}

async function runAssembly(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const pcbPath = requirePcb(parsed, 'assembly');
  const rootDir = assemblyDirFor(parsed, buildDirPath(), pcbPath);

  const result = exportAssembly(pcbPath, {
    rootDir,
    profileId: stringArg(parsed, 'profile'),
    bomProfileId: stringArg(parsed, 'bom-profile'),
    side: enumArg(parsed, 'side', ['front', 'back', 'both'] as const),
    centroid: enumArg(parsed, 'centroid', ['anchor', 'pads', 'body'] as const),
    origin: enumArg(parsed, 'origin', ['board', 'aux'] as const),
    units: enumArg(parsed, 'units', ['mm', 'in', 'mils'] as const),
    rotationOffset: numberArg(parsed, 'rotation-offset'),
    bottomRotation: numberArg(parsed, 'bottom-rotation'),
    exclude: excludeArg(parsed),
    includeDnp: parsed.args['include-dnp'] === true ? true : undefined,
    freshBoardXml: parsed.args['fresh-board'] === true ? true : undefined,
    zip: parsed.args['zip'] === false ? false : undefined,
    json,
  });

  if (json) {
    logger.log(
      JSON.stringify(
        {
          pcb: pcbPath,
          outputDir: rootDir,
          stagingDir: result.stagingDir,
          zip: result.zipPath,
          profile: stringArg(parsed, 'profile') ?? 'generic',
          gerberFiles: result.gerberFiles,
          placementFile: result.placementFile,
          placementBoardFile: result.placementBoardFile,
          placementPackagesFile: result.placementPackagesFile,
          placementPartsFile: result.placementPartsFile,
          placementRows: result.placementRows,
          bomFile: result.bomFile,
          bomRows: result.bomRows,
        },
        null,
        2,
      ),
    );
  }
}
