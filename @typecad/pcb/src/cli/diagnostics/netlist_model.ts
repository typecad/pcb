import fs from 'node:fs';
import { parse } from '../../sexpr/index.js';
import { SNode } from '../../sexpr/query.js';

/**
 * Logical (schematic) view parsed from the KiCad netlist a typeCAD build
 * writes to build/<sheet>.net: components with their fields, and every net
 * with its pins including electrical types (`pintype`) and no-connects.
 */

export interface NetlistComponent {
  reference: string;
  value: string;
  footprint: string;
  fields: Record<string, string>;
  /** typeCAD via components: V-prefixed reference with no footprint. */
  isVia: boolean;
}

export interface NetlistNode {
  reference: string;
  pin: string;
  pintype: string;
}

export interface NetlistNet {
  code: number;
  name: string;
  nodes: NetlistNode[];
}

export interface NetlistModel {
  file: string;
  tool: string | null;
  components: NetlistComponent[];
  nets: NetlistNet[];
}

export function buildNetlistModel(netPath: string): NetlistModel {
  const text = fs.readFileSync(netPath, 'utf-8');
  const rootRaw = parse(text);
  const root = SNode.from(rootRaw as unknown as never[]);

  const tool = root.child('design')?.child('tool')?.getString(1) ?? null;

  const components: NetlistComponent[] = [];
  for (const comp of root.child('components')?.children('comp') ?? []) {
    const reference = comp.child('ref')?.getString(1) ?? '';
    const value = comp.child('value')?.getString(1) ?? '';
    const footprint = comp.child('footprint')?.getString(1) ?? '';
    const fields: Record<string, string> = {};
    for (const field of comp.child('fields')?.children('field') ?? []) {
      const key = field.child('name')?.getString(1);
      const val = field.getString(2);
      if (key && val !== null) fields[key] = val;
    }
    components.push({ reference, value, footprint, fields, isVia: /^V\d+$/.test(reference) && !footprint });
  }

  const nets: NetlistNet[] = [];
  for (const net of root.child('nets')?.children('net') ?? []) {
    const name = net.child('name')?.getString(1) ?? '';
    const nodes: NetlistNode[] = [];
    for (const node of net.children('node')) {
      const reference = node.child('ref')?.getString(1) ?? '';
      const pin = node.child('pin')?.getString(1) ?? '';
      if (!reference || !pin) continue;
      nodes.push({ reference, pin, pintype: node.child('pintype')?.getString(1) ?? 'unspecified' });
    }
    nets.push({ code: net.child('code')?.getNumber(1, 0) ?? 0, name, nodes });
  }

  return { file: netPath, tool, components, nets };
}
