import fs from 'node:fs';
import chalk from 'chalk';

function renderComponent(data) {
    const componentImport = data.component_name ? `\nimport { ${data.component_name} } from './${data.component_name}';` : '';
    const declareU1 = data.component_name ? `\n    declare U1: ${data.component_name};` : '';
    const initU1 = data.component_name ? `\n        this.U1 = new ${data.component_name}(reference);` : '';
    const pushU1 = data.component_name ? `\n        this.components.push(this.U1);\n        this.pcb.group('${data.component_name}', this.U1);` : '';
    return `import * as _0603 from '@typecad/passives/0603';
import { PCB, TrackBuilder, Component } from '@typecad/typecad';${componentImport}

export interface ${data.package_name_pascal}Options {
    reference?: string;
    passives?: typeof _0603;
    pcb: PCB;
    x: number;
    y: number;
}

/**
 * ### ${data.package_name_pascal} - Description
 * 
 * #### Input Connections
 * 
 * #### Output Connections
 * 
 */
export class ${data.package_name_pascal} {
    #passives: typeof _0603;
    readonly pcb: PCB;
    readonly components: (Component | TrackBuilder)[] = [];${declareU1}

    constructor({ reference, passives, pcb, x, y }: ${data.package_name_pascal}Options) {
        this.#passives = passives || _0603;
        this.pcb = pcb;

        // Push offset to PCB for tracks and vias
        this.pcb.pushOffset(x, y);

        // create the components${initU1}

        // connect the components
        // this.pcb.net(this.U1.pin(1), this.U2.pin(2));

        // create the tracks

        // add the components to the pcb and group them${pushU1}

        // Restore the previous origin
        this.pcb.popOffset();
    }
}`;
}

function renderPackageJson(data) {
    return `{
  "name": "${data.package_name}",
  "version": "1.0.0",
  "description": "${data.package_name} typeCAD package",
  "main": "index.ts",
  "type": "module",
  "author": "",
  "license": "ISC",
  "keywords": ["typeCAD", "package"],
  "devDependencies": {
    "tsx": "^4.19.1"
  },
  "peerDependencies": {
    "@typecad/passives": "~0.1.0",
    "@typecad/typecad": "~0.1.0"
  },
  "scripts": {
    "postinstall": "node postinstall.js"
  }
}`;
}

const postinstall_template = `import fs from 'node:fs';

const package_json = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

fs.cp(
  process.env.INIT_CWD + \`/node_modules/\${package_json.name}/build\`,
  process.env.INIT_CWD + '/build',
  { recursive: true },
  (err) => {
    if (err) {
      console.error(err);
    }
  }
);`

export async function create_package(data) {
  const pascal_package_name = data.package_name.charAt(0).toUpperCase() + data.package_name.slice(1);
  const enriched_data = { ...data, package_name_pascal: pascal_package_name };

  const result = renderComponent(enriched_data);
  const package_json = renderPackageJson(data);
  const postinstall = postinstall_template;

  // make folder structure
  const dir = data.package_name;
  if (!fs.existsSync(`${data.folder}/${dir}`)) {
    fs.mkdirSync(`${data.folder}/${dir}/build/lib/footprints`, { recursive: true });
  }

  try {
    fs.writeFileSync(`${data.folder}/${data.package_name}/index.ts`, result);
    fs.writeFileSync(`${data.folder}/${data.package_name}/package.json`, package_json);
    fs.writeFileSync(`${data.folder}/${data.package_name}/postinstall.js`, postinstall);
    fs.writeFileSync(`${data.folder}/${data.package_name}/build/lib/README`, 'Files placed in this folder will be copied to the typeCAD project folder structure on npm install.');

    console.log(`Finished package creation! You can use it like this:`);
    console.log(chalk.whiteBright.bold(`
import { PCB } from '@typecad/typecad'
import { ${pascal_package_name} } from "./${data.package_name}";

let typecad = new PCB('board_name');

let u1 = new ${pascal_package_name}({ pcb: typecad, x: 0, y: 0 });

typecad.create(...u1.components);
`));
    console.log();
    console.log("Report any creation issues: https://www.reddit.com/r/typecad/");
    console.log();

  } catch (error) {
    console.log(
      chalk.red(`ERROR - ${error}`)
    );
    return;
  }
}
