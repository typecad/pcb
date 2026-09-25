import fs from 'node:fs';
import chalk from 'chalk';
import type { PackageRenderData } from '../../types.js';
import logger from '../../../utils/logging.js';

function renderComponent(data: PackageRenderData) {
  const componentImport = data.component_name
    ? `\nimport { ${data.component_name} } from './${data.component_name}';`
    : '';
  const declareU1 = data.component_name ? `    declare ${data.component_name}: ${data.component_name};\n` : '';
  const initU1 = data.component_name
    ? `        this.${data.component_name} = new ${data.component_name}(this.reference);\n        this.${data.component_name}.pcb = { x: 0, y: 0, rotation: 0 };\n\n`
    : '';
  return `import { Package, PackageOptions, Component } from '@typecad/pcb';${componentImport}

/**
 * ### ${data.package_name_pascal} - Description
 *
 * #### Input Connections
 *
 * #### Output Connections
 *
 */
export class ${data.package_name_pascal} extends Package {
${declareU1}    declare r1: Component;

    build(options: PackageOptions) {
${initU1}        // Passives
        this.r1 = new this.passives.Resistor({ value: '10k' });

        // Nets
        // this.net(this.U1.pin(1), this.r1.pin(1));

        // Vias
        // let v1 = this.via({ x: 0, y: 0 });

        // Tracks
        // this.add(this.track().from({ x: 0, y: 0 }).to({ x: 1, y: 1, layer: 'F.Cu', width: 0.2 }));
    }
}
`;
}

function renderPackageJson(data: PackageRenderData) {
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
    "@typecad/pcb": "^1.0.0-alpha.0"
  },
  "scripts": {
    "package_publish": "npm publish --access public"
  }
}`;
}

export async function create_package(data: PackageRenderData) {
  const pascal_package_name = data.package_name.charAt(0).toUpperCase() + data.package_name.slice(1);
  const enriched_data = { ...data, package_name_pascal: pascal_package_name };

  const result = renderComponent(enriched_data);
  const package_json = renderPackageJson(data);

  const dir = data.package_name;
  if (!fs.existsSync(`${data.folder}/${dir}`)) {
    fs.mkdirSync(`${data.folder}/${dir}/build/lib/footprints`, { recursive: true });
  }

  try {
    fs.writeFileSync(`${data.folder}/${data.package_name}/index.ts`, result);
    fs.writeFileSync(`${data.folder}/${data.package_name}/package.json`, package_json);
    fs.writeFileSync(
      `${data.folder}/${data.package_name}/build/lib/README`,
      "Files placed in this folder are synced into the typeCAD project's ./build/lib/ directory automatically whenever a Package that uses them is constructed during a build. No install script is required.",
    );

    logger.log(`Finished package creation. You can use it like this:`);
    logger.log(
      chalk.whiteBright.bold(`
import { PCB } from '@typecad/pcb'
import { ${pascal_package_name} } from "./${data.package_name}";

let typecad = new PCB('board_name');

let u1 = new ${pascal_package_name}({ pcb: typecad, x: 0, y: 0, name: '${data.package_name}' });

typecad.create(u1.components);
`),
    );
    logger.log();
    logger.log('Report any creation issues: https://www.reddit.com/r/typecad/');
    logger.log();
  } catch (error) {
    logger.log(chalk.red(`ERROR - ${error}`));
    return;
  }
}
