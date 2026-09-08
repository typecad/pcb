import { main } from '../../add-component/index.js';
import type { ParsedArgs } from '../parser.js';

export async function run(parsed: ParsedArgs): Promise<void> {
  const args = { ...parsed.args };

  if (parsed.positional.length > 0 && !args.folder) {
    args.folder = parsed.positional[0];
  }

  await main(args);
}
