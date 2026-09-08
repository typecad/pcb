import { Component } from '../component.js';
import type { ISchematicNode } from '../types/schematic_types.js';
import chalk from 'chalk';

function getComponentIcon(component: Component): string {
  if (component.via) return '🕳️ ';
  if (component.reference?.startsWith('C')) return '🪫 ';
  if (component.reference?.startsWith('R')) return '💈';
  if (component.reference?.startsWith('L')) return '🌀';
  if (component.reference?.startsWith('SW')) return '🔳 ';
  if (component.reference?.startsWith('LED')) return '🚨 ';
  if (component.reference?.startsWith('D')) return '🔺 ';
  if (component.reference?.startsWith('U')) return '칩';
  if (component.reference?.startsWith('F')) return '🔗 ';
  if (component.reference?.startsWith('J')) return '🔌 ';
  if (component.reference?.startsWith('TP')) return '🎯 ';
  if (component.reference?.startsWith('Y')) return '💎 ';
  return '◼️ ';
}

function formatComponentDisplay(component: Component, nodes: ISchematicNode[]): string {
  const icon = getComponentIcon(component);
  let display = `${icon} ${component.reference}`;

  if (component.value) {
    display += `: ${component.value}`;
  }

  if (component.description) {
    display += ` (${component.description})`;
  }

  if (component.via) {
    const netName = nodes.find((net) => net.nodes.some((pin) => pin.uuid === component.uuid))?.name;
    if (netName) {
      display += ` (Net: '${netName}')`;
    }
  }

  return display;
}

/** @internal */
export function buildProjectTree(
  groupedComponents: Map<string, Component[]>,
  nodes: ISchematicNode[],
  sheetName: string,
): string {
  const lines: string[] = [];
  lines.push(
    chalk.green.bold(' ╦ ') + chalk.whiteBright.bold('type') + 'CAD Project: ' + chalk.whiteBright.bold(sheetName),
  );
  lines.push('└── 📂 Groups');

  const sortedGroups = Array.from(groupedComponents.keys()).sort();

  sortedGroups.forEach((group, groupIndex) => {
    const components = groupedComponents.get(group) || [];
    const isLastGroup = groupIndex === sortedGroups.length - 1;
    const groupPrefix = isLastGroup ? '    └── ' : '    ├── ';

    lines.push(`${groupPrefix}📦 ${group}`);

    components.forEach((component, compIndex) => {
      const isLastComponent = compIndex === components.length - 1;
      const compPrefix = isLastGroup ? '        ' : '    │   ';
      const compConnector = isLastComponent ? '└── ' : '├── ';
      lines.push(`${compPrefix}${compConnector}${formatComponentDisplay(component, nodes)}`);
    });
  });

  return lines.join('\n') + '\n';
}
