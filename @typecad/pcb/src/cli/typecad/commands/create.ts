import { main } from '../../create-typecad/index.js';
import type { ParsedArgs } from '../parser.js';

function toBool(val: string | boolean | undefined): boolean | undefined {
  if (val === undefined) return undefined;
  if (typeof val === 'boolean') return val;
  return val === 'true';
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const args: Record<string, string | boolean | undefined> = { ...parsed.args };

  // Leave absent flags absent: assigning `undefined` still creates the key,
  // which main() reads as an explicitly answered prompt and skips it.
  const hal = toBool(args.hal);
  if (hal !== undefined) args.hal = hal;
  const git = toBool(args.git);
  if (git !== undefined) args.git = git;

  await main(args);
}
