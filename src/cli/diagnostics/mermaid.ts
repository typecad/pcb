import type { DiagnosticsReport, NetEntry } from './report.js';

/**
 * Mermaid diagram generators for the diagnostics report. All functions
 * return bare mermaid source (no code fences) and '' when there is nothing
 * to draw. Node ids are positional (c0, n0, ...) so arbitrary reference and
 * net names never break the diagram; labels are quoted and escaped.
 */

const DRIVER_TYPES = new Set(['output', 'power_out']);
const INPUT_TYPES = new Set(['input', 'power_in']);

/** Escape text for use inside mermaid double-quoted labels. */
function esc(label: string): string {
  return label.replace(/\\/g, '\\\\').replace(/"/g, '#quot;').replace(/\r?\n/g, ' ');
}

function trunc(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

const GROUP_LABELS: Record<string, string> = {
  R: 'Resistors',
  C: 'Capacitors',
  L: 'Inductors',
  D: 'Diodes',
  Q: 'Transistors',
  U: 'Integrated Circuits',
  J: 'Connectors',
  P: 'Connectors',
  CN: 'Connectors',
  SW: 'Switches',
  Y: 'Crystals',
  X: 'Crystals',
  F: 'Fuses',
  FB: 'Ferrite Beads',
  BT: 'Batteries',
  TP: 'Test Points',
  MH: 'Mounting Holes',
  K: 'Relays',
  T: 'Transformers',
  VR: 'Regulators',
  V: 'Regulators',
  LED: 'LEDs',
};

export function groupOf(reference: string): { prefix: string; label: string } {
  const match = reference.match(/^[A-Za-z]+/);
  const prefix = match ? match[0]! : ref0(reference) || 'other';
  return { prefix, label: GROUP_LABELS[prefix] ?? prefix };
}

function ref0(reference: string): string {
  return reference.replace(/[^A-Za-z]/g, '');
}

function componentLabel(reference: string, value: string): string {
  const v = value.trim();
  return v ? `${reference}: ${trunc(v, 24)}` : reference;
}

interface GraphNode {
  id: string;
  label: string;
  group: string;
  groupLabel: string;
}

/**
 * Shared builder for component↔net flowcharts (used for the full net
 * connectivity graph and the power-only subgraph).
 */
function buildNetGraph(report: DiagnosticsReport, nets: NetEntry[], title: string): string {
  if (report.components.length === 0 && nets.length === 0) return '';

  const lines: string[] = [`%% ${title}`, 'flowchart LR'];
  lines.push('  classDef comp fill:#e1f5fe,stroke:#0288d1,color:#01579b;');
  lines.push('  classDef net fill:#fff9c4,stroke:#fbc02d,color:#333;');
  lines.push('  classDef power fill:#ffcdd2,stroke:#d32f2f,color:#7f0000;');

  // Component nodes grouped by reference prefix
  const nodes = new Map<string, GraphNode>();
  const groups = new Map<string, GraphNode[]>();
  report.components.forEach((comp, i) => {
    const { prefix, label: groupLabel } = groupOf(comp.reference);
    const node: GraphNode = { id: `c${i}`, label: componentLabel(comp.reference, comp.value), group: prefix, groupLabel };
    nodes.set(comp.reference.toUpperCase(), node);
    const list = groups.get(prefix) ?? [];
    list.push(node);
    groups.set(prefix, list);
  });

  let sg = 0;
  for (const [prefix, groupNodes] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const label = groupNodes[0]!.groupLabel;
    lines.push(`  subgraph SG${sg}["${esc(label)} (${prefix})"]`);
    for (const node of groupNodes.sort((a, b) => a.label.localeCompare(b.label))) {
      lines.push(`    ${node.id}["${esc(node.label)}"]:::comp`);
    }
    lines.push('  end');
    sg++;
  }

  // Net nodes
  const netIds = new Map<string, string>();
  nets.forEach((net, i) => {
    const id = `n${i}`;
    netIds.set(net.name, id);
    const cls = net.power ? 'power' : 'net';
    lines.push(`  ${id}("${esc(net.name)}"):::${cls}`);
  });

  // Edges: one per pin, direction from the pin's electrical type
  const edge = (compId: string, netId: string, pin: string, pintype: string): void => {
    const label = `|"${esc(pin)}"|`;
    if (DRIVER_TYPES.has(pintype)) lines.push(`  ${compId} -->${label} ${netId}`);
    else if (INPUT_TYPES.has(pintype)) lines.push(`  ${netId} -->${label} ${compId}`);
    else if (pintype === 'bidirectional' || pintype === 'tri_state') lines.push(`  ${compId} <-->${label} ${netId}`);
    else if (pintype === 'no_connect') lines.push(`  ${compId} x--x${label} ${netId}`);
    else lines.push(`  ${compId} ---${label} ${netId}`);
  };

  for (const net of nets) {
    const netId = netIds.get(net.name)!;
    for (const pin of net.pins) {
      const compId = nodes.get(pin.reference.toUpperCase())?.id;
      if (!compId) continue; // via/unknown reference — not a graph node
      edge(compId, netId, pin.pin, pin.pintype);
    }
  }

  return lines.join('\n');
}

export function netConnectivityGraph(report: DiagnosticsReport): string {
  return buildNetGraph(report, report.nets, 'Net connectivity: components ↔ nets (edge label = pin number; arrow = signal direction from pin type)');
}

export function powerDistributionGraph(report: DiagnosticsReport): string {
  const powerNets = report.nets.filter((n) => n.power);
  if (powerNets.length === 0) return '';
  return buildNetGraph(report, powerNets, 'Power distribution: power rails and their consumers');
}

const CLUSTER_COLORS = ['#e8f5e9', '#e3f2fd', '#fce4ec', '#f3e5f5', '#fff8e1', '#e0f2f1'];

export function clustersGraph(report: DiagnosticsReport): string {
  const clusters = report.clusters.filter((c) => c.members.length >= 2);
  if (clusters.length === 0) return '';

  const lines: string[] = ['%% Connectivity clusters: components joined by shared nets (islands need no connection between them)', 'flowchart LR'];
  CLUSTER_COLORS.forEach((fill, i) => {
    lines.push(`  classDef k${i} fill:${fill},stroke:#607d8b,color:#263238;`);
  });

  // Positional ids keep arbitrary references out of mermaid's id grammar
  const ids = new Map<string, string>();
  report.components.forEach((comp, i) => ids.set(comp.reference.toUpperCase(), `c${i}`));

  clusters.forEach((cluster, ci) => {
    const cls = `k${ci % CLUSTER_COLORS.length}`;
    for (const member of cluster.members) {
      const id = ids.get(member.toUpperCase());
      if (!id) continue;
      lines.push(`  ${id}["${esc(member)}"]:::${cls}`);
    }
  });

  // Chain members of each shared net so edge count stays linear per net
  for (const net of report.nets) {
    const members = [...new Set(net.pins.filter((p) => p.pintype !== 'no_connect').map((p) => p.reference.toUpperCase()))]
      .map((ref) => ids.get(ref))
      .filter((ref): ref is string => ref !== undefined);
    if (members.length < 2) continue;
    const sorted = [...members].sort();
    const label = `|"${esc(net.name)}"|`;
    for (let i = 1; i < sorted.length; i++) {
      lines.push(`  ${sorted[i - 1]!} ---${label} ${sorted[i]!}`);
    }
  }

  return lines.join('\n');
}

export function componentsPie(report: DiagnosticsReport): string {
  const counts = new Map<string, { label: string; prefix: string; count: number }>();
  for (const comp of report.components) {
    const { prefix, label } = groupOf(comp.reference);
    const entry = counts.get(prefix) ?? { label, prefix, count: 0 };
    entry.count++;
    counts.set(prefix, entry);
  }
  if (counts.size === 0) return '';
  const lines: string[] = ['pie showData', '  title Components by group'];
  for (const { label, prefix, count } of [...counts.values()].sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix))) {
    lines.push(`  "${esc(label)} (${prefix})" : ${count}`);
  }
  return lines.join('\n');
}
