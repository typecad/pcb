import fs from 'node:fs';
import chalk from 'chalk';
import { basename, join as pathJoin } from 'node:path';

function renderComponent(data: any) {
    const pinsTableRows = data.pins.map((p: any) => ` | ${p.number}     | ${p.name}  | ${p.type}      |`).join('\n');
    const pinProperties = data.pins.map((p: any) => `    ${p.name} = new Pin(this.reference, ${p.number}, '${p.type}', this);`).join('\n');
    return `import { Component, Pin } from "@typecad/typecad";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
${pinsTableRows}
 */
export class ${data.name} extends Component {
${pinProperties}
    
    constructor(reference?: string | undefined) {
        super({ reference, footprint: "${data.footprint}", symbol: "${data.symbol}" });
    }
}`;
}

export async function create_component(data: any) {
  const result = renderComponent(data);

  // make folder structure
  // var dir = `./src/component`;
  // if (!fs.existsSync(dir)) {
  //   fs.mkdirSync(dir, { recursive: true });
  // }

  // if a symbol file was passed, copy into ./build/lib/
  if (data.symbol_path) {
    const buildLibPath = pathJoin(data.folder, 'build', 'lib');
    if (!fs.existsSync(buildLibPath)) {
      fs.mkdirSync(buildLibPath, { recursive: true });
    }

    fs.copyFileSync(data.symbol_path, pathJoin(buildLibPath, basename(data.symbol_path))); 
  }

  // if a footprint file was passed, copy into ./build/lib/footprints/
  if (data.footprint_path) {
    const buildFootprintsPath = pathJoin(data.folder, 'build', 'lib', 'footprints');
    if (!fs.existsSync(buildFootprintsPath)) {
      fs.mkdirSync(buildFootprintsPath, { recursive: true });
    }

    fs.copyFileSync(data.footprint_path, pathJoin(buildFootprintsPath, basename(data.footprint_path))); 
  }

  try {
    // Create src directory if it doesn't exist
    const srcPath = pathJoin(data.folder, 'src');
    if (!fs.existsSync(srcPath)) {
      fs.mkdirSync(srcPath, { recursive: true });
    }

    fs.writeFileSync(pathJoin(srcPath, `${data.name}.ts`), result);

    console.log(`Finished component creation, use it with:`)
    console.log(chalk.whiteBright.bold(` import { ${data.name} } from './${data.name}';`))
    console.log(chalk.whiteBright.bold(` let u1 = new ${data.name}();`))
    console.log();
    console.log("Report any component creation issues: https://www.reddit.com/r/typecad/");
    console.log();

  } catch (error) {
    console.log(
      chalk.red(`ERROR - ${error}`)
    );
    return;
  }
}
