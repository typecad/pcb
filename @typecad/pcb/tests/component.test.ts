import { describe, it, expect } from 'vitest';
import { Component } from '../src/component.js';

describe('Component', () => {
  it('should create a basic component', () => {
    const component = new Component({ reference: 'R1', value: '1k', footprint: 'Resistor_SMD:R_0603_1608Metric' });
    expect(component.reference).toBe('R1');
    expect(component.value).toBe('1k');
    expect(component.footprint).toBe('Resistor_SMD:R_0603_1608Metric');
    expect(component.pcb).toEqual({ x: 0, y: 0, rotation: 0, side: 'front' });
  });

  it('should create a component with custom PCB placement', () => {
    const component = new Component({
      reference: 'U1',
      value: 'ATMEGA328P',
      footprint: 'Package_DIP:DIP-28_W7.62mm',
      pcb: { x: 100, y: 100, rotation: 45, side: 'back' },
    });
    expect(component.pcb).toEqual({ x: 100, y: 100, rotation: 45, side: 'back' });
  });

  it('should accept any reference via property assignment', () => {
    expect(() => new Component({ reference: 'R1' })).not.toThrow();
    expect(() => new Component({ reference: 'U123' })).not.toThrow();
    const c = new Component({ reference: 'invalid' });
    expect(c.reference).toBe('invalid');
    const c2 = new Component({ reference: '123' });
    expect(c2.reference).toBe('123');
  });

  it('should validate footprint format', () => {
    // Valid footprint formats should not throw
    expect(() => new Component({ reference: 'R1', footprint: 'Resistor_SMD:R_0603_1608Metric' })).not.toThrow();
    expect(() => new Component({ reference: 'U1', footprint: 'Package_DIP:DIP-28_W7.62mm' })).not.toThrow();
    expect(() => new Component({ reference: 'C1', footprint: 'Capacitor_SMD:C_0805_2012Metric' })).not.toThrow();

    // Invalid footprint formats should throw
    expect(() => new Component({ reference: 'R1', footprint: 'InvalidFootprint' })).toThrow();
    expect(() => new Component({ reference: 'U1', footprint: 'NoColonHere' })).toThrow();
    expect(() => new Component({ reference: 'C1', footprint: '' })).not.toThrow(); // Empty string is allowed (undefined footprint)
  });

  it('should create a component with custom text properties', () => {
    const component = new Component({
      reference: 'U1',
      value: 'TEST',
      footprint: 'Package_DIP:DIP-28_W7.62mm',
      text: [
        { property: 'Extra', text: 'test', x: 0, y: 0, rotation: 0, layer: 'F.Fab' },
        { property: 'Note', text: 'important', x: 5, y: 5 },
      ],
    });
    expect(component.text).toHaveLength(2);
    expect(component.text[0]).toEqual({ property: 'Extra', text: 'test', x: 0, y: 0, rotation: 0, layer: 'F.Fab' });
    expect(component.text[1]).toEqual({ property: 'Note', text: 'important', x: 5, y: 5 });
  });

  it('should handle empty text array', () => {
    const component = new Component({
      reference: 'U2',
      value: 'TEST',
      footprint: 'Package_DIP:DIP-28_W7.62mm',
      text: [],
    });
    expect(component.text).toHaveLength(0);
  });

  it('should handle text property with show flag', () => {
    const component = new Component({
      reference: 'U3',
      value: 'TEST',
      footprint: 'Package_DIP:DIP-28_W7.62mm',
      text: [
        { property: 'Visible', text: 'shown', x: 0, y: 0, show: true },
        { property: 'Hidden', text: 'hidden', x: 0, y: 0, show: false },
      ],
    });
    expect(component.text[0].show).toBe(true);
    expect(component.text[1].show).toBe(false);
  });
});
