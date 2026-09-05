import { main } from '../../add-package/index.js';
import type { ParsedArgs } from '../parser.js';

function toBool(val: string | boolean | undefined): boolean | undefined {
  if (val === undefined) return undefined;
  if (typeof val === 'boolean') return val;
  return val === 'true';
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const args: Record<string, string | boolean | undefined> = { ...parsed.args };

  args.empty = toBool(args.empty);
  args.component = toBool(args.component);
  args.kicad = toBool(args.kicad);
  args.local = toBool(args.local);
  args.jlcpcb = toBool(args.jlcpcb);

  if (parsed.positional.length > 0 && !args.folder) {
    args.folder = parsed.positional[0];
  }

  await main(args);
}
