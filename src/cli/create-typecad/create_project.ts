import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { execFileSync } from 'node:child_process';
import { findExecutable } from '../../kicad.js';
import type { ProjectAnswers } from '../types.js';
import logger from '../../utils/logging.js';
import { getCategories, getSkillsByCategory } from '../typecad/skills/registry.js';
import { CORE_DEPENDENCIES } from './core-deps.js';

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
    // execSync failures carry the child's stderr on .stderr — without it the
    // log shows only "Command failed", hiding the real cause (an ERESOLVE
    // reads as "is npm on your PATH?").
    const err = e as { stderr?: { toString(): string }; stdout?: { toString(): string } };
    const detail = err.stderr?.toString().trim() || err.stdout?.toString().trim() || String(e);
    logger.error(`Failed executing ${command} ${args.join(' ')}`, detail);
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

    logger.log(chalk.green('+'), 'Project folders created');

    try {
      fs.writeFileSync(`./${answers.name}/hw/build/${answers.name}.kicad_pro`, '');
    } catch (error) {
      throw new Error(`ERROR creating ./${answers.name}/hw/build/${answers.name}.kicad_pro. ${error}`);
    }

    try {
      fs.writeFileSync(
        `./${answers.name}/hw/build/${answers.name}.kicad_pcb`,
        '(kicad_pcb(version 20240108)(generator "pcbnew")(generator_version "8.0"))',
      );
    } catch (error) {
      throw new Error(`ERROR creating ./hw/build/${answers.name}/${answers.name}.kicad_pcb. ${error}`);
    }

    try {
      fs.writeFileSync(
        `./${answers.name}/hw/build/fp-lib-table`,
        '(fp_lib_table(version 8)(lib (name "lib")(type "KiCad")(uri "${KIPRJMOD}/lib/footprints")(options "")(descr "")))',
      );
    } catch (error) {
      throw new Error(`ERROR creating ./${answers.name}/hw/build/fp-lib-table. ${error}`);
    }

    try {
      fs.writeFileSync(
        `./${answers.name}/hw/src/${answers.name}.ts`,
        `import { PCB, Resistor } from '@typecad/pcb'

let typecad = new PCB('${answers.name}');
let r1 = new Resistor({ value: '1kohm' });

typecad.create(r1);
// 1. run the npm script 'build'
// 2. run the npm script 'open_board' to edit the board in KiCAD
 `,
      );
    } catch (error) {
      throw new Error(`ERROR creating ./${answers.name}/src/${answers.name}.ts. ${error}`);
    }
    logger.log(chalk.green('+'), 'KiCAD project created');

    try {
      fs.writeFileSync(
        `./${answers.name}/hw/typecad.conf.ts`,
        `import { defineConfig } from '@typecad/pcb';

export default defineConfig({
  entry: './src/${answers.name}.ts',
});
`,
      );
    } catch (error) {
      throw new Error(`ERROR creating ./${answers.name}/hw/typecad.conf.ts. ${error}`);
    }
    logger.log(chalk.green('+'), 'typecad.conf.ts created');

    try {
      // tsx runs the project without a tsconfig; this exists so `typecad
      // validate` (tsc --noEmit) can type-check it. No `types` field — when
      // @types/node is installed later the default walk picks it up.
      fs.writeFileSync(
        `./${answers.name}/hw/tsconfig.json`,
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2021',
              module: 'NodeNext',
              moduleResolution: 'NodeNext',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              forceConsistentCasingInFileNames: true,
              noEmit: true,
            },
            include: ['src/**/*.ts', 'typecad.conf.ts'],
          },
          null,
          2,
        ),
      );
    } catch (error) {
      throw new Error(`ERROR creating ./${answers.name}/hw/tsconfig.json. ${error}`);
    }
    logger.log(chalk.green('+'), 'tsconfig.json created');

    logger.log(chalk.green('+'), 'Creating npm package');
    const npmInit = runCommand('npm', ['init', '-y'], path.join(process.cwd(), answers.name, 'hw'));
    if (!npmInit) {
      throw new Error(`Failed to initialize npm package. Is npm installed and on your PATH?`);
    }

    logger.log(chalk.green('+'), 'Installing dependencies');
    // Single source with `typecad-pcb doctor`'s repair line — see core-deps.ts
    // for why these carry specs (the two registry lines must never mix).
    const installedDeps = runCommandQuiet(
      'npm',
      ['i', ...CORE_DEPENDENCIES],
      path.join(process.cwd(), answers.name, 'hw'),
    );
    if (!installedDeps) {
      throw new Error(
        `Failed to install dependencies (npm output above). ` +
          `If it ends in ERESOLVE, the project's dependency lines are mixed — 'typecad-pcb doctor' in the hw/ directory diagnoses and repairs that.`,
      );
    }

    // Dev-only: tsconfig.json's consumer is `typecad-pcb validate`'s tsc --noEmit.
    // Soft-fails (like pio/git) so a missing typescript never aborts creation —
    // not in CORE_DEPENDENCIES on purpose: doctor must not demand it from
    // projects that predate generated tsconfigs.
    const installedTS = runCommandQuiet('npm', ['i', '-D', 'typescript'], path.join(process.cwd(), answers.name, 'hw'));
    if (!installedTS) {
      logger.error(
        `Failed to install typescript — run 'npm i -D typescript' in hw/ for 'typecad-pcb validate' type-checking`,
      );
    }

    try {
      fs.writeFileSync(`${process.cwd()}/${answers.name}/hw/.gitignore`, 'node_modules/\nbuild/serve/\n');
    } catch (error) {
      throw new Error(`ERROR writing ./${answers.name}/hw/.gitignore ${error}`);
    }

    try {
      // Skills section is generated from the live registry so it can never
      // drift from the CLI's actual knowledge.
      const skillSections = getCategories()
        .map((cat) => {
          const names = getSkillsByCategory(cat).map((s) => s.name);
          return `### ${cat}\n\n${names.join(', ')}\n`;
        })
        .join('\n');
      fs.writeFileSync(
        `${process.cwd()}/${answers.name}/hw/AGENTS.md`,
        `# typeCAD Project

This is a typeCAD project. typeCAD is a TypeScript framework for programmatically
creating PCB designs that output KiCad files.

## The agent loop

- \`npx typecad-pcb skills search <query>\` — find the right API pattern before writing code
- \`npx typecad-pcb skills get <name> --json\` — detailed patterns and examples
- \`npx typecad-pcb edit connect R1.1 U1.3\` — checked semantic edits to the source
- \`npx typecad-pcb check --json\` — build + unconnected + ERC + DRC in one report
- \`npx typecad-pcb query <subject>\` — inspect the compiled board (nets, pins, power, placement)

Edits are validated against the compiled board before the source is touched, and
build output is deterministic, so you can verify your changes by diffing \`build/\`.

## Skill categories (live from the CLI)

${skillSections}
## npm Scripts

- \`npm run build\` — generate KiCad files from typeCAD source
- \`npm run gerber_viewer\` — board viewer dev server (gerber-viewer serve, http://localhost:4273) that re-exports gerbers and refreshes the page on every \`npm run build\`
- \`npm run add_component\` — add a component interactively
- \`npm run add_package\` — create a reusable component package
- \`npm run kicad-search\` — search KiCad symbol libraries
`,
      );
      logger.log(chalk.green('+'), 'AGENTS.md created for AI tool discoverability');
    } catch (error) {
      throw new Error(`ERROR writing ./${answers.name}/hw/AGENTS.md ${error}`);
    }

    let package_json;
    try {
      package_json = JSON.parse(fs.readFileSync(`${process.cwd()}/${answers.name}/hw/package.json`, 'utf8'));
    } catch (error) {
      throw new Error(`ERROR reading ./${answers.name}/hw/package.json ${error}`);
    }

    package_json.type = 'module';

    package_json.scripts['build'] = `typecad-pcb build`;
    package_json.scripts['gerber_viewer'] = `gerber-viewer serve`;
    package_json.scripts['add_component'] = `typecad-pcb add component`;
    package_json.scripts['add_package'] = `typecad-pcb add package`;
    package_json.scripts['kicad-search'] = `typecad-pcb search`;
    package_json.scripts['import'] = `typecad-pcb import ${path.join('.', 'build', `${answers.name}.kicad_pcb`)} --apply`;
    package_json.scripts['open_board'] = `npx open-cli ./build/${answers.name}.kicad_pcb`;
    package_json.scripts['diff'] = `typecad-pcb diff HEAD ./build/${answers.name}.kicad_pcb`;

    package_json.scripts['docs'] = `typecad-pcb doc ${path.join('.', 'docs', `${answers.name}.md`)} ${path.join(
      '.',
      'build',
      `${answers.name}.kicad_pcb`,
    )}`;

    delete package_json.scripts.test;

    try {
      fs.writeFileSync(`${process.cwd()}/${answers.name}/hw/package.json`, JSON.stringify(package_json, null, 2));
    } catch (error) {
      throw new Error(`ERROR writing ./${answers.name}/hw/package.json ${error}`);
    }

    if (answers.pio) {
      dir = `./${answers.name}/fw`;
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      logger.log(chalk.green('+'), 'Creating pio project in ./fw');
      const installedPIO = runCommand(
        'pio',
        ['project', 'init', '--project-dir', './fw/', '-b', answers.board],
        path.join(process.cwd(), answers.name),
      );
      if (!installedPIO) {
        logger.error(`Error creating PlatformIO project`);
      }
    }

    if (answers.git) {
      dir = `./${answers.name}/fw`;
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      logger.log(chalk.green('+'), 'Initializing git repo ./fw');
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
      fs.writeFileSync(`${process.cwd()}/${answers.name}/hw/docs/${answers.name}.md`, docContent);
      logger.log(chalk.green('+'), 'Documentation template created');
    } catch (error) {
      throw new Error(`ERROR writing ./${answers.name}/hw/docs/${answers.name}.md ${error}`);
    }

    const code_workspace: Record<string, unknown> = {};

    if (answers.pio) {
      code_workspace.folders = [{ path: 'hw' }, { path: 'fw' }];
    } else {
      code_workspace.folders = [{ path: 'hw' }];
    }
    code_workspace.settings = {};

    try {
      fs.writeFileSync(
        `${process.cwd()}/${answers.name}/${answers.name}.code-workspace`,
        JSON.stringify(code_workspace, null, 2),
      );
    } catch (error) {
      throw new Error(`ERROR writing ./${answers.name}.code-workspace ${error}`);
    }

    logger.log(chalk.green('+'), 'Finished');
    logger.log(chalk.green('+'), `Open ${answers.name}.code-workspace in VS Code to get started`);
  } catch (err) {
    if (createdDirs && fs.existsSync(projectRoot)) {
      try {
        fs.rmSync(projectRoot, { recursive: true, force: true });
        logger.log(chalk.yellow('!'), 'Cleaned up partial project:', projectRoot);
      } catch (cleanupErr) {
        logger.error(`Failed to clean up ${projectRoot}. Remove it manually.`);
      }
    }
    logger.error(chalk.red(`Project creation failed: ${(err as Error).message}`));
  }
}
