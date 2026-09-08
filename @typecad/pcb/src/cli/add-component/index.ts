#!/usr/bin/env node
import {
  kicad_symbol,
  kicad_pins,
  return_list_of_symbols,
  return_list_of_footprints,
  local_symbol_to_footprint,
  sanitize_name,
} from '../shared/kicad_sym_utils.js';
import { KiCAD } from '../../kicad.js';
import { findExecutable } from '../../kicad.js';
import { create_component } from './typecad.js';
import { basename } from 'node:path';
import chalk from 'chalk';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { CliArgs, CliPinInfo, SymbolData, FootprintData } from '../types.js';
import logger from '../../utils/logging.js';
import { buildKiCADArgs } from '../../kicad_commands.js';

type InquirerPrompts = typeof import('@inquirer/prompts');
type FileSelector = typeof import('inquirer-file-selector');
type EasyEdaConverter = typeof import('../../kipm/easyeda2kicadCore.js');

let _inquirer: InquirerPrompts | undefined;
let _fileSelector: FileSelector | undefined;
let _easyeda: EasyEdaConverter | undefined;

async function getInquirer() {
  if (!_inquirer) _inquirer = await import('@inquirer/prompts');
  return _inquirer;
}

async function getFileSelector() {
  if (!_fileSelector) _fileSelector = await import('inquirer-file-selector');
  return _fileSelector;
}

async function getEasyedaConverter() {
  if (!_easyeda) _easyeda = await import('../../kipm/easyeda2kicadCore.js');
  return _easyeda;
}

/**
 * Parse command line arguments
 * @returns {Object} Parsed arguments object
 */
function parseArguments() {
  const args = process.argv.slice(2);
  const parsedArgs: CliArgs = {};

  // Handle backward compatibility: if there's exactly one argument without -- prefix,
  // treat it as the folder parameter (old argv[2] behavior)
  const nonFlagArgs = args.filter((arg) => !arg.startsWith('--'));
  if (nonFlagArgs.length === 1 && args.length === 1) {
    parsedArgs.folder = nonFlagArgs[0];
    // Don't treat this as non-interactive mode - it should start interactive mode
    // with the folder parameter set
  }

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');

      // Handle flags without values (like --help)
      if (key === 'help' && value === undefined) {
        parsedArgs[key] = true;
      } else {
        // String parameters
        parsedArgs[key] = value;
      }
    }
  }

  return parsedArgs;
}

/**
 * Check if all required arguments are provided for non-interactive mode
 * @param {Object} args - Parsed arguments
 * @returns {boolean} True if all required args are present
 */
function hasAllRequiredArgs(args: CliArgs) {
  // Check if we have symbol and footprint source specifications
  const hasSymbolSource = args.hasOwnProperty('symbol_source');
  const hasFootprintSource = args.hasOwnProperty('footprint_source');

  // For JLCPCB components, we still need the old format for backward compatibility
  if (args.hasOwnProperty('jlcpcb') && args.hasOwnProperty('c')) {
    return true;
  }

  // For new mixed source format
  if (hasSymbolSource && hasFootprintSource) {
    const symbolSource = args.symbol_source;
    const footprintSource = args.footprint_source;

    // Check symbol requirements
    if ((symbolSource === 'kicad' || symbolSource === 'local') && !args.hasOwnProperty('symbol')) {
      return false;
    }
    if (symbolSource === 'jlcpcb' && !args.hasOwnProperty('c')) {
      return false;
    }

    // Check footprint requirements - only require footprint if not using auto-association
    if (footprintSource === 'jlcpcb' && !args.hasOwnProperty('c')) {
      return false;
    }
    // For kicad/local footprints, footprint is optional (will use auto-association)

    return true;
  }

  // Legacy format support
  const sourceTypes = ['kicad', 'local', 'jlcpcb'];
  const providedSources = sourceTypes.filter((type) => args.hasOwnProperty(type));

  if (providedSources.length !== 1) {
    return false;
  }

  const sourceType = providedSources[0];

  // Check requirements based on source type
  if (sourceType === 'kicad' || sourceType === 'local') {
    // Only require symbol - footprint will be auto-associated
    return args.hasOwnProperty('symbol');
  } else if (sourceType === 'jlcpcb') {
    return args.hasOwnProperty('c');
  }

  return false;
}

/**
 * Display help information
 */
function showHelp() {
  logger.log(chalk.white.bold('🧩 typeCAD Add Component - Command Line Usage\n'));
  logger.log('Usage: npx @typecad/add-component [options]\n');
  logger.log('Mixed Source Options (NEW - allows mixing symbol and footprint sources):');
  logger.log('  --symbol_source=<source>     Symbol source: kicad, local, or jlcpcb');
  logger.log('  --footprint_source=<source>  Footprint source: kicad, local, or jlcpcb');
  logger.log(
    '  --symbol=<symbol_name>       Symbol name (format: library:symbol or path/to/file.kicad_sym) - for kicad/local',
  );
  logger.log(
    '  --footprint=<footprint>      Footprint name (format: library:footprint or path/to/file.kicad_mod) - optional for kicad/local (uses auto-association if not provided)',
  );
  logger.log('  --c=<component_number>       Component number (format: C1234567) - for jlcpcb\n');
  logger.log('Legacy Component Source Options (choose exactly one):');
  logger.log('  --kicad=<value>           Use KiCAD library component');
  logger.log('  --local=<value>           Use local component (symbol and footprint names)');
  logger.log('  --jlcpcb=<value>          Use EasyEDA/JLCPCB component\n');
  logger.log('Other Options:');
  logger.log('  --folder=<path>           Output folder (default: current directory)');
  logger.log('  --help                    Show this help message\n');
  logger.log('Examples:');
  logger.log('Mixed sources:');
  logger.log(
    '  npx @typecad/add-component --symbol_source=kicad --footprint_source=local --symbol=MCU_Microchip_ATtiny:ATtiny3227-M --footprint=MyLib:MyFootprint',
  );
  logger.log(
    '  npx @typecad/add-component --symbol_source=kicad --footprint_source=kicad --symbol=MCU_Microchip_ATtiny:ATtiny3227-M',
  );
  logger.log(
    '  npx @typecad/add-component --symbol_source=local --footprint_source=local --symbol=./MyComponent.kicad_sym --footprint=./MyFootprint.kicad_mod',
  );
  logger.log(
    '  npx @typecad/add-component --symbol_source=jlcpcb --footprint_source=kicad --c=C3217148 --footprint=Package_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm',
  );
  logger.log('Legacy format:');
  logger.log(
    '  npx @typecad/add-component --kicad=true --symbol=MCU_Microchip_ATtiny:ATtiny3227-M --footprint=Package_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm',
  );
  logger.log('  npx @typecad/add-component --kicad=true --symbol=MCU_Microchip_ATtiny:ATtiny3227-M');
  logger.log('  npx @typecad/add-component --local=true --symbol=MyLib:MySymbol --footprint=MyLib:MyFootprint');
  logger.log(
    '  npx @typecad/add-component --local=true --symbol=./MyComponent.kicad_sym --footprint=./MyFootprint.kicad_mod',
  );
  logger.log('  npx @typecad/add-component --jlcpcb=true --c=C3217148');
  logger.log('  npx @typecad/add-component # starts interactive mode');
}

async function main(preparsedArgs?: CliArgs) {
  const cmdArgs = preparsedArgs || parseArguments();

  if (cmdArgs.help) {
    showHelp();
    return;
  }

  // Mode detection
  const isNonInteractive = hasAllRequiredArgs(cmdArgs);

  logger.log('🧩 ' + chalk.whiteBright.bold('type') + 'CAD Create Component');

  let symbolSource, footprintSource;

  if (isNonInteractive) {
    // Handle legacy format first
    if (cmdArgs.kicad !== undefined) {
      symbolSource = footprintSource = 'kicad';
      logger.log(chalk.green(`Using kicad source from command line arguments`));
    } else if (cmdArgs.local !== undefined) {
      symbolSource = footprintSource = 'local';
      logger.log(chalk.green(`Using local source from command line arguments`));
    } else if (cmdArgs.jlcpcb !== undefined) {
      symbolSource = footprintSource = 'easyeda';
      logger.log(chalk.green(`Using easyeda source from command line arguments`));
    } else {
      // New mixed format
      symbolSource = cmdArgs.symbol_source as string;
      footprintSource = cmdArgs.footprint_source as string;
      if (symbolSource === 'jlcpcb') symbolSource = 'easyeda';
      if (footprintSource === 'jlcpcb') footprintSource = 'easyeda';
      logger.log(chalk.green(`Using symbol source: ${symbolSource}, footprint source: ${footprintSource}`));
    }
  } else {
    // Interactive mode - ask for symbol source first
    symbolSource = await (
      await getInquirer()
    ).select({
      message: 'Select symbol source:',
      choices: [
        {
          name: 'KiCAD',
          value: 'kicad',
          description: 'A symbol from the installed KiCAD library',
        },
        {
          name: 'local file',
          value: 'local',
          description: 'A symbol file on this computer',
        },
        {
          name: 'EasyEDA/JLCPCB',
          value: 'easyeda',
          description: 'A symbol from the EasyEDA/JLCPCB library',
        },
      ],
    });

    // Ask for footprint source
    footprintSource = await (
      await getInquirer()
    ).select({
      message: 'Select footprint source:',
      choices: [
        {
          name: 'KiCAD',
          value: 'kicad',
          description: 'A footprint from the installed KiCAD library',
        },
        {
          name: 'local file',
          value: 'local',
          description: 'A footprint file on this computer',
        },
        {
          name: 'EasyEDA/JLCPCB',
          value: 'easyeda',
          description: 'A footprint from the EasyEDA/JLCPCB library',
        },
      ],
    });
  }

  // Now handle the mixed source approach
  await handleMixedSources(symbolSource, footprintSource, cmdArgs, isNonInteractive);
}

async function handleMixedSources(
  symbolSource: string,
  footprintSource: string,
  cmdArgs: CliArgs,
  isNonInteractive: boolean,
) {
  let symbolData: SymbolData | null = null;
  let footprintData: FootprintData | null = null;
  let pins: CliPinInfo[] = [];
  let componentName: string = '';

  symbolData = await handleSymbolSource(symbolSource, cmdArgs, isNonInteractive);
  if (!symbolData) throw new Error('Failed to get symbol data');

  footprintData = await handleFootprintSource(footprintSource, cmdArgs, isNonInteractive, symbolData);
  if (!footprintData) throw new Error('Failed to get footprint data');

  pins = symbolData.pins || [];
  componentName = symbolData.name || 'Component';

  // Create the final component data
  const data = {
    name: componentName,
    symbol: symbolData.symbol,
    footprint: footprintData.footprint,
    pins,
    symbol_path: symbolData.symbol_path,
    footprint_path: footprintData.footprint_path,
    folder: (cmdArgs.folder || '.') as string,
  };

  create_component(data);

  // Cleanup if needed
  if (symbolData.cleanup) {
    symbolData.cleanup();
  }
  if (footprintData.cleanup) {
    footprintData.cleanup();
  }
}

async function handleSymbolSource(source: string, cmdArgs: CliArgs, isNonInteractive: boolean) {
  if (source === 'kicad') {
    return await handleKicadSymbol(cmdArgs, isNonInteractive);
  } else if (source === 'local') {
    return await handleLocalSymbol(cmdArgs, isNonInteractive);
  } else if (source === 'easyeda') {
    return await handleEasyedaSymbol(cmdArgs, isNonInteractive);
  }
  return null;
}

async function handleFootprintSource(
  source: string,
  cmdArgs: CliArgs,
  isNonInteractive: boolean,
  symbolData: SymbolData,
) {
  if (source === 'kicad') {
    return await handleKicadFootprint(cmdArgs, isNonInteractive, symbolData);
  } else if (source === 'local') {
    return await handleLocalFootprint(cmdArgs, isNonInteractive, symbolData);
  } else if (source === 'easyeda') {
    return await handleEasyedaFootprint(cmdArgs, isNonInteractive, symbolData);
  }
  return null;
}

async function handleKicadSymbol(cmdArgs: CliArgs, isNonInteractive: boolean) {
  let entered_symbol;

  if (isNonInteractive) {
    entered_symbol = cmdArgs.symbol as string | undefined;

    // Check if this is a direct .kicad_sym file path or library:symbol format
    if (entered_symbol && entered_symbol.endsWith('.kicad_sym')) {
      // Handle direct .kicad_sym file path - treat as local symbol
      if (!fs.existsSync(entered_symbol)) {
        logger.log(chalk.red(`Error: Symbol file '${entered_symbol}' not found.`));
        return null;
      }

      const _found_symbols = return_list_of_symbols(entered_symbol);
      if (_found_symbols.length === 0) {
        logger.log(chalk.red(`Error: No symbols found in file '${entered_symbol}'.`));
        return null;
      }

      // Use first symbol found
      const _chosen_symbol = _found_symbols[0].value;

      // Issue warning if multiple symbols found
      if (_found_symbols.length > 1) {
        logger.log(
          chalk.yellow(
            `Warning: Multiple symbols found in '${entered_symbol}'. Using first symbol: '${_chosen_symbol}'. Other symbols found: ${_found_symbols
              .slice(1)
              .map((s) => s.value)
              .join(', ')}`,
          ),
        );
      }

      local_symbol_to_footprint(entered_symbol);
      const pins = kicad_pins();

      return {
        symbol: basename(entered_symbol).replace(/\.[^/\\.]+$/, '') + ':' + _chosen_symbol,
        name: sanitize_name(_chosen_symbol),
        pins,
        symbol_path: entered_symbol,
        footprint_recommendation: local_symbol_to_footprint(entered_symbol),
      };
    } else {
      // Handle library:symbol format (existing logic)
      if (!entered_symbol || !entered_symbol.includes(':')) {
        logger.log(
          chalk.red(`Error: Invalid symbol format. Must be 'symbol_library:symbol_name' or path to .kicad_sym file`),
        );
        return null;
      }
    }
  } else {
    entered_symbol = await (
      await getInquirer()
    ).input({
      message: 'Symbol name?',
      default: (cmdArgs.symbol || 'MCU_Microchip_ATtiny:ATtiny3227-M') as string,
      validate: (entered_symbol) => {
        if (!entered_symbol.includes(':')) {
          return `Not a valid symbol. It needs to be in this format 'symbol_library:symbol_name'`;
        }
        const footprint_recommendation: string | undefined = kicad_symbol(
          entered_symbol,
          (cmdArgs.folder || '.') as string,
        );
        if (footprint_recommendation === undefined) {
          return `Provide a valid KiCAD library symbol ('symbol_library:symbol_name')`;
        }
        return true;
      },
    });
  }

  const footprint_recommendation: string | undefined = kicad_symbol(entered_symbol, (cmdArgs.folder || '.') as string);
  if (footprint_recommendation === undefined) {
    logger.log(chalk.red(`Error: Invalid KiCAD library symbol '${entered_symbol}'`));
    return null;
  }

  const pins = kicad_pins(entered_symbol);

  return {
    symbol: entered_symbol,
    name: sanitize_name(entered_symbol.split(':')[1]),
    pins,
    footprint_recommendation,
  };
}

async function handleLocalSymbol(cmdArgs: CliArgs, isNonInteractive: boolean) {
  let entered_symbol, symbolPath, _chosen_symbol;

  if (isNonInteractive) {
    entered_symbol = cmdArgs.symbol as string | undefined;

    // Check if this is a direct .kicad_sym file path or library:symbol format
    if (entered_symbol && entered_symbol.endsWith('.kicad_sym')) {
      // Handle direct .kicad_sym file path
      symbolPath = entered_symbol;

      if (!fs.existsSync(symbolPath)) {
        logger.log(chalk.red(`Error: Symbol file '${symbolPath}' not found.`));
        return null;
      }

      const _found_symbols = return_list_of_symbols(symbolPath);
      if (_found_symbols.length === 0) {
        logger.log(chalk.red(`Error: No symbols found in file '${symbolPath}'.`));
        return null;
      }

      // Use first symbol found
      _chosen_symbol = _found_symbols[0].value;

      // Issue warning if multiple symbols found
      if (_found_symbols.length > 1) {
        logger.log(
          chalk.yellow(
            `Warning: Multiple symbols found in '${symbolPath}'. Using first symbol: '${_chosen_symbol}'. Other symbols found: ${_found_symbols
              .slice(1)
              .map((s) => s.value)
              .join(', ')}`,
          ),
        );
      }

      local_symbol_to_footprint(symbolPath);
      const pins = kicad_pins();

      return {
        symbol: basename(symbolPath).replace(/\.[^/\\.]+$/, '') + ':' + _chosen_symbol,
        name: sanitize_name(_chosen_symbol),
        pins,
        symbol_path: symbolPath,
        footprint_recommendation: local_symbol_to_footprint(symbolPath),
      };
    } else {
      // Handle library:symbol format (existing logic)
      if (!entered_symbol || !entered_symbol.includes(':')) {
        logger.log(
          chalk.red(`Error: Invalid symbol format. Must be 'symbol_library:symbol_name' or path to .kicad_sym file`),
        );
        return null;
      }

      _chosen_symbol = entered_symbol.split(':')[1];
      kicad_symbol(entered_symbol, (cmdArgs.folder || './src') as string);
      const pins = kicad_pins();

      return {
        symbol: entered_symbol,
        name: sanitize_name(_chosen_symbol),
        pins,
      };
    }
  } else {
    do {
      symbolPath = (
        await (
          await getFileSelector()
        ).fileSelector({
          message: 'Select a KiCAD Symbol file (kicad_sym):',
          filter: (file) => file.isDirectory || file.path.includes('.kicad_sym'),
          showExcluded: false,
        })
      ).path;
      if (fs.statSync(symbolPath).isDirectory()) {
        logger.log(chalk.yellow('Please select a file, not a directory.'));
      }
    } while (fs.statSync(symbolPath).isDirectory());

    const _found_symbols = return_list_of_symbols(symbolPath);
    if (_found_symbols.length > 1) {
      _chosen_symbol = await (
        await getInquirer()
      ).select({
        message: 'Select a symbol from in the file',
        choices: _found_symbols,
      });
    } else {
      _chosen_symbol = _found_symbols[0].value;
    }

    local_symbol_to_footprint(symbolPath);
    const pins = kicad_pins();

    return {
      symbol: basename(symbolPath).replace(/\.[^/\\.]+$/, '') + ':' + _chosen_symbol,
      name: sanitize_name(_chosen_symbol),
      pins,
      symbol_path: symbolPath,
      footprint_recommendation: local_symbol_to_footprint(symbolPath),
    };
  }
}

async function handleEasyedaSymbol(cmdArgs: CliArgs, isNonInteractive: boolean) {
  const pattern = /^C\d+$/;
  let c_component;

  if (isNonInteractive) {
    c_component = cmdArgs.c as string | undefined;
    if (!pattern.test(c_component as string)) {
      logger.log(
        chalk.red(`Error: Invalid component number '${c_component}'. Must start with 'C' followed by digits.`),
      );
      return null;
    }
  } else {
    c_component = await (
      await getInquirer()
    ).input({
      message: 'Component #?',
      default: (cmdArgs.c || 'C3217148') as string,
      validate: (c_component) => {
        if (!pattern.test(c_component)) {
          return `Not a valid component number: must start with 'C'`;
        }
        return true;
      },
    });
  }

  let convertedComponent;
  try {
    convertedComponent = await (
      await getEasyedaConverter()
    ).convertEasyedaToKicad(c_component as string, {
      footprintLibName: 'lib',
      kicadVersion: 'v6_99',
    });
  } catch (error) {
    logger.log('Error converting EasyEDA component to KiCAD:', error);
    return null;
  }

  const baseFolder = (cmdArgs.folder || '.') as string;
  const prettyFolder = path.join(baseFolder, `${convertedComponent.symbol.name}.pretty`);

  if (!fs.existsSync(prettyFolder)) {
    fs.mkdirSync(prettyFolder);
  }

  const symbolFilePath = path.join(prettyFolder, `${convertedComponent.symbol.name}.kicad_sym`);
  fs.writeFileSync(
    symbolFilePath,
    '(kicad_symbol_lib(version 20200101)(generator https://github.com/uPesy/easyeda2kicad.py)' +
      convertedComponent.symbol.content +
      ')',
    { encoding: 'utf-8' },
  );

  try {
    if (!KiCAD.cliPath) throw new Error('kicad-cli not found');
    const { executable, execArgs } = buildKiCADArgs('sym', ['upgrade', symbolFilePath]);
    execFileSync(executable, execArgs, { stdio: 'pipe' });
  } catch (e) {
    logger.error(`Failed executing kicad-cli sym upgrade`, e);
  }

  local_symbol_to_footprint(symbolFilePath);
  const pins = kicad_pins();

  return {
    symbol: basename(symbolFilePath).replace(/\.[^/\\.]+$/, '') + ':' + convertedComponent.symbol.name,
    name: sanitize_name(convertedComponent.symbol.name),
    pins,
    symbol_path: symbolFilePath,
    convertedComponent,
    c_component,
    prettyFolder,
    cleanup: () => {
      try {
        fs.rmSync(prettyFolder, { recursive: true, force: true });
      } catch (error) {
        logger.error('Error cleaning up temp directory:', error);
      }
    },
  };
}

async function handleKicadFootprint(cmdArgs: CliArgs, isNonInteractive: boolean, symbolData: SymbolData) {
  let entered_footprint;

  if (isNonInteractive) {
    entered_footprint = cmdArgs.footprint as string | undefined;

    // If no footprint provided, try to use auto-associated footprint
    if (!entered_footprint) {
      if (symbolData.footprint_recommendation) {
        entered_footprint = symbolData.footprint_recommendation;
        logger.log(chalk.yellow(`No footprint specified, using auto-associated footprint: ${entered_footprint}`));
      } else {
        logger.log(
          chalk.red(
            `Error: No footprint specified and no auto-associated footprint found for symbol '${symbolData.symbol}'`,
          ),
        );
        return null;
      }
    }

    // Check if this is a direct .kicad_mod file path or library:footprint format
    if (entered_footprint && entered_footprint.endsWith('.kicad_mod')) {
      // Handle direct .kicad_mod file path - treat as local footprint
      if (!fs.existsSync(entered_footprint)) {
        logger.log(chalk.red(`Error: Footprint file '${entered_footprint}' not found.`));
        return null;
      }

      const _found_footprints = return_list_of_footprints(entered_footprint);
      if (_found_footprints.length === 0) {
        logger.log(chalk.red(`Error: No footprints found in file '${entered_footprint}'.`));
        return null;
      }

      // Use first footprint found
      const _chosen_footprint = _found_footprints[0].value;

      // Issue warning if multiple footprints found
      if (_found_footprints.length > 1) {
        logger.log(
          chalk.yellow(
            `Warning: Multiple footprints found in '${entered_footprint}'. Using first footprint: '${_chosen_footprint}'. Other footprints found: ${_found_footprints
              .slice(1)
              .map((f) => f.value)
              .join(', ')}`,
          ),
        );
      }

      return {
        footprint: basename(entered_footprint).replace(/\.[^/\\.]+$/, '') + ':' + _chosen_footprint,
        footprint_path: entered_footprint,
      };
    } else {
      // Handle library:footprint format (existing logic)
      if (!entered_footprint.includes(':')) {
        logger.log(
          chalk.red(
            `Error: Invalid footprint format. Must be 'footprint_library:footprint_name' or path to .kicad_mod file`,
          ),
        );
        return null;
      }
    }
  } else {
    entered_footprint = await (
      await getInquirer()
    ).input({
      message: 'Footprint name?',
      default: (cmdArgs.footprint || symbolData.footprint_recommendation || '') as string,
      validate: (footprint) => {
        if (!footprint.includes(':')) {
          return `Not a valid footprint. It needs to be in this format 'footprint_library:footprint_name'`;
        }
        return true;
      },
    });
  }

  return {
    footprint: entered_footprint,
  };
}

async function handleLocalFootprint(cmdArgs: CliArgs, isNonInteractive: boolean, symbolData: SymbolData) {
  let entered_footprint, footprintPath;

  if (isNonInteractive) {
    entered_footprint = cmdArgs.footprint as string | undefined;

    // Check if this is a direct .kicad_mod file path or library:footprint format
    if (entered_footprint && entered_footprint.endsWith('.kicad_mod')) {
      // Handle direct .kicad_mod file path
      footprintPath = entered_footprint;

      if (!fs.existsSync(footprintPath)) {
        logger.log(chalk.red(`Error: Footprint file '${footprintPath}' not found.`));
        return null;
      }

      const _found_footprints = return_list_of_footprints(footprintPath);
      if (_found_footprints.length === 0) {
        logger.log(chalk.red(`Error: No footprints found in file '${footprintPath}'.`));
        return null;
      }

      // Use first footprint found
      const _chosen_footprint = _found_footprints[0].value;

      // Issue warning if multiple footprints found
      if (_found_footprints.length > 1) {
        logger.log(
          chalk.yellow(
            `Warning: Multiple footprints found in '${footprintPath}'. Using first footprint: '${_chosen_footprint}'. Other footprints found: ${_found_footprints
              .slice(1)
              .map((f) => f.value)
              .join(', ')}`,
          ),
        );
      }

      return {
        footprint: basename(footprintPath).replace(/\.[^/\\.]+$/, '') + ':' + _chosen_footprint,
        footprint_path: footprintPath,
      };
    } else {
      // Handle library:footprint format (existing logic)
      if (!entered_footprint || !entered_footprint.includes(':')) {
        logger.log(
          chalk.red(
            `Error: Invalid footprint format. Must be 'footprint_library:footprint_name' or path to .kicad_mod file`,
          ),
        );
        return null;
      }

      return {
        footprint: entered_footprint,
      };
    }
  } else {
    const defaultFootprint = symbolData.footprint_recommendation || 'lib:footprint';
    do {
      footprintPath = (
        await (
          await getFileSelector()
        ).fileSelector({
          message: `Select footprint file (.kicad_mod) for ${defaultFootprint}:`,
          filter: (file) => file.isDirectory || file.path.includes('.kicad_mod'),
          showExcluded: false,
        })
      ).path;
      if (fs.statSync(footprintPath).isDirectory()) {
        logger.log(chalk.yellow('Please select a file, not a directory.'));
      }
    } while (fs.statSync(footprintPath).isDirectory());

    return {
      footprint: defaultFootprint,
      footprint_path: footprintPath,
    };
  }
}

async function handleEasyedaFootprint(cmdArgs: CliArgs, isNonInteractive: boolean, symbolData: SymbolData) {
  // For EasyEDA footprints, we need to get the component and process it
  const pattern = /^C\d+$/;
  let c_component;

  if (isNonInteractive) {
    c_component = cmdArgs.c as string | undefined;
    if (!pattern.test(c_component as string)) {
      logger.log(
        chalk.red(`Error: Invalid component number '${c_component}'. Must start with 'C' followed by digits.`),
      );
      return null;
    }
  } else {
    c_component = await (
      await getInquirer()
    ).input({
      message: 'Component # for footprint?',
      default: (symbolData.c_component || cmdArgs.c || 'C3217148') as string,
      validate: (c_component) => {
        if (!pattern.test(c_component)) {
          return `Not a valid component number: must start with 'C'`;
        }
        return true;
      },
    });
  }

  let convertedComponent;
  try {
    convertedComponent = await (
      await getEasyedaConverter()
    ).convertEasyedaToKicad(c_component as string, {
      footprintLibName: 'lib',
      kicadVersion: 'v6_99',
    });
  } catch (error) {
    logger.error('Error converting EasyEDA component to KiCAD:', error);
    return null;
  }

  const baseFolder = (cmdArgs.folder || '.') as string;
  const prettyFolder = path.join(baseFolder, `${convertedComponent.footprint.name}.pretty`);

  if (!fs.existsSync(prettyFolder)) {
    fs.mkdirSync(prettyFolder);
  }

  const footprintFilePath = path.join(prettyFolder, `${convertedComponent.footprint.name}.kicad_mod`);
  fs.writeFileSync(footprintFilePath, convertedComponent.footprint.content.replace('/${KIPRJMOD}/', ''), {
    encoding: 'utf-8',
  });

  try {
    if (!KiCAD.cliPath) throw new Error('kicad-cli not found');
    const { executable, execArgs } = buildKiCADArgs('fp', ['upgrade', prettyFolder]);
    execFileSync(executable, execArgs, { stdio: 'pipe' });
  } catch (e) {
    logger.error(`Failed executing kicad-cli fp upgrade`, e);
  }

  // Handle 3D models
  const dir = path.join(baseFolder, 'build', 'lib', 'footprints');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (convertedComponent.model3d) {
    if (convertedComponent.model3d.wrlContent) {
      fs.writeFileSync(path.join(dir, `${convertedComponent.model3d.name}.wrl`), convertedComponent.model3d.wrlContent);
    }
    if (convertedComponent.model3d.stepContent) {
      fs.writeFileSync(
        path.join(dir, `${convertedComponent.model3d.name}.step`),
        convertedComponent.model3d.stepContent,
      );
    }
  }

  return {
    footprint: `lib:${convertedComponent.footprint.name}`,
    footprint_path: footprintFilePath,
    cleanup: () => {
      try {
        fs.rmSync(prettyFolder, { recursive: true, force: true });
      } catch (error) {
        logger.error('Error cleaning up temp directory:', error);
      }
    },
  };
}

process.on('uncaughtException', (error) => {
  if (error instanceof Error && error.name === 'ExitPromptError') {
  } else {
    throw error;
  }
});

export { main, showHelp };

if (process.argv[1]?.endsWith('add-component/index.js') || process.argv[1]?.endsWith('add-component\\index.js')) {
  main();
}
