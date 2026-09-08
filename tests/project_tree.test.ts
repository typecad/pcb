import { describe, it, expect } from 'vitest';
import { buildProjectTree } from '../src/cli/project_tree.js';
import { Component } from '../src/component.js';
import type { ISchematicNode } from '../src/types/schematic_types.js';
import { Pin } from '../src/pin.js';

function makeComponent(opts: { reference: string; value?: string; description?: string; via?: boolean }): Component {
  const init: Record<string, unknown> = {
    footprint: 'Resistor_SMD:R_0603_1608Metric',
    reference: opts.reference,
  };
  if (opts.value) init.value = opts.value;
  if (opts.description) init.description = opts.description;
  const c = new Component(init as any);
  if (opts.via) {
    c.via = true;
    c.reference = opts.reference;
  }
  return c;
}

describe('buildProjectTree', () => {
  it('should include sheet name in output', () => {
    const grouped = new Map<string, Component[]>();
    const result = buildProjectTree(grouped, [], 'MyBoard');
    expect(result).toContain('MyBoard');
  });

  it('should list components under groups', () => {
    const r1 = makeComponent({ reference: 'R1', value: '10k' });
    const grouped = new Map<string, Component[]>([['Power', [r1]]]);
    const result = buildProjectTree(grouped, [], 'test');
    expect(result).toContain('Power');
    expect(result).toContain('R1');
    expect(result).toContain('10k');
  });

  it('should include description when present', () => {
    const r1 = makeComponent({ reference: 'R1', description: 'Pull-up' });
    const grouped = new Map<string, Component[]>([['Main', [r1]]]);
    const result = buildProjectTree(grouped, [], 'test');
    expect(result).toContain('Pull-up');
  });

  it('should sort groups alphabetically', () => {
    const r1 = makeComponent({ reference: 'R1' });
    const c1 = makeComponent({ reference: 'C1' });
    const grouped = new Map<string, Component[]>([
      ['ZGroup', [r1]],
      ['AGroup', [c1]],
    ]);
    const result = buildProjectTree(grouped, [], 'test');
    const aIdx = result.indexOf('AGroup');
    const zIdx = result.indexOf('ZGroup');
    expect(aIdx).toBeLessThan(zIdx);
  });

  it('should display via component in tree', () => {
    const viaComp = makeComponent({ reference: 'V1', via: true });

    const grouped = new Map<string, Component[]>([['Vias', [viaComp]]]);
    const result = buildProjectTree(grouped, [], 'test');
    expect(result).toContain('V1');
  });

  it('should handle empty grouped components', () => {
    const grouped = new Map<string, Component[]>();
    const result = buildProjectTree(grouped, [], 'test');
    expect(result).toContain('type');
    expect(result).toContain('CAD');
  });

  it('should show component value without description', () => {
    const r1 = makeComponent({ reference: 'R1', value: '4.7k' });
    const grouped = new Map<string, Component[]>([['Main', [r1]]]);
    const result = buildProjectTree(grouped, [], 'test');
    expect(result).toContain('4.7k');
  });
});
