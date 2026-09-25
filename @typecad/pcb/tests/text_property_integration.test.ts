import { describe, it, expect } from 'vitest';
import { Component } from '../src/component.js';

describe('Text Property Integration', () => {
  it('should store custom text properties on component', () => {
    const component = new Component('Package_DIP:DIP-8_W7.62mm');
    component.reference = 'U1';
    component.value = 'TestComponent';
    component.pcb = { x: 100, y: 100, rotation: 0 };
    component.text = [
      { property: 'Extra', text: 'test', x: 0, y: 0, rotation: 0, layer: 'F.Fab' },
      { property: 'Note', text: 'important', x: 5, y: 5, layer: 'F.SilkS', show: true },
      { property: 'Hidden', text: 'secret', x: 10, y: 10, show: false },
    ];

    expect(component.text).toHaveLength(3);

    expect(component.text[0].property).toBe('Extra');
    expect(component.text[0].text).toBe('test');
    expect(component.text[0].x).toBe(0);
    expect(component.text[0].y).toBe(0);
    expect(component.text[0].rotation).toBe(0);
    expect(component.text[0].layer).toBe('F.Fab');
    expect(component.text[0].show).toBeUndefined();

    expect(component.text[1].property).toBe('Note');
    expect(component.text[1].text).toBe('important');
    expect(component.text[1].x).toBe(5);
    expect(component.text[1].y).toBe(5);
    expect(component.text[1].layer).toBe('F.SilkS');
    expect(component.text[1].show).toBe(true);

    expect(component.text[2].property).toBe('Hidden');
    expect(component.text[2].text).toBe('secret');
    expect(component.text[2].show).toBe(false);
  });

  it('should handle text properties with custom font settings', () => {
    const component = new Component('Package_DIP:DIP-8_W7.62mm');
    component.reference = 'U2';
    component.value = 'CustomFont';
    component.pcb = { x: 200, y: 200, rotation: 0 };
    component.text = [{ property: 'Large', text: 'BIG', x: 0, y: 0, fontSize: 2.0, thickness: 0.3 }];

    expect(component.text).toHaveLength(1);
    expect(component.text[0].fontSize).toBe(2.0);
    expect(component.text[0].thickness).toBe(0.3);
  });

  it('should handle component without text properties', () => {
    const component = new Component('Package_DIP:DIP-8_W7.62mm');
    component.reference = 'U3';
    component.value = 'NoText';
    component.pcb = { x: 300, y: 300, rotation: 0 };

    expect(component.text).toHaveLength(0);
    expect(component.text).toEqual([]);
  });

  it('should apply default values for optional text properties', () => {
    const component = new Component('Package_DIP:DIP-8_W7.62mm');
    component.reference = 'U4';
    component.value = 'Defaults';
    component.text = [{ property: 'Simple', text: 'test', x: 0, y: 0 }];

    expect(component.text[0].rotation).toBeUndefined();
    expect(component.text[0].layer).toBeUndefined();
    expect(component.text[0].fontSize).toBeUndefined();
    expect(component.text[0].thickness).toBeUndefined();
    expect(component.text[0].show).toBeUndefined();
  });

  it('should allow updating existing properties like Reference', () => {
    const component = new Component('Package_DIP:DIP-8_W7.62mm');
    component.reference = 'U5';
    component.value = 'CustomValue';
    component.text = [{ property: 'Reference', text: 'U5', x: 10, y: -5, layer: 'F.SilkS', show: true, fontSize: 2.0 }];

    expect(component.reference).toBe('U5');
    expect(component.text).toHaveLength(1);
    expect(component.text[0].property).toBe('Reference');
    expect(component.text[0].x).toBe(10);
    expect(component.text[0].y).toBe(-5);
    expect(component.text[0].fontSize).toBe(2.0);
  });

  it('should handle multiple text properties including standard ones', () => {
    const component = new Component('Package_DIP:DIP-8_W7.62mm');
    component.reference = 'U6';
    component.value = 'MultiProp';
    component.text = [
      { property: 'Reference', text: 'U6', x: 0, y: -10, show: true },
      { property: 'Value', text: 'MultiProp', x: 0, y: 10, show: true },
      { property: 'CustomNote', text: 'Special', x: 5, y: 0, layer: 'F.Fab' },
    ];

    expect(component.text).toHaveLength(3);

    const refProp = component.text.find((t) => t.property === 'Reference');
    expect(refProp).toBeDefined();
    expect(refProp?.y).toBe(-10);

    const valProp = component.text.find((t) => t.property === 'Value');
    expect(valProp).toBeDefined();
    expect(valProp?.y).toBe(10);

    const customProp = component.text.find((t) => t.property === 'CustomNote');
    expect(customProp).toBeDefined();
    expect(customProp?.layer).toBe('F.Fab');
  });
});
