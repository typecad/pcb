import { runApplication } from '../../../kicad-symbols/app/index.js';
import { searchFootprints } from './footprint_search.js';
import logger from '../../../utils/logging.js';
import type { ParsedArgs } from '../parser.js';

export async function run(parsed: ParsedArgs): Promise<void> {
  // `search <query> --footprint` scans footprint libraries instead of
  // symbol libraries — symbols alone don't answer "what pads does it have".
  if (parsed.args['footprint'] === true) {
    const query = parsed.positional.join(' ').trim();
    if (!query) {
      logger.log('Usage: typecad-pcb search <query> --footprint');
      logger.log('Example: typecad-pcb search "SOIC-8" --footprint');
      return;
    }
    const limit = typeof parsed.args['limit'] === 'string' ? Math.max(1, parseInt(parsed.args['limit'], 10) || 10) : 10;
    const results = searchFootprints(query, { limit });

    if (parsed.json) {
      logger.log(JSON.stringify(results, null, 2));
      return;
    }
    if (results.length === 0) {
      logger.log(`No footprints matched "${query}".`);
      return;
    }
    logger.log(`KiCad footprint search: "${query}" — ${results.length} match(es)\n`);
    for (const [i, r] of results.entries()) {
      logger.log(`  ${i + 1}. ${r.id}`);
      logger.log(`     pads: ${r.pads.length > 0 ? r.pads.join(', ') : '(unknown)'}`);
      if (r.description) logger.log(`     ${r.description.slice(0, 110)}`);
    }
    logger.log(`\nUse as: new Component({ footprint: '<library:footprint>', ... })`);
    return;
  }

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
