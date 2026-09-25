import { describe, it, expect } from 'vitest';
import { Component } from '../src/component.js';
import { parseFab } from '../src/pcb/component_text.js';
import type { ITextPositioning, FabLayout } from '../src/index.js';

describe('Component Layout Properties', () => {
  it('should accept referenceLayout at construction', () => {
    const c = new Component({
      footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
      reference: 'U1',
      value: 'TestIC',
      referenceLayout: { x: 0, y: -5 },
    });

    expect(c.referenceLayout).toBeDefined();
    expect(c.referenceLayout?.x).toBe(0);
    expect(c.referenceLayout?.y).toBe(-5);
  });

  it('should accept valueLayout at construction', () => {
    const c = new Component({
      footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
      reference: 'U2',
      value: 'TestIC',
      valueLayout: { x: 0, y: 5, rotation: 90 },
    });

    expect(c.valueLayout).toBeDefined();
    expect(c.valueLayout?.x).toBe(0);
    expect(c.valueLayout?.y).toBe(5);
    expect(c.valueLayout?.rotation).toBe(90);
  });

  it('should accept fabLayout at construction and sync to fab', () => {
    const c = new Component({
      footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
      reference: 'U3',
      value: 'TestIC',
      fabLayout: { text: 'U3', x: 3.81, y: 8.89, rotation: 180 },
    });

    expect(c.fabLayout).toBeDefined();
    expect(c.fabLayout?.text).toBe('U3');
    expect(c.fabLayout?.x).toBe(3.81);
    expect(c.fabLayout?.y).toBe(8.89);
    expect(c.fabLayout?.rotation).toBe(180);

    expect(c.fab).toBeDefined();
    expect(c.fab?.text).toBe('U3');
    expect(c.fab?.x).toBe(3.81);
    expect(c.fab?.y).toBe(8.89);
    expect(c.fab?.rotation).toBe(180);
  });

  it('should default fabLayout text to ${REFERENCE} when not provided', () => {
    const c = new Component({
      footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
      reference: 'U4',
      value: 'TestIC',
      fabLayout: { x: 0, y: 1 },
    });

    expect(c.fab?.text).toBe('${REFERENCE}');
    expect(c.fab?.x).toBe(0);
    expect(c.fab?.y).toBe(1);
  });

  it('should accept all three layouts at construction', () => {
    const c = new Component({
      footprint: 'Package_QFP:TQFP-32_7x7mm_P0.8mm',
      reference: 'U5',
      value: 'MCU',
      pcb: { x: 100, y: 80 },
      referenceLayout: { x: 0, y: -5, rotation: 0, layer: 'F.SilkS' },
      valueLayout: { x: 0, y: 5, rotation: 0, layer: 'F.Fab' },
      fabLayout: { text: 'U5', x: 0, y: 0, rotation: 180 },
    });

    expect(c.referenceLayout).toMatchObject({ x: 0, y: -5, layer: 'F.SilkS' });
    expect(c.valueLayout).toMatchObject({ x: 0, y: 5, layer: 'F.Fab' });
    expect(c.fabLayout).toMatchObject({ text: 'U5', x: 0, y: 0, rotation: 180 });
    expect(c.pcb.x).toBe(100);
    expect(c.pcb.y).toBe(80);
  });

  it('should allow post-construction assignment of referenceLayout', () => {
    const c = new Component('Resistor_SMD:R_0603_1608Metric');
    c.reference = 'R1';
    c.value = '10k';

    c.referenceLayout = { x: 0, y: -1, rotation: 0 };

    expect(c.referenceLayout).toMatchObject({ x: 0, y: -1, rotation: 0 });
  });

  it('should allow post-construction assignment of valueLayout', () => {
    const c = new Component('Capacitor_SMD:C_0603_1608Metric');
    c.reference = 'C1';
    c.value = '100nF';

    c.valueLayout = { x: 0, y: 1.5, layer: 'F.Fab' };

    expect(c.valueLayout).toMatchObject({ x: 0, y: 1.5, layer: 'F.Fab' });
  });

  it('should allow post-construction assignment of fabLayout and sync to fab', () => {
    const c = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    c.reference = 'U10';

    c.fabLayout = { x: 1, y: 2, rotation: 90 };

    expect(c.fabLayout).toMatchObject({ x: 1, y: 2, rotation: 90 });
    expect(c.fab).toBeDefined();
    expect(c.fab?.x).toBe(1);
    expect(c.fab?.y).toBe(2);
    expect(c.fab?.rotation).toBe(90);
  });

  it('should set fab to undefined when fabLayout is set to undefined', () => {
    const c = new Component({
      footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
      reference: 'U11',
      fabLayout: { x: 1, y: 2 },
    });

    expect(c.fab).toBeDefined();

    c.fabLayout = undefined;

    expect(c.fabLayout).toBeUndefined();
    expect(c.fab).toBeUndefined();
  });

  it('should support full styling options on layouts', () => {
    const c = new Component({
      footprint: 'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm',
      reference: 'U20',
      value: 'Controller',
      referenceLayout: {
        x: 0,
        y: -5,
        rotation: 90,
        layer: 'F.SilkS',
        width: 1.2,
        height: 1.0,
        thickness: 0.15,
        bold: true,
        italic: false,
        justify: { horizontal: 'center', vertical: 'middle' },
        show: true,
      },
    });

    expect(c.referenceLayout).toMatchObject({
      x: 0,
      y: -5,
      rotation: 90,
      layer: 'F.SilkS',
      width: 1.2,
      height: 1.0,
      thickness: 0.15,
      bold: true,
      italic: false,
      show: true,
    });
    expect(c.referenceLayout?.justify).toMatchObject({
      horizontal: 'center',
      vertical: 'middle',
    });
  });

  it('should not affect existing fab property when set directly', () => {
    const c = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    c.reference = 'U30';
    c.fab = parseFab(['U30', { x: 1, y: 2, rotation: 90 }]);

    expect(c.fab?.text).toBe('U30');
    expect(c.fab?.x).toBe(1);
    expect(c.fabLayout).toBeUndefined();
  });

  it('should keep layouts undefined when not provided', () => {
    const c = new Component('Resistor_SMD:R_0603_1608Metric');
    c.reference = 'R50';
    c.value = '1k';

    expect(c.referenceLayout).toBeUndefined();
    expect(c.valueLayout).toBeUndefined();
    expect(c.fabLayout).toBeUndefined();
    expect(c.fab).toBeUndefined();
  });
});
