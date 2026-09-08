/* eslint-disable no-console */
import chalk from 'chalk';

/**
 * Unified logging for typeCAD.
 *
 * Environment variables:
 *   TYPECAD_DEBUG=1  - Enables debug output
 *   TYPECAD_QUIET=1  - Suppresses debug and info output
 *   TYPECAD_SILENT=1 - Suppresses all output (warn/error still shown unless set)
 */

function isDebug(): boolean {
  return process.env.TYPECAD_DEBUG === '1';
}
function isQuiet(): boolean {
  return process.env.TYPECAD_QUIET === '1';
}
function isSilent(): boolean {
  return process.env.TYPECAD_SILENT === '1';
}

export function debug(...args: unknown[]) {
  if (!isSilent() && isDebug() && !isQuiet()) {
    console.log(chalk.gray(...args));
  }
}

export function info(...args: unknown[]) {
  if (!isSilent() && !isQuiet()) {
    console.info(chalk.blue(...args));
  }
}

export function warn(...args: unknown[]) {
  if (!isSilent()) {
    console.warn(chalk.yellow(...args));
  }
}

export function error(...args: unknown[]) {
  if (!isSilent()) {
    console.error(chalk.red(...args));
  }
}

/** Log without additional chalk styling, respecting QUIET/SILENT flags. */
export function log(...args: unknown[]) {
  if (!isSilent() && !isQuiet()) {
    console.log(...args);
  }
}

export function success(...args: unknown[]) {
  if (!isSilent() && !isQuiet()) {
    console.log(chalk.green('✔'), ...args);
  }
}

export default { debug, info, warn, error, log, success };
