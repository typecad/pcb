import { runApplication } from '../../../kicad-symbols/app/index.js';
import type { ParsedArgs } from '../parser.js';

export async function run(parsed: ParsedArgs): Promise<void> {
  const syntheticArgv = ['node', 'typecad'];

  if (parsed.json) {
    syntheticArgv.push('--format', 'json');
  }

  for (const pos of parsed.positional) {
    syntheticArgv.push(pos);
  }

  if (parsed.args['format'] && typeof parsed.args['format'] === 'string') {
    syntheticArgv.push('--format', parsed.args['format']);
  }
  if (parsed.args['sort'] && typeof parsed.args['sort'] === 'string') {
    syntheticArgv.push('--sort', parsed.args['sort']);
  }
  if (parsed.args['limit'] && typeof parsed.args['limit'] === 'string') {
    syntheticArgv.push('--limit', parsed.args['limit']);
  }

  await runApplication(syntheticArgv, { programName: 'typecad-pcb search' });
}
