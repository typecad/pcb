import fs from 'node:fs';
import chalk from 'chalk';
import Handlebars from 'handlebars';
import { basename, join as pathJoin } from 'node:path';

const component_template = `import { Component, Pin } from "@typecad/typecad";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 {{#each pins}}
 | {{{number}}}     | {{{name}}}  | {{{type}}}      |
 {{/each}}
 */
export class {{{name}}} extends Component {
	{{#each pins}}
    {{{name}}} = new Pin(this.reference, {{{number}}}, '{{{type}}}', this);
    {{/each}}
    
    constructor(reference?: string | undefined) {
        super({ reference, footprint: "{{{footprint}}}", symbol: "{{{symbol}}}" });
    }
}`;

export async function create_component(data) {
  const template = Handlebars.compile(component_template);
  const result = template(data);

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
