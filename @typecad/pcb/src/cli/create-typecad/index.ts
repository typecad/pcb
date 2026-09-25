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

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');

      // Handle flags without values (like --help)
      if (key === 'help' && value === undefined) {
        parsedArgs[key] = true;
      } else if (key === 'hal' || key === 'git') {
        parsedArgs[key] = value === 'true';
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
  // --yes fills sensible defaults (hal=false, git=true) so agents only need --name
  if (args.yes === true && typeof args.name === 'string') {
    args.hal = args.hal === true;
    args.git = args.git !== false;
    return true;
  }

  return typeof args.name === 'string' && typeof args.hal === 'boolean' && typeof args.git === 'boolean';
}

// Display help information
function showHelp() {
  logger.log(chalk.white.bold('🤖 typeCAD Project Creator - Command Line Usage\n'));
  logger.log('Usage: npx @typecad/pcb create [options]\n');
  logger.log('Options:');
  logger.log('  --name=<project_name>     Project name (required for non-interactive mode)');
  logger.log('  --yes                     Non-interactive with defaults (hal=false, git=true)');
  logger.log('  --hal=<true|false>        Add a typeCAD HAL firmware project in ./fw (its board setup runs interactively)');
  logger.log('  --git=<true|false>        Initialize git repository (required for non-interactive mode)');
  logger.log('  --help                    Show this help message\n');
  logger.log('Examples:');
  logger.log('  npx @typecad/pcb create --name=my_project --hal=false --git=true');
  logger.log('  npx @typecad/pcb create --name=my_project --hal=true --git=true');
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
    answers.hal = cmdArgs.hal;
    answers.git = cmdArgs.git;

    logger.log(chalk.green('Creating project with the following settings:'));
    logger.log(`  Name: ${answers.name}`);
    logger.log(`  typeCAD HAL firmware: ${answers.hal}`);
    logger.log(`  Git: ${answers.git}`);
  } else {
    // Interactive mode. Plain readline, NOT @inquirer: on Windows an
    // @inquirer raw-mode console reader cannot be fully stopped after the
    // prompts finish, and it silently swallows every keystroke meant for the
    // interactive HAL wizard spawned later with inherited stdio (the board
    // picker accepts no input). readline's close() actually stops reading,
    // so the child gets the console.
    const { createInterface } = await import('node:readline/promises');
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    // Line queue instead of sequential question() calls: lines that arrive
    // while no question is pending (piped stdin delivers the whole answer
    // sheet in one chunk) would otherwise be dropped by readline.
    const pendingLines: string[] = [];
    const lineWaiters: Array<(line: string) => void> = [];
    rl.on('line', (l: string) => {
      if (lineWaiters.length > 0) lineWaiters.shift()!(l);
      else pendingLines.push(l);
    });
    const nextLine = (): Promise<string> =>
      new Promise((resolve) => {
        if (pendingLines.length > 0) resolve(pendingLines.shift()!);
        else lineWaiters.push(resolve);
      });
    const ask = async (q: string, def?: string): Promise<string> => {
      const suffix = def ? ` (${def})` : '';
      process.stdout.write(`${q}${suffix}: `);
      const a = await nextLine();
      return a.trim() || (def ?? '');
    };

    let name = await ask('Project name?', cmdArgs.name || 'typecad_project');
    let nameValidation = validateProjectName(name);
    while (nameValidation !== true) {
      logger.error(chalk.red('Error:'), nameValidation);
      name = await ask('Project name?', 'typecad_project');
      nameValidation = validateProjectName(name);
    }
    answers.name = name;

    answers.hal =
      typeof cmdArgs.hal === 'boolean'
        ? cmdArgs.hal
        : (await ask('Add a typeCAD HAL firmware project in ./fw? [y/N]', '')).toLowerCase().startsWith('y');

    answers.git =
      typeof cmdArgs.git === 'boolean'
        ? cmdArgs.git
        : (await ask('Initialize a git repo? [y/N]', '')).toLowerCase().startsWith('y');

    rl.close();
  }

  await create_project(answers as ProjectAnswers);
}

export { main };

if (process.argv[1]?.endsWith('create-typecad/index.js') || process.argv[1]?.endsWith('create-typecad\\index.js')) {
  main();
}
