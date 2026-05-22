#!/usr/bin/env node
import { select, input } from '@inquirer/prompts';
import { sanitize_name } from './package/kicad.js';
import { create_package } from './package/typecad.js';
import { create_component } from './component/typecad.js';
import {
  kicad_symbol,
  kicad_pins,
  return_list_of_symbols,
  local_symbol_to_footprint,
  kicad_cli,
} from './component/kicad.js';
import { fileSelector } from 'inquirer-file-selector';
import { convertEasyedaToKicad } from '../../kipm/easyeda2kicadCore.js';
import chalk from 'chalk';
import { basename } from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

process.on('uncaughtException', (error) => {
  if (error instanceof Error && error.name === 'ExitPromptError') {
  } else {
    // Rethrow unknown errors
    throw error;
  }
});

/**
 * Parse command line arguments
 */
function parseArguments() {
  const args = process.argv.slice(2);
  const parsedArgs = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const equalIndex = arg.indexOf('=');
      if (equalIndex === -1) {
        // Handle flags without values (like --help)
        const key = arg.slice(2);
        if (key === 'help') {
          parsedArgs[key] = true;
        }
      } else {
        // Handle key=value pairs
        const key = arg.slice(2, equalIndex);
        const value = arg.slice(equalIndex + 1);
        
        if (key === 'empty' || key === 'component') {
          // Boolean parameters
          parsedArgs[key] = value === 'true';
        } else {
          // String parameters
          parsedArgs[key] = value;
        }
      }
    } else if (i === 0 && !arg.startsWith('--')) {
      // First non-flag argument is the folder (backward compatibility)
      parsedArgs.folder = arg;
    }
  }
  
  return parsedArgs;
}

/**
 * Check if all required arguments are provided for non-interactive mode
 */
function hasAllRequiredArgs(args) {
  // Must have exactly one of empty or component
  const hasExactlyOneMode = (args.empty === true && args.component !== true) || 
                           (args.component === true && args.empty !== true);
  
  if (!hasExactlyOneMode) {
    return false;
  }
  
  // Both modes require name
  if (!args.name) {
    return false;
  }
  
  // Component mode requires source and additional parameters
  if (args.component === true) {
    // Must have exactly one source
    const sources = [args.kicad, args.local, args.jlcpcb].filter(Boolean);
    if (sources.length !== 1) {
      return false;
    }
    
    // KiCAD and Local modes require symbol and footprint
    if (args.kicad || args.local) {
      if (!args.symbol || !args.footprint) {
        return false;
      }
    }
    
    // JLCPCB mode requires component number
    if (args.jlcpcb && !args.c) {
      return false;
    }
  }
  
  return true;
}

/**
 * Show help information
 */
function showHelp() {
  console.log(chalk.white.bold('📦 typeCAD Add Package - Command Line Usage\n'));
  console.log('Usage: node @typecad/add-package [options]\n');
  console.log('Package Type Options (exactly one required):');
  console.log('  --empty=true              Create an empty package');
  console.log('  --component=true          Create a component package\n');
  console.log('Required Parameters:');
  console.log('  --name=<package_name>     Package name (required for both modes)\n');
  console.log('Component Mode - Source Options (exactly one required):');
  console.log('  --kicad=<value>           Use KiCAD library component');
  console.log('  --local=<value>           Use local component (symbol and footprint names)');
  console.log('  --jlcpcb=<value>          Use EasyEDA/JLCPCB component\n');
  console.log('Required Parameters for KiCAD and Local modes:');
  console.log('  --symbol=<library:symbol> Symbol name in format library:symbol_name');
  console.log('  --footprint=<library:footprint> Footprint name in format library:footprint_name\n');
  console.log('Required Parameters for JLCPCB mode:');
  console.log('  --c=<component_number>    Component number starting with \'C\' (e.g., C3217148)\n');
  console.log('Optional Parameters:');
  console.log('  --folder=<path>           Output directory (default: current directory)');
  console.log('  --help                    Show this help message\n');
  console.log('Examples:');
  console.log('  # Create empty package');
  console.log('  node @typecad/add-package --empty=true --name=my_package');
  console.log('  node @typecad/add-package --empty=true --name=my_package --folder=./packages\n');
  console.log('  # Create component package from KiCAD');
  console.log('  node @typecad/add-package --component=true --name=attiny_package --kicad=true --symbol=MCU_Microchip_ATtiny:ATtiny3227-M --footprint=Package_DFN_QFN:DFN-20-1EP_3x4mm_P0.5mm_EP1.65x3.1mm\n');
  console.log('  # Create component package from JLCPCB');
  console.log('  node @typecad/add-package --component=true --name=resistor_package --jlcpcb=true --c=C3217148\n');
  console.log('  # Create component package from local files');
  console.log('  node @typecad/add-package --component=true --name=custom_package --local=true --symbol=MyLib:MySymbol --footprint=MyLib:MyFootprint');
}

main();

async function main() {
  let entered_package_name = '';
  let footprint_recommendation = '';
  let entered_footprint = '';
  let entered_symbol = '';
  let pins = [];
  let _chosen_symbol;

  const cmdArgs = parseArguments();
  
  // Early exit for help
  if (cmdArgs.help) {
    showHelp();
    return;
  }
  
  // Mode detection
  const isNonInteractive = hasAllRequiredArgs(cmdArgs);
  
  // Determine folder - if we have command line args, don't use process.argv[2] as folder
  const folderPath = cmdArgs.folder || (isNonInteractive ? './' : process.argv[2] || './');
  
  console.log('📦 ' + chalk.whiteBright.bold('type') + 'CAD Create Package');

  let answer;
  if (isNonInteractive) {
    // Non-interactive mode: determine package type from arguments
    if (cmdArgs.empty === true) {
      answer = 'empty_package';
    } else if (cmdArgs.component === true) {
      answer = 'component_package';
    }
  } else {
    // Interactive mode: show selection prompt
    answer = await select({
      message: 'Package type?',
      choices: [
        {
          name: 'Empty Package',
          value: 'empty_package',
          description: 'An empty npm-packaged class',
        },
        {
          name: 'Component Package',
          value: 'component_package',
          description: 'An npm-packaged class for a component',
        },
      ],
    });
  }

  if (answer == 'empty_package') {
    if (isNonInteractive) {
      // Non-interactive mode: use provided values
      entered_package_name = cmdArgs.name;
      
      console.log(chalk.green('Creating empty package with the following settings:'));
      console.log(`  Name: ${entered_package_name}`);
      console.log(`  Folder: ${folderPath}`);
      console.log();
    } else {
      // Interactive/hybrid mode: use args as defaults
      entered_package_name = await input({
        message: 'Package name?',
        default: cmdArgs.name || 'typecad_package',
      });
    }

    const data = {
      package_name: sanitize_name(entered_package_name),
      folder: folderPath,
    };
    create_package(data);
  }

  if (answer == 'component_package') {
    if (isNonInteractive) {
      // Non-interactive mode: use provided values
      entered_package_name = cmdArgs.name;
      
      console.log(chalk.green('Creating component package with the following settings:'));
      console.log(`  Name: ${entered_package_name}`);
      console.log(`  Folder: ${folderPath}`);
      if (cmdArgs.kicad) {
        console.log(`  Source: KiCAD`);
        console.log(`  Symbol: ${cmdArgs.symbol}`);
        console.log(`  Footprint: ${cmdArgs.footprint}`);
      } else if (cmdArgs.local) {
        console.log(`  Source: Local`);
        console.log(`  Symbol: ${cmdArgs.symbol}`);
        console.log(`  Footprint: ${cmdArgs.footprint}`);
      } else if (cmdArgs.jlcpcb) {
        console.log(`  Source: EasyEDA/JLCPCB`);
        console.log(`  Component: ${cmdArgs.c}`);
      }
      console.log();
    } else {
      // Interactive/hybrid mode: use args as defaults
      entered_package_name = await input({
        message: 'Package name?',
        default: cmdArgs.name || 'typecad_package',
      });
    }

    let componentSource;
    if (isNonInteractive) {
      // Determine source from arguments
      if (cmdArgs.kicad) {
        componentSource = 'kicad';
      } else if (cmdArgs.local) {
        componentSource = 'local';
      } else if (cmdArgs.jlcpcb) {
        componentSource = 'easyeda';
      }
    } else {
      // Interactive mode: show selection prompt
      componentSource = await select({
        message: 'Component source?',
        choices: [
          {
            name: 'KiCAD',
            value: 'kicad',
            description: 'A symbol from the installed KiCAD library',
          },
          {
            name: 'local file',
            value: 'local',
            description: 'A file on this computer',
          },
          {
            name: 'EasyEDA/JLCPCB',
            value: 'easyeda',
            description: 'A component in the EasyEDA/JLCPCB library\n(not all have symbols/footprints)',
          },
        ],
      });
    }

    if (componentSource == 'kicad') {
      if (isNonInteractive) {
        // Non-interactive mode: use provided values
        entered_symbol = cmdArgs.symbol;
        entered_footprint = cmdArgs.footprint;
        
        // Validate symbol format
        if (!entered_symbol.includes(':')) {
          console.error(chalk.red(`Error: Invalid symbol format. Expected 'symbol_library:symbol_name', got '${entered_symbol}'`));
          return;
        }
        
        // Validate footprint format
        if (!entered_footprint.includes(':')) {
          console.error(chalk.red(`Error: Invalid footprint format. Expected 'footprint_library:footprint_name', got '${entered_footprint}'`));
          return;
        }
        
        // Validate KiCAD symbol exists
        footprint_recommendation = kicad_symbol(entered_symbol, '');
        if (footprint_recommendation == false) {
          console.error(chalk.red(`Error: Invalid KiCAD library symbol '${entered_symbol}'`));
          return;
        }
      } else {
        // Interactive mode: show prompts with argument defaults
        entered_symbol = await input({
          message: 'Symbol name?',
          default: cmdArgs.symbol || 'MCU_Microchip_ATtiny:ATtiny3227-M',
          validate: (entered_symbol) => {
            if (!entered_symbol.includes(':')) {
              return `Not a valid symbol. It needs to be in this format 'symbol_library:symbol_name'`;
            }
            footprint_recommendation = kicad_symbol(entered_symbol, '');
            if (footprint_recommendation == false) {
              return `Provide a valid KiCAD library symbol ('symbol_library:symbol_name')`;
            }
            return true;
          },
        });

        entered_footprint = await input({
          message: 'Footprint name?',
          default: cmdArgs.footprint || footprint_recommendation,
          validate: (symbol) => {
            if (!symbol.includes(':')) {
              return `Not a valid footprint. It needs to be in this format 'footprint_library:footprint_name'`;
            }
            return true;
          },
        });
      }

      pins = kicad_pins(entered_symbol);

      const data = {
        package_name: sanitize_name(entered_package_name),
        folder: folderPath,
        component_folder:
          folderPath + '/' + entered_package_name ||
          `./${entered_package_name}/`,
        component_name: sanitize_name(entered_symbol.split(':')[1]),
        symbol: entered_symbol,
        footprint: entered_footprint,
        pins,
      };

      create_component(data);
      create_package(data);
    } else if (componentSource == 'local') {
      if (isNonInteractive) {
        // Non-interactive mode: use provided values
        entered_symbol = cmdArgs.symbol;
        entered_footprint = cmdArgs.footprint;
        
        // Validate symbol format
        if (!entered_symbol.includes(':')) {
          console.error(chalk.red(`Error: Invalid symbol format. Expected 'library:symbol_name', got '${entered_symbol}'`));
          return;
        }
        
        // Validate footprint format
        if (!entered_footprint.includes(':')) {
          console.error(chalk.red(`Error: Invalid footprint format. Expected 'library:footprint_name', got '${entered_footprint}'`));
          return;
        }
        
        // For local mode, we need to get pins from the symbol
        pins = kicad_pins(entered_symbol);
        
        const data = {
          package_name: sanitize_name(entered_package_name),
          component_name: sanitize_name(entered_symbol.split(':')[1]),
          footprint: entered_footprint,
          pins,
          symbol: entered_symbol,
          folder: folderPath,
        };
        
        create_component(data);
        create_package(data);
        return;
      }
      
      const symbolPath = (await fileSelector({
        message: 'Select a KiCAD Symbol file (kicad_sym):',
        filter: (file) => file.isDirectory || file.path.includes('.kicad_sym'),
        showExcluded: false,
      })).path;

      // if there are more than one symbols, pick, else, select the one available
      let _found_symbols = return_list_of_symbols(symbolPath);
      if (_found_symbols.length > 1) {
        _chosen_symbol = await select({
          message: 'Select a symbol from in the file',
          choices: _found_symbols,
        });
      } else {
        _chosen_symbol = _found_symbols[0].value;
      }

      let _footprint = local_symbol_to_footprint(symbolPath);
      const footprintPath = (await fileSelector({
        message: `The symbol file says the footprint should be ${_footprint}. What .kicad_mod is it located in?:`,
        filter: (file) => file.isDirectory || file.path.includes('.kicad_mod'),
        showExcluded: false,
      })).path;

      pins = kicad_pins(entered_symbol);

      const data = {
        package_name: sanitize_name(entered_package_name),
        component_name: sanitize_name(_chosen_symbol),
        footprint: _footprint,
        pins,
        symbol_path: symbolPath,
        symbol: `${_chosen_symbol}:${_chosen_symbol}`,
        footprint_path: footprintPath,
        folder: folderPath,
      };

      create_component(data);
      create_package(data);
    } else if (componentSource == 'easyeda') {
      const pattern = /^C\d+$/;
      let c_component;
      
      if (isNonInteractive) {
        // Non-interactive mode: use provided value
        c_component = cmdArgs.c;
        
        // Validate component number format
        if (!pattern.test(c_component)) {
          console.error(chalk.red(`Error: Invalid component number format. Expected 'C' followed by digits, got '${c_component}'`));
          return;
        }
      } else {
        // Interactive mode: show prompt with argument default
        c_component = await input({
          message: 'Component #?',
          default: cmdArgs.c || 'C3217148',
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
        convertedComponent = await convertEasyedaToKicad(c_component, {
          footprintLibName: 'lib',
          kicadVersion: 'v6_99', // We always use v6 format in this context
        });
      } catch (error) {
        console.error('Error converting EasyEDA component to KiCAD:', error);
        return;
      }

      // make .pretty folder to us kicad-cli fp upgrade later
      if (!fs.existsSync(`./${convertedComponent.symbol.name}.pretty`)) {
        fs.mkdirSync(`./${convertedComponent.symbol.name}.pretty`);
      }

      // write symbol file and upgrade it
      fs.writeFileSync(
        `./${convertedComponent.symbol.name}.pretty/${convertedComponent.symbol.name}.kicad_sym`,
        '(kicad_symbol_lib(version 20200101)(generator https://github.com/uPesy/easyeda2kicad.py)' +
          convertedComponent.symbol.content +
          ')',
        { encoding: 'utf-8' }
      );
      try {
        execSync(
          `"${kicad_cli()}" sym upgrade ./${
            convertedComponent.symbol.name
          }.pretty/${convertedComponent.symbol.name}.kicad_sym`
        );
      } catch (e) {
        console.error(`Failed executing`, e);
      }

      // write footprint file, remove KIPRJMOD to fix 3d model path and upgrade it
      fs.writeFileSync(
        `./${convertedComponent.symbol.name}.pretty/${convertedComponent.footprint.name}.kicad_mod`,
        convertedComponent.footprint.content.replace('/${KIPRJMOD}/', ''),
        {
          encoding: 'utf-8',
        }
      );
      try {
        execSync(
          `"${kicad_cli()}" fp upgrade ./${
            convertedComponent.symbol.name
          }.pretty/`
        );
      } catch (e) {
        console.error(
          `Failed executing "${kicad_cli()}" fp upgrade ./${
            convertedComponent.symbol.name
          }.pretty/`,
          e
        );
      }

      // gets pin names from symbol
      local_symbol_to_footprint(
        `./${convertedComponent.symbol.name}.pretty/${convertedComponent.symbol.name}.kicad_sym`
      );
      pins = kicad_pins();

              const data = {
          package_name: sanitize_name(entered_package_name),
          component_name: sanitize_name(`${convertedComponent.symbol.name}`),
          component_folder:
            folderPath + '/' + entered_package_name + '/',
          symbol:
            basename(
              `./${convertedComponent.symbol.name}.pretty/${convertedComponent.symbol.name}.kicad_sym`
            ).replace(/\.[^/\\.]+$/, '') +
            ':' +
            `${convertedComponent.symbol.name}`,
          footprint: `lib:${convertedComponent.footprint.name}`,
          pins,
          symbol_path: `./${convertedComponent.symbol.name}.pretty/${convertedComponent.symbol.name}.kicad_sym`,
          footprint_path: `./${convertedComponent.symbol.name}.pretty/${convertedComponent.footprint.name}.kicad_mod`,
          folder: folderPath,
        };

      // make folder structure for the package
      let packageDir = `${data.folder}/${data.package_name}`;
      let packageBuildDir = `${packageDir}/build/lib/footprints`;
      if (!fs.existsSync(packageBuildDir)) {
        fs.mkdirSync(packageBuildDir, { recursive: true });
      }

      // write 3d model files to the package build directory
      if (convertedComponent.model3d) {
        if (convertedComponent.model3d.wrlContent) {
          fs.writeFileSync(
            path.join(
              packageBuildDir,
              `${convertedComponent.model3d.name}.wrl`
            ),
            convertedComponent.model3d.wrlContent
          );
        }
        if (convertedComponent.model3d.stepContent) {
          fs.writeFileSync(
            path.join(
              packageBuildDir,
              `${convertedComponent.model3d.name}.step`
            ),
            convertedComponent.model3d.stepContent
          );
        }
      }

      create_component(data);
      create_package(data);

      // Clean up temporary .pretty folder
      try {
        fs.rmSync(`./${convertedComponent.symbol.name}.pretty`, {
          recursive: true,
          force: true,
        });
      } catch (error) {
        console.error(`Error cleaning up temporary folder: ${error.message}`);
      }
    }
  }
}
