import type { ComponentInit } from '../component.js';
import type { ISchematicNode } from '../types/schematic_types.js';
import { escapeSexprString } from '../sexpr/escape.js';

export function renderComp(data: ComponentInit): string {
  const fields: string[] = [];
  if (data.footprint) fields.push(`          (field (name "Footprint") "${escapeSexprString(data.footprint)}")`);
  if (data.datasheet) fields.push(`          (field (name "Datasheet") "${escapeSexprString(data.datasheet)}")`);
  if (data.description) fields.push(`          (field (name "Description") "${escapeSexprString(data.description)}")`);
  if (data.voltage) fields.push(`          (field (name "Voltage") "${escapeSexprString(data.voltage)}")`);
  if (data.wattage) fields.push(`          (field (name "Wattage") "${escapeSexprString(data.wattage)}")`);
  if (data.mpn) fields.push(`          (field (name "MPN") "${escapeSexprString(data.mpn)}")`);
  const fieldsStr = fields.length > 0 ? fields.join('\n') + '\n' : '';
  return `(comp
      (ref "${escapeSexprString(String(data.reference ?? ''))}")
        (value "${escapeSexprString(String(data.value ?? ''))}")
        (footprint "${escapeSexprString(data.footprint ?? '')}")
        (fields
        ${fieldsStr}        )
     )`;
}

export function renderNets(nets: ISchematicNode[]): string {
  return nets
    .map((net) => {
      const nodesStr = net.nodes
        .map(
          (node) =>
            `        (node (ref "${escapeSexprString(node.reference)}") (pin "${escapeSexprString(node.number)}") (pintype "${escapeSexprString(node.type)}"))`,
        )
        .join('\n');
      return `(net (code "${net.code}") (name "${escapeSexprString(net.name)}")
${nodesStr}
)`;
    })
    .join('\n');
}

export function renderNetlist(data: { components: string[]; nets: string[] }): string {
  const componentsStr = data.components.map((c) => `    ${c}`).join('\n');
  const netsStr = data.nets.map((n) => `    ${n}`).join('\n');
  return `(export (version "E")
  (design
    (tool "typeCAD"))
  (components
${componentsStr})
  (nets
${netsStr}
))
`;
}
