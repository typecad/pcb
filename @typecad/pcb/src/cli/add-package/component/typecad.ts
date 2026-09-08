import fs from 'node:fs';
import chalk from 'chalk';
import { basename } from 'node:path';
import type { PackageComponentRenderData, CliPinInfo } from '../../types.js';
import logger from '../../../utils/logging.js';

function renderComponent(data: PackageComponentRenderData) {
  const pinsTableRows = data.pins
    .map((p: CliPinInfo) => ` | ${p.number}     | ${p.name}  | ${p.type}      |`)
    .join('\n');
  const pinProperties = data.pins
    .map((p: CliPinInfo) => `    ${p.name} = this.pin(${p.number}, { type: '${p.type}' });`)
    .join('\n');
  return `import { Component } from "@typecad/pcb";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
${pinsTableRows}
 */
export class ${data.component_name} extends Component {
${pinProperties}
    
    constructor(reference?: string | undefined) {
        super("${data.footprint}");
        this.symbol = "${data.symbol}";
        if (reference) this.reference = reference;
    }
}`;
}

export async function create_component(data: PackageComponentRenderData) {
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
    logger.log(chalk.red(`ERROR - ${error}`));
    return;
  }
}
