import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { executeKiCADCommand } from '../../../kicad_commands.js';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';

function findPcbFile(argPath?: string): string | null {
  if (argPath) {
    const resolved = path.resolve(argPath);
    if (fs.existsSync(resolved)) return resolved;
    return null;
  }

  const buildDir = path.join(process.cwd(), 'build');
  if (!fs.existsSync(buildDir)) return null;

  const pcbFiles = fs.readdirSync(buildDir).filter((f) => f.endsWith('.kicad_pcb'));
  if (pcbFiles.length === 1) return path.join(buildDir, pcbFiles[0]);
  if (pcbFiles.length > 1) return null;

  return null;
}

function getOutputDir(parsed: ParsedArgs, defaultDir: string): string {
  const output = parsed.args['output'];
  if (typeof output === 'string' && output) return path.resolve(output);
  const o = parsed.args['o'];
  if (typeof o === 'string' && o) return path.resolve(o);
  return defaultDir;
}

const VALID_SUBCOMMANDS = ['gerbers', 'drill'];

async function runGerbers(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const pcbArg = parsed.positional[0];
  const pcbPath = findPcbFile(pcbArg);

  if (!pcbPath) {
    if (pcbArg) {
      throw new Error(`PCB file not found: ${pcbArg}`);
    }
    throw new Error(
      'No .kicad_pcb file found in ./build/.\n' +
        'Run `typecad-pcb build` first, or specify a path: typecad-pcb export gerbers <path/to/board.kicad_pcb>',
    );
  }

  const buildDir = path.join(process.cwd(), 'build');
  const outputDir = getOutputDir(parsed, path.join(buildDir, 'gerbers'));
  fs.mkdirSync(outputDir, { recursive: true });

  if (!json) {
    logger.log(chalk.white.bold('typecad-pcb export gerbers') + ' - Export Gerber files\n');
    logger.log(`  PCB:    ${pcbPath}`);
    logger.log(`  Output: ${outputDir}\n`);
  }

  const args = ['export', 'gerbers', '--output', outputDir, ...parsed.passthrough, pcbPath];

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
      'No .kicad_pcb file found in ./build/.\n' +
        'Run `typecad-pcb build` first, or specify a path: typecad-pcb export drill <path/to/board.kicad_pcb>',
    );
  }

  const buildDir = path.join(process.cwd(), 'build');
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
