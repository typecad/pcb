import chalk from 'chalk';

/**
 * Unified logging for typeCAD.
 *
 * Environment variables:
 *   TYPECAD_DEBUG=1  - Enables debug output
 *   TYPECAD_QUIET=1  - Suppresses debug and info output
 *   TYPECAD_SILENT=1 - Suppresses all output (warn/error still shown unless set)
 */

const DEBUG_ENABLED = process.env.TYPECAD_DEBUG === '1';
const QUIET_ENABLED = process.env.TYPECAD_QUIET === '1';
const SILENT_ENABLED = process.env.TYPECAD_SILENT === '1';

export function debug(...args: unknown[]) {
  if (!SILENT_ENABLED && DEBUG_ENABLED && !QUIET_ENABLED) {
    console.log(chalk.gray(...args.map(String)));
  }
}

export function info(...args: unknown[]) {
  if (!SILENT_ENABLED && !QUIET_ENABLED) {
    console.info(chalk.blue(...args.map(String)));
  }
}

export function warn(...args: unknown[]) {
  if (!SILENT_ENABLED) {
    console.warn(chalk.yellow(...args.map(String)));
  }
}

export function error(...args: unknown[]) {
  if (!SILENT_ENABLED) {
    console.error(chalk.red(...args.map(String)));
  }
}

/** Log without additional chalk styling, respecting QUIET/SILENT flags. */
export function log(...args: unknown[]) {
  if (!SILENT_ENABLED && !QUIET_ENABLED) {
    console.log(...args);
  }
}

export function success(...args: unknown[]) {
  if (!SILENT_ENABLED && !QUIET_ENABLED) {
    console.log(chalk.green('✔'), ...args.map(String));
  }
}

export default { debug, info, warn, error, log, success };
