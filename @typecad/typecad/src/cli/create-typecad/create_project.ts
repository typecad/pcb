import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { execFileSync } from "node:child_process";
import { findExecutable } from '../../kicad.js';
import type { ProjectAnswers } from '../types.js';
import logger from '../../utils/logging.js';

function sanitizeProjectName(name: string): string {
  if (/[;&|$`\\!#(){}[\]<>]/.test(name)) {
    throw new Error(`Project name contains invalid characters: ${name}`);
  }
  if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error(`Project name contains invalid path characters: ${name}`);
  }
  return name;
}

const IS_WIN = process.platform === 'win32';
const IS_CMD_EXT = /\.(?:cmd|bat)$/i;

function runSync(command: string, args: string[], cwd?: string): void {
  const resolved = findExecutable(command);
  if (IS_WIN && (!resolved || IS_CMD_EXT.test(resolved))) {
    // .cmd/.bat shims (npm, npx) need cmd.exe; pass bare name to avoid path-with-spaces issues
    execFileSync('cmd.exe', ['/d', '/s', '/c', command, ...args], { cwd, stdio: 'pipe', timeout: 120_000 });
  } else {
    execFileSync(resolved ?? command, args, { cwd, stdio: 'pipe', timeout: 120_000 });
  }
}

const runCommand = (command: string, args: string[], cwd?: string) => {
  try {
    runSync(command, args, cwd);
  } catch (e: unknown) {
    const err = e as { stderr?: { toString(): string } };
    const detail = err.stderr?.toString().trim() || (e instanceof Error ? e.message : String(e));
    logger.error(`Failed executing ${command} ${args.join(' ')}`, detail);
    return false;
  }
  return true;
};

const runCommandQuiet = (command: string, args: string[], cwd?: string) => {
  try {
    runSync(command, args, cwd);
  } catch (e: unknown) {
    logger.error(`Failed executing ${command} ${args.join(' ')}`, e);
    return false;
  }
  return true;
};

export function create_project(answers: ProjectAnswers) {
  answers.name = sanitizeProjectName(answers.name);
  const projectRoot = path.resolve(answers.name);
  let createdDirs = false;

  try {
    let dir = `./${answers.name}/hw/build/lib/footprints`;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    createdDirs = true;

    dir = `./${answers.name}/hw/src`;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    dir = `./${answers.name}/hw/.vscode`;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    logger.log(chalk.green("+"), "Project folders created");

    try {
      fs.writeFileSync(
        `./${answers.name}/hw/build/${answers.name}.kicad_pro`,
        ""
      );
    } catch (error) {
      throw new Error(`ERROR creating ./${answers.name}/hw/build/${answers.name}.kicad_pro. ${error}`);
    }

    try {
      fs.writeFileSync(
        `./${answers.name}/hw/build/${answers.name}.kicad_pcb`,
        '(kicad_pcb(version 20240108)(generator "pcbnew")(generator_version "8.0"))'
      );
    } catch (error) {
      throw new Error(`ERROR creating ./hw/build/${answers.name}/${answers.name}.kicad_pcb. ${error}`);
    }

    try {
      fs.writeFileSync(
        `./${answers.name}/hw/build/fp-lib-table`,
        '(fp_lib_table(version 8)(lib (name "lib")(type "KiCad")(uri "${KIPRJMOD}/lib/footprints")(options "")(descr "")))'
      );
    } catch (error) {
      throw new Error(`ERROR creating ./${answers.name}/hw/build/fp-lib-table. ${error}`);
    }

    try {
      fs.writeFileSync(
        `./${answers.name}/hw/src/${answers.name}.ts`,
        `import { PCB } from '@typecad/typecad'
import { Resistor } from '@typecad/passives/0603';
${[
  answers.packages.includes("ngspice")
    ? `import { ngspiceSimulator } from '@typecad/ngspice';`
    : "",
  answers.packages.includes("graphviz")
    ? `import { graphviz } from '@typecad/graphviz';`
    : "",
  answers.packages.includes("jlcpcb")
    ? `import { jlcpcb_export } from '@typecad/jlcpcb-export';`
    : "",
]
  .filter(Boolean)
  .join("\n")}
let typecad = new PCB('${answers.name}');
${[
  answers.packages.includes("ngspice")
    ? `let ngspice = new ngspiceSimulator(typecad);`
    : "",
]
  .filter(Boolean)
  .join("\n")}
${[
  answers.packages.includes("ngspice")
    ? `let r1 = new Resistor({ value: '1kohm', simulation: { include: true } });`
    : `let r1 = new Resistor({ value: '1kohm' });`,
]
  .filter(Boolean)
  .join("\n")}

typecad.create(r1);
${[
  answers.packages.includes("ngspice") ? `ngspice.op();` : "",
  answers.packages.includes("graphviz") ? `graphviz(typecad);` : "",
  answers.packages.includes("jlcpcb") ? `jlcpcb_export(typecad, pcb);` : "",
]
  .filter(Boolean)
  .join("\n")}
// 1. run the npm script 'build'
// 2. run the npm script 'open_board' to edit the board in KiCAD
${[
  answers.packages.includes("ngspice")
    ? `// * read more about ngspice simulation: https://www.npmjs.com/package/@typecad/ngspice`
    : "",
  answers.packages.includes("graphviz")
    ? `// * read more about the graphviz package: https://www.npmjs.com/package/@typecad/graphviz`
    : "",
  answers.packages.includes("jlcpcb")
    ? `// * read more about the jlcpcb-export package: https://www.npmjs.com/package/@typecad/jlcpcb-export`
    : "",
]
  .filter(Boolean)
  .join("\n")}
 `
      );
    } catch (error) {
      throw new Error(`ERROR creating ./${answers.name}/src/${answers.name}.ts. ${error}`);
    }
    logger.log(chalk.green("+"), "KiCAD project created");

    try {
      fs.writeFileSync(
        `./${answers.name}/hw/typecad.conf.ts`,
        `import { defineConfig } from '@typecad/typecad';

export default defineConfig({
  entry: './src/${answers.name}.ts',
});
`
      );
    } catch (error) {
      throw new Error(`ERROR creating ./${answers.name}/hw/typecad.conf.ts. ${error}`);
    }
    logger.log(chalk.green("+"), "typecad.conf.ts created");

    logger.log(chalk.green("+"), "Creating npm package");
    const npmInit = runCommand('npm', ['init', '-y'], path.join(process.cwd(), answers.name, 'hw'));
    if (!npmInit) {
      throw new Error(`Failed to initialize npm package. Is npm installed and on your PATH?`);
    }

    const pkgList = [
      'tsx', '@typecad/typecad', '@typecad/passives',
      ...answers.packages.includes("ngspice") ? ['@typecad/ngspice'] : [],
      ...answers.packages.includes("graphviz") ? ['@typecad/graphviz'] : [],
      ...answers.packages.includes("jlcpcb") ? ['@typecad/jlcpcb-export'] : [],
      ...answers.packages.includes("prompt") ? ['@typecad/typecad-prompt'] : [],
      ...answers.packages.includes("wiring") ? ['@typecad/wiring'] : [],
      ...answers.packages.includes("jlcpcb-parts") ? ['@typecad/jlcpcb-parts'] : [],
      ...answers.packages.includes("typecad-mcp") ? ['@typecad/typecad-mcp'] : [],
    ].filter(Boolean);

    logger.log(chalk.green("+"), "Installing dependencies");
    const installedDeps = runCommandQuiet('npm', ['i', ...pkgList], path.join(process.cwd(), answers.name, 'hw'));
    if (!installedDeps) {
      throw new Error(`Failed to install dependencies. Is npm installed and on your PATH?`);
    }

    try {
      fs.writeFileSync(
        `${process.cwd()}/${answers.name}/hw/.gitignore`,
        "node_modules/"
      );
    } catch (error) {
      throw new Error(`ERROR writing ./${answers.name}/hw/.gitignore ${error}`);
    }

    try {
      fs.writeFileSync(
        `${process.cwd()}/${answers.name}/hw/AGENTS.md`,
        `# typeCAD Project

This is a typeCAD project. typeCAD is a TypeScript framework for programmatically
creating PCB designs that output KiCad files.

## AI Reference: typecad skills

The \`typecad\` CLI includes a knowledge lookup system. Use it before writing typeCAD code:

- \`npx typecad skills\` — list all available topics
- \`npx typecad skills get <name>\` — detailed API patterns and examples for a topic
- \`npx typecad skills get <name> --json\` — machine-readable JSON output

Use skills to look up: components, pins, nets, power, buses, passives (resistor,
capacitor, inductor, diode, LED, fuse, connector, testpoint, mounting-hole, net-tie),
PCB layout (tracks, vias, zones, keepout, outlines, autoroute, placement),
graphics, text, validation (ERC, DRC), packages, contracts, BOM, simulation,
config, KiCad integration, and project commands.

## npm Scripts

- \`npm run build\` — generate KiCad files from typeCAD source
- \`npm run add_component\` — add a component interactively
- \`npm run add_package\` — create a reusable component package
- \`npm run kicad-search\` — search KiCad symbol libraries
`
      );
      logger.log(chalk.green("+"), "AGENTS.md created for AI tool discoverability");
    } catch (error) {
      throw new Error(`ERROR writing ./${answers.name}/hw/AGENTS.md ${error}`);
    }

    let package_json;
    try {
      package_json = JSON.parse(
        fs.readFileSync(
          `${process.cwd()}/${answers.name}/hw/package.json`,
          "utf8"
        )
      );
    } catch (error) {
      throw new Error(`ERROR reading ./${answers.name}/hw/package.json ${error}`);
    }

    package_json.type = "module";

    package_json.scripts["build"] = `typecad build`;
    package_json.scripts["add_component"] = `typecad add component`;
    package_json.scripts["add_package"] = `typecad add package`;
    package_json.scripts["kicad-search"] = `typecad search`;
    package_json.scripts["import"] = `typecad import ${path.join(".", "build", `${answers.name}.kicad_pcb`)} --apply`;
    package_json.scripts[
      "open_board"
    ] = `npx open-cli ./build/${answers.name}.kicad_pcb`;
    package_json.scripts["diff"] = `typecad diff HEAD ./build/${answers.name}.kicad_pcb`;

    package_json.scripts["docs"] = `typecad doc ${path.join(".", "docs", `${answers.name}.md`)} ${path.join(
      ".",
      "build",
      `${answers.name}.kicad_pcb`
    )}`;

    if (answers.packages.includes("jlcpcb-parts")) {
      package_json.scripts["jlcpcb_parts"] = `${path.join(
        ".",
        "node_modules",
        ".bin",
        "jlcpcb-search"
      )}`;
    }

    delete package_json.scripts.test;

    try {
      fs.writeFileSync(
        `${process.cwd()}/${answers.name}/hw/package.json`,
        JSON.stringify(package_json, null, 2)
      );
    } catch (error) {
      throw new Error(`ERROR writing ./${answers.name}/hw/package.json ${error}`);
    }

    if (answers.pio) {
      dir = `./${answers.name}/fw`;
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      logger.log(chalk.green("+"), "Creating pio project in ./fw");
      const installedPIO = runCommand('pio', ['project', 'init', '--project-dir', './fw/', '-b', answers.board], path.join(process.cwd(), answers.name));
      if (!installedPIO) {
        logger.error(`Error creating PlatformIO project`);
      }
    }

    if (answers.git) {
      dir = `./${answers.name}/fw`;
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      logger.log(chalk.green("+"), "Initializing git repo ./fw");
      const installedGit = runCommand('git', ['init'], path.join(process.cwd(), answers.name));
      if (!installedGit) {
        logger.error(`Error initializing git repo`);
      }
    }

    const docsDir = `./${answers.name}/hw/docs`;
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    const docContent = `# Fabrication Notes

|                 Stackup                 |                        Dimensions                         |                Drills                |
| :-------------------------------------: | :-------------------------------------------------------: | :----------------------------------: |
| ![{Stackup}](./images/stackup.png =550) | ![{Edge.Cuts,User.5,F.Fab}](./images/dimensions.png =350) | ![{Drill}](./images/drills.png =350) |

1. FABRICATE PER IPC-6012A CLASS 2
2. REFER TO ABOVE IMAGE FOR BOARD THICKNESSES, IMPEDANCE CONTROL, SOLDERMASK AND SURFACE FINISH DETAILS
3. VENDOR SHOULD FOLLOW ROHS COMPLIANT PROCESS AND Pb FREE FOR MANUFACTURING
4. PRINTED CIRCUIT BOARD SHALL COMPLY WITH REQUIREMENTS OF ANSI/J-STD-003
5. FLATNESS REQUIREMENTS: TEST IN ACCORDANCE WITH THE CURRENT REVISION OF IPC-TM-650 2.4.22
6. PCB MATERIAL REQUIREMENTS: Tg 170 C OR EQUIVALENT
7. ALL DIMENSIONS ARE IN MILLIMETERS UNLESS OTHERWISE SPECIFIED

# L1

![{F.Cu}](./images/fcu.png =550)

# L2

![{B.Cu}](./images/bcu.png =550)
_flipped_

# Renders

|                          Top View                          |                        Bottom View                        |
| :--------------------------------------------------------: | :-------------------------------------------------------: |
| ![{Render/front/90/0/0}](./images/render-display.png =550) | ![{Render/bottom/0/0/360}](./images/back-render.png =550) |

# Top Assembly

|                              Top View                              |                      Render                       |
| :----------------------------------------------------------------: | :-----------------------------------------------: |
| ![{Edge.Cuts,F.Cu,F.Mask,F.Fab}](./images/front-assembly.png =550) | ![Front render](./images/render-display.png =550) |

# Bottom Assembly

|                        Bottom View                        |                     Render                      |
| :-------------------------------------------------------: | :---------------------------------------------: |
| ![{B.Cu,B.Mask,B.Fab}](./images/bottom-assembly.png =550) | ![Bottom render](./images/back-render.png =550) |
`;

    try {
      fs.writeFileSync(
        `${process.cwd()}/${answers.name}/hw/docs/${answers.name}.md`,
        docContent
      );
      logger.log(chalk.green("+"), "Documentation template created");
    } catch (error) {
      throw new Error(`ERROR writing ./${answers.name}/hw/docs/${answers.name}.md ${error}`);
    }

    let code_workspace: Record<string, any> = {};

    if (answers.pio) {
      code_workspace.folders = [{ path: "hw" }, { path: "fw" }];
    } else {
      code_workspace.folders = [{ path: "hw" }];
    }
    code_workspace.settings = {};

    try {
      fs.writeFileSync(
        `${process.cwd()}/${answers.name}/${answers.name}.code-workspace`,
        JSON.stringify(code_workspace, null, 2)
      );
    } catch (error) {
      throw new Error(`ERROR writing ./${answers.name}.code-workspace ${error}`);
    }

    logger.log(chalk.green("+"), "Finished");
    logger.log(
      chalk.green("+"),
      `Open ${answers.name}.code-workspace in VS Code to get started`
    );
  } catch (err) {
    if (createdDirs && fs.existsSync(projectRoot)) {
      try {
        fs.rmSync(projectRoot, { recursive: true, force: true });
        logger.log(chalk.yellow("!"), "Cleaned up partial project:", projectRoot);
      } catch (cleanupErr) {
        logger.error(`Failed to clean up ${projectRoot}. Remove it manually.`);
      }
    }
    logger.error(chalk.red(`Project creation failed: ${(err as Error).message}`));
  }
}
