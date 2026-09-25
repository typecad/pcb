import { kicadDataToTypeCAD } from '../../../kicad2typecad/cli.js';
import type { ParsedArgs } from '../parser.js';

export async function run(parsed: ParsedArgs): Promise<void> {
  const filePath = parsed.positional[0];

  if (!filePath) {
    throw new Error(
      'No KiCad file path provided.\n' + 'Usage: typecad-pcb import <path_to_kicad_pcb_file> [--apply] [--capture-layouts]',
    );
  }

  const apply = parsed.args['apply'] === true;
  const captureLayouts = parsed.args['capture-layouts'] === true;

  await kicadDataToTypeCAD(filePath, { apply, captureLayouts });
}
