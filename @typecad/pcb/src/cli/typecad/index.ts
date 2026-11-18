#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withCommands } from '../../utils/command_hint.js';
import { findUnknownFlags, normalizeBareFileInvocation, parseArgv } from './parser.js';
import { COMMAND_NAMES, findCommand, helpFunctionFor } from './registry.js';
import { suggestClosest } from './suggest.js';
import logger from '../../utils/logging.js';
import { applyOutDirFlag } from './pipeline.js';

function outputJson(data: unknown): void {
  logger.out(JSON.stringify(data));
}

/** Usage errors (unknown command or option) exit 2, distinct from failed checks (1). */
function usageError(parsedJson: boolean, code: string, message: string, hint?: string): never {
  if (parsedJson) {
    outputJson({ error: true, message, code });
  } else {
    logger.error(hint ? withCommands(message, hint) : message);
  }
  process.exit(2);
}

/** Run a help printer and return its text with colors stripped (for --help --json). */
async function captureHelp(print: () => Promise<void> | void): Promise<string> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    await print();
  } finally {
    console.log = original;
  }
  // eslint-disable-next-line no-control-regex
  return lines.join('\n').replace(/\u001b\[[0-9;]*m/g, '');
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
  const fnName = helpFunctionFor(command, subcommand);
  if (!fnName) return false;
  const help = (await import('./help.js')) as unknown as Record<string, unknown>;
  const print = help[fnName];
  if (typeof print !== 'function') return false;
  (print as () => void)();
  return true;
}

async function main(): Promise<void> {
  const parsed = normalizeBareFileInvocation(parseArgv(process.argv));
  // --outDir applies to every command: it redirects both the CLI's artifact
  // discovery and the library's writes (via TYPECAD_BUILD_DIR).
  applyOutDirFlag(parsed.args);
  // --quiet / --verbose steer the logger (and any child build) for every command.
  logger.configureFromFlags({ quiet: parsed.args['quiet'] === true, verbose: parsed.args['verbose'] === true });

  if (parsed.version) {
    if (parsed.json) {
      outputJson({ version: getVersion() });
    } else {
      logger.log(`typecad-pcb v${getVersion()}`);
    }
    return;
  }

  // A mistyped subcommand (`export gerber`) gets the nearest real one.
  const spec = findCommand(parsed.command);
  if (spec?.subcommands && parsed.subcommand && !spec.subcommands.some((sub) => sub.name === parsed.subcommand)) {
    const names = spec.subcommands.map((sub) => sub.name).filter((name) => name !== 'help');
    const near = suggestClosest(parsed.subcommand, names);
    usageError(
      parsed.json,
      'UNKNOWN_SUBCOMMAND',
      `Unknown subcommand '${parsed.command} ${parsed.subcommand}'.${near ? ` Did you mean '${near}'?` : ''} ` +
        `Available: ${names.join(', ')}. See the options with:`,
      `typecad-pcb ${parsed.command} --help`,
    );
  }

  // bare `help` (the word, not --help) shows the top-level screen too
  if (!parsed.command || parsed.command === 'help' || parsed.help) {
    const printHelp = async (): Promise<void> => {
      if (parsed.command && parsed.command !== 'help' && (await showCommandHelp(parsed.command, parsed.subcommand))) {
        return;
      }
      const help = await import('./help.js');
      help.showTopLevelHelp();
    };
    if (parsed.json) {
      const text = await captureHelp(printHelp);
      outputJson({ command: parsed.command || null, subcommand: parsed.subcommand || null, help: text });
    } else {
      await printHelp();
    }
    return;
  }

  // A mistyped option used to be ignored silently (--outdir quietly wrote to
  // the default folder), and so was an option another command reads
  // (`build --fix`). Both are rejected, pointing at the closest real one
  // for THIS command.
  if (parsed.command === 'help' || COMMAND_NAMES.includes(parsed.command)) {
    const unknown = findUnknownFlags(parsed);
    if (unknown.length > 0) {
      const parts = unknown.map(({ flag, scope, candidates }) => {
        const bare = flag.replace(/^-+(no-)?/, '');
        const near = suggestClosest(bare, candidates);
        const hint = near ? `did you mean --${near}?` : '';
        if (scope === 'command') {
          return `${flag} (not an option of '${parsed.command}'${hint ? `; ${hint}` : ''})`;
        }
        return hint ? `${flag} (${hint})` : flag;
      });
      usageError(
        parsed.json,
        'UNKNOWN_OPTION',
        `Unknown option${unknown.length > 1 ? 's' : ''}: ${parts.join(', ')}. See the options for this command with:`,
        `typecad-pcb ${parsed.command}${parsed.subcommand ? ' ' + parsed.subcommand : ''} --help`,
      );
    }
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
          usageError(
            parsed.json,
            'UNKNOWN_SUBCOMMAND',
            `Unknown subcommand 'add ${parsed.subcommand}'. Use 'component' or 'package'.`,
          );
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

      case 'check-sync':
        await (await import('./commands/check_sync.js')).run(parsed);
        break;

      case 'drc':
        await (await import('./commands/drc.js')).run(parsed);
        break;

      case 'simulate':
        await (await import('./commands/simulate.js')).run(parsed);
        break;

      case 'erc':
        await (await import('./commands/erc.js')).run(parsed);
        break;

      case 'lib':
        await (await import('./commands/lib.js')).run(parsed);
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

      case 'diagnostics':
        await (await import('./commands/diagnostics.js')).run(parsed);
        break;

      case 'clean':
        await (await import('./commands/clean.js')).run(parsed);
        break;

      case 'package':
        await (await import('./commands/package.js')).run(parsed);
        break;

      case 'export':
        await (await import('./commands/export.js')).run(parsed);
        break;

      case 'viewer':
        await (await import('./commands/viewer.js')).run(parsed);
        break;

      case 'completion':
        await (await import('./commands/completion.js')).run(parsed);
        break;

      default: {
        const near = suggestClosest(parsed.command, COMMAND_NAMES);
        usageError(
          parsed.json,
          'UNKNOWN_COMMAND',
          `Unknown command '${parsed.command}'.${near ? ` Did you mean '${near}'?` : ''} See the available commands with:`,
          'typecad-pcb --help',
        );
      }
    }
  } catch (error) {
    if (parsed.json) {
      outputJson({
        error: true,
        message: error instanceof Error ? error.message : String(error),
        code: 'COMMAND_ERROR',
      });
    } else {
      logger.error(error instanceof Error ? error.message : String(error));
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
