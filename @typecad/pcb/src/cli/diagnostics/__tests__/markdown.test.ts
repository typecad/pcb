import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../markdown.js';
import { buildDiagnosticsReport, type DiagnosticsReport } from '../report.js';
import type { NetlistNet, NetlistComponent } from '../netlist_model.js';

const skipped = { ran: false, passed: true, reason: 'skipped' } as const;

function comp(reference: string, value = '', footprint = 'lib:FP'): NetlistComponent {
  return { reference, value, footprint, fields: {}, isVia: /^V\d+$/.test(reference) && !footprint };
}

function net(name: string, code: number, nodes: [string, string, string][]): NetlistNet {
  return { name, code, nodes: nodes.map(([reference, pin, pintype]) => ({ reference, pin, pintype })) };
}

function reportOf(nets: NetlistNet[], components: NetlistComponent[], erc?: DiagnosticsReport['erc']): DiagnosticsReport {
  return buildDiagnosticsReport({
    netlist: {
      file: 'board.net',
      tool: 'typeCAD',
      components: components.map((c) =>
        c.reference === 'U1' ? { ...c, fields: { MPN: 'STM32F103', Datasheet: 'https://example.com', Description: 'MCU' } } : c,
      ),
      nets,
    },
    board: null,
    erc: erc ?? skipped,
    drc: skipped,
    metadata: { entry: 'src/board.ts', netlistFile: 'build/board.net', version: '1.0.0-test' },
  });
}

describe('renderMarkdown', () => {
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
      net('net4', 4, [
        ['U1', '6', 'output'],
        ['U1', '7', 'output'],
      ]),
    ],
    [comp('U1', 'MCU'), comp('R1', '10k'), comp('C1', '100nF'), comp('V1', '', '')],
  );
  const md = renderMarkdown(report);

  it('renders a header with provenance and entry', () => {
    expect(md).toContain('# PCB Diagnostics — board');
    expect(md).toContain('**Netlist:** `build/board.net`');
    expect(md).toContain('**Entry:** `src/board.ts`');
    expect(md).toContain('typecad-pcb v1.0.0-test');
  });

  it('puts one provenance fact per blockquote line', () => {
    const quoteLines = md.split('\n').filter((l) => l.startsWith('> '));
    for (const line of quoteLines) {
      // long absolute paths must not get piped together on one line
      const fileFacts = (line.match(/`[^`]+`/g) ?? []).filter((v) => /\.\w/.test(v));
      expect(fileFacts.length, line).toBeLessThanOrEqual(1);
    }
    expect(quoteLines).toContain('> **Netlist:** `build/board.net`');
    expect(quoteLines).toContain('> **Entry:** `src/board.ts`');
    expect(quoteLines.some((l) => l.startsWith('> **Tool:**') && l.includes('**Generated:**'))).toBe(true);
  });

  it('renders the summary table', () => {
    expect(md).toContain('## Project Summary');
    expect(md).toContain('| **Components** | 3 (+1 vias) |');
  });

  it('renders the BOM table without vias, with MPN/datasheet fields', () => {
    expect(md).toContain('## Components (BOM)');
    expect(md).toContain('| U1 | MCU |');
    expect(md).toContain('| STM32F103 |');
    expect(md).not.toContain('| V1 |');
  });

  it('renders net list and pin map', () => {
    expect(md).toContain('### Net List');
    expect(md).toContain('U1.3, R1.1');
    expect(md).toContain('### Pin Map');
    expect(md).toContain('| U1 | 5 | power_in | GND |');
  });

  it('embeds mermaid diagrams in fences', () => {
    const fences = md.match(/```mermaid\n[\s\S]*?```/g) ?? [];
    expect(fences.length).toBeGreaterThanOrEqual(3); // pie + net graph + clusters
    expect(md).toContain('### Net Connectivity');
    expect(md).toContain('### Connectivity Clusters');
  });

  it('renders electrical findings with severity icons', () => {
    expect(md).toContain('## Electrical Checks');
    expect(md).toContain('✖ error');
  });

  it('notes skipped ERC/DRC steps', () => {
    expect(md).toContain('## ERC Report');
    expect(md).toContain('- – skipped');
    expect(md).toContain('## DRC Report');
  });

  it('renders ERC violations as a table when present', () => {
    const withErc = reportOf(
      [net('GND', 1, [['U1', '5', 'power_in'], ['C1', '1', 'passive']])],
      [comp('U1'), comp('C1')],
      {
        ran: true,
        passed: false,
        errors: 1,
        warnings: 0,
        violations: [
          {
            type: 'power_pin_not_driven',
            severity: 'error',
            description: 'Power pin not driven',
            items: [{ description: 'U1.5', pos: { x: 10, y: 20 } }],
          },
        ],
      },
    );
    const md2 = renderMarkdown(withErc);
    expect(md2).toContain('power_pin_not_driven');
    expect(md2).toContain('✖ 1 error');
    expect(md2).toContain('U1.5 @(10, 20)');
  });
});
