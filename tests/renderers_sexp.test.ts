import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderComp, renderNets, renderNetlist } from '../src/renderers/sexp_renderers.js';
import type { ComponentInit } from '../src/component.js';
import type { ISchematicNode } from '../src/types/schematic_types.js';
import { Pin } from '../src/pin.js';

describe('renderComp', () => {
  it('should render a component with all fields', () => {
    const data: ComponentInit = {
      reference: 'R1',
      value: '10k',
      footprint: 'Resistor_SMD:R_0603_1608Metric',
      datasheet: 'https://example.com',
      description: 'Test resistor',
      voltage: '25V',
      wattage: '0.1W',
      mpn: 'RC0603FR-0710KL',
    };
    const result = renderComp(data);
    expect(result).toContain('(ref "R1")');
    expect(result).toContain('(value "10k")');
    expect(result).toContain('(footprint "Resistor_SMD:R_0603_1608Metric")');
    expect(result).toContain('(name "Datasheet")');
    expect(result).toContain('(name "Description")');
    expect(result).toContain('(name "Voltage")');
    expect(result).toContain('(name "Wattage")');
    expect(result).toContain('(name "MPN")');
  });

  it('should render minimal component with no optional fields', () => {
    const data: ComponentInit = {
      reference: 'C1',
      value: '100nF',
      footprint: 'Capacitor_SMD:C_0402_1005Metric',
    };
    const result = renderComp(data);
    expect(result).toContain('(ref "C1")');
    expect(result).toContain('(value "100nF")');
    expect(result).not.toContain('(name "Datasheet")');
    expect(result).not.toContain('(name "MPN")');
  });

  it('should escape special characters in field values', () => {
    const data: ComponentInit = {
      reference: 'U1',
      value: 'ATmega328P "Rev.B"',
      footprint: 'Package_DIP:DIP-28_W7.62mm',
    };
    const result = renderComp(data);
    expect(result).toContain('ATmega328P \\"Rev.B\\"');
  });

  it('should handle empty reference and value', () => {
    const data: ComponentInit = {};
    const result = renderComp(data);
    expect(result).toContain('(ref "")');
    expect(result).toContain('(value "")');
  });
});

describe('renderNets', () => {
  it('should render a single net with pins', () => {
    const p1 = new Pin('R1', '1');
    const p2 = new Pin('R2', '2');
    const nets: ISchematicNode[] = [
      {
        name: 'VCC',
        code: 1,
        nodes: [p1, p2],
        owner: null,
      },
    ];
    const result = renderNets(nets);
    expect(result).toContain('(net (code "1") (name "VCC")');
    expect(result).toContain('(node (ref "R1") (pin "1")');
    expect(result).toContain('(node (ref "R2") (pin "2")');
  });

  it('should render multiple nets', () => {
    const nets: ISchematicNode[] = [
      { name: 'VCC', code: 1, nodes: [new Pin('R1', '1')], owner: null },
      { name: 'GND', code: 2, nodes: [new Pin('R1', '2')], owner: null },
    ];
    const result = renderNets(nets);
    expect(result).toContain('(name "VCC")');
    expect(result).toContain('(name "GND")');
  });

  it('should escape special characters in net names', () => {
    const nets: ISchematicNode[] = [
      {
        name: '/VCC"test',
        code: 1,
        nodes: [new Pin('R1', '1')],
        owner: null,
      },
    ];
    const result = renderNets(nets);
    expect(result).toContain('/VCC\\"test');
  });
});

describe('renderNetlist', () => {
  it('should produce valid netlist structure', () => {
    const comp = renderComp({ reference: 'R1', value: '10k', footprint: 'Resistor_SMD:R_0603_1608Metric' });
    const result = renderNetlist({ components: [comp], nets: ['(net (code "1") (name "VCC"))'] });
    expect(result).toContain('(export (version "E")');
    expect(result).toContain('(tool "typeCAD")');
    expect(result).toContain('(components');
    expect(result).toContain('(nets');
    expect(result).toContain('(ref "R1")');
    expect(result).toContain('(name "VCC")');
  });

  it('should handle empty components and nets', () => {
    const result = renderNetlist({ components: [], nets: [] });
    expect(result).toContain('(export (version "E")');
    expect(result).toContain('(components');
    expect(result).toContain('(nets');
  });
});
