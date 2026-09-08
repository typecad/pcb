import { describe, it, expect } from 'vitest';
import { Component } from '../src/component.js';
import { parseFab, applyTextPositioning } from '../src/pcb/component_text.js';

describe('Component Reference and Value Positioning', () => {
  it('should accept reference as a string (old format)', () => {
    const component = new Component('Package_SO:SOIC-16_3.9x9.9mm_P1.27mm');
    component.reference = 'U1';
    component.value = '74HC595';

    expect(component.reference).toBe('U1');
    expect(component.text).toHaveLength(0);
  });

  it('should accept reference via property assignment', () => {
    const component = new Component('Package_DIP:DIP-28_W7.62mm');
    component.reference = 'U2';
    component.value = 'ATmega328P';

    expect(component.reference).toBe('U2');
    expect(component.text).toHaveLength(0);
  });

  it('should accept reference with additional options (no positioning via property)', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.reference = 'U3';
    component.value = 'LM358';

    expect(component.reference).toBe('U3');
    expect(component.text).toHaveLength(0);
  });

  it('should preserve existing text properties when setting reference', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.reference = 'U4';
    component.value = '555';
    component.text.push({
      property: 'Note',
      text: 'Timer IC',
      x: 0,
      y: 5,
      layer: 'F.Fab',
      show: true,
    });

    expect(component.reference).toBe('U4');
    expect(component.text).toHaveLength(1);

    expect(component.text.find((t) => t.property === 'Note')).toBeDefined();
  });

  it('should preserve other text entries when setting reference', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.reference = 'U5';
    component.value = 'Op-Amp';
    component.text.push({
      property: 'Note',
      text: 'Some note',
      x: 5,
      y: 5,
      layer: 'F.Fab',
      show: true,
    });

    expect(component.reference).toBe('U5');
    expect(component.text).toHaveLength(1);

    expect(component.text.find((t) => t.property === 'Note')).toMatchObject({
      property: 'Note',
      text: 'Some note',
      x: 5,
      y: 5,
    });
  });

  it('should handle reference with minimal options via property', () => {
    const component = new Component('Package_TO_SOT_SMD:SOT-23');
    component.reference = 'U6';
    component.value = 'Regulator';

    expect(component.reference).toBe('U6');
    expect(component.text).toHaveLength(0);
  });

  it('should work with auto-generated reference when not provided', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.value = 'Test Component';

    expect(component.reference).toMatch(/^S\d+$/);
    expect(component.text).toHaveLength(0);
  });

  it('should accept reference with width and height styling options (via property)', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.reference = 'R7';
    component.value = 'Sensor';

    expect(component.reference).toBe('R7');
    expect(component.text).toHaveLength(0);
  });

  it('should accept reference with bold and italic styling (via property)', () => {
    const component = new Component('Package_SO:SOIC-16_3.9x9.9mm_P1.27mm');
    component.reference = 'C8';
    component.value = 'Controller';

    expect(component.reference).toBe('C8');
    expect(component.text).toHaveLength(0);
  });

  it('should accept reference with justify options (via property)', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.reference = 'D9';
    component.value = 'Display';

    expect(component.reference).toBe('D9');
    expect(component.text).toHaveLength(0);
  });

  it('should accept reference with all styling options combined (via property)', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.reference = 'L10';
    component.value = 'Full Styled';

    expect(component.reference).toBe('L10');
    expect(component.text).toHaveLength(0);
  });

  it('should accept value as a string (old format)', () => {
    const component = new Component('Resistor_SMD:R_0603_1608Metric');
    component.reference = 'R1';
    component.value = '10k';

    expect(component.value).toBe('10k');
    expect(component.text).toHaveLength(0);
  });

  it('should accept value via property assignment', () => {
    const component = new Component('Resistor_SMD:R_0603_1608Metric');
    component.reference = 'R2';
    component.value = '10k';

    expect(component.value).toBe('10k');
    expect(component.text).toHaveLength(0);
  });

  it('should accept value with full styling options (via property)', () => {
    const component = new Component('Capacitor_SMD:C_0805_2012Metric');
    component.reference = 'C1';
    component.value = '100nF';

    expect(component.value).toBe('100nF');
    expect(component.text).toHaveLength(0);
  });

  it('should accept both reference and value via property assignment', () => {
    const component = new Component('Package_DIP:DIP-28_W7.62mm');
    component.reference = 'U11';
    component.value = 'ATmega328P';

    expect(component.reference).toBe('U11');
    expect(component.value).toBe('ATmega328P');
    expect(component.text).toHaveLength(0);
  });

  it('should preserve other text entries when setting value', () => {
    const component = new Component('Resistor_SMD:R_0603_1608Metric');
    component.reference = 'R3';
    component.value = '22k';
    component.text.push({
      property: 'Note',
      text: 'Some note',
      x: 5,
      y: 5,
      layer: 'F.Fab',
      show: true,
    });

    expect(component.value).toBe('22k');
    expect(component.text).toHaveLength(1);

    expect(component.text.find((t) => t.property === 'Note')).toMatchObject({
      property: 'Note',
      text: 'Some note',
      x: 5,
      y: 5,
    });
  });

  it('should auto-assign reference when .ref() is not called, with positioning via applyTextPositioning', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.value = 'TestValue';
    const ref = component.reference;
    applyTextPositioning(component.text, 'Reference', ref, { x: 0, y: -5, rotation: 0 });

    expect(component.reference).toMatch(/^S\d+$/);
    expect(component.text).toHaveLength(1);
    expect(component.text[0].property).toBe('Reference');
    expect(component.text[0].x).toBe(0);
    expect(component.text[0].y).toBe(-5);
  });

  it('should auto-assign reference with different positioning values', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.value = 'TestValue2';
    const ref = component.reference;
    applyTextPositioning(component.text, 'Reference', ref, { x: 1, y: -6, rotation: 90 });

    expect(component.reference).toMatch(/^S\d+$/);
    expect(component.text).toHaveLength(1);
    expect(component.text[0].property).toBe('Reference');
    expect(component.text[0].x).toBe(1);
    expect(component.text[0].y).toBe(-6);
    expect(component.text[0].rotation).toBe(90);
  });

  it('should auto-assign reference with empty string and positioning', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.value = 'TestValue3';
    applyTextPositioning(component.text, 'Reference', component.reference, { x: 2, y: -7, rotation: 180 });

    expect(component.reference).toMatch(/^S\d+$/);
    expect(component.text).toHaveLength(1);
    expect(component.text[0].property).toBe('Reference');
    expect(component.text[0].x).toBe(2);
    expect(component.text[0].y).toBe(-7);
    expect(component.text[0].rotation).toBe(180);
  });

  it('should use custom prefix when auto-assigning reference with positioning', () => {
    const component = Component._create({
      prefix: 'R',
      value: 'Resistor',
      footprint: 'Resistor_SMD:R_0603_1608Metric',
    });
    applyTextPositioning(component.text, 'Reference', component.reference, { x: 0, y: -5, rotation: 0 });

    expect(component.reference).toMatch(/^R\d+$/);
    expect(component.text).toHaveLength(1);
    expect(component.text[0].property).toBe('Reference');
  });

  it('should accept fab positioning tuple', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.reference = 'U15';
    component.value = 'TestIC';
    component.fab = parseFab(['U15', { x: 3.81, y: 8.89, rotation: 180 }]);

    expect(component.reference).toBe('U15');
    expect(component.fab).toBeDefined();
    expect(component.fab).toMatchObject({
      text: 'U15',
      x: 3.81,
      y: 8.89,
      rotation: 180,
    });
  });

  it('should accept fab with full styling options', () => {
    const component = new Component('Package_DIP:DIP-28_W7.62mm');
    component.reference = 'U13';
    component.value = 'Controller';
    component.fab = parseFab([
      'U13',
      {
        x: 5,
        y: 10,
        rotation: 90,
        layer: 'F.Fab',
        width: 1,
        height: 1,
        fontSize: 1.0,
        thickness: 0.15,
        bold: true,
        italic: false,
        justify: {
          horizontal: 'center',
          vertical: 'middle',
        },
        show: true,
      },
    ]);

    expect(component.fab).toMatchObject({
      text: 'U13',
      x: 5,
      y: 10,
      rotation: 90,
      layer: 'F.Fab',
      width: 1,
      height: 1,
      fontSize: 1.0,
      thickness: 0.15,
      bold: true,
      italic: false,
      justify: {
        horizontal: 'center',
        vertical: 'middle',
      },
      show: true,
    });
  });

  it('should accept reference, value, and fab positioning together', () => {
    const component = new Component('Package_QFP:TQFP-32_7x7mm_P0.8mm');
    component.reference = 'U17';
    component.value = 'MCU';
    component.fab = parseFab(['U17', { x: 3.81, y: 8.89, rotation: 180, width: 1, height: 1 }]);

    expect(component.reference).toBe('U17');
    expect(component.value).toBe('MCU');
    expect(component.text).toHaveLength(0);

    expect(component.fab).toMatchObject({
      text: 'U17',
      x: 3.81,
      y: 8.89,
      rotation: 180,
      width: 1,
      height: 1,
    });
  });

  it('should store value footprint formatting for fp_text value node', () => {
    const component = new Component('Resistor_SMD:R_0603_1608Metric');
    component.reference = 'R10';
    component.value = '10k';

    expect(component.value).toBe('10k');
    expect(component.text).toHaveLength(0);
  });

  it('should use ${REFERENCE} when fab text is empty/null/undefined', () => {
    const component1 = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component1.reference = 'U15';
    component1.value = 'TestIC';
    component1.fab = parseFab([undefined, { x: 3.81, y: 8.89, rotation: 180 }]);
    expect(component1.fab).toBeDefined();
    expect(component1.fab?.text).toBe('${REFERENCE}');
    expect(component1.fab?.x).toBe(3.81);
    expect(component1.fab?.y).toBe(8.89);
    expect(component1.fab?.rotation).toBe(180);

    const component2 = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component2.reference = 'U16';
    component2.value = 'TestIC2';
    component2.fab = parseFab([null, { x: 5, y: 10, rotation: 90 }]);
    expect(component2.fab).toBeDefined();
    expect(component2.fab?.text).toBe('${REFERENCE}');
    expect(component2.fab?.x).toBe(5);
    expect(component2.fab?.y).toBe(10);
    expect(component2.fab?.rotation).toBe(90);

    const component3 = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component3.reference = 'U17';
    component3.value = 'TestIC3';
    component3.fab = parseFab(['', { x: 0, y: 0, rotation: 0, width: 1, height: 1 }]);
    expect(component3.fab).toBeDefined();
    expect(component3.fab?.text).toBe('${REFERENCE}');
    expect(component3.fab?.x).toBe(0);
    expect(component3.fab?.y).toBe(0);
    expect(component3.fab?.rotation).toBe(0);
    expect(component3.fab?.width).toBe(1);
    expect(component3.fab?.height).toBe(1);
  });

  it('should accept reference as positioning-only object (auto-assign reference)', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.value = 'TestValue';
    const ref = component.reference;
    applyTextPositioning(component.text, 'Reference', ref, { x: 0, y: -5, rotation: 0 });

    expect(component.reference).toMatch(/^S\d+$/);

    expect(component.text).toHaveLength(1);
    expect(component.text[0]).toMatchObject({
      property: 'Reference',
      text: component.reference,
      x: 0,
      y: -5,
      rotation: 0,
    });
  });

  it('should accept value as positioning-only object', () => {
    const component = new Component('Resistor_SMD:R_0603_1608Metric');
    component.reference = 'R20';
    applyTextPositioning(component.text, 'Value', '', { x: 0, y: 5, rotation: 90, width: 1.5, height: 1.2 });
    component.valueFootprint = { x: 0, y: 5, rotation: 90, width: 1.5, height: 1.2 };

    expect(component.value).toBe('');

    expect(component.text).toHaveLength(1);
    expect(component.text[0]).toMatchObject({
      property: 'Value',
      text: '',
      x: 0,
      y: 5,
      rotation: 90,
      width: 1.5,
      height: 1.2,
    });

    expect(component.valueFootprint).toBeDefined();
    expect(component.valueFootprint).toMatchObject({
      x: 0,
      y: 5,
      rotation: 90,
      width: 1.5,
      height: 1.2,
    });
  });

  it('should accept fab as positioning-only object (auto ${REFERENCE})', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.reference = 'U18';
    component.value = 'TestIC';
    component.fab = parseFab({ x: 3.81, y: 8.89, rotation: 180, width: 1, height: 1 });

    expect(component.fab).toBeDefined();
    expect(component.fab).toMatchObject({
      text: '${REFERENCE}',
      x: 3.81,
      y: 8.89,
      rotation: 180,
      width: 1,
      height: 1,
    });
  });
});
