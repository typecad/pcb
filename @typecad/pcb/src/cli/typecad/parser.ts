import { findCommand, GLOBAL_FLAGS } from './registry.js';

export interface ParsedArgs {
  command: string;
  subcommand: string;
  args: Record<string, string | boolean>;
  positional: string[];
  passthrough: string[];
  json: boolean;
  help: boolean;
  version: boolean;
  /** Flags written as `--no-<name>` (keyed by <name> in `args`), for error messages. */
  negated?: string[];
}

/**
 * Double-dash flags that take a value. They accept both `--flag=value` and
 * `--flag value` forms; other double-dash flags are boolean unless written
 * with `=`.
 */
const VALUE_FLAGS = new Set([
  'name',
  'board',
  'out',
  'outDir',
  'out-dir',
  'file',
  'category',
  'footprint',
  'to',
  'gap',
  'rot',
  'width',
  'layers',
  'left-of',
  'right-of',
  'above',
  'below',
  // viewer overlays (typecad-pcb viewer) — value flags like gerber-viewer's
  'netlist',
  'drc',
  'stackup',
  'rules',
  // one deferred view rendered as a mountable fragment (typecad-pcb viewer)
  'view-part',
  // assembly exports (typecad-pcb export pos/bom/assembly); 'output' joins
  // so `--output dir` parses like `--output=dir` always did
  'output',
  'profile',
  'bom-profile',
  'side',
  'centroid',
  'origin',
  'units',
  'exclude',
  'decimals',
  'rotation-decimals',
  'rotation-offset',
  'bottom-rotation',
  // search (`--limit 3`, `--format table`, `--sort id`), diff, simulate, add component
  'limit',
  'format',
  'sort',
  'theme',
  'entry',
  'folder',
  'symbol',
  'symbol_source',
  'footprint_source',
  'c',
  'value',
]);

/** Single-letter flags that take a value; every other `-x` is boolean. */
const SHORT_VALUE_FLAGS = new Set(['o']);

/**
 * Alternate spellings accepted for a flag, mapped to its canonical key. Lets
 * `--symbol-source` and `--outdir` work without keeping three styles alive.
 */
const FLAG_ALIASES: Record<string, string> = {
  'symbol-source': 'symbol_source',
  'footprint-source': 'footprint_source',
  outdir: 'outDir',
};

/**
 * Every flag any command reads (value flags, booleans, the global ones, and
 * the `--no-x` bases). Used by `findUnknownFlags` so a typo errors out instead
 * of being silently ignored. Flags after `--` are passthrough and never checked.
 */
const BOOLEAN_FLAGS = [
  'json', 'help', 'version', 'watch', 'typecheck', 'diagnostics', 'skip-erc', 'skip-drc',
  'skip-typecheck', 'skip-build', 'verbose', 'quiet', 'force', 'fix', 'open', 'full',
  'apply', 'auto', 'dry-run', 'restore', 'zip', 'ungrouped', 'grouped', 'include-dnp',
  'fresh-board', 'saved-fills', 'lazy-views', 'kicad-erc', 'kicad-drc', 'kicad', 'local',
  'jlcpcb', 'yes', 'hal', 'git', 'empty', 'component', 'clear', 'w',
];

export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  ...VALUE_FLAGS,
  ...SHORT_VALUE_FLAGS,
  ...BOOLEAN_FLAGS,
  ...Object.keys(FLAG_ALIASES),
]);

export interface UnknownFlag {
  /** The flag as the user typed it, e.g. `--outdirr` or `-x`. */
  flag: string;
  /**
   * `unknown`: no command reads it. `command`: another command does, but not
   * this one (`build --fix`) — it would have been silently ignored.
   */
  scope: 'unknown' | 'command';
  /** The flags this command does accept, for "did you mean". */
  candidates: string[];
}

/** Canonical-key set of the flags `command` accepts (its own plus the global ones). */
export function allowedFlagsFor(command: string): Set<string> | undefined {
  const spec = findCommand(command);
  if (!spec) return undefined;
  return new Set([...GLOBAL_FLAGS, ...spec.flags].map(canonicalFlag));
}

/**
 * Flags in `parsed.args` the command does not read — typos and flags that
 * belong to another command. Without a known command, falls back to the
 * union of every flag.
 */
export function findUnknownFlags(parsed: ParsedArgs): UnknownFlag[] {
  const negated = new Set(parsed.negated ?? []);
  const allowed = allowedFlagsFor(parsed.command);
  const unknown: UnknownFlag[] = [];
  for (const key of Object.keys(parsed.args)) {
    const known = KNOWN_FLAGS.has(key);
    if (known && (!allowed || allowed.has(key))) continue;
    const dashes = key.length === 1 ? '-' : negated.has(key) ? '--no-' : '--';
    unknown.push({
      flag: `${dashes}${key}`,
      scope: known ? 'command' : 'unknown',
      candidates: allowed ? [...allowed] : [...KNOWN_FLAGS],
    });
  }
  return unknown;
}

function canonicalFlag(name: string): string {
  return FLAG_ALIASES[name] ?? name;
}

export function parseArgv(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: '',
    subcommand: '',
    args: {},
    positional: [],
    passthrough: [],
    json: false,
    help: false,
    version: false,
  };

  const tokens = argv.slice(2);

  const passthroughIdx = tokens.indexOf('--');
  let passthroughTokens: string[] = [];
  let typecadTokens: string[];
  if (passthroughIdx !== -1) {
    typecadTokens = tokens.slice(0, passthroughIdx);
    passthroughTokens = tokens.slice(passthroughIdx + 1);
  } else {
    typecadTokens = tokens;
  }

  let i = 0;

  if (typecadTokens.length > 0 && !typecadTokens[0].startsWith('-')) {
    result.command = typecadTokens[i++];
  }

  if (
    (result.command === 'add' ||
      result.command === 'skills' ||
      result.command === 'export' ||
      result.command === 'query' ||
      result.command === 'edit' ||
      result.command === 'lib') &&
    typecadTokens.length > i &&
    !typecadTokens[i].startsWith('-')
  ) {
    result.subcommand = typecadTokens[i++];
  }

  while (i < typecadTokens.length) {
    const token = typecadTokens[i++];

    if (token === undefined) continue;

    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eqIdx = body.indexOf('=');

      if (eqIdx !== -1) {
        const key = canonicalFlag(body.slice(0, eqIdx));
        const value = body.slice(eqIdx + 1);
        result.args[key] = value;
      } else if (body.startsWith('no-')) {
        const key = canonicalFlag(body.slice(3));
        result.args[key] = false;
        (result.negated ??= []).push(key);
      } else if (body === 'json') {
        result.json = true;
      } else if (body === 'help') {
        result.help = true;
      } else if (body === 'version') {
        result.version = true;
      } else if (VALUE_FLAGS.has(canonicalFlag(body))) {
        const key = canonicalFlag(body);
        // Value flags accept `--flag value` as well as `--flag=value`; a bare
        // `--flag` with no following token stays `true` so callers can reject it.
        // Tokens that look like numbers are consumed even with a leading '-'
        // (negative coordinates for --to, --gap, ...).
        const next = typecadTokens[i];
        if (next && (!next.startsWith('-') || /^-?\d/.test(next))) {
          result.args[key] = next;
          i++;
        } else {
          result.args[key] = true;
        }
      } else {
        result.args[canonicalFlag(body)] = true;
      }
    } else if (token.startsWith('-') && token.length === 2) {
      const flag = token.slice(1);
      if (flag === 'h') {
        result.help = true;
      } else if (flag === 'v') {
        // `-v` is --version on its own and --verbose after a command, which
        // is how `doc --help` documents it.
        if (result.command) result.args['verbose'] = true;
        else result.version = true;
      } else if (flag === 'q') {
        result.args['quiet'] = true;
      } else if (SHORT_VALUE_FLAGS.has(flag)) {
        const next = typecadTokens[i];
        if (next && !next.startsWith('-')) {
          result.args[flag] = next;
          i++;
        } else {
          result.args[flag] = true;
        }
      } else {
        // Boolean: `-w main.ts` is watch + a positional, not watch=main.ts.
        result.args[flag] = true;
      }
    } else {
      result.positional.push(token);
    }
  }

  result.passthrough = passthroughTokens;

  return result;
}

/**
 * Bare-file default invocation, HAL-style: `typecad-pcb main.ts --watch`
 * behaves like `typecad-pcb build main.ts --watch`. When the command token
 * is itself a TypeScript path, it is really the build entry.
 */
export function normalizeBareFileInvocation(parsed: ParsedArgs): ParsedArgs {
  if (parsed.command && /\.(ts|tsx|mts|cts)$/.test(parsed.command)) {
    return { ...parsed, command: 'build', positional: [parsed.command, ...parsed.positional] };
  }
  return parsed;
}
