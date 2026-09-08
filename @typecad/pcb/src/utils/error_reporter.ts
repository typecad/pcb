import fs from 'node:fs';
import chalk from 'chalk';
import logger from './logging.js';
import type { IPadResolutionFailure } from '../routing/shared/pad_resolver.js';

export interface Locatable {
  reference: string;
  sourceInfo?: {
    file: string;
    line: number;
    variable?: string;
  };
}

/**
 * Reports a beautiful, colorized error message with source code context.
 *
 * @param message The error message
 * @param item The component or object with source info
 */
export function displayName(component: { reference?: string; sourceInfo?: { variable?: string } }): string {
  const ref = component.reference || 'UNKNOWN';
  const variable = component.sourceInfo?.variable;
  return variable ? `${variable} (${ref})` : ref;
}

export function reportError(message: string, item: Locatable) {
  const sourceInfo = item.sourceInfo;

  // Header
  logger.error(chalk.red.bold(`\nError: ${message}`));

  if (sourceInfo && sourceInfo.file && sourceInfo.line) {
    const variableName = sourceInfo.variable || item.reference;
    logger.error(`  at ${chalk.cyan(variableName)} (${chalk.gray(sourceInfo.file + ':' + sourceInfo.line)})`);

    try {
      if (fs.existsSync(sourceInfo.file)) {
        const content = fs.readFileSync(sourceInfo.file, 'utf-8');
        const lines = content.split(/\r?\n/);
        const lineIdx = sourceInfo.line - 1;

        const startLine = Math.max(0, lineIdx - 2);
        const endLine = Math.min(lines.length - 1, lineIdx + 2);

        logger.log(''); // Spacer

        for (let i = startLine; i <= endLine; i++) {
          const lineNumStr = (i + 1).toString().padStart(5, ' ');
          const lineContent = lines[i];

          if (i === lineIdx) {
            // Highlighted line
            logger.log(`${chalk.red('>')} ${chalk.gray(lineNumStr)} | ${lineContent}`);

            // Try to add a pointer under the variable name
            if (sourceInfo.variable && lineContent.includes(sourceInfo.variable)) {
              const indent = lineContent.indexOf(sourceInfo.variable);
              const pointer = ' '.repeat(indent) + '^'.repeat(sourceInfo.variable.length);
              logger.log(`        | ${chalk.red(pointer)}`);
            }
          } else {
            // Context lines
            logger.log(`  ${chalk.gray(lineNumStr)} | ${chalk.gray(lineContent)}`);
          }
        }
        logger.log(''); // Spacer
      }
    } catch (e) {
      // Fallback if file reading fails
      logger.error(chalk.gray(`  [Could not read source file: ${(e as Error).message}]`));
    }
  } else {
    logger.error(`  at ${chalk.cyan(item.reference)} (No source info available)`);
  }
}

export interface IPinFailureDetail {
  pin: import('../pin.js').Pin;
  failure: IPadResolutionFailure;
}

export function formatPinResolutionError(fromFailures: IPinFailureDetail[], toFailures: IPinFailureDetail[]): string {
  const allFailures = [
    ...fromFailures.map((f) => ({ ...f, direction: 'from' as const })),
    ...toFailures.map((f) => ({ ...f, direction: 'to' as const })),
  ];

  const parts: string[] = [];

  for (const { pin, failure } of allFailures) {
    const comp = failure.component;
    const compDisplay = displayName(comp);
    const footprint = comp.footprint || '(none)';
    const availableStr = failure.availablePads.length > 0 ? failure.availablePads.join(', ') : '(unknown)';

    parts.push(
      `Pin ${chalk.bold(pin.number)} on ${chalk.cyan(compDisplay)} (footprint: ${chalk.gray(footprint)}) does not exist.` +
        `\n  Available pin(s): ${chalk.green(availableStr)}`,
    );

    const pinSourceFile = pin.sourceFile;
    const pinSourceLine = pin.sourceLine;
    if (pinSourceFile && pinSourceLine) {
      const fileContent = readSourceFile(pinSourceFile);
      if (fileContent !== undefined) {
        const lines = fileContent.split(/\r?\n/);
        const lineIdx = pinSourceLine - 1;
        const targetLine = lines[lineIdx] || '';
        const col = pin.sourceColumn;

        parts.push('');
        const startLine = Math.max(0, lineIdx - 2);
        const endLine = Math.min(lines.length - 1, lineIdx + 2);
        for (let i = startLine; i <= endLine; i++) {
          const lineNumStr = (i + 1).toString().padStart(5, ' ');
          const lineContent = lines[i] || '';
          if (i === lineIdx) {
            parts.push(`${chalk.red('>')} ${chalk.gray(lineNumStr)} | ${lineContent}`);
            if (col && col > 0) {
              const pointer = ' '.repeat(col - 1) + chalk.red('^');
              parts.push(`        | ${pointer}`);
            }
          } else {
            parts.push(`  ${chalk.gray(lineNumStr)} | ${chalk.gray(lineContent)}`);
          }
        }
        parts.push('');
      }
    } else {
      const sourceInfo = comp.sourceInfo;
      if (sourceInfo && sourceInfo.file && sourceInfo.line) {
        const fileContent = readSourceFile(sourceInfo.file);
        if (fileContent !== undefined) {
          const lines = fileContent.split(/\r?\n/);
          const lineIdx = sourceInfo.line - 1;
          const startLine = Math.max(0, lineIdx - 2);
          const endLine = Math.min(lines.length - 1, lineIdx + 2);

          parts.push(chalk.gray(`  (component defined at ${sourceInfo.file}:${sourceInfo.line})`));
          parts.push('');
          for (let i = startLine; i <= endLine; i++) {
            const lineNumStr = (i + 1).toString().padStart(5, ' ');
            const lineContent = lines[i] || '';
            if (i === lineIdx) {
              parts.push(`${chalk.red('>')} ${chalk.gray(lineNumStr)} | ${lineContent}`);
              const variable = sourceInfo.variable;
              if (variable && lineContent.includes(variable)) {
                const indent = lineContent.indexOf(variable);
                const pointer = ' '.repeat(indent) + chalk.red('^'.repeat(variable.length));
                parts.push(`        | ${pointer}`);
              }
            } else {
              parts.push(`  ${chalk.gray(lineNumStr)} | ${chalk.gray(lineContent)}`);
            }
          }
          parts.push('');
        }
      }
    }
  }

  const suggestion = buildSuggestion(allFailures);

  const header = `Unable to resolve pin positions: ${fromFailures.length} invalid start pin(s), ${toFailures.length} invalid end pin(s)`;

  return `${header}\n\n${parts.join('\n')}\n\n${chalk.yellow('Suggestion:')} ${suggestion}`;
}

export function formatSourceError(
  message: string,
  location?: { file: string; line: number; column?: number } | null | undefined,
): string {
  if (!location || !location.file || !location.line) return message;

  const parts: string[] = [message];

  const fileContent = readSourceFile(location.file);
  if (fileContent !== undefined) {
    const lines = fileContent.split(/\r?\n/);
    const lineIdx = location.line - 1;
    const startLine = Math.max(0, lineIdx - 2);
    const endLine = Math.min(lines.length - 1, lineIdx + 2);

    parts.push('');
    for (let i = startLine; i <= endLine; i++) {
      const lineNumStr = (i + 1).toString().padStart(5, ' ');
      const lineContent = lines[i] || '';
      if (i === lineIdx) {
        parts.push(`${chalk.red('>')} ${chalk.gray(lineNumStr)} | ${lineContent}`);
        if (location.column && location.column > 0) {
          const pointer = ' '.repeat(location.column - 1) + chalk.red('^');
          parts.push(`        | ${pointer}`);
        }
      } else {
        parts.push(`  ${chalk.gray(lineNumStr)} | ${chalk.gray(lineContent)}`);
      }
    }
    parts.push('');
  }

  return parts.join('\n');
}

function readSourceFile(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

function buildSuggestion(failures: Array<{ pin: import('../pin.js').Pin; failure: IPadResolutionFailure }>): string {
  const suggestions: string[] = [];
  for (const { pin, failure } of failures) {
    const comp = failure.component;
    const variable = comp.sourceInfo?.variable;
    const compName = variable ? `${variable}` : comp.reference;
    const availableStr =
      failure.availablePads.length > 0 ? failure.availablePads.join(', ') : 'check the footprint definition';
    suggestions.push(`${compName}.pin(${chalk.bold(pin.number)}) does not exist — use one of: ${availableStr}`);
  }
  return suggestions.join('\n  ');
}
