import { describe, it, expect } from 'vitest';
import { clustersGraph, componentsPie, netConnectivityGraph, powerDistributionGraph, groupOf } from '../mermaid.js';
import { buildDiagnosticsReport, type DiagnosticsReport } from '../report.js';
import type { NetlistNet, NetlistComponent } from '../netlist_model.js';

const skipped = { ran: false, passed: true, reason: 'skipped' } as const;

function comp(reference: string, value = '', footprint = 'lib:FP'): NetlistComponent {
  return { reference, value, footprint, fields: {}, isVia: /^V\d+$/.test(reference) && !footprint };
}

function net(name: string, code: number, nodes: [string, string, string][]): NetlistNet {
  return { name, code, nodes: nodes.map(([reference, pin, pintype]) => ({ reference, pin, pintype })) };
}

function reportOf(nets: NetlistNet[], components: NetlistComponent[]): DiagnosticsReport {
  return buildDiagnosticsReport({
    netlist: { file: 'b.net', tool: 'typeCAD', components, nets },
    board: null,
    erc: skipped,
    drc: skipped,
    metadata: {},
  });
}

const report = reportOf(
  [
    net('GND', 1, [
      ['U1', '5', 'power_in'],
      ['C1', '1', 'passive'],
    ]),
    net('net2', 2, [
      ['U1', '3', 'output'],
      ['R1', '1', 'passive'],
    ]),
    net('net3', 3, [
      ['U1', '4', 'input'],
      ['R1', '2', 'passive'],
      ['R2', '1', 'passive'],
    ]),
    net('net7', 7, [['U1', '9', 'no_connect']]),
  ],
  [comp('U1', 'MCU "pro"'), comp('R1', '10k'), comp('R2'), comp('C1')],
);

describe('netConnectivityGraph', () => {
  const graph = netConnectivityGraph(report);

  it('is a left-to-right flowchart', () => {
    expect(graph).toMatch(/^%% .+\nflowchart LR/);
  });

  it('groups components into labeled subgraphs by prefix', () => {
    expect(graph).toContain('subgraph SG');
    expect(graph).toContain('["Integrated Circuits (U)"]');
    expect(graph).toContain('["Resistors (R)"]');
    expect(graph).toContain('["Capacitors (C)"]');
  });

  it('draws edges per pin with direction from pintype', () => {
    // output drives the net: component --> net
    expect(graph).toMatch(/c\d+ -->\|"(3|4)"\| n\d+/);
    // power_in is driven by the net: net --> component
    expect(graph).toMatch(/n\d+ -->\|"5"\| c\d+/);
    // passive links are undirected
    expect(graph).toMatch(/c\d+ ---\|"\d+"\| n\d+/);
    // no-connect uses a crossed edge
    expect(graph).toMatch(/c\d+ x--x\|"9"\| n\d+/);
  });

  it('escapes quotes in labels', () => {
    expect(graph).toContain('#quot;');
  });

  it('styles power nets', () => {
    expect(graph).toContain('classDef power');
    expect(graph).toMatch(/n\d+\("GND"\):::power/);
  });
});

describe('clustersGraph', () => {
  const graph = clustersGraph(report);

  it('chains components sharing a net with the net as edge label', () => {
    expect(graph).toContain('flowchart LR');
    expect(graph).toMatch(/c\d+ ---\|"net3"\| c\d+/);
    expect(graph).toMatch(/c\d+ ---\|"GND"\| c\d+/);
  });

  it('omits DNC-only nets', () => {
    expect(graph).not.toContain('"net7"');
  });
});

describe('powerDistributionGraph', () => {
  it('includes only power nets and their members', () => {
    const graph = powerDistributionGraph(report);
    expect(graph).toContain('("GND")');
    expect(graph).not.toContain('("net2")');
  });

  it('returns empty when there are no power nets', () => {
    const plain = reportOf([net('net1', 1, [['R1', '1', 'passive'], ['R2', '1', 'passive']])], [comp('R1'), comp('R2')]);
    expect(powerDistributionGraph(plain)).toBe('');
  });
});

describe('componentsPie', () => {
  it('counts components per group', () => {
    const pie = componentsPie(report);
    expect(pie).toContain('pie showData');
    expect(pie).toContain('"Resistors (R)" : 2');
    expect(pie).toContain('"Integrated Circuits (U)" : 1');
  });
});

describe('groupOf', () => {
  it('maps known prefixes to friendly labels', () => {
    expect(groupOf('R1').label).toBe('Resistors');
    expect(groupOf('U12').label).toBe('Integrated Circuits');
    expect(groupOf('J3').label).toBe('Connectors');
  });

  it('falls back to the prefix itself', () => {
    expect(groupOf('ZZ9')).toEqual({ prefix: 'ZZ', label: 'ZZ' });
  });
});
