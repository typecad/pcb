import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Schematic } from '../src/schematic.js';
import { Component } from '../src/component.js';
import { Pin } from '../src/pin.js';

// Mock fs module
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

// Mock execSync and exec
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  exec: vi.fn(),
  execFile: vi.fn(),
}));

describe('Schematic', () => {
  let schematic: Schematic;

  beforeEach(() => {
    schematic = new Schematic('test_schematic');
    vi.clearAllMocks();
  });

  describe('Basic Schematic Operations', () => {
    it('should create a Schematic instance', () => {
      expect(schematic).toBeDefined();
      expect(schematic.sheetName).toBe('test_schematic');
    });
  });

  describe('Component Management', () => {
    it('should add components via add() method', () => {
      const resistor = new Component({
        reference: 'R1',
        value: '10k',
        symbol: 'Device:R_Small',
      });

      schematic.add(resistor);

      expect(schematic.components).toHaveLength(1);
      expect(schematic.components[0]).toBe(resistor);
      expect(schematic.components[0].value).toBe('10k');
    });

    it('should handle multiple components in add()', () => {
      const resistor = new Component({
        reference: 'R99',
        value: '10k',
        symbol: 'Device:R_Small',
      });

      const capacitor = new Component({
        reference: 'C99',
        value: '10uF',
        symbol: 'Device:C_Small',
      });

      schematic.add(resistor, capacitor);

      expect(schematic.components).toHaveLength(2);
      expect(schematic.components).toContain(resistor);
      expect(schematic.components).toContain(capacitor);
    });

    it('should skip DNP components', () => {
      const dnpResistor = new Component({
        reference: 'RN99',
        value: '10k',
        dnp: true,
      });

      schematic.add(dnpResistor);

      expect(schematic.components).toHaveLength(0);
    });
  });

  describe('Net Operations', () => {
    it('should create nets from pins', () => {
      const resistor = new Component({
        reference: 'RN1',
        symbol: 'Device:R_Small',
      });

      const pin1 = resistor.pin(1);
      const pin2 = resistor.pin(2);

      const netDef = schematic.net(pin1, pin2);

      expect(netDef.pins).toHaveLength(2);
      expect(netDef.connections).toHaveLength(2);
      expect(netDef.connections[0].reference).toBe(resistor.reference);
      expect(netDef.connections[1].reference).toBe(resistor.reference);
    });

    it('should create a named net', () => {
      const resistor = new Component({
        reference: 'RN2',
        symbol: 'Device:R_Small',
      });

      const pin1 = resistor.pin(1);
      const pin2 = resistor.pin(2);

      const netDef = schematic.named('VCC').net(pin1, pin2);

      expect(netDef.name).toBe('VCC');
      expect(schematic.nodes).toHaveLength(1);
      expect(schematic.nodes[0].name).toBe('VCC');
    });

    it('should track Nodes with correct structure', () => {
      const resistor = new Component({
        reference: 'RN3',
        symbol: 'Device:R_Small',
      });

      const pin1 = resistor.pin(1);

      schematic.net(pin1);

      expect(schematic.nodes).toHaveLength(1);
      expect(schematic.nodes[0].nodes).toHaveLength(1);
      expect(schematic.nodes[0].nodes[0].reference).toBe(resistor.reference);
    });
  });

  describe('No-Connection Operations', () => {
    it('should add no-connection flags to pins', () => {
      const component = new Component({
        reference: 'UN1',
        symbol: 'MCU:ATmega328P',
      });

      const pin = component.pin(1);

      schematic.dnc(pin);

      expect(pin.type).toBe('no_connect');
      expect(schematic.nodes).toHaveLength(1);
    });

    it('should handle multiple pins for DNC', () => {
      const component = new Component({
        reference: 'UN2',
        symbol: 'MCU:ATmega328P',
      });

      const pin1 = component.pin(1);
      const pin2 = component.pin(2);

      schematic.dnc(pin1, pin2);

      expect(pin1.type).toBe('no_connect');
      expect(pin2.type).toBe('no_connect');
      expect(schematic.nodes.length).toBeGreaterThanOrEqual(1);
    });
  });
});
