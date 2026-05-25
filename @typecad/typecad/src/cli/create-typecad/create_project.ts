import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { execSync } from "node:child_process";

const runCommandQuiet = (command) => {
  try {
    execSync(`${command}`);
  } catch (e) {
    console.error(`Failed executing ${command}`, e);
    return false;
  }
  return true;
};

export function create_project(answers) {
  let dir = `./${answers.name}/hw/build/lib/footprints`;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dir = `./${answers.name}/hw/src`;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dir = `./${answers.name}/hw/.vscode`;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(chalk.green("+"), "Project folders created");

  // make files
  try {
    fs.writeFileSync(
      `./${answers.name}/hw/build/${answers.name}.kicad_pro`,
      ""
    );
  } catch (error) {
    console.log(
      chalk.red(
        `- ERROR creating ./${answers.name}/hw/build/${answers.name}.kicad_pro. ${error}`
      )
    );
    return;
  }

  try {
    fs.writeFileSync(
      `./${answers.name}/hw/build/${answers.name}.kicad_pcb`,
      '(kicad_pcb(version 20240108)(generator "pcbnew")(generator_version "8.0"))'
    );
  } catch (error) {
    console.log(
      chalk.red(
        `- ERROR creating ./hw/build/${answers.name}/${answers.name}.kicad_pcb. ${error}`
      )
    );
    return;
  }

  try {
    fs.writeFileSync(
      `./${answers.name}/hw/build/fp-lib-table`,
      '(fp_lib_table(version 8)(lib (name "lib")(type "KiCad")(uri "${KIPRJMOD}/lib/footprints")(options "")(descr "")))'
    );
  } catch (error) {
    console.log(
      chalk.red(
        `- ERROR creating ./${answers.name}/hw/build/fp-lib-table. ${error}`
      )
    );
    return;
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
// 1. run the npm script '🤖 Build'
// 2. run the npm script 'Open Board ✳️' to edit the board in KiCAD
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
    console.log(
      chalk.red(
        `- ERROR creating ./${answers.name}/src/${answers.name}.ts. ${error}`
      )
    );
    return;
  }
  console.log(chalk.green("+"), "KiCAD project created");

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
    console.log(
      chalk.red(`- ERROR creating ./${answers.name}/hw/typecad.conf.ts. ${error}`)
    );
    return;
  }
  console.log(chalk.green("+"), "typecad.conf.ts created");

  // install npm deps
  const npmInitCommand = `cd ${answers.name}/hw && npm init -y`;
  console.log(chalk.green("+"), "Creating npm package");
  const npmInit = runCommandQuiet(npmInitCommand);
  if (!npmInit) {
    console.error(`Error installing dependencies`);
  }

  const installDepsCommand = `cd ${
    answers.name
  }/hw && npm i tsx @typecad/typecad @typecad/passives ${
    answers.packages.includes("ngspice") ? `@typecad/ngspice` : ""
  } ${answers.packages.includes("graphviz") ? `@typecad/graphviz` : ""} ${
    answers.packages.includes("jlcpcb") ? `@typecad/jlcpcb-export` : ""
  } ${answers.packages.includes("prompt") ? `@typecad/typecad-prompt` : ""} ${
    answers.packages.includes("wiring") ? `@typecad/wiring` : ""} ${
    answers.packages.includes("jlcpcb-parts") ? `@typecad/jlcpcb-parts` : ""
  } ${answers.packages.includes("typecad-mcp") ? `@typecad/typecad-mcp` : ""
  }`;
  console.log(chalk.green("+"), "Installing dependencies");
  const installedDeps = runCommandQuiet(installDepsCommand);
  if (!installedDeps) {
    console.error(`Error installing dependencies`);
  }

  // make a .gitignore file
  try {
    fs.writeFileSync(
      `${process.cwd()}/${answers.name}/hw/.gitignore`,
      "node_modules/"
    );
  } catch (error) {
    console.log(
      chalk.red(`- ERROR writing ./${answers.name}/hw/.gitignore ${error}`)
    );
    return;
  }

  // add scripts to package.json
  let package_json;
  try {
    package_json = JSON.parse(
      fs.readFileSync(
        `${process.cwd()}/${answers.name}/hw/package.json`,
        "utf8"
      )
    );
  } catch (error) {
    console.log(
      chalk.red(`- ERROR reading ./${answers.name}/hw/package.json ${error}`)
    );
    return;
  }

  package_json.type = "module";

  package_json.scripts["build"] = `typecad build`;
  package_json.scripts["add_component"] = `typecad add component`;
  package_json.scripts["add_package"] = `typecad add package`;
  package_json.scripts["kicad-search"] = `typecad search`;
  package_json.scripts["import"] = `typecad import ${path.join(".", "build", `${answers.name}.kicad_pcb`)}`;
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
    console.log(
      chalk.red(`- ERROR writing ./${answers.name}/hw/package.json ${error}`)
    );
    return;
  }

  // typecad.code-snippets
  // let snippets = {
  //   'typeCAD Named Net': {
  //     prefix: '.net',
  //     body: ['.net( { net: ${1}, pins: [${2}] });'],
  //     description: 'typeCAD Named Net',
  //   },
  //   'typeCAD Unnamed Net': {
  //     prefix: '.net',
  //     body: ['.net({ pins: [${1}] });'],
  //     description: 'typeCAD Unnamed Net',
  //   },
  //   'typeCAD Input Net': {
  //     prefix: '.in',
  //     body: ['.in({ net: ${1}, pins: [${2}] });'],
  //     description: 'typeCAD Input Net',
  //   },
  //   'typeCAD Output Net': {
  //     prefix: '.out',
  //     body: ['.out({ net: ${1}, pins: [${2}] });'],
  //     description: 'typeCAD Output Net',
  //   },
  // };
  // try {
  //   fs.writeFileSync(
  //     `${process.cwd()}/${answers.name}/hw/.vscode/typecad.code-snippets`,
  //     JSON.stringify(snippets, null, 2)
  //   );
  // } catch (error) {
  //   console.log(
  //     chalk.red(
  //       `- ERROR writing ./${answers.name}/hw/.vscode/typecad.code-snippets ${error}`
  //     )
  //   );
  //   return;
  // }

  if (answers.pio) {
    dir = `./${answers.name}/fw`;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    console.log(chalk.green("+"), "Creating pio project in ./fw");
    const installPIOCommand = `cd ${answers.name} && pio project init --project-dir ./fw/ -b ${answers.board}`;
    const installedPIO = runCommandQuiet(installPIOCommand);
    if (!installedPIO) {
      console.error(`Error creating PlatformIO project`);
    }
  }

  if (answers.git) {
    dir = `./${answers.name}/fw`;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    console.log(chalk.green("+"), "Initializing git repo ./fw");
    const installGitCommand = `cd ${answers.name} && git init`;
    const installedGit = runCommandQuiet(installGitCommand);
    if (!installedGit) {
      console.error(`Error initializing git repo`);
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
    console.log(chalk.green("+"), "Documentation template created");
  } catch (error) {
    console.log(
      chalk.red(
        `- ERROR writing ./${answers.name}/hw/docs/${answers.name}.md ${error}`
      )
    );
    return;
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
    console.log(
      chalk.red(`- ERROR writing ./${answers.name}.code-workspace ${error}`)
    );
    return;
  }

  console.log(chalk.green("+"), "Finished");
  console.log(
    chalk.green("+"),
    `Open ${answers.name}.code-workspace in VS Code to get started`
  );
}

// module.exports = {
//   create_project,
// };
