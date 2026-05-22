import { createRequire } from "node:module";
import type { IComponent } from "../component.js";
import type { ISchematicNode } from "../types/schematic_types.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

export function renderComp(data: IComponent): string {
    const fields: string[] = [];
    if (data.footprint) fields.push(`          (field (name "Footprint") "${data.footprint}")`);
    if (data.datasheet) fields.push(`          (field (name "Datasheet") "${data.datasheet}")`);
    if (data.description) fields.push(`          (field (name "Description") "${data.description}")`);
    if (data.voltage) fields.push(`          (field (name "Voltage") "${data.voltage}")`);
    if (data.wattage) fields.push(`          (field (name "Wattage") "${data.wattage}")`);
    if (data.mpn) fields.push(`          (field (name "MPN") "${data.mpn}")`);
    const fieldsStr = fields.length > 0 ? fields.join('\n') + '\n' : '';
    return `(comp
      (ref "${data.reference}")
        (value "${data.value}")
        (footprint "${data.footprint}")
        (fields
        ${fieldsStr}        )
     )`;
}

export function renderNets(nets: ISchematicNode[]): string {
    return nets.map(net => {
        const nodesStr = net.nodes.map(node =>
            `        (node (ref "${node.reference}") (pin "${node.number}") (pintype "${node.type}"))`
        ).join('\n');
        return `(net (code "${net.code}") (name "${net.name}")
${nodesStr}
)`;
    }).join('\n');
}

export function renderNetlist(data: { components: string[]; nets: string[] }): string {
    const componentsStr = data.components.map(c => `    ${c}`).join('\n');
    const netsStr = data.nets.map(n => `    ${n}`).join('\n');
    return `(export (version "E")
  (design
    (tool "typeCAD ${pkg.version}"))
  (components
${componentsStr})
  (nets
${netsStr}
))
`;
}
