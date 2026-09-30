import { kicadDataToTypeCAD } from '../../../kicad2typecad/cli.js';
import type { ParsedArgs } from '../parser.js';

export async function run(parsed: ParsedArgs): Promise<void> {
  const filePath = parsed.positional[0];

  if (!filePath) {
    throw new Error(
      'No KiCad file path provided.\n' +
        'Usage: typecad-pcb import <path_to_kicad_pcb_file> [--apply] [--auto] [--watch]',
    );
  }

  const auto = parsed.args['auto'] === true;
  const watch = parsed.args['watch'] === true;
  // --auto implies apply (it is apply, minus the prompts); --watch alone
  // re-runs display mode on every save, --watch --auto live-syncs the source.
  const apply = parsed.args['apply'] === true || auto;

  await kicadDataToTypeCAD(filePath, { apply, auto, watch });
}
