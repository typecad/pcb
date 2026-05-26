#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { parseArgv } from './parser.js';
import {
  showTopLevelHelp,
  showCreateHelp,
  showAddComponentHelp,
  showAddPackageHelp,
  showBuildHelp,
  showSearchHelp,
  showImportHelp,
  showDiffHelp,
  showDocHelp,
  showDoctorHelp,
  showValidateHelp,
  showDrcHelp,
} from './help.js';

function outputJson(data: unknown): void {
  console.log(JSON.stringify(data));
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

function showCommandHelp(command: string, subcommand: string): boolean {
  if (command === 'create') {
    showCreateHelp();
    return true;
  }
  if (command === 'add' && subcommand === 'component') {
    showAddComponentHelp();
    return true;
  }
  if (command === 'add' && subcommand === 'package') {
    showAddPackageHelp();
    return true;
  }
  if (command === 'build') {
    showBuildHelp();
    return true;
  }
  if (command === 'search') {
    showSearchHelp();
    return true;
  }
  if (command === 'import') {
    showImportHelp();
    return true;
  }
  if (command === 'diff') {
    showDiffHelp();
    return true;
  }
  if (command === 'doc') {
    showDocHelp();
    return true;
  }
  if (command === 'doctor') {
    showDoctorHelp();
    return true;
  }
  if (command === 'validate') {
    showValidateHelp();
    return true;
  }
  if (command === 'drc') {
    showDrcHelp();
    return true;
  }
  if (command === 'add') {
    console.log(
      chalk.white.bold('typecad add') + ' - Available subcommands:\n'
    );
    console.log('  component    Add a component to the current project');
    console.log('  package      Create a reusable component package\n');
    console.log("Run 'typecad add <subcommand> --help' for details.");
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
      console.log(`typeCAD v${getVersion()}`);
    }
    return;
  }

  if (!parsed.command || parsed.help) {
    if (parsed.command && showCommandHelp(parsed.command, parsed.subcommand)) {
      return;
    }
    showTopLevelHelp();
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
          showCommandHelp('add', '');
        } else {
          if (parsed.json) {
            outputJson({
              error: true,
              message: `Unknown subcommand 'add ${parsed.subcommand}'. Use 'component' or 'package'.`,
              code: 'UNKNOWN_SUBCOMMAND',
            });
          } else {
            console.error(
              chalk.red(
                `Unknown subcommand 'add ${parsed.subcommand}'. Use 'component' or 'package'.`
              )
            );
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

      default:
        if (parsed.json) {
          outputJson({
            error: true,
            message: `Unknown command '${parsed.command}'`,
            code: 'UNKNOWN_COMMAND',
          });
        } else {
          console.error(
            chalk.red(
              `Unknown command '${parsed.command}'. Run 'typecad --help' for available commands.`
            )
          );
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
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
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
