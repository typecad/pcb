import path from 'node:path';
import type { CheckStep, DiagnosticsReport } from './report.js';
import { clustersGraph, componentsPie, netConnectivityGraph, powerDistributionGraph } from './mermaid.js';

/**
 * Renders the DiagnosticsReport as GitHub-flavored markdown with embedded
 * mermaid diagrams — viewable directly in VSCode's markdown preview.
 */

/** A path shown project-relative (forward slashes) when it sits under cwd. */
function displayPath(p: string): string {
  const abs = path.resolve(p);
  const rel = path.relative(process.cwd(), abs);
  const shown = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : abs;
  return shown.replace(/\\/g, '/');
}

/** Escape a value for use inside a markdown table cell. */
function cell(value: unknown): string {
  if (value === undefined || value === null) return '—';
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function fence(mermaid: string): string {
  return mermaid === '' ? '' : ['```mermaid', mermaid, '```'].join('\n');
}

function boardName(report: DiagnosticsReport): string {
  const { boardFile, schematicFile, netlistFile } = report.metadata;
  const source = boardFile ?? schematicFile ?? netlistFile;
  if (!source) return 'untitled';
  const base = source.split(/[\\/]/).pop() ?? 'untitled';
  return base.replace(/\.(kicad_pcb|kicad_sch|net)$/, '');
}

function routeStatus(report: DiagnosticsReport, netName: string): string {
  const net = report.nets.find((n) => n.name === netName);
  if (!net || net.routed === null || net.routed === undefined) return '—';
  if (net.routed) return net.pourAssisted ? '✓ routed (pour)' : '✓ routed';
  return `✖ ${net.pinsConnected ?? 0}/${net.pinsTotal ?? '?'} pins`;
}

function checkStepStatus(step: CheckStep): string {
  if (!step.ran) {
    return step.reason === 'skipped' ? '– skipped' : `⚠ ${step.reason ?? 'unavailable'}`;
  }
  const parts: string[] = [];
  parts.push(step.errors > 0 ? `✖ ${step.errors} error${step.errors > 1 ? 's' : ''}` : '✓ 0 errors');
  if (step.warnings > 0) parts.push(`⚠ ${step.warnings} warning${step.warnings > 1 ? 's' : ''}`);
  if ('unconnectedItems' in step && (step.unconnectedItems ?? 0) > 0) {
    parts.push(`⚠ ${step.unconnectedItems} unconnected item${step.unconnectedItems! > 1 ? 's' : ''}`);
  }
  return parts.join(', ');
}

export function renderMarkdown(report: DiagnosticsReport): string {
  const out: string[] = [];
  const m = report.metadata;
  const s = report.summary;

  // ── Header ────────────────────────────────────────────────────────────────
  out.push(`# PCB Diagnostics — ${boardName(report)}`, '');
  for (const [label, value] of [
    ['Board', m.boardFile],
    ['Schematic', m.schematicFile],
    ['Netlist', m.netlistFile],
    ['Entry', m.entry],
  ] as const) {
    if (value) out.push(`> **${label}:** \`${displayPath(value)}\``);
  }
  out.push(`> **Tool:** ${m.tool} v${m.version} | **Generated:** ${m.generatedAt}`);
  out.push('', '---', '');

  // ── Project Summary ───────────────────────────────────────────────────────
  out.push('## Project Summary', '');
  out.push('| Metric | Value |', '| :--- | :--- |');
  out.push(`| **Components** | ${s.components}${s.vias > 0 ? ` (+${s.vias} vias)` : ''} |`);
  out.push(`| **Nets** | ${s.nets} (${s.powerNets} power) |`);
  out.push(
    `| **Pins** | ${s.pins} — ${s.connectedPins} connected, ${s.unconnectedPins} unconnected, ${s.dncPins} no-connect |`,
  );
  out.push(
    `| **Routing** | ${s.routedNets} routed, ${s.unroutedNets} unrouted, ${s.unknownRoutingNets} unknown (${s.totalRoutedLengthMm} mm total) |`,
  );
  if (s.boardOutlineMm) out.push(`| **Board outline** | ${s.boardOutlineMm.width} × ${s.boardOutlineMm.height} mm |`);
  if (s.copperLayers.length > 0) out.push(`| **Copper layers** | ${s.copperLayers.join(', ')} |`);
  if (s.zones > 0 || s.keepouts > 0) out.push(`| **Zones** | ${s.zones} pours, ${s.keepouts} keepouts |`);
  const statusBits = [checkStepStatus(report.erc), checkStepStatus(report.drc)];
  out.push(`| **ERC** | ${cell(statusBits[0])} |`);
  out.push(`| **DRC** | ${cell(statusBits[1])} |`);
  out.push('', '---', '');

  // ── Components (BOM) ──────────────────────────────────────────────────────
  out.push('## Components (BOM)', '');
  if (report.components.length === 0) {
    out.push('_No components found._', '');
  } else {
    const pie = fence(componentsPie(report));
    if (pie) out.push(pie, '');
    out.push('| Reference | Value | Footprint | Pads | Nets | MPN | Datasheet |', '| :--- | :--- | :--- | :-: | :-: | :--- | :--- |');
    for (const c of report.components) {
      out.push(
        `| ${cell(c.reference)} | ${cell(c.value)} | ${cell(c.footprint)} | ${cell(c.padCount)} | ${c.netCount} | ${cell(c.mpn)} | ${cell(c.datasheet ? `[datasheet](${c.datasheet})` : undefined)} |`,
      );
    }
    const described = report.components.filter((c) => c.description);
    if (described.length > 0) {
      out.push('');
      for (const c of described) out.push(`- **${c.reference}** — ${cell(c.description)}`);
    }
    out.push('');
  }
  out.push('---', '');

  // ── Nets & Connections ────────────────────────────────────────────────────
  out.push('## Nets & Connections', '');
  if (report.nets.length === 0) {
    out.push('_No nets found._', '');
  } else {
    out.push('### Net List', '');
    out.push(
      '| Net | Pins | Members | Copper |',
      '| :--- | :-: | :--- | :--- |',
    );
    for (const net of report.nets) {
      const members = net.pins.map((p) => (p.pintype === 'no_connect' ? `${p.reference}.${p.pin} ⛔` : `${p.reference}.${p.pin}`)).join(', ');
      const flags = [net.power ? '⏦ power' : null].filter(Boolean).join(', ');
      out.push(
        `| ${cell(net.name)}${flags ? ` (${flags})` : ''} | ${net.pins.length} | ${cell(members)} | ${cell(routeStatus(report, net.name))} |`,
      );
    }
    out.push('');
  }

  out.push('### Pin Map', '');
  out.push('> Every pin of every component and the net it belongs to (⛔ = intentional no-connect, ⚠ = unconnected).', '');
  if (report.pinMap.length === 0) {
    out.push('_No pin data available._', '');
  } else {
    out.push('| Component | Pin | Type | Net |', '| :--- | :--- | :--- | :--- |');
    for (const comp of report.pinMap) {
      for (const pin of comp.pins) {
        const net = pin.dnc ? `⛔ ${cell(pin.net)} (DNC)` : pin.net !== null ? cell(pin.net) : '⚠ _unconnected_';
        out.push(`| ${cell(comp.reference)} | ${cell(pin.pin)} | ${cell(pin.pintype)} | ${net} |`);
      }
    }
    out.push('');
  }
  out.push('---', '');

  // ── Unconnected & No-Connect ─────────────────────────────────────────────
  out.push('## Unconnected Pins & No-Connects', '');
  const u = report.unconnected;
  if (u.pads.length === 0 && u.singlePinNets.length === 0 && u.dncPins.length === 0) {
    out.push('✅ Everything is connected.', '');
  } else {
    if (u.pads.length > 0) {
      out.push(`**Pads with no net (${u.pads.length}):**`, '');
      out.push('| Reference | Pad | Pad type |', '| :--- | :--- | :--- |');
      for (const p of u.pads) out.push(`| ${cell(p.reference)} | ${cell(p.pad)} | ${cell(p.type)} |`);
      out.push('');
    }
    if (u.singlePinNets.length > 0) {
      out.push(`**Single-pin nets (${u.singlePinNets.length}) — likely forgotten connections:**`, '');
      for (const n of u.singlePinNets) out.push(`- ${cell(n)}`);
      out.push('');
    }
    if (u.dncPins.length > 0) {
      out.push(`**Intentional no-connects (${u.dncPins.length}):**`, '');
      for (const d of u.dncPins) out.push(`- ${cell(d.reference)}.${cell(d.pin)} on ${cell(d.net)}`);
      out.push('');
    }
  }
  out.push('---', '');

  // ── Graphs ────────────────────────────────────────────────────────────────
  out.push('## Graphs', '');
  const netGraph = fence(netConnectivityGraph(report));
  if (netGraph) out.push('### Net Connectivity', '', netGraph, '');
  const clusterGraph = fence(clustersGraph(report));
  if (clusterGraph) out.push('### Connectivity Clusters', '', '> Each island is a group of components joined by shared nets.', '', clusterGraph, '');
  const powerGraph = fence(powerDistributionGraph(report));
  if (powerGraph) out.push('### Power Distribution', '', powerGraph, '');
  out.push('---', '');

  // ── Electrical checks ─────────────────────────────────────────────────────
  out.push('## Electrical Checks', '');
  out.push('> Derived from pin types in the netlist (a lightweight ERC before the real one).', '');
  if (report.electrical.length === 0) {
    out.push('✅ No electrical issues found.', '');
  } else {
    out.push('| Severity | Check | Net | Detail |', '| :--- | :--- | :--- | :--- |');
    const icons: Record<string, string> = { error: '✖ error', warning: '⚠ warning', info: 'ℹ info' };
    const order = { error: 0, warning: 1, info: 2 } as const;
    for (const f of [...report.electrical].sort((a, b) => order[a.severity] - order[b.severity])) {
      out.push(`| ${icons[f.severity]} | ${cell(f.check)} | ${cell(f.net)} | ${cell(f.message)} |`);
    }
    out.push('');
  }
  out.push('---', '');

  // ── ERC / DRC ─────────────────────────────────────────────────────────────
  out.push('## ERC Report', '', `- ${checkStepStatus(report.erc)}`, '');
  if (report.erc.ran && report.erc.violations.length > 0) out.push(violationsTable(report.erc.violations), '');
  out.push('## DRC Report', '', `- ${checkStepStatus(report.drc)}`, '');
  if (report.drc.ran && report.drc.violations.length > 0) out.push(violationsTable(report.drc.violations), '');
  out.push('---', '');

  // ── Routing & zones ───────────────────────────────────────────────────────
  const routedNets = report.nets.filter((n) => n.routed !== null);
  if (routedNets.length > 0) {
    out.push('## Routing Status', '');
    out.push('| Net | Status | Pins | Length | Layers | Vias |', '| :--- | :--- | :--- | :-: | :--- | :-: |');
    for (const net of routedNets) {
      out.push(
        `| ${cell(net.name)} | ${cell(routeStatus(report, net.name))} | ${net.pinsConnected ?? 0}/${net.pinsTotal ?? '?'} | ${cell(net.lengthMm !== undefined ? `${net.lengthMm} mm` : undefined)} | ${cell(net.layers?.join(', '))} | ${cell(net.vias)} |`,
      );
    }
    const disconnected = routedNets.filter((n) => n.disconnectedGroups && n.disconnectedGroups.length > 0);
    if (disconnected.length > 0) {
      out.push('');
      for (const net of disconnected) {
        for (const group of net.disconnectedGroups!) {
          out.push(`- ⚠ **${cell(net.name)}**: no copper path to ${cell(group.join(', '))}`);
        }
      }
    }
    out.push('');
    out.push('---', '');
  }

  if (report.zones.length > 0) {
    out.push('## Zones', '');
    out.push('| Net | Kind | Layers | Fill | Size |', '| :--- | :--- | :--- | :--- | :--- |');
    for (const z of report.zones) {
      const kind = z.keepout ? 'keepout' : 'pour';
      const fill = z.keepout ? '—' : z.materialized ? `filled${z.fillMode ? ` (${z.fillMode})` : ''}` : z.filled ? 'declared, not materialized' : 'unfilled';
      out.push(
        `| ${cell(z.net)} | ${kind} | ${cell(z.layers.join(', '))} | ${fill} | ${z.bbox.width} × ${z.bbox.height} mm |`,
      );
    }
    out.push('');
  }

  return out.join('\n');
}

interface ViolationLike {
  type?: string;
  severity?: string;
  description?: string;
  items?: { description?: string; pos?: { x: number; y: number } }[];
}

function violationsTable(violations: ViolationLike[]): string {
  const lines: string[] = ['| Severity | Type | Description | Items |', '| :--- | :--- | :--- | :--- |'];
  for (const v of violations) {
    const icon = (v.severity ?? 'error') === 'warning' ? '⚠ warning' : '✖ error';
    const items = (v.items ?? []).slice(0, 3).map((item) => {
      const pos = item.pos ? ` @(${item.pos.x}, ${item.pos.y})` : '';
      return `${item.description ?? ''}${pos}`;
    });
    const more = (v.items ?? []).length - 3;
    if (more > 0) items.push(`+${more} more`);
    lines.push(`| ${icon} | ${cell(v.type)} | ${cell(v.description)} | ${cell(items.join('<br>'))} |`);
  }
  return lines.join('\n');
}
