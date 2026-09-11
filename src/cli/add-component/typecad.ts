import fs from 'node:fs';
import chalk from 'chalk';
import { basename, isAbsolute, join as pathJoin } from 'node:path';
import type { ComponentRenderData, CliPinInfo } from '../types.js';
import logger from '../../utils/logging.js';
import { getBuildDir } from '../../utils/constants.js';

function renderComponent(data: ComponentRenderData) {
  const pinsTableRows = data.pins
    .map((p: CliPinInfo) => ` | ${p.number}     | ${p.name}  | ${p.type}      |`)
    .join('\n');
  const pinProperties = data.pins
    .map((p: CliPinInfo) => `    ${p.name} = this.pin(${p.number}, { type: '${p.type}' });`)
    .join('\n');
  const prefixLine = data.prefix ? `\n        prefix: "${data.prefix}",` : '';
  return `import { Component } from "@typecad/pcb";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
${pinsTableRows}
 */
export class ${data.name} extends Component {
${pinProperties}

    constructor(reference?: string | undefined) {
        super({
            footprint: "${data.footprint}",
            symbol: "${data.symbol}",${prefixLine}
        });
        if (reference) this.reference = reference;
    }
}`;
}

export async function create_component(data: ComponentRenderData) {
  const result = renderComponent(data);

  // make folder structure
  // var dir = `./src/component`;
  // if (!fs.existsSync(dir)) {
  //   fs.mkdirSync(dir, { recursive: true });
  // }

  // The project's build dir honors --outDir/TYPECAD_BUILD_DIR like the rest
  // of the toolchain (an absolute override wins over the folder-relative default).
  const folder = data.folder ?? '.';
  const buildDir = getBuildDir();
  const projectBuildDir = isAbsolute(buildDir) ? buildDir : pathJoin(folder, buildDir);

  // if a symbol file was passed, copy into the project's build lib dir
  if (data.symbol_path) {
    const buildLibPath = pathJoin(projectBuildDir, 'lib');
    if (!fs.existsSync(buildLibPath)) {
      fs.mkdirSync(buildLibPath, { recursive: true });
    }

    fs.copyFileSync(data.symbol_path, pathJoin(buildLibPath, basename(data.symbol_path)));
  }

  // if a footprint file was passed, copy into the project's build lib footprints dir
  if (data.footprint_path) {
    const buildFootprintsPath = pathJoin(projectBuildDir, 'lib', 'footprints');
    if (!fs.existsSync(buildFootprintsPath)) {
      fs.mkdirSync(buildFootprintsPath, { recursive: true });
    }

    fs.copyFileSync(data.footprint_path, pathJoin(buildFootprintsPath, basename(data.footprint_path)));
  }

  try {
    // Create src directory if it doesn't exist
    const srcPath = pathJoin(data.folder ?? '.', 'src');
    if (!fs.existsSync(srcPath)) {
      fs.mkdirSync(srcPath, { recursive: true });
    }

    fs.writeFileSync(pathJoin(srcPath, `${data.name}.ts`), result);

    logger.log(`Finished component creation, use it with:`);
    logger.log(chalk.whiteBright.bold(` import { ${data.name} } from './${data.name}';`));
    logger.log(chalk.whiteBright.bold(` let u1 = new ${data.name}();`));
    logger.log();
    logger.log('Report any component creation issues: https://www.reddit.com/r/typecad/');
    logger.log();
  } catch (error) {
    logger.log(chalk.red(`ERROR - ${error}`));
    return;
  }
}
