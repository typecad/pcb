#!/usr/bin/env node
import chalk from 'chalk';
import { create_project } from './create_project.js';

import type { ProjectAnswers } from '../types.js';
import logger from '../../utils/logging.js';

const answers: Partial<ProjectAnswers> = {};
process.on('uncaughtException', (error) => {
  if (error && error.name === 'ExitPromptError') {
    process.exit(0);
  } else {
    // Rethrow unknown errors
    throw error;
  }
});

// Parse command line arguments
function parseArguments() {
  const args = process.argv.slice(2);
  const parsedArgs: Record<string, string | boolean | string[] | undefined> = {};

  // Mapping from npm package names to internal short names
  const packageNameMap: Record<string, string> = {
    '@typecad/graphviz': 'graphviz',
    '@typecad/jlcpcb-export': 'jlcpcb',
    '@typecad/typecad-prompt': 'prompt',
    '@typecad/wiring': 'wiring',
    '@typecad/jlcpcb-parts': 'jlcpcb-parts',
    '@typecad/typecad-mcp': 'typecad-mcp',
  };

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');

      // Handle flags without values (like --help)
      if (key === 'help' && value === undefined) {
        parsedArgs[key] = true;
      } else if (key === 'pio' || key === 'git') {
        parsedArgs[key] = value === 'true';
      } else if (key === 'packages') {
        if (value) {
          // Convert npm package names to internal short names
          parsedArgs[key] = value.split(',').map((pkg) => packageNameMap[pkg] || pkg);
        } else {
          parsedArgs[key] = [];
        }
      } else {
        // Valueless flags become true so they can never read as "undefined"
        parsedArgs[key] = value === undefined ? true : value;
      }
    }
  }

  return parsedArgs;
}

// Check if all required arguments are provided for non-interactive mode
function hasAllRequiredArgs(args: Record<string, string | boolean | string[] | undefined>) {
  // --yes fills sensible defaults (pio=false, git=true) so agents only need --name
  if (args.yes === true && typeof args.name === 'string') {
    args.pio = args.pio === true;
    args.git = args.git !== false;
    return true;
  }

  const hasBasicArgs = typeof args.name === 'string' && typeof args.pio === 'boolean' && typeof args.git === 'boolean';

  // If pio is true, board is also required
  if (args.pio === true) {
    return hasBasicArgs && typeof args.board === 'string';
  }

  return hasBasicArgs;
}

// Display help information
function showHelp() {
  logger.log(chalk.white.bold('🤖 typeCAD Project Creator - Command Line Usage\n'));
  logger.log('Usage: npx @typecad/typecad create [options]\n');
  logger.log('Options:');
  logger.log('  --name=<project_name>     Project name (required for non-interactive mode)');
  logger.log('  --yes                     Non-interactive with defaults (pio=false, git=true)');
  logger.log('  --pio=<true|false>        Create PlatformIO project (required for non-interactive mode)');
  logger.log('  --git=<true|false>        Initialize git repository (required for non-interactive mode)');
  logger.log('  --board=<board_name>      PlatformIO board (required when --pio=true, default: esp32dev)');
  logger.log('  --packages=<pkg1,pkg2>    Comma-separated list of optional packages');
  logger.log('  --help                    Show this help message\n');
  logger.log('Available packages:');
  logger.log('  @typecad/graphviz, @typecad/jlcpcb-export, @typecad/typecad-prompt,');
  logger.log('  @typecad/wiring, @typecad/jlcpcb-parts, @typecad/typecad-mcp\n');
  logger.log('Examples:');
  logger.log('  npx @typecad/typecad create --name=my_project --pio=false --git=true');
  logger.log('  npx @typecad/typecad create --name=my_project --pio=true --git=true --board=esp32dev');
  logger.log(
    '  npx @typecad/typecad create --name=my_project --pio=true --git=true --board=esp32dev --packages=@typecad/graphviz',
  );
}

// argv bag: keys are parsed dynamically (see parseArguments), so values are intentionally untyped
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function main(preparsedArgs?: Record<string, any>) {
  const cmdArgs = preparsedArgs || parseArguments();

  if (cmdArgs.help) {
    showHelp();
    return;
  }

  // Validate project name if provided
  function validateProjectName(name: string) {
    if (name.includes('-') || name.includes(' ') || name.match(/^\d/)) {
      return `That's not a valid function name in TypeScript`;
    }
    return true;
  }

  process.stdout.write(chalk.white.bold('🤖 type'));
  process.stdout.write(chalk('CAD '));
  process.stdout.write(chalk('Project Creator\n'));

  // Check if we're in non-interactive mode
  const isNonInteractive = hasAllRequiredArgs(cmdArgs);

  // Always create a project - no need to ask
  const project_type = 'project';

  if (isNonInteractive) {
    // Validate provided name
    const nameValidation = validateProjectName(cmdArgs.name);
    if (nameValidation !== true) {
      logger.error(chalk.red('Error:'), nameValidation);
      process.exit(1);
    }

    // Use command line arguments
    answers.name = cmdArgs.name;
    answers.pio = cmdArgs.pio;
    answers.git = cmdArgs.git;
    answers.board = cmdArgs.board || 'esp32dev';
    answers.packages = cmdArgs.packages || [];

    logger.log(chalk.green('Creating project with the following settings:'));
    logger.log(`  Name: ${answers.name}`);
    logger.log(`  PlatformIO: ${answers.pio}`);
    logger.log(`  Git: ${answers.git}`);
    if (answers.pio) {
      logger.log(`  Board: ${answers.board}`);
    }
    if (answers.packages && answers.packages.length > 0) {
      logger.log(`  Packages: ${answers.packages.join(', ')}`);
    }
  } else {
    // Interactive mode - ask questions as before
    const { input, confirm } = await import('@inquirer/prompts');
    const multi_select = await import('inquirer-select-pro');

    answers.name = await input({
      message: 'Project name?',
      default: cmdArgs.name || 'typecad_project',
      validate: validateProjectName,
    });

    answers.pio = cmdArgs.hasOwnProperty('pio')
      ? cmdArgs.pio
      : await confirm({
          message: 'Create a PlatformIO project for firmware?',
          default: false,
        });

    if (answers.pio) {
      answers.board =
        cmdArgs.board ||
        (await input({
          message: 'PlatformIO board?',
          default: 'esp32dev',
        }));
    }

    answers.git = cmdArgs.hasOwnProperty('git')
      ? cmdArgs.git
      : await confirm({
          message: 'Initialize a git repo?',
        });

    answers.packages =
      cmdArgs.packages ||
      (await multi_select.select({
        message: 'Optional packages',
        multiple: true,
        defaultValue: [],
        options: [
          {
            name: '@typecad/graphviz - view connections in your typeCAD project',
            value: 'graphviz',
          },
          {
            name: '@typecad/jlcpcb-export - export all the required files for JLCPCB assembly from a typeCAD project',
            value: 'jlcpcb',
          },
          {
            name: '@typecad/typecad-prompt - generate prompts to use typeCAD with AI coding models',
            value: 'prompt',
          },
          {
            name: '@typecad/wiring - programmatically create wiring diagrams',
            value: 'wiring',
          },
          {
            name: '@typecad/jlcpcb-parts - Fuzzy search for JLCPCB basic and preferred electrical components',
            value: 'jlcpcb-parts',
          },
          {
            name: '@typecad/typecad-mcp - Provides AI assistants with direct access to typeCAD tools and workflows',
            value: 'typecad-mcp',
          },
        ],
      }));
  }

  await create_project(answers as ProjectAnswers);
}

export { main };

if (process.argv[1]?.endsWith('create-typecad/index.js') || process.argv[1]?.endsWith('create-typecad\\index.js')) {
  main();
}
