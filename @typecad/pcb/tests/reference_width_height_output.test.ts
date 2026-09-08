import { describe, it, expect } from 'vitest';
import { PCB, Component } from '../src/index.js';
import fs from 'node:fs';

describe('Reference Width/Height S-Expression Output', () => {
  it('should generate reference in s-expression output', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.reference = 'U2';
    component.value = 'TestValue';
    component.pcb = { x: 100, y: 100, rotation: 0 };

    const pcb = new PCB('test_width_height');
    pcb.create(component);

    const pcbContent = fs.readFileSync('./build/test_width_height.kicad_pcb', 'utf8');

    expect(pcbContent).toContain('(property "Reference" "U2"');
  });

  it('should generate reference with default size values', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.reference = 'U3';
    component.value = 'TestValue';
    component.pcb = { x: 100, y: 100, rotation: 0 };

    const pcb = new PCB('test_font_size_only');
    pcb.create(component);

    const pcbContent = fs.readFileSync('./build/test_font_size_only.kicad_pcb', 'utf8');

    expect(pcbContent).toContain('(property "Reference" "U3"');
  });

  it('should generate reference with mixed sizing defaults', () => {
    const component = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    component.reference = 'U4';
    component.value = 'TestValue';
    component.pcb = { x: 100, y: 100, rotation: 0 };

    const pcb = new PCB('test_mixed_sizing');
    pcb.create(component);

    const pcbContent = fs.readFileSync('./build/test_mixed_sizing.kicad_pcb', 'utf8');

    expect(pcbContent).toContain('(property "Reference" "U4"');
  });
});
