#!/usr/bin/env node

import { kicadDataToTypeCAD } from './cli.js';
import logger from '../utils/logging.js';

const args = process.argv.slice(2);
const filePathArg = args.find((a) => !a.startsWith('--'));
const auto = args.includes('--auto');
const watch = args.includes('--watch');
const dryRun = args.includes('--dry-run');
const restore = args.includes('--restore');
// --auto implies apply (it is apply, minus the prompts); --dry-run previews
const apply = args.includes('--apply') || auto || dryRun;

if (filePathArg && filePathArg.trim() !== '') {
  kicadDataToTypeCAD(filePathArg, { apply, auto, watch, dryRun, restore }).catch((err: unknown) => {
    logger.error(err);
    process.exit(1);
  });
} else {
  logger.log('No KiCad file path provided. Please provide a file path as a command line argument.');
  logger.log('Usage: npx kicad2typecad <path_to_kicad_pcb_file> [--apply] [--auto] [--watch]');
  logger.log('');
  logger.log('Options:');
  logger.log('  --apply             Interactively apply coordinate changes to source files');
  logger.log('  --auto              Apply every detected change without prompting (implies --apply)');
  logger.log('  --watch             Re-run on every save of the board file; with --auto the');
  logger.log('                      source .ts is live-synced while you edit in KiCad');
  logger.log('  --dry-run           Preview every change (with edits) without writing');
  logger.log('  --restore           Undo the last apply cycle from its snapshot');
  logger.log('  (text layout positions are always imported)');
  logger.log('');
  logger.log('Notes:');
  logger.log("- Variable names are sourced from each footprint's 'Code' property.");
  logger.log('- If missing, the KiCad reference is used (e.g., U1, R3).');
}
