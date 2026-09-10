import { describe, it, expect } from 'vitest';
import { buildDiagnosticsReport } from '../report.js';
import type { NetlistModel, NetlistNet, NetlistComponent } from '../netlist_model.js';
import type { BoardModel } from '../../typecad/board_model.js';

const skipped = { ran: false, passed: true, reason: 'skipped' } as const;

function comp(reference: string, value = '', footprint = 'lib:FP'): NetlistComponent {
  return { reference, value, footprint, fields: {}, isVia: /^V\d+$/.test(reference) && !footprint };
}

function net(name: string, code: number, nodes: [string, string, string][]): NetlistNet {
  return { name, code, nodes: nodes.map(([reference, pin, pintype]) => ({ reference, pin, pintype })) };
}

function netlist(nets: NetlistNet[], components: NetlistComponent[]): NetlistModel {
  return { file: 'board.net', tool: 'typeCAD', components, nets };
}

function reportFor(nets: NetlistNet[], components: NetlistComponent[], board: BoardModel | null = null) {
  return buildDiagnosticsReport({ netlist: netlist(nets, components), board, erc: skipped, drc: skipped, metadata: {} });
}

describe('buildDiagnosticsReport — components', () => {
  it('excludes vias from the BOM but counts them in the summary', () => {
    const report = reportFor(
      [net('net1', 1, [['R1', '1', 'passive'], ['R2', '2', 'passive']])],
      [comp('R1', '10k'), comp('R2', '4k7'), comp('V1', '', '')],
    );
    expect(report.components.map((c) => c.reference)).toEqual(['R1', 'R2']);
    expect(report.summary.vias).toBe(1);
  });

  it('counts distinct nets per component', () => {
    const report = reportFor(
      [net('A', 1, [['R1', '1', 'passive']]), net('B', 2, [['R1', '2', 'passive'], ['R2', '1', 'passive']])],
      [comp('R1'), comp('R2')],
    );
    expect(report.components.find((c) => c.reference === 'R1')!.netCount).toBe(2);
    expect(report.components.find((c) => c.reference === 'R2')!.netCount).toBe(1);
  });
});

describe('buildDiagnosticsReport — electrical findings', () => {
  it('flags nets with multiple drivers as errors', () => {
    const report = reportFor(
      [net('VCC', 1, [['U1', '1', 'power_out'], ['U2', '3', 'output'], ['R1', '1', 'passive']])],
      [comp('U1'), comp('U2'), comp('R1')],
    );
    const finding = report.electrical.find((f) => f.check === 'conflicting-drivers');
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toContain('U1.1');
    expect(finding?.message).toContain('U2.3');
  });

  it('flags undriven inputs on non-power nets', () => {
    const report = reportFor(
      [net('net3', 3, [['U1', '2', 'input'], ['U1', '4', 'input']])],
      [comp('U1')],
    );
    const finding = report.electrical.find((f) => f.check === 'undriven-input');
    expect(finding?.severity).toBe('warning');
    expect(finding?.net).toBe('net3');
  });

  it('does not flag power nets without a driver (globally fed rails)', () => {
    const report = reportFor(
      [net('GND', 1, [['U1', '5', 'power_in'], ['U2', '2', 'power_in']])],
      [comp('U1'), comp('U2')],
    );
    expect(report.electrical.find((f) => f.check === 'undriven-input')).toBeUndefined();
    expect(report.nets[0]!.power).toBe(true);
  });

  it('treats passive pins as sufficient drive for inputs', () => {
    const report = reportFor(
      [net('net2', 2, [['U1', '2', 'input'], ['R1', '1', 'passive']])],
      [comp('U1'), comp('R1')],
    );
    expect(report.electrical.find((f) => f.check === 'undriven-input')).toBeUndefined();
  });

  it('flags single-pin nets as warnings', () => {
    const report = reportFor([net('net9', 9, [['R3', '1', 'passive']])], [comp('R3')]);
    const finding = report.electrical.find((f) => f.check === 'single-pin-net');
    expect(finding?.severity).toBe('warning');
    expect(report.unconnected.singlePinNets).toContain('net9');
  });

  it('records no-connect pins as info findings, not single-pin warnings', () => {
    const report = reportFor(
      [net('net7', 7, [['U1', '9', 'no_connect']]), net('GND', 1, [['U1', '5', 'power_in']])],
      [comp('U1')],
    );
    const finding = report.electrical.find((f) => f.check === 'no-connect');
    expect(finding?.severity).toBe('info');
    expect(report.unconnected.dncPins).toEqual([{ reference: 'U1', pin: '9', net: 'net7' }]);
    expect(report.unconnected.singlePinNets).not.toContain('net7');
    expect(report.summary.dncPins).toBe(1);
  });
});

describe('buildDiagnosticsReport — clusters and pin map', () => {
  it('groups components joined by shared nets', () => {
    const report = reportFor(
      [
        net('A', 1, [['R1', '1', 'passive'], ['R2', '1', 'passive']]),
        net('B', 2, [['R2', '2', 'passive'], ['R3', '1', 'passive']]),
        net('C', 3, [['U9', '1', 'passive']]),
      ],
      [comp('R1'), comp('R2'), comp('R3'), comp('U9')],
    );
    expect(report.clusters.map((c) => c.members)).toEqual([['R1', 'R2', 'R3']]);
    expect(report.clusters[0]!.nets).toEqual(['A', 'B']);
  });

  it('builds a pin map from netlist pins when no board exists', () => {
    const report = reportFor(
      [net('A', 1, [['R1', '1', 'passive'], ['R2', '1', 'passive']])],
      [comp('R1', '10k'), comp('R2')],
    );
    const r1 = report.pinMap.find((p) => p.reference === 'R1')!;
    expect(r1.pins).toEqual([{ pin: '1', pintype: 'passive', net: 'A', dnc: false }]);
  });
});

describe('buildDiagnosticsReport — board merge', () => {
  const board: BoardModel = {
    file: 'board.kicad_pcb',
    components: [
      {
        reference: 'U1',
        value: 'MCU',
        footprint: 'lib:QFP',
        side: 'front',
        at: { x: 10, y: 20, rotation: 0 },
        dimensions: null,
        variable: 'mcu',
        source: 'src/board.ts:12',
        pads: [
          { pad: '1', net: 'VCC', type: 'smd', pinType: 'power_in', at: { x: 0, y: 0 }, layers: ['F.Cu'] },
          { pad: '2', net: null, type: 'smd', at: { x: 0, y: 0 }, layers: ['F.Cu'] },
        ],
      },
    ],
    nets: [
      {
        code: 1,
        name: 'VCC',
        pins: ['U1.1'],
        vias: [],
        zones: [],
        segments: [{ layer: 'F.Cu', width: 0.25, length: 2.5, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }],
        route: {
          segments: 1,
          length: 2.5,
          layers: ['F.Cu'],
          pinsTotal: 1,
          pinsConnected: 1,
          disconnectedGroups: [],
          routed: true,
          pourAssisted: false,
        },
      },
    ],
    zones: [],
    summary: {
      file: 'board.kicad_pcb',
      components: 1,
      namedNets: 1,
      vias: 0,
      zones: 0,
      keepouts: 0,
      tracks: 1,
      unconnectedPads: 1,
      board: { minX: 0, minY: 0, maxX: 50, maxY: 30 },
    },
  };

  it('attaches physical route data to logical nets by name', () => {
    const report = reportFor([net('VCC', 1, [['U1', '1', 'power_in']])], [comp('U1')], board);
    const vcc = report.nets.find((n) => n.name === 'VCC')!;
    expect(vcc.routed).toBe(true);
    expect(vcc.lengthMm).toBe(2.5);
    expect(vcc.layers).toEqual(['F.Cu']);
    expect(report.summary.routedNets).toBe(1);
  });

  it('builds the pin map from board pads, flagging unconnected ones', () => {
    const report = reportFor([net('VCC', 1, [['U1', '1', 'power_in']])], [comp('U1')], board);
    const u1 = report.pinMap.find((p) => p.reference === 'U1')!;
    expect(u1.pins).toHaveLength(2);
    expect(u1.pins[0]).toEqual({ pin: '1', pintype: 'power_in', net: 'VCC', dnc: false });
    expect(u1.pins[1]!.net).toBeNull();
    expect(report.unconnected.pads).toEqual([{ reference: 'U1', pad: '2', type: 'smd' }]);
    expect(report.summary.unconnectedPins).toBe(1);
  });

  it('carries board placement metadata into the BOM', () => {
    const report = reportFor([net('VCC', 1, [['U1', '1', 'power_in']])], [comp('U1', 'MCU')], board);
    const bom = report.components.find((c) => c.reference === 'U1')!;
    expect(bom.side).toBe('front');
    expect(bom.variable).toBe('mcu');
    expect(bom.source).toBe('src/board.ts:12');
    expect(bom.padCount).toBe(2);
  });

  it('derives nets and pin types from the board alone when no netlist exists', () => {
    const report = buildDiagnosticsReport({ netlist: null, board, erc: skipped, drc: skipped, metadata: {} });
    expect(report.nets.map((n) => n.name)).toEqual(['VCC']);
    expect(report.nets[0]!.pins[0]).toEqual({ reference: 'U1', pin: '1', pintype: 'power_in' });
    expect(report.components[0]!.reference).toBe('U1');
    expect(report.summary.boardOutlineMm).toEqual({ width: 50, height: 30 });
  });
});
