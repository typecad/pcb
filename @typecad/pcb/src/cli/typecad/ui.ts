import chalk from 'chalk';
import createSpinner from '../../gitdiff/utils/spinner.js';
import { sym } from '../../utils/symbols.js';

export { sym };

/** `1 error`, `2 errors`; pass `many` for irregular plurals. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** `230ms`, `1.4s`, `2m 05s`. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s - m * 60)).padStart(2, '0')}s`;
}

/** Local `HH:MM:SS`, for watch-mode log prefixes. */
export function timestamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export type ResultStatus = 'ok' | 'warn' | 'fail';

/** One result line: `✔ DRC: passed (0.8s)` — the single format for every command. */
export function resultLine(status: ResultStatus, label: string, detail: string, ms?: number): string {
  const mark = status === 'ok' ? chalk.green(sym.ok) : status === 'warn' ? chalk.yellow(sym.warn) : chalk.red(sym.fail);
  const time = ms !== undefined ? chalk.gray(` (${formatDuration(ms)})`) : '';
  return `${mark} ${label}: ${detail}${time}`;
}

export interface CountSummary {
  label: string;
  errors?: number;
  warnings?: number;
  unconnected?: number;
  ms?: number;
}

/** `✖ DRC: 1 error, 2 warnings (0.8s)` or `✔ DRC: passed (0.8s)`. */
export function summaryLine(s: CountSummary): string {
  const errors = s.errors ?? 0;
  const warnings = s.warnings ?? 0;
  const unconnected = s.unconnected ?? 0;
  const parts: string[] = [];
  if (errors > 0) parts.push(plural(errors, 'error'));
  if (warnings > 0) parts.push(plural(warnings, 'warning'));
  if (unconnected > 0) parts.push(plural(unconnected, 'unconnected item'));
  if (parts.length === 0) return resultLine('ok', s.label, 'passed', s.ms);
  return resultLine(errors > 0 ? 'fail' : 'warn', s.label, parts.join(', '), s.ms);
}

function spinnerEnabled(): boolean {
  return (
    Boolean(process.stderr.isTTY) &&
    process.env.TYPECAD_QUIET !== '1' &&
    process.env.TYPECAD_SILENT !== '1' &&
    process.env.TYPECAD_DEBUG !== '1'
  );
}

/**
 * Show a spinner on stderr while an async step runs. Interactive terminals
 * only: piped output, --json, --quiet and --verbose get no spinner. The
 * spinner clears itself, so the command's own result line is the only
 * thing left behind.
 *
 * It animates only while the event loop is free (kicad-cli child
 * processes); a long synchronous step shows a static first frame.
 */
export async function withSpinner<T>(text: string, task: () => Promise<T>, opts?: { enabled?: boolean }): Promise<T> {
  if (!(opts?.enabled ?? spinnerEnabled())) return task();
  const spinner = createSpinner({ text }).start();
  try {
    return await task();
  } finally {
    spinner.stop();
  }
}
