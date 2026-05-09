import chalk from 'chalk';

/**
 * Unified logging for typeCAD.
 *
 * Environment variables:
 *   TYPECAD_DEBUG=1  - Enables debug output
 *   TYPECAD_QUIET=1  - Suppresses debug and info output
 *   TYPECAD_SILENT=1 - Suppresses all output (warn/error still shown unless set)
 */

const DEBUG_ENABLED = Boolean(process.env.TYPECAD_DEBUG && process.env.TYPECAD_DEBUG === '1');
const QUIET_ENABLED = Boolean(process.env.TYPECAD_QUIET && process.env.TYPECAD_QUIET === '1');
const SILENT_ENABLED = Boolean(process.env.TYPECAD_SILENT && process.env.TYPECAD_SILENT === '1');

export function debug(...args: any[]) {
  if (!SILENT_ENABLED && DEBUG_ENABLED && !QUIET_ENABLED) {
    console.log(chalk.gray(...args));
  }
}

export function info(...args: any[]) {
  if (!SILENT_ENABLED && !QUIET_ENABLED) {
    console.info(chalk.blue(...args));
  }
}

export function warn(...args: any[]) {
  if (!SILENT_ENABLED) {
    console.warn(chalk.yellow(...args));
  }
}

export function error(...args: any[]) {
  if (!SILENT_ENABLED) {
    console.error(chalk.red(...args));
  }
}

/** Log without additional chalk styling, respecting QUIET/SILENT flags. */
export function log(...args: any[]) {
  if (!SILENT_ENABLED && !QUIET_ENABLED) {
    console.log(...args);
  }
}

export default { debug, info, warn, error, log };
