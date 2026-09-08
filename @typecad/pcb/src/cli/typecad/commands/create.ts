import { main } from '../../create-typecad/index.js';
import type { ParsedArgs } from '../parser.js';

function toBool(val: string | boolean | undefined): boolean | undefined {
  if (val === undefined) return undefined;
  if (typeof val === 'boolean') return val;
  return val === 'true';
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const args: Record<string, string | boolean | undefined> = { ...parsed.args };

  args.pio = toBool(args.pio);
  args.git = toBool(args.git);

  await main(args);
}
