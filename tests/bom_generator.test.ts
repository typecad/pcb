import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateBom } from '../src/renderers/bom-generator.js';
import { Component } from '../src/component.js';
import { createTempDir, cleanupTempDir, readTempFile } from './helpers/temp_dir.js';
import type { BomField } from '../src/schematic.js';

describe('generateBom', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir('bom-test-');
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  function makeComponent(opts: {
    reference: string;
    value?: string;
    footprint?: string;
    mpn?: string;
    datasheet?: string;
    description?: string;
    voltage?: string;
    wattage?: string;
  }): Component {
    const init: Record<string, unknown> = {
      footprint: opts.footprint ?? 'Resistor_SMD:R_0603_1608Metric',
      reference: opts.reference,
    };
    if (opts.value) init.value = opts.value;
    if (opts.mpn) init.mpn = opts.mpn;
    if (opts.datasheet) init.datasheet = opts.datasheet;
    if (opts.description) init.description = opts.description;
    if (opts.voltage) init.voltage = opts.voltage;
    if (opts.wattage) init.wattage = opts.wattage;
    return new Component(init as any);
  }

  it('should write CSV with header row', () => {
    const components = [makeComponent({ reference: 'R1', value: '10k' })];
    const options = { bom_fields: ['Reference', 'Value'] as BomField[], bom_separator: ',' };
    generateBom(components, 'test', options, tempDir);
    const content = readTempFile(tempDir, 'test.csv');
    expect(content.startsWith('Reference,Value\n')).toBe(true);
  });

  it('should include component data in correct order', () => {
    const components = [makeComponent({ reference: 'R1', value: '10k' })];
    const options = { bom_fields: ['Reference', 'Value'] as BomField[], bom_separator: ',' };
    generateBom(components, 'test', options, tempDir);
    const content = readTempFile(tempDir, 'test.csv');
    const lines = content.trim().split('\n');
    expect(lines[1]).toBe('R1,10k');
  });

  it('should use custom separator', () => {
    const components = [makeComponent({ reference: 'R1', value: '10k' })];
    const options = { bom_fields: ['Reference', 'Value'] as BomField[], bom_separator: ';' };
    generateBom(components, 'test', options, tempDir);
    const content = readTempFile(tempDir, 'test.csv');
    expect(content).toContain('Reference;Value');
    expect(content).toContain('R1;10k');
  });

  it('should filter out VIA components', () => {
    const viaComp = makeComponent({ reference: 'VIA1', value: '' });
    viaComp.via = true;
    viaComp.reference = 'VIA1';
    const resistor = makeComponent({ reference: 'R1', value: '10k' });
    const options = { bom_fields: ['Reference', 'Value'] as BomField[], bom_separator: ',' };
    generateBom([viaComp, resistor], 'test', options, tempDir);
    const content = readTempFile(tempDir, 'test.csv');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(lines[1]).toBe('R1,10k');
  });

  it('should output all field types', () => {
    const comp = makeComponent({
      reference: 'R1',
      value: '10k',
      footprint: 'Resistor_SMD:R_0603_1608Metric',
      mpn: 'RC0603',
      datasheet: 'https://example.com',
      description: 'Resistor',
      voltage: '25V',
      wattage: '0.1W',
    });
    const fields: BomField[] = [
      'Reference',
      'Value',
      'Datasheet',
      'Footprint',
      'MPN',
      'Description',
      'Voltage',
      'Wattage',
    ];
    const options = { bom_fields: fields, bom_separator: ',' };
    generateBom([comp], 'test', options, tempDir);
    const content = readTempFile(tempDir, 'test.csv');
    expect(content).toContain('R1');
    expect(content).toContain('10k');
    expect(content).toContain('RC0603');
    expect(content).toContain('https://example.com');
    expect(content).toContain('Resistor');
    expect(content).toContain('25V');
    expect(content).toContain('0.1W');
  });

  it('should return true on success', () => {
    const components = [makeComponent({ reference: 'R1', value: '10k' })];
    const options = { bom_fields: ['Reference', 'Value'] as BomField[], bom_separator: ',' };
    const result = generateBom(components, 'test', options, tempDir);
    expect(result).toBe(true);
  });

  it('should handle multiple components', () => {
    const components = [
      makeComponent({ reference: 'R1', value: '10k' }),
      makeComponent({ reference: 'R2', value: '4.7k' }),
      makeComponent({ reference: 'C1', value: '100nF' }),
    ];
    const options = { bom_fields: ['Reference', 'Value'] as BomField[], bom_separator: ',' };
    generateBom(components, 'test', options, tempDir);
    const content = readTempFile(tempDir, 'test.csv');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(4);
  });
});
