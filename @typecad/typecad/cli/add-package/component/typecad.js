import fs from 'node:fs';
import chalk from 'chalk';
import Handlebars from 'handlebars';
import { basename } from 'node:path';

const component_template = `import { Component, Pin } from "@typecad/typecad";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 {{#each pins}}
 | {{{number}}}     | {{{name}}}  | {{{type}}}      |
 {{/each}}
 */
export class {{{component_name}}} extends Component {
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
    const dir = data.package_name;
    if (!fs.existsSync(`${data.folder}/${dir}`)) {
      fs.mkdirSync(`${data.folder}/${dir}/build/lib/footprints`, { recursive: true });
    }

  // if a symbol file was passed, copy into ./build/lib/
  if (data.symbol_path) {
    fs.copyFileSync(data.symbol_path, `${data.folder}/${dir}/build/lib/` + basename(data.symbol_path)); 
  }

  // if a footprint file was passed, copy into ./build/lib/footprints/
  if (data.footprint_path) {
    fs.copyFileSync(data.footprint_path, `${data.folder}/${dir}/build/lib/footprints/` + basename(data.footprint_path)); 
  }

  try {
    fs.writeFileSync(`${data.folder}/${data.package_name}/${data.component_name}.ts`, result);

    console.log(`Finished component creation, use it with:`)
    console.log(chalk.whiteBright.bold(` import { ${data.component_name} } from './${data.component_name}';`))
    console.log(chalk.whiteBright.bold(` let u1 = new ${data.component_name}();`))
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
