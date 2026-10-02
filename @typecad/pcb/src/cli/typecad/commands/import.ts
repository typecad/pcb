import { kicadDataToTypeCAD } from '../../../kicad2typecad/cli.js';
import type { ParsedArgs } from '../parser.js';

export async function run(parsed: ParsedArgs): Promise<void> {
  const filePath = parsed.positional[0];

  if (!filePath) {
    throw new Error(
      'No KiCad file path provided.\n' +
        'Usage: typecad-pcb import <path_to_kicad_pcb_file> [--apply] [--auto] [--watch] [--dry-run] [--restore]',
    );
  }

  const auto = parsed.args['auto'] === true;
  const watch = parsed.args['watch'] === true;
  const dryRun = parsed.args['dry-run'] === true;
  const restore = parsed.args['restore'] === true;
  // --auto implies apply (it is apply, minus the prompts); --watch alone
  // re-runs display mode on every save, --watch --auto live-syncs the source.
  // --dry-run previews an apply without writing anything.
  const apply = parsed.args['apply'] === true || auto || dryRun;

  await kicadDataToTypeCAD(filePath, { apply, auto, watch, dryRun, restore });
}
