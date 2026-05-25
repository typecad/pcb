#!/usr/bin/env node
import { input, select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { create_project } from "./create_project.js";
import * as multi_select from "inquirer-select-pro";

let answers: Record<string, any> = {};
process.on("uncaughtException", (error) => {
  if (error && error.name === "ExitPromptError") {
    process.exit(0);
  } else {
    // Rethrow unknown errors
    throw error;
  }
});

// Parse command line arguments
function parseArguments() {
  const args = process.argv.slice(2);
  const parsedArgs: Record<string, string | boolean | string[] | undefined> = {};

  // Mapping from npm package names to internal short names
  const packageNameMap = {
    "@typecad/ngspice": "ngspice",
    "@typecad/graphviz": "graphviz",
    "@typecad/jlcpcb-export": "jlcpcb",
    "@typecad/typecad-prompt": "prompt",
    "@typecad/wiring": "wiring",
    "@typecad/jlcpcb-parts": "jlcpcb-parts",
    "@typecad/typecad-mcp": "typecad-mcp",
  };

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");

      // Handle flags without values (like --help)
      if (key === "help" && value === undefined) {
        parsedArgs[key] = true;
      } else if (key === "pio" || key === "git") {
        parsedArgs[key] = value === "true";
      } else if (key === "packages") {
        if (value) {
          // Convert npm package names to internal short names
          parsedArgs[key] = value
            .split(",")
            .map((pkg) => packageNameMap[pkg] || pkg);
        } else {
          parsedArgs[key] = [];
        }
      } else {
        parsedArgs[key] = value;
      }
    }
  }

  return parsedArgs;
}

// Check if all required arguments are provided for non-interactive mode
function hasAllRequiredArgs(args) {
  const hasBasicArgs =
    args.hasOwnProperty("name") &&
    args.hasOwnProperty("pio") &&
    args.hasOwnProperty("git");

  // If pio is true, board is also required
  if (args.pio === true) {
    return hasBasicArgs && args.hasOwnProperty("board");
  }

  return hasBasicArgs;
}

// Display help information
function showHelp() {
  console.log(
    chalk.white.bold("🤖 typeCAD Project Creator - Command Line Usage\n")
  );
  console.log("Usage: node @typecad/create-typecad [options]\n");
  console.log("Options:");
  console.log(
    "  --name=<project_name>     Project name (required for non-interactive mode)"
  );
  console.log(
    "  --pio=<true|false>        Create PlatformIO project (required for non-interactive mode)"
  );
  console.log(
    "  --git=<true|false>        Initialize git repository (required for non-interactive mode)"
  );
  console.log(
    "  --board=<board_name>      PlatformIO board (required when --pio=true, default: esp32dev)"
  );
  console.log(
    "  --packages=<pkg1,pkg2>    Comma-separated list of optional packages"
  );
  console.log("  --help                    Show this help message\n");
  console.log("Available packages:");
  console.log(
    "  @typecad/ngspice, @typecad/graphviz, @typecad/jlcpcb-export, @typecad/typecad-prompt,"
  );
  console.log(
    "  @typecad/wiring, @typecad/jlcpcb-parts, @typecad/typecad-mcp\n"
  );
  console.log("Examples:");
  console.log(
    "  node @typecad/create-typecad --name=my_project --pio=false --git=true"
  );
  console.log(
    "  node @typecad/create-typecad --name=my_project --pio=true --git=true --board=esp32dev"
  );
  console.log(
    "  node @typecad/create-typecad --name=my_project --pio=true --git=true --board=esp32dev --packages=@typecad/ngspice,@typecad/graphviz"
  );
}

async function main(preparsedArgs?: Record<string, any>) {
  const cmdArgs = preparsedArgs || parseArguments();

  if (cmdArgs.help) {
    showHelp();
    return;
  }

  // Validate project name if provided
  function validateProjectName(name) {
    if (name.includes("-") || name.includes(" ") || name.match(/^\d/)) {
      return `That's not a valid function name in TypeScript`;
    }
    return true;
  }

  process.stdout.write(chalk.white.bold("🤖 type"));
  process.stdout.write(chalk("CAD "));
  process.stdout.write(chalk("Project Creator\n"));

  // Check if we're in non-interactive mode
  const isNonInteractive = hasAllRequiredArgs(cmdArgs);

  // Always create a project - no need to ask
  const project_type = "project";

  if (isNonInteractive) {
    // Validate provided name
    const nameValidation = validateProjectName(cmdArgs.name);
    if (nameValidation !== true) {
      console.error(chalk.red("Error:"), nameValidation);
      process.exit(1);
    }

    // Use command line arguments
    answers.name = cmdArgs.name;
    answers.pio = cmdArgs.pio;
    answers.git = cmdArgs.git;
    answers.board = cmdArgs.board || "esp32dev";
    answers.packages = cmdArgs.packages || [];

    console.log(chalk.green("Creating project with the following settings:"));
    console.log(`  Name: ${answers.name}`);
    console.log(`  PlatformIO: ${answers.pio}`);
    console.log(`  Git: ${answers.git}`);
    if (answers.pio) {
      console.log(`  Board: ${answers.board}`);
    }
    if (answers.packages.length > 0) {
      console.log(`  Packages: ${answers.packages.join(", ")}`);
    }
  } else {
    // Interactive mode - ask questions as before
    answers.name = await input({
      message: "Project name?",
      default: cmdArgs.name || "typecad_project",
      validate: validateProjectName,
    });

    answers.pio = cmdArgs.hasOwnProperty("pio")
      ? cmdArgs.pio
      : await confirm({
          message: "Create a PlatformIO project for firmware?",
          default: false,
        });

    if (answers.pio) {
      answers.board =
        cmdArgs.board ||
        (await input({
          message: "PlatformIO board?",
          default: "esp32dev",
        }));
    }

    answers.git = cmdArgs.hasOwnProperty("git")
      ? cmdArgs.git
      : await confirm({
          message: "Initialize a git repo?",
        });

    answers.packages =
      cmdArgs.packages ||
      (await multi_select.select({
        message: "Optional packages",
        multiple: true,
        defaultValue: [],
        options: [
          {
            name: "@typecad/ngspice - use typeCAD to design your hardware and run simulations with ngspice with the same codebase",
            value: "ngspice",
          },
          {
            name: "@typecad/graphviz - view connections in your typeCAD project",
            value: "graphviz",
          },
          {
            name: "@typecad/jlcpcb-export - export all the required files for JLCPCB assembly from a typeCAD project",
            value: "jlcpcb",
          },
          {
            name: "@typecad/typecad-prompt - generate prompts to use typeCAD with AI coding models",
            value: "prompt",
          },
          {
            name: "@typecad/wiring - programmatically create wiring diagrams",
            value: "wiring",
          },
          {
            name: "@typecad/jlcpcb-parts - Fuzzy search for JLCPCB basic and preferred electrical components",
            value: "jlcpcb-parts",
          },
          {
            name: "@typecad/typecad-mcp - Provides AI assistants with direct access to typeCAD tools and workflows",
            value: "typecad-mcp",
          },
        ],
      }));
  }

  await create_project(answers);
}

export { main };

if (
  process.argv[1]?.endsWith('create-typecad/index.js') ||
  process.argv[1]?.endsWith('create-typecad\\index.js')
) {
  main();
}
