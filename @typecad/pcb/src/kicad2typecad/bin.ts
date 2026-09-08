#!/usr/bin/env node

import { kicadDataToTypeCAD } from './cli.js';
import logger from '../utils/logging.js';

const args = process.argv.slice(2);
const filePathArg = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
const captureLayouts = args.includes('--capture-layouts');

if (filePathArg && filePathArg.trim() !== '') {
  kicadDataToTypeCAD(filePathArg, { apply, captureLayouts }).catch((err: unknown) => {
    logger.error(err);
    process.exit(1);
  });
} else {
  logger.log('No KiCad file path provided. Please provide a file path as a command line argument.');
  logger.log('Usage: npx kicad2typecad <path_to_kicad_pcb_file> [--apply]');
  logger.log('');
  logger.log('Options:');
  logger.log('  --apply             Interactively apply coordinate changes to source files');
  logger.log('  --capture-layouts   Also import text layout positions (referenceLayout, valueLayout, fabLayout)');
  logger.log('');
  logger.log('Notes:');
  logger.log("- Variable names are sourced from each footprint's 'Code' property.");
  logger.log('- If missing, the KiCad reference is used (e.g., U1, R3).');
}
