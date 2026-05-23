#!/usr/bin/env node
import { select, input } from "@inquirer/prompts";
import {
  kicad_symbol,
  kicad_pins,
  return_list_of_symbols,
  return_list_of_footprints,
  local_symbol_to_footprint,
  sanitize_name,
  kicad_cli,
} from "./kicad.js";
import { findExecutable } from "../../kicad.js";
import { create_component } from "./typecad.js";
import { basename } from "node:path";
import { fileSelector } from "inquirer-file-selector";
import chalk from "chalk";
import { convertEasyedaToKicad } from "../../../kipm/easyeda2kicadCore.js";
import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Parse command line arguments
 * @returns {Object} Parsed arguments object
 */
function parseArguments() {
  const args = process.argv.slice(2);
  const parsedArgs: Record<string, any> = {};

  // Handle backward compatibility: if there's exactly one argument without -- prefix,
  // treat it as the folder parameter (old argv[2] behavior)
  const nonFlagArgs = args.filter((arg) => !arg.startsWith("--"));
  if (nonFlagArgs.length === 1 && args.length === 1) {
    parsedArgs.folder = nonFlagArgs[0];
    // Don't treat this as non-interactive mode - it should start interactive mode
    // with the folder parameter set
  }

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");

      // Handle flags without values (like --help)
      if (key === "help" && value === undefined) {
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
function hasAllRequiredArgs(args) {
  // Check if we have symbol and footprint source specifications
  const hasSymbolSource = args.hasOwnProperty("symbol_source");
  const hasFootprintSource = args.hasOwnProperty("footprint_source");

  // For JLCPCB components, we still need the old format for backward compatibility
  if (args.hasOwnProperty("jlcpcb") && args.hasOwnProperty("c")) {
    return true;
  }

  // For new mixed source format
  if (hasSymbolSource && hasFootprintSource) {
    const symbolSource = args.symbol_source;
    const footprintSource = args.footprint_source;

    // Check symbol requirements
    if (
      (symbolSource === "kicad" || symbolSource === "local") &&
      !args.hasOwnProperty("symbol")
    ) {
      return false;
    }
    if (symbolSource === "jlcpcb" && !args.hasOwnProperty("c")) {
      return false;
    }

    // Check footprint requirements - only require footprint if not using auto-association
    if (footprintSource === "jlcpcb" && !args.hasOwnProperty("c")) {
      return false;
    }
    // For kicad/local footprints, footprint is optional (will use auto-association)

    return true;
  }

  // Legacy format support
  const sourceTypes = ["kicad", "local", "jlcpcb"];
  const providedSources = sourceTypes.filter((type) =>
    args.hasOwnProperty(type)
  );

  if (providedSources.length !== 1) {
    return false;
  }

  const sourceType = providedSources[0];

  // Check requirements based on source type
  if (sourceType === "kicad" || sourceType === "local") {
    // Only require symbol - footprint will be auto-associated
    return args.hasOwnProperty("symbol");
  } else if (sourceType === "jlcpcb") {
    return args.hasOwnProperty("c");
  }

  return false;
}

/**
 * Display help information
 */
function showHelp() {
  console.log(
    chalk.white.bold("🧩 typeCAD Add Component - Command Line Usage\n")
  );
  console.log("Usage: npx @typecad/add-component [options]\n");
  console.log(
    "Mixed Source Options (NEW - allows mixing symbol and footprint sources):"
  );
  console.log(
    "  --symbol_source=<source>     Symbol source: kicad, local, or jlcpcb"
  );
  console.log(
    "  --footprint_source=<source>  Footprint source: kicad, local, or jlcpcb"
  );
  console.log(
    "  --symbol=<symbol_name>       Symbol name (format: library:symbol or path/to/file.kicad_sym) - for kicad/local"
  );
  console.log(
    "  --footprint=<footprint>      Footprint name (format: library:footprint or path/to/file.kicad_mod) - optional for kicad/local (uses auto-association if not provided)"
  );
  console.log(
    "  --c=<component_number>       Component number (format: C1234567) - for jlcpcb\n"
  );
  console.log("Legacy Component Source Options (choose exactly one):");
  console.log("  --kicad=<value>           Use KiCAD library component");
  console.log(
    "  --local=<value>           Use local component (symbol and footprint names)"
  );
  console.log("  --jlcpcb=<value>          Use EasyEDA/JLCPCB component\n");
  console.log("Other Options:");
  console.log(
    "  --folder=<path>           Output folder (default: current directory)"
  );
  console.log("  --help                    Show this help message\n");
  console.log("Examples:");
  console.log("Mixed sources:");
  console.log(
    "  npx @typecad/add-component --symbol_source=kicad --footprint_source=local --symbol=MCU_Microchip_ATtiny:ATtiny3227-M --footprint=MyLib:MyFootprint"
  );
  console.log(
    "  npx @typecad/add-component --symbol_source=kicad --footprint_source=kicad --symbol=MCU_Microchip_ATtiny:ATtiny3227-M"
  );
  console.log(
    "  npx @typecad/add-component --symbol_source=local --footprint_source=local --symbol=./MyComponent.kicad_sym --footprint=./MyFootprint.kicad_mod"
  );
  console.log(
    "  npx @typecad/add-component --symbol_source=jlcpcb --footprint_source=kicad --c=C3217148 --footprint=Package_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm"
  );
  console.log("Legacy format:");
  console.log(
    "  npx @typecad/add-component --kicad=true --symbol=MCU_Microchip_ATtiny:ATtiny3227-M --footprint=Package_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm"
  );
  console.log(
    "  npx @typecad/add-component --kicad=true --symbol=MCU_Microchip_ATtiny:ATtiny3227-M"
  );
  console.log(
    "  npx @typecad/add-component --local=true --symbol=MyLib:MySymbol --footprint=MyLib:MyFootprint"
  );
  console.log(
    "  npx @typecad/add-component --local=true --symbol=./MyComponent.kicad_sym --footprint=./MyFootprint.kicad_mod"
  );
  console.log("  npx @typecad/add-component --jlcpcb=true --c=C3217148");
  console.log("  npx @typecad/add-component # starts interactive mode");
}

main();

process.on("uncaughtException", (error) => {
  if (error instanceof Error && error.name === "ExitPromptError") {
  } else {
    // Rethrow unknown errors
    throw error;
  }
});

async function main() {
  const cmdArgs = parseArguments();

  // Early exit for help
  if (cmdArgs.help) {
    showHelp();
    return;
  }

  // Mode detection
  const isNonInteractive = hasAllRequiredArgs(cmdArgs);

  console.log("🧩 " + chalk.whiteBright.bold("type") + "CAD Create Component");

  let symbolSource, footprintSource;

  if (isNonInteractive) {
    // Handle legacy format first
    if (cmdArgs.kicad !== undefined) {
      symbolSource = footprintSource = "kicad";
      console.log(
        chalk.green(`Using kicad source from command line arguments`)
      );
    } else if (cmdArgs.local !== undefined) {
      symbolSource = footprintSource = "local";
      console.log(
        chalk.green(`Using local source from command line arguments`)
      );
    } else if (cmdArgs.jlcpcb !== undefined) {
      symbolSource = footprintSource = "easyeda";
      console.log(
        chalk.green(`Using easyeda source from command line arguments`)
      );
    } else {
      // New mixed format
      symbolSource = cmdArgs.symbol_source;
      footprintSource = cmdArgs.footprint_source;
      if (symbolSource === "jlcpcb") symbolSource = "easyeda";
      if (footprintSource === "jlcpcb") footprintSource = "easyeda";
      console.log(
        chalk.green(
          `Using symbol source: ${symbolSource}, footprint source: ${footprintSource}`
        )
      );
    }
  } else {
    // Interactive mode - ask for symbol source first
    symbolSource = await select({
      message: "Select symbol source:",
      choices: [
        {
          name: "KiCAD",
          value: "kicad",
          description: "A symbol from the installed KiCAD library",
        },
        {
          name: "local file",
          value: "local",
          description: "A symbol file on this computer",
        },
        {
          name: "EasyEDA/JLCPCB",
          value: "easyeda",
          description: "A symbol from the EasyEDA/JLCPCB library",
        },
      ],
    });

    // Ask for footprint source
    footprintSource = await select({
      message: "Select footprint source:",
      choices: [
        {
          name: "KiCAD",
          value: "kicad",
          description: "A footprint from the installed KiCAD library",
        },
        {
          name: "local file",
          value: "local",
          description: "A footprint file on this computer",
        },
        {
          name: "EasyEDA/JLCPCB",
          value: "easyeda",
          description: "A footprint from the EasyEDA/JLCPCB library",
        },
      ],
    });
  }

  // Now handle the mixed source approach
  await handleMixedSources(
    symbolSource,
    footprintSource,
    cmdArgs,
    isNonInteractive
  );
}

async function handleMixedSources(
  symbolSource,
  footprintSource,
  cmdArgs,
  isNonInteractive
) {
  let symbolData: Record<string, unknown> = {};
  let footprintData: Record<string, unknown> = {};
  let pins = [];
  let componentName = "";

  // Handle symbol source
  symbolData = await handleSymbolSource(
    symbolSource,
    cmdArgs,
    isNonInteractive
  );
  if (!symbolData) return;

  // Handle footprint source
  footprintData = await handleFootprintSource(
    footprintSource,
    cmdArgs,
    isNonInteractive,
    symbolData
  );
  if (!footprintData) return;

  // Get pins from symbol data
  pins = symbolData.pins || [];
  componentName = symbolData.name || "Component";

  // Create the final component data
  const data = {
    name: componentName,
    symbol: symbolData.symbol,
    footprint: footprintData.footprint,
    pins,
    symbol_path: symbolData.symbol_path,
    footprint_path: footprintData.footprint_path,
    folder: cmdArgs.folder || "./",
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

async function handleSymbolSource(source, cmdArgs, isNonInteractive) {
  if (source === "kicad") {
    return await handleKicadSymbol(cmdArgs, isNonInteractive);
  } else if (source === "local") {
    return await handleLocalSymbol(cmdArgs, isNonInteractive);
  } else if (source === "easyeda") {
    return await handleEasyedaSymbol(cmdArgs, isNonInteractive);
  }
  return null;
}

async function handleFootprintSource(
  source,
  cmdArgs,
  isNonInteractive,
  symbolData
) {
  if (source === "kicad") {
    return await handleKicadFootprint(cmdArgs, isNonInteractive, symbolData);
  } else if (source === "local") {
    return await handleLocalFootprint(cmdArgs, isNonInteractive, symbolData);
  } else if (source === "easyeda") {
    return await handleEasyedaFootprint(cmdArgs, isNonInteractive, symbolData);
  }
  return null;
}

async function handleKicadSymbol(cmdArgs, isNonInteractive) {
  let entered_symbol;

  if (isNonInteractive) {
    entered_symbol = cmdArgs.symbol;
    
    // Check if this is a direct .kicad_sym file path or library:symbol format
    if (entered_symbol && entered_symbol.endsWith('.kicad_sym')) {
      // Handle direct .kicad_sym file path - treat as local symbol
      if (!fs.existsSync(entered_symbol)) {
        console.log(
          chalk.red(
            `Error: Symbol file '${entered_symbol}' not found.`
          )
        );
        return null;
      }
      
      let _found_symbols = return_list_of_symbols(entered_symbol);
      if (_found_symbols.length === 0) {
        console.log(
          chalk.red(
            `Error: No symbols found in file '${entered_symbol}'.`
          )
        );
        return null;
      }
      
      // Use first symbol found
      let _chosen_symbol = _found_symbols[0].value;
      
      // Issue warning if multiple symbols found
      if (_found_symbols.length > 1) {
        console.log(
          chalk.yellow(
            `Warning: Multiple symbols found in '${entered_symbol}'. Using first symbol: '${_chosen_symbol}'. Other symbols found: ${_found_symbols.slice(1).map(s => s.value).join(', ')}`
          )
        );
      }
      
      local_symbol_to_footprint(entered_symbol);
      const pins = kicad_pins();

      return {
        symbol:
          basename(entered_symbol).replace(/\.[^/\\.]+$/, "") + ":" + _chosen_symbol,
        name: sanitize_name(_chosen_symbol),
        pins,
        symbol_path: entered_symbol,
        footprint_recommendation: local_symbol_to_footprint(entered_symbol),
      };
      
    } else {
      // Handle library:symbol format (existing logic)
      if (!entered_symbol || !entered_symbol.includes(":")) {
        console.log(
          chalk.red(
            `Error: Invalid symbol format. Must be 'symbol_library:symbol_name' or path to .kicad_sym file`
          )
        );
        return null;
      }
    }
  } else {
    entered_symbol = await input({
      message: "Symbol name?",
      default: cmdArgs.symbol || "MCU_Microchip_ATtiny:ATtiny3227-M",
      validate: (entered_symbol) => {
        if (!entered_symbol.includes(":")) {
          return `Not a valid symbol. It needs to be in this format 'symbol_library:symbol_name'`;
        }
        const footprint_recommendation = kicad_symbol(
          entered_symbol,
          cmdArgs.folder || "./"
        );
        if (footprint_recommendation === false) {
          return `Provide a valid KiCAD library symbol ('symbol_library:symbol_name')`;
        }
        return true;
      },
    });
  }

  const footprint_recommendation = kicad_symbol(
    entered_symbol,
    cmdArgs.folder || "./"
  );
  if (footprint_recommendation === false) {
    console.log(
      chalk.red(`Error: Invalid KiCAD library symbol '${entered_symbol}'`)
    );
    return null;
  }

  const pins = kicad_pins(entered_symbol);

  return {
    symbol: entered_symbol,
    name: sanitize_name(entered_symbol.split(":")[1]),
    pins,
    footprint_recommendation,
  };
}

async function handleLocalSymbol(cmdArgs, isNonInteractive) {
  let entered_symbol, symbolPath, _chosen_symbol;

  if (isNonInteractive) {
    entered_symbol = cmdArgs.symbol;
    
    // Check if this is a direct .kicad_sym file path or library:symbol format
    if (entered_symbol && entered_symbol.endsWith('.kicad_sym')) {
      // Handle direct .kicad_sym file path
      symbolPath = entered_symbol;
      
      if (!fs.existsSync(symbolPath)) {
        console.log(
          chalk.red(
            `Error: Symbol file '${symbolPath}' not found.`
          )
        );
        return null;
      }
      
      let _found_symbols = return_list_of_symbols(symbolPath);
      if (_found_symbols.length === 0) {
        console.log(
          chalk.red(
            `Error: No symbols found in file '${symbolPath}'.`
          )
        );
        return null;
      }
      
      // Use first symbol found
      _chosen_symbol = _found_symbols[0].value;
      
      // Issue warning if multiple symbols found
      if (_found_symbols.length > 1) {
        console.log(
          chalk.yellow(
            `Warning: Multiple symbols found in '${symbolPath}'. Using first symbol: '${_chosen_symbol}'. Other symbols found: ${_found_symbols.slice(1).map(s => s.value).join(', ')}`
          )
        );
      }
      
      local_symbol_to_footprint(symbolPath);
      const pins = kicad_pins();

      return {
        symbol:
          basename(symbolPath).replace(/\.[^/\\.]+$/, "") + ":" + _chosen_symbol,
        name: sanitize_name(_chosen_symbol),
        pins,
        symbol_path: symbolPath,
        footprint_recommendation: local_symbol_to_footprint(symbolPath),
      };
      
    } else {
      // Handle library:symbol format (existing logic)
      if (!entered_symbol || !entered_symbol.includes(":")) {
        console.log(
          chalk.red(
            `Error: Invalid symbol format. Must be 'symbol_library:symbol_name' or path to .kicad_sym file`
          )
        );
        return null;
      }

      _chosen_symbol = entered_symbol.split(":")[1];
      kicad_symbol(entered_symbol, cmdArgs.folder || "./");
      const pins = kicad_pins();

      return {
        symbol: entered_symbol,
        name: sanitize_name(_chosen_symbol),
        pins,
      };
    }
  } else {
    symbolPath = (await fileSelector({
      message: "Select a KiCAD Symbol file (kicad_sym):",
      filter: (file) => file.isDirectory || file.path.includes(".kicad_sym"),
      showExcluded: false,
    })).path;

    let _found_symbols = return_list_of_symbols(symbolPath);
    if (_found_symbols.length > 1) {
      _chosen_symbol = await select({
        message: "Select a symbol from in the file",
        choices: _found_symbols,
      });
    } else {
      _chosen_symbol = _found_symbols[0].value;
    }

    local_symbol_to_footprint(symbolPath);
    const pins = kicad_pins();

    return {
      symbol:
        basename(symbolPath).replace(/\.[^/\\.]+$/, "") + ":" + _chosen_symbol,
      name: sanitize_name(_chosen_symbol),
      pins,
      symbol_path: symbolPath,
      footprint_recommendation: local_symbol_to_footprint(symbolPath),
    };
  }
}

async function handleEasyedaSymbol(cmdArgs, isNonInteractive) {
  const pattern = /^C\d+$/;
  let c_component;

  if (isNonInteractive) {
    c_component = cmdArgs.c;
    if (!pattern.test(c_component)) {
      console.log(
        chalk.red(
          `Error: Invalid component number '${c_component}'. Must start with 'C' followed by digits.`
        )
      );
      return null;
    }
  } else {
    c_component = await input({
      message: "Component #?",
      default: cmdArgs.c || "C3217148",
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
      footprintLibName: "lib",
      kicadVersion: "v6_99",
    });
  } catch (error) {
    console.log("Error converting EasyEDA component to KiCAD:", error);
    return null;
  }

  const baseFolder = cmdArgs.folder || "./";
  const prettyFolder = path.join(
    baseFolder,
    `${convertedComponent.symbol.name}.pretty`
  );

  if (!fs.existsSync(prettyFolder)) {
    fs.mkdirSync(prettyFolder);
  }

  const symbolFilePath = path.join(
    prettyFolder,
    `${convertedComponent.symbol.name}.kicad_sym`
  );
  fs.writeFileSync(
    symbolFilePath,
    "(kicad_symbol_lib(version 20200101)(generator https://github.com/uPesy/easyeda2kicad.py)" +
      convertedComponent.symbol.content +
      ")",
    { encoding: "utf-8" }
  );

  try {
    execSync(`"${kicad_cli()}" sym upgrade "${symbolFilePath}"`);
  } catch (e) {
    console.error(`Failed executing`, e);
  }

  local_symbol_to_footprint(symbolFilePath);
  const pins = kicad_pins();

  return {
    symbol:
      basename(symbolFilePath).replace(/\.[^/\\.]+$/, "") +
      ":" +
      convertedComponent.symbol.name,
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
        console.error("Error cleaning up temp directory:", error);
      }
    },
  };
}

async function handleKicadFootprint(cmdArgs, isNonInteractive, symbolData) {
  let entered_footprint;

  if (isNonInteractive) {
    entered_footprint = cmdArgs.footprint;
    
    // If no footprint provided, try to use auto-associated footprint
    if (!entered_footprint) {
      if (symbolData.footprint_recommendation) {
        entered_footprint = symbolData.footprint_recommendation;
        console.log(
          chalk.yellow(
            `No footprint specified, using auto-associated footprint: ${entered_footprint}`
          )
        );
      } else {
        console.log(
          chalk.red(
            `Error: No footprint specified and no auto-associated footprint found for symbol '${symbolData.symbol}'`
          )
        );
        return null;
      }
    }
    
    // Check if this is a direct .kicad_mod file path or library:footprint format
    if (entered_footprint && entered_footprint.endsWith('.kicad_mod')) {
      // Handle direct .kicad_mod file path - treat as local footprint
      if (!fs.existsSync(entered_footprint)) {
        console.log(
          chalk.red(
            `Error: Footprint file '${entered_footprint}' not found.`
          )
        );
        return null;
      }
      
      let _found_footprints = return_list_of_footprints(entered_footprint);
      if (_found_footprints.length === 0) {
        console.log(
          chalk.red(
            `Error: No footprints found in file '${entered_footprint}'.`
          )
        );
        return null;
      }
      
      // Use first footprint found
      let _chosen_footprint = _found_footprints[0].value;
      
      // Issue warning if multiple footprints found
      if (_found_footprints.length > 1) {
        console.log(
          chalk.yellow(
            `Warning: Multiple footprints found in '${entered_footprint}'. Using first footprint: '${_chosen_footprint}'. Other footprints found: ${_found_footprints.slice(1).map(f => f.value).join(', ')}`
          )
        );
      }

      return {
        footprint:
          basename(entered_footprint).replace(/\.[^/\\.]+$/, "") + ":" + _chosen_footprint,
        footprint_path: entered_footprint,
      };
      
    } else {
      // Handle library:footprint format (existing logic)
      if (!entered_footprint.includes(":")) {
        console.log(
          chalk.red(
            `Error: Invalid footprint format. Must be 'footprint_library:footprint_name' or path to .kicad_mod file`
          )
        );
        return null;
      }
    }
  } else {
    entered_footprint = await input({
      message: "Footprint name?",
      default: cmdArgs.footprint || symbolData.footprint_recommendation || "",
      validate: (footprint) => {
        if (!footprint.includes(":")) {
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

async function handleLocalFootprint(cmdArgs, isNonInteractive, symbolData) {
  let entered_footprint, footprintPath;

  if (isNonInteractive) {
    entered_footprint = cmdArgs.footprint;
    
    // Check if this is a direct .kicad_mod file path or library:footprint format
    if (entered_footprint && entered_footprint.endsWith('.kicad_mod')) {
      // Handle direct .kicad_mod file path
      footprintPath = entered_footprint;
      
      if (!fs.existsSync(footprintPath)) {
        console.log(
          chalk.red(
            `Error: Footprint file '${footprintPath}' not found.`
          )
        );
        return null;
      }
      
      let _found_footprints = return_list_of_footprints(footprintPath);
      if (_found_footprints.length === 0) {
        console.log(
          chalk.red(
            `Error: No footprints found in file '${footprintPath}'.`
          )
        );
        return null;
      }
      
      // Use first footprint found
      let _chosen_footprint = _found_footprints[0].value;
      
      // Issue warning if multiple footprints found
      if (_found_footprints.length > 1) {
        console.log(
          chalk.yellow(
            `Warning: Multiple footprints found in '${footprintPath}'. Using first footprint: '${_chosen_footprint}'. Other footprints found: ${_found_footprints.slice(1).map(f => f.value).join(', ')}`
          )
        );
      }

      return {
        footprint:
          basename(footprintPath).replace(/\.[^/\\.]+$/, "") + ":" + _chosen_footprint,
        footprint_path: footprintPath,
      };
      
    } else {
      // Handle library:footprint format (existing logic)
      if (!entered_footprint || !entered_footprint.includes(":")) {
        console.log(
          chalk.red(
            `Error: Invalid footprint format. Must be 'footprint_library:footprint_name' or path to .kicad_mod file`
          )
        );
        return null;
      }

      return {
        footprint: entered_footprint,
      };
    }
  } else {
    const defaultFootprint =
      symbolData.footprint_recommendation || "lib:footprint";
    footprintPath = (await fileSelector({
      message: `Select footprint file (.kicad_mod) for ${defaultFootprint}:`,
      filter: (file) => file.isDirectory || file.path.includes(".kicad_mod"),
      showExcluded: false,
    })).path;

    return {
      footprint: defaultFootprint,
      footprint_path: footprintPath,
    };
  }
}

async function handleEasyedaFootprint(cmdArgs, isNonInteractive, symbolData) {
  // For EasyEDA footprints, we need to get the component and process it
  const pattern = /^C\d+$/;
  let c_component;

  if (isNonInteractive) {
    c_component = cmdArgs.c;
    if (!pattern.test(c_component)) {
      console.log(
        chalk.red(
          `Error: Invalid component number '${c_component}'. Must start with 'C' followed by digits.`
        )
      );
      return null;
    }
  } else {
    c_component = await input({
      message: "Component # for footprint?",
      default: symbolData.c_component || cmdArgs.c || "C3217148",
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
      footprintLibName: "lib",
      kicadVersion: "v6_99",
    });
  } catch (error) {
    console.error("Error converting EasyEDA component to KiCAD:", error);
    return null;
  }

  const baseFolder = cmdArgs.folder || "./";
  const prettyFolder = path.join(
    baseFolder,
    `${convertedComponent.footprint.name}.pretty`
  );

  if (!fs.existsSync(prettyFolder)) {
    fs.mkdirSync(prettyFolder);
  }

  const footprintFilePath = path.join(
    prettyFolder,
    `${convertedComponent.footprint.name}.kicad_mod`
  );
  fs.writeFileSync(
    footprintFilePath,
    convertedComponent.footprint.content.replace("/${KIPRJMOD}/", ""),
    { encoding: "utf-8" }
  );

  try {
    execSync(`"${kicad_cli()}" fp upgrade "${prettyFolder}"`);
  } catch (e) {
    console.error(`Failed executing`, e);
  }

  // Handle 3D models
  let dir = path.join(baseFolder, "build", "lib", "footprints");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (convertedComponent.model3d) {
    if (convertedComponent.model3d.wrlContent) {
      fs.writeFileSync(
        path.join(dir, `${convertedComponent.model3d.name}.wrl`),
        convertedComponent.model3d.wrlContent
      );
    }
    if (convertedComponent.model3d.stepContent) {
      fs.writeFileSync(
        path.join(dir, `${convertedComponent.model3d.name}.step`),
        convertedComponent.model3d.stepContent
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
        console.error("Error cleaning up temp directory:", error);
      }
    },
  };
}
