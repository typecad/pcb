/**
 * Status symbols shared by every CLI surface, so a pass/fail/warn mark looks
 * the same in `check`, `doctor`, `build`, the logger and the summary lines.
 * Falls back to ASCII on consoles that cannot render the Unicode marks
 * (legacy Windows conhost), mirroring the `is-unicode-supported` heuristic.
 */

export function isUnicodeSupported(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== 'win32') return env.TERM !== 'linux';
  return (
    Boolean(env.WT_SESSION) || // Windows Terminal
    Boolean(env.TERMINUS_SUBLIME) ||
    env.ConEmuTask === '{cmd::Cmder}' ||
    env.TERM_PROGRAM === 'Terminus-Sublime' ||
    env.TERM_PROGRAM === 'vscode' ||
    env.TERM === 'xterm-256color' ||
    env.TERM === 'alacritty' ||
    env.TERMINAL_EMULATOR === 'JetBrains-JediTerm'
  );
}

export interface Symbols {
  ok: string;
  fail: string;
  warn: string;
  skip: string;
  arrow: string;
}

export function pickSymbols(unicode: boolean): Symbols {
  return unicode
    ? { ok: '✔', fail: '✖', warn: '⚠', skip: '–', arrow: '→' }
    : { ok: 'OK', fail: 'x', warn: '!!', skip: '-', arrow: '->' };
}

export const sym: Symbols = pickSymbols(isUnicodeSupported());
