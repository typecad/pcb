export interface ParsedArgs {
  command: string;
  subcommand: string;
  args: Record<string, string | boolean>;
  positional: string[];
  json: boolean;
  help: boolean;
  version: boolean;
}

export function parseArgv(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: '',
    subcommand: '',
    args: {},
    positional: [],
    json: false,
    help: false,
    version: false,
  };

  const tokens = argv.slice(2);

  let i = 0;

  if (tokens.length > 0 && !tokens[0].startsWith('-')) {
    result.command = tokens[i++];
  }

  if (
    result.command === 'add' &&
    tokens.length > i &&
    !tokens[i].startsWith('-')
  ) {
    result.subcommand = tokens[i++];
  }

  while (i < tokens.length) {
    const token = tokens[i++];

    if (token === undefined) continue;

    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eqIdx = body.indexOf('=');

      if (eqIdx !== -1) {
        const key = body.slice(0, eqIdx);
        const value = body.slice(eqIdx + 1);
        result.args[key] = value;
      } else {
        if (body === 'json') {
          result.json = true;
        } else if (body === 'help') {
          result.help = true;
        } else if (body === 'version') {
          result.version = true;
        } else {
          result.args[body] = true;
        }
      }
    } else if (token.startsWith('-') && token.length === 2) {
      const flag = token.slice(1);
      if (flag === 'h') {
        result.help = true;
      } else if (flag === 'v') {
        result.version = true;
      } else {
        result.args[flag] = true;
      }
    } else {
      result.positional.push(token);
    }
  }

  return result;
}
