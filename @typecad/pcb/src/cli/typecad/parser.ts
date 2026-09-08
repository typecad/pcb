export interface ParsedArgs {
  command: string;
  subcommand: string;
  args: Record<string, string | boolean>;
  positional: string[];
  passthrough: string[];
  json: boolean;
  help: boolean;
  version: boolean;
}

/**
 * Double-dash flags that take a value. They accept both `--flag=value` and
 * `--flag value` forms; other double-dash flags are boolean unless written
 * with `=`.
 */
const VALUE_FLAGS = new Set([
  'out',
  'file',
  'category',
  'to',
  'gap',
  'rot',
  'width',
  'layers',
  'left-of',
  'right-of',
  'above',
  'below',
]);

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
      result.command === 'edit') &&
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
        const key = body.slice(0, eqIdx);
        const value = body.slice(eqIdx + 1);
        result.args[key] = value;
      } else if (body.startsWith('no-')) {
        const key = body.slice(3);
        result.args[key] = false;
      } else if (body === 'json') {
        result.json = true;
      } else if (body === 'help') {
        result.help = true;
      } else if (body === 'version') {
        result.version = true;
      } else if (VALUE_FLAGS.has(body)) {
        // Value flags accept `--flag value` as well as `--flag=value`; a bare
        // `--flag` with no following token stays `true` so callers can reject it.
        // Tokens that look like numbers are consumed even with a leading '-'
        // (negative coordinates for --to, --gap, ...).
        const next = typecadTokens[i];
        if (next && (!next.startsWith('-') || /^-?\d/.test(next))) {
          result.args[body] = next;
          i++;
        } else {
          result.args[body] = true;
        }
      } else {
        result.args[body] = true;
      }
    } else if (token.startsWith('-') && token.length === 2) {
      const flag = token.slice(1);
      if (flag === 'h') {
        result.help = true;
      } else if (flag === 'v') {
        result.version = true;
      } else {
        const next = typecadTokens[i];
        if (next && !next.startsWith('-')) {
          result.args[flag] = next;
          i++;
        } else {
          result.args[flag] = true;
        }
      }
    } else {
      result.positional.push(token);
    }
  }

  result.passthrough = passthroughTokens;

  return result;
}
