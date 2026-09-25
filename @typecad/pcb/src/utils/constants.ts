export const DEFAULT_NET_PREFIX = 'net';
export const DEFAULT_BUILD_DIR = './build';
export const LIBRARY_SEPARATOR = ':';

/**
 * Build output directory. `typecad-pcb --outDir=<dir>` (also honored by the
 * build/check/diagnostics/... commands) sets TYPECAD_BUILD_DIR before the
 * entry runs, so every write below and every artifact lookup keyed off this
 * follows the override. Values may be relative (resolved against cwd).
 */
export function getBuildDir(): string {
  return process.env.TYPECAD_BUILD_DIR || DEFAULT_BUILD_DIR;
}
