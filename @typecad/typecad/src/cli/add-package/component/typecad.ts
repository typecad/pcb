import fs from 'node:fs';
import chalk from 'chalk';
import { basename } from 'node:path';

function renderComponent(data: any) {
    const pinsTableRows = data.pins.map((p: any) => ` | ${p.number}     | ${p.name}  | ${p.type}      |`).join('\n');
    const pinProperties = data.pins.map((p: any) => `    ${p.name} = new Pin(this.reference, ${p.number}, '${p.type}', this);`).join('\n');
    return `import { Component, Pin } from "@typecad/typecad";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
${pinsTableRows}
 */
export class ${data.component_name} extends Component {
${pinProperties}
    
    constructor(reference?: string | undefined) {
        super({ reference, footprint: "${data.footprint}", symbol: "${data.symbol}" });
    }
}`;
}

export async function create_component(data: any) {
  const result = renderComponent(data);

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



  } catch (error) {
    console.log(
      chalk.red(`ERROR - ${error}`)
    );
    return;
  }
}
