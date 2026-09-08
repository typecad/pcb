#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { parseArgv } from './parser.js';
import logger from '../../utils/logging.js';

function outputJson(data: unknown): void {
  logger.log(JSON.stringify(data));
}

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pkgPath = path.join(__dirname, '../../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function showCommandHelp(command: string, subcommand: string): Promise<boolean> {
  const help = await import('./help.js');
  if (command === 'create') {
    help.showCreateHelp();
    return true;
  }
  if (command === 'add' && subcommand === 'component') {
    help.showAddComponentHelp();
    return true;
  }
  if (command === 'add' && subcommand === 'package') {
    help.showAddPackageHelp();
    return true;
  }
  if (command === 'build') {
    help.showBuildHelp();
    return true;
  }
  if (command === 'search') {
    help.showSearchHelp();
    return true;
  }
  if (command === 'import') {
    help.showImportHelp();
    return true;
  }
  if (command === 'diff') {
    help.showDiffHelp();
    return true;
  }
  if (command === 'doc') {
    help.showDocHelp();
    return true;
  }
  if (command === 'doctor') {
    help.showDoctorHelp();
    return true;
  }
  if (command === 'validate') {
    help.showValidateHelp();
    return true;
  }
  if (command === 'drc') {
    help.showDrcHelp();
    return true;
  }
  if (command === 'erc') {
    help.showErcHelp();
    return true;
  }
  if (command === 'skills') {
    help.showSkillsHelp();
    return true;
  }
  if (command === 'query') {
    help.showQueryHelp();
    return true;
  }
  if (command === 'edit') {
    help.showEditHelp();
    return true;
  }
  if (command === 'check') {
    help.showCheckHelp();
    return true;
  }
  if (command === 'package') {
    help.showPackageHelp();
    return true;
  }
  if (command === 'export') {
    if (subcommand === 'gerbers') {
      help.showExportGerbersHelp();
    } else if (subcommand === 'drill') {
      help.showExportDrillHelp();
    } else {
      help.showExportHelp();
    }
    return true;
  }
  return false;
}

async function main(): Promise<void> {
  const parsed = parseArgv(process.argv);

  if (parsed.version) {
    if (parsed.json) {
      outputJson({ version: getVersion() });
    } else {
      logger.log(`typeCAD v${getVersion()}`);
    }
    return;
  }

  if (!parsed.command || parsed.help) {
    if (parsed.command && (await showCommandHelp(parsed.command, parsed.subcommand))) {
      return;
    }
    const help = await import('./help.js');
    help.showTopLevelHelp();
    return;
  }

  try {
    switch (parsed.command) {
      case 'create':
        await (await import('./commands/create.js')).run(parsed);
        break;

      case 'add':
        if (parsed.subcommand === 'component') {
          await (await import('./commands/add-component.js')).run(parsed);
        } else if (parsed.subcommand === 'package') {
          await (await import('./commands/add-package.js')).run(parsed);
        } else if (!parsed.subcommand) {
          await showCommandHelp('add', '');
        } else {
          if (parsed.json) {
            outputJson({
              error: true,
              message: `Unknown subcommand 'add ${parsed.subcommand}'. Use 'component' or 'package'.`,
              code: 'UNKNOWN_SUBCOMMAND',
            });
          } else {
            logger.error(chalk.red(`Unknown subcommand 'add ${parsed.subcommand}'. Use 'component' or 'package'.`));
          }
          process.exit(1);
        }
        break;

      case 'build':
        await (await import('./commands/build.js')).run(parsed);
        break;

      case 'search':
        await (await import('./commands/search.js')).run(parsed);
        break;

      case 'import':
        await (await import('./commands/import.js')).run(parsed);
        break;

      case 'diff':
        await (await import('./commands/diff.js')).run(parsed);
        break;

      case 'doc':
        await (await import('./commands/doc.js')).run(parsed);
        break;

      case 'doctor':
        await (await import('./commands/doctor.js')).run(parsed);
        break;

      case 'validate':
        await (await import('./commands/validate.js')).run(parsed);
        break;

      case 'drc':
        await (await import('./commands/drc.js')).run(parsed);
        break;

      case 'erc':
        await (await import('./commands/erc.js')).run(parsed);
        break;

      case 'skills':
        await (await import('./commands/skills.js')).run(parsed);
        break;

      case 'query':
        await (await import('./commands/query.js')).run(parsed);
        break;

      case 'edit':
        await (await import('./commands/edit.js')).run(parsed);
        break;

      case 'check':
        await (await import('./commands/check.js')).run(parsed);
        break;

      case 'package':
        await (await import('./commands/package.js')).run(parsed);
        break;

      case 'export':
        await (await import('./commands/export.js')).run(parsed);
        break;

      default:
        if (parsed.json) {
          outputJson({
            error: true,
            message: `Unknown command '${parsed.command}'`,
            code: 'UNKNOWN_COMMAND',
          });
        } else {
          logger.error(chalk.red(`Unknown command '${parsed.command}'. Run 'typecad --help' for available commands.`));
        }
        process.exit(1);
    }
  } catch (error) {
    if (parsed.json) {
      outputJson({
        error: true,
        message: error instanceof Error ? error.message : String(error),
        code: 'COMMAND_ERROR',
      });
    } else {
      logger.error(chalk.red(error instanceof Error ? error.message : String(error)));
    }
    process.exit(1);
  }
}

process.on('uncaughtException', (error) => {
  if (error instanceof Error && error.name === 'ExitPromptError') {
    process.exit(0);
  } else {
    throw error;
  }
});

main();
