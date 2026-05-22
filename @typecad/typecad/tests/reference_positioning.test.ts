import { describe, it, expect } from 'vitest';
import { Component } from '../src/component.js';

describe('Component Reference and Value Positioning', () => {
    it('should accept reference as a string (old format)', () => {
        const component = new Component({
            reference: 'U1',
            value: '74HC595',
            footprint: 'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm'
        });

        expect(component.reference).toBe('U1');
        expect(component.text).toHaveLength(0);
    });

    it('should accept reference as a tuple with positioning', () => {
        const component = new Component({
            reference: ['U2', { x: 1, y: 2, rotation: 90 }],
            value: 'ATmega328P',
            footprint: 'Package_DIP:DIP-28_W7.62mm'
        });

        expect(component.reference).toBe('U2');
        expect(component.text).toHaveLength(1);
        expect(component.text[0]).toMatchObject({
            property: 'Reference',
            text: 'U2',
            x: 1,
            y: 2,
            rotation: 90
        });
    });

    it('should accept reference with positioning and additional options', () => {
        const component = new Component({
            reference: ['U3', {
                x: 5,
                y: 10,
                rotation: 180,
                layer: 'F.SilkS',
                fontSize: 2.0,
                thickness: 0.3,
                show: true
            }],
            value: 'LM358',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'
        });

        expect(component.reference).toBe('U3');
        expect(component.text).toHaveLength(1);
        expect(component.text[0]).toMatchObject({
            property: 'Reference',
            text: 'U3',
            x: 5,
            y: 10,
            rotation: 180,
            layer: 'F.SilkS',
            fontSize: 2.0,
            thickness: 0.3,
            show: true
        });
    });

    it('should merge reference positioning with existing text properties', () => {
        const component = new Component({
            reference: ['U4', { x: 3, y: 4, rotation: 0 }],
            value: '555',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
            text: [
                {
                    property: 'Note',
                    text: 'Timer IC',
                    x: 0,
                    y: 5,
                    layer: 'F.Fab',
                    show: true
                }
            ]
        });

        expect(component.reference).toBe('U4');
        expect(component.text).toHaveLength(2);

        // Should have both the Note and Reference properties
        expect(component.text.find(t => t.property === 'Note')).toBeDefined();
        expect(component.text.find(t => t.property === 'Reference')).toMatchObject({
            property: 'Reference',
            text: 'U4',
            x: 3,
            y: 4,
            rotation: 0
        });
    });

    it('should override existing Reference property in text array', () => {
        const component = new Component({
            reference: ['U5', { x: 10, y: 20, rotation: 270 }],
            value: 'Op-Amp',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
            text: [
                {
                    property: 'Reference',
                    text: 'OLD',
                    x: 0,
                    y: 0,
                    layer: 'F.Fab',
                    show: false
                },
                {
                    property: 'Note',
                    text: 'Some note',
                    x: 5,
                    y: 5,
                    layer: 'F.Fab',
                    show: true
                }
            ]
        });

        expect(component.reference).toBe('U5');
        expect(component.text).toHaveLength(2);

        // The Reference property should be updated, not duplicated
        const referenceEntries = component.text.filter(t => t.property === 'Reference');
        expect(referenceEntries).toHaveLength(1);
        expect(referenceEntries[0]).toMatchObject({
            property: 'Reference',
            text: 'U5',
            x: 10,
            y: 20,
            rotation: 270
        });

        // Note property should remain unchanged
        expect(component.text.find(t => t.property === 'Note')).toMatchObject({
            property: 'Note',
            text: 'Some note',
            x: 5,
            y: 5
        });
    });

    it('should handle reference positioning with minimal options', () => {
        const component = new Component({
            reference: ['U6', { x: 0, y: 0 }],
            value: 'Regulator',
            footprint: 'Package_TO_SOT_SMD:SOT-23'
        });

        expect(component.reference).toBe('U6');
        expect(component.text).toHaveLength(1);
        expect(component.text[0]).toMatchObject({
            property: 'Reference',
            text: 'U6',
            x: 0,
            y: 0
        });
        expect(component.text[0].rotation).toBeUndefined();
        expect(component.text[0].layer).toBeUndefined();
        expect(component.text[0].fontSize).toBeUndefined();
    });

    it('should work with auto-generated reference when not provided', () => {
        const component = new Component({
            value: 'Test Component',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'
        });

        // Reference should be auto-generated (e.g., U1, U2, etc.)
        expect(component.reference).toMatch(/^U\d+$/);
        expect(component.text).toHaveLength(0);
    });

    it('should accept reference with width and height styling options', () => {
        const component = new Component({
            reference: ['R7', {
                x: 2,
                y: 3,
                width: 2.5,
                height: 2.0
            }],
            value: 'Sensor',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'
        });

        expect(component.reference).toBe('R7');
        expect(component.text).toHaveLength(1);
        expect(component.text[0]).toMatchObject({
            property: 'Reference',
            text: 'R7',
            x: 2,
            y: 3,
            width: 2.5,
            height: 2.0
        });
    });

    it('should accept reference with bold and italic styling', () => {
        const component = new Component({
            reference: ['C8', {
                x: 0,
                y: 0,
                bold: true,
                italic: true
            }],
            value: 'Controller',
            footprint: 'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm'
        });

        expect(component.reference).toBe('C8');
        expect(component.text).toHaveLength(1);
        expect(component.text[0]).toMatchObject({
            property: 'Reference',
            text: 'C8',
            bold: true,
            italic: true
        });
    });

    it('should accept reference with justify options', () => {
        const component = new Component({
            reference: ['D9', {
                x: 1,
                y: 1,
                justify: {
                    horizontal: 'center',
                    vertical: 'middle',
                    mirror: false
                }
            }],
            value: 'Display',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'
        });

        expect(component.reference).toBe('D9');
        expect(component.text).toHaveLength(1);
        expect(component.text[0]).toMatchObject({
            property: 'Reference',
            text: 'D9',
            x: 1,
            y: 1,
            justify: {
                horizontal: 'center',
                vertical: 'middle',
                mirror: false
            }
        });
    });

    it('should accept reference with all styling options combined', () => {
        const component = new Component({
            reference: ['L10', {
                x: 5,
                y: 10,
                rotation: 45,
                layer: 'F.SilkS',
                width: 3.0,
                height: 2.5,
                fontSize: 1.8,
                thickness: 0.25,
                bold: true,
                italic: false,
                justify: {
                    horizontal: 'right',
                    vertical: 'top',
                    mirror: true
                },
                show: true
            }],
            value: 'Full Styled',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'
        });

        expect(component.reference).toBe('L10');
        expect(component.text).toHaveLength(1);
        expect(component.text[0]).toMatchObject({
            property: 'Reference',
            text: 'L10',
            x: 5,
            y: 10,
            rotation: 45,
            layer: 'F.SilkS',
            width: 3.0,
            height: 2.5,
            fontSize: 1.8,
            thickness: 0.25,
            bold: true,
            italic: false,
            justify: {
                horizontal: 'right',
                vertical: 'top',
                mirror: true
            },
            show: true
        });
    });

    // Value positioning tests
    it('should accept value as a string (old format)', () => {
        const component = new Component({
            reference: 'R1',
            value: '10k',
            footprint: 'Resistor_SMD:R_0603_1608Metric'
        });

        expect(component.value).toBe('10k');
        expect(component.text).toHaveLength(0);
    });

    it('should accept value as a tuple with positioning', () => {
        const component = new Component({
            reference: 'R2',
            value: ['10k', { x: 0, y: 5, rotation: 0 }],
            footprint: 'Resistor_SMD:R_0603_1608Metric'
        });

        expect(component.value).toBe('10k');
        expect(component.text).toHaveLength(1);
        expect(component.text[0]).toMatchObject({
            property: 'Value',
            text: '10k',
            x: 0,
            y: 5,
            rotation: 0
        });
    });

    it('should accept value with full styling options', () => {
        const component = new Component({
            reference: 'C1',
            value: ['100nF', {
                x: 0,
                y: 6,
                rotation: 90,
                layer: 'F.SilkS',
                width: 1.5,
                height: 1.2,
                fontSize: 1.0,
                thickness: 0.2,
                bold: true,
                italic: false,
                justify: {
                    horizontal: 'center',
                    vertical: 'bottom'
                },
                show: true
            }],
            footprint: 'Capacitor_SMD:C_0805_2012Metric'
        });

        expect(component.value).toBe('100nF');
        expect(component.text).toHaveLength(1);
        expect(component.text[0]).toMatchObject({
            property: 'Value',
            text: '100nF',
            x: 0,
            y: 6,
            rotation: 90,
            layer: 'F.SilkS',
            width: 1.5,
            height: 1.2,
            fontSize: 1.0,
            thickness: 0.2,
            bold: true,
            italic: false,
            justify: {
                horizontal: 'center',
                vertical: 'bottom'
            },
            show: true
        });
    });

    it('should accept both reference and value positioning together', () => {
        const component = new Component({
            reference: ['U11', { x: 0, y: -5, rotation: 0 }],
            value: ['ATmega328P', { x: 0, y: 5, rotation: 0 }],
            footprint: 'Package_DIP:DIP-28_W7.62mm'
        });

        expect(component.reference).toBe('U11');
        expect(component.value).toBe('ATmega328P');
        expect(component.text).toHaveLength(2);

        const refText = component.text.find(t => t.property === 'Reference');
        const valText = component.text.find(t => t.property === 'Value');

        expect(refText).toMatchObject({
            property: 'Reference',
            text: 'U11',
            x: 0,
            y: -5,
            rotation: 0
        });

        expect(valText).toMatchObject({
            property: 'Value',
            text: 'ATmega328P',
            x: 0,
            y: 5,
            rotation: 0
        });
    });

    it('should override existing Value property in text array', () => {
        const component = new Component({
            reference: 'R3',
            value: ['22k', { x: 1, y: 6, rotation: 0 }],
            footprint: 'Resistor_SMD:R_0603_1608Metric',
            text: [
                {
                    property: 'Value',
                    text: 'OLD',
                    x: 0,
                    y: 0,
                    layer: 'F.Fab',
                    show: false
                },
                {
                    property: 'Note',
                    text: 'Some note',
                    x: 5,
                    y: 5,
                    layer: 'F.Fab',
                    show: true
                }
            ]
        });

        expect(component.value).toBe('22k');
        expect(component.text).toHaveLength(2);

        // The Value property should be updated, not duplicated
        const valueEntries = component.text.filter(t => t.property === 'Value');
        expect(valueEntries).toHaveLength(1);
        expect(valueEntries[0]).toMatchObject({
            property: 'Value',
            text: '22k',
            x: 1,
            y: 6,
            rotation: 0
        });

        // Note property should remain unchanged
        expect(component.text.find(t => t.property === 'Note')).toMatchObject({
            property: 'Note',
            text: 'Some note',
            x: 5,
            y: 5
        });
    });

    it('should auto-assign reference when tuple has empty/null/undefined string', () => {
        // Test with undefined
        const component1 = new Component({
            reference: [undefined, { x: 0, y: -5, rotation: 0 }],
            value: 'TestValue',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'
        });
        expect(component1.reference).toMatch(/^U\d+$/);
        expect(component1.text).toHaveLength(1);
        expect(component1.text[0].property).toBe('Reference');
        expect(component1.text[0].x).toBe(0);
        expect(component1.text[0].y).toBe(-5);

        // Test with null
        const component2 = new Component({
            reference: [null, { x: 1, y: -6, rotation: 90 }],
            value: 'TestValue2',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'
        });
        expect(component2.reference).toMatch(/^U\d+$/);
        expect(component2.text).toHaveLength(1);
        expect(component2.text[0].property).toBe('Reference');
        expect(component2.text[0].x).toBe(1);
        expect(component2.text[0].y).toBe(-6);
        expect(component2.text[0].rotation).toBe(90);

        // Test with empty string
        const component3 = new Component({
            reference: ['', { x: 2, y: -7, rotation: 180 }],
            value: 'TestValue3',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'
        });
        expect(component3.reference).toMatch(/^U\d+$/);
        expect(component3.text).toHaveLength(1);
        expect(component3.text[0].property).toBe('Reference');
        expect(component3.text[0].x).toBe(2);
        expect(component3.text[0].y).toBe(-7);
        expect(component3.text[0].rotation).toBe(180);
    });

    it('should use custom prefix when auto-assigning reference with positioning', () => {
        const component = new Component({
            reference: [undefined, { x: 0, y: -5, rotation: 0 }],
            value: 'Resistor',
            footprint: 'Resistor_SMD:R_0603_1608Metric',
            prefix: 'R'
        });
        expect(component.reference).toMatch(/^R\d+$/);
        expect(component.text).toHaveLength(1);
        expect(component.text[0].property).toBe('Reference');
    });

    // Fab positioning tests
    it('should accept fab positioning tuple', () => {
        const component = new Component({
            reference: 'U15',
            value: 'TestIC',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
            fab: ['U15', { x: 3.81, y: 8.89, rotation: 180 }]
        });

        expect(component.reference).toBe('U15');
        expect(component.fab).toBeDefined();
        expect(component.fab).toMatchObject({
            text: 'U15',
            x: 3.81,
            y: 8.89,
            rotation: 180
        });
    });

    it('should accept fab with full styling options', () => {
        const component = new Component({
            reference: 'U13',
            value: 'Controller',
            footprint: 'Package_DIP:DIP-28_W7.62mm',
            fab: ['U13', {
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
                    vertical: 'middle'
                },
                show: true
            }]
        });

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
                vertical: 'middle'
            },
            show: true
        });
    });

    it('should accept reference, value, and fab positioning together', () => {
        const component = new Component({
            reference: ['U17', { x: 0, y: -5, rotation: 0 }],
            value: ['MCU', { x: 0, y: 5, rotation: 0 }],
            fab: ['U17', { x: 3.81, y: 8.89, rotation: 180, width: 1, height: 1 }],
            footprint: 'Package_QFP:TQFP-32_7x7mm_P0.8mm'
        });

        expect(component.reference).toBe('U17');
        expect(component.value).toBe('MCU');
        expect(component.text).toHaveLength(2);

        const refText = component.text.find(t => t.property === 'Reference');
        const valText = component.text.find(t => t.property === 'Value');

        expect(refText).toMatchObject({
            property: 'Reference',
            text: 'U17',
            x: 0,
            y: -5,
            rotation: 0
        });

        expect(valText).toMatchObject({
            property: 'Value',
            text: 'MCU',
            x: 0,
            y: 5,
            rotation: 0
        });

        expect(component.fab).toMatchObject({
            text: 'U17',
            x: 3.81,
            y: 8.89,
            rotation: 180,
            width: 1,
            height: 1
        });
    });

    it('should store value footprint formatting for fp_text value node', () => {
        const component = new Component({
            reference: 'R10',
            value: ['10k', {
                x: 0,
                y: 3,
                rotation: 90,
                layer: 'F.Fab',
                width: 1.5,
                height: 1.2,
                fontSize: 1.0,
                thickness: 0.2,
                bold: true
            }],
            footprint: 'Resistor_SMD:R_0603_1608Metric'
        });

        // Value should be set correctly
        expect(component.value).toBe('10k');

        // Value text entry should be in text array
        expect(component.text).toHaveLength(1);
        const valueText = component.text.find(t => t.property === 'Value');
        expect(valueText).toMatchObject({
            property: 'Value',
            text: '10k',
            x: 0,
            y: 3,
            rotation: 90
        });

        // Value footprint formatting should be stored separately
        expect(component.valueFootprint).toBeDefined();
        expect(component.valueFootprint).toMatchObject({
            x: 0,
            y: 3,
            rotation: 90,
            layer: 'F.Fab',
            width: 1.5,
            height: 1.2,
            fontSize: 1.0,
            thickness: 0.2,
            bold: true
        });
    });

    it('should use ${REFERENCE} when fab text is empty/null/undefined', () => {
        // Test with undefined
        const component1 = new Component({
            reference: 'U15',
            value: 'TestIC',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
            fab: [undefined, { x: 3.81, y: 8.89, rotation: 180 }]
        });
        expect(component1.fab).toBeDefined();
        expect(component1.fab?.text).toBe('${REFERENCE}');
        expect(component1.fab?.x).toBe(3.81);
        expect(component1.fab?.y).toBe(8.89);
        expect(component1.fab?.rotation).toBe(180);

        // Test with null
        const component2 = new Component({
            reference: 'U16',
            value: 'TestIC2',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
            fab: [null, { x: 5, y: 10, rotation: 90 }]
        });
        expect(component2.fab).toBeDefined();
        expect(component2.fab?.text).toBe('${REFERENCE}');
        expect(component2.fab?.x).toBe(5);
        expect(component2.fab?.y).toBe(10);
        expect(component2.fab?.rotation).toBe(90);

        // Test with empty string
        const component3 = new Component({
            reference: 'U17',
            value: 'TestIC3',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
            fab: ['', { x: 0, y: 0, rotation: 0, width: 1, height: 1 }]
        });
        expect(component3.fab).toBeDefined();
        expect(component3.fab?.text).toBe('${REFERENCE}');
        expect(component3.fab?.x).toBe(0);
        expect(component3.fab?.y).toBe(0);
        expect(component3.fab?.rotation).toBe(0);
        expect(component3.fab?.width).toBe(1);
        expect(component3.fab?.height).toBe(1);
    });

    // Positioning-only format tests
    it('should accept reference as positioning-only object (auto-assign reference)', () => {
        const component = new Component({
            reference: { x: 0, y: -5, rotation: 0 },
            value: 'TestValue',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'
        });

        // Reference should be auto-assigned
        expect(component.reference).toMatch(/^U\d+$/);

        // Positioning should be applied
        expect(component.text).toHaveLength(1);
        expect(component.text[0]).toMatchObject({
            property: 'Reference',
            text: component.reference,
            x: 0,
            y: -5,
            rotation: 0
        });
    });

    it('should accept value as positioning-only object', () => {
        const component = new Component({
            reference: 'R20',
            value: { x: 0, y: 5, rotation: 90, width: 1.5, height: 1.2 },
            footprint: 'Resistor_SMD:R_0603_1608Metric'
        });

        // Value should be empty string
        expect(component.value).toBe('');

        // Positioning should be applied
        expect(component.text).toHaveLength(1);
        expect(component.text[0]).toMatchObject({
            property: 'Value',
            text: '',
            x: 0,
            y: 5,
            rotation: 90,
            width: 1.5,
            height: 1.2
        });

        // Value footprint formatting should be stored
        expect(component.valueFootprint).toBeDefined();
        expect(component.valueFootprint).toMatchObject({
            x: 0,
            y: 5,
            rotation: 90,
            width: 1.5,
            height: 1.2
        });
    });

    it('should accept fab as positioning-only object (auto ${REFERENCE})', () => {
        const component = new Component({
            reference: 'U18',
            value: 'TestIC',
            footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
            fab: { x: 3.81, y: 8.89, rotation: 180, width: 1, height: 1 }
        });

        // Fab should use ${REFERENCE} as text
        expect(component.fab).toBeDefined();
        expect(component.fab).toMatchObject({
            text: '${REFERENCE}',
            x: 3.81,
            y: 8.89,
            rotation: 180,
            width: 1,
            height: 1
        });
    });
});

