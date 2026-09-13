import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { executeKiCADCommand } from '../../../kicad_commands.js';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import { buildDirPath, findBoardFile } from '../pipeline.js';

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
  const o = parsed.args['o'];
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
    await runGerbers(parsed);
  } else {
    await runDrill(parsed);
  }
}
