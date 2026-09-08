import { Component } from '../component.js';
import fs from 'node:fs';
import logger from '../utils/logging.js';
import type { BomField } from '../schematic.js';
import { DEFAULT_BUILD_DIR } from '../utils/constants.js';

export function generateBom(
  components: Component[],
  sheetName: string,
  options: { bom_fields: BomField[]; bom_separator: string },
  outputFolder?: string,
): boolean {
  let bom = '';
  const _output_folder = outputFolder || DEFAULT_BUILD_DIR;

  bom += options.bom_fields.join(options.bom_separator) + '\n';

  components.forEach((component) => {
    if (component.via) {
      return;
    }

    const fields = options.bom_fields.map((field) => {
      switch (field.toLowerCase()) {
        case 'reference':
          return component.reference;
        case 'value':
          return component.value;
        case 'datasheet':
          return component.datasheet;
        case 'footprint':
          return component.footprint;
        case 'mpn':
          return component.mpn;
        case 'description':
          return component.description;
        case 'voltage':
          return component.voltage;
        case 'wattage':
          return component.wattage;
        default:
          return '';
      }
    });
    bom += fields.join(options.bom_separator) + '\n';
  });

  try {
    fs.writeFileSync(`${_output_folder}/${sheetName}.csv`, bom);
    return true;
  } catch (err) {
    logger.error(err);
    return false;
  }
}
