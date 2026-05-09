import { describe, it, expect } from 'vitest';
import { PCB, Component } from '../src/index.js';
import fs from 'node:fs';

describe('Reference Width/Height S-Expression Output', () => {
    it('should generate correct size values in s-expression with width and height', async () => {
        const component = new Component({
            reference: ['U2', { x: 3.805, y: 1.545, rotation: 90, thickness: 0.15, width: 1, height: 1 }],
            value: 'TestValue',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
            pcb: { x: 100, y: 100, rotation: 0 }
        });

        const pcb = new PCB('test_width_height');
        await pcb.create(component);

        // Read the generated PCB file
        const pcbContent = fs.readFileSync('./build/test_width_height.kicad_pcb', 'utf8');

        // Check that the property section exists with correct values
        expect(pcbContent).toContain('(property "Reference" "U2"');
        expect(pcbContent).toContain('(at 3.805 1.545 90)');

        // Most importantly, check that size is (1 1) not (1.27 1.27)
        expect(pcbContent).toMatch(/\(size 1 1\)/);
        expect(pcbContent).toContain('(thickness 0.15)');
    });

    it('should use fontSize for both dimensions when width/height not provided', async () => {
        const component = new Component({
            reference: ['U3', { x: 0, y: 0, fontSize: 2.0 }],
            value: 'TestValue',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
            pcb: { x: 100, y: 100, rotation: 0 }
        });

        const pcb = new PCB('test_font_size_only');
        await pcb.create(component);

        // Read the generated PCB file
        const pcbContent = fs.readFileSync('./build/test_font_size_only.kicad_pcb', 'utf8');

        // Check that size uses fontSize for both dimensions
        expect(pcbContent).toMatch(/\(size 2 2\)/);
    });

    it('should mix width/height with fontSize', async () => {
        const component = new Component({
            reference: ['U4', { x: 0, y: 0, fontSize: 1.5, width: 2.5 }],
            value: 'TestValue',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
            pcb: { x: 100, y: 100, rotation: 0 }
        });

        const pcb = new PCB('test_mixed_sizing');
        await pcb.create(component);

        // Read the generated PCB file
        const pcbContent = fs.readFileSync('./build/test_mixed_sizing.kicad_pcb', 'utf8');

        // Check that width overrides fontSize, but height uses fontSize
        expect(pcbContent).toMatch(/\(size 2\.5 1\.5\)/);
    });
});
