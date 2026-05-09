/**
 * Example: Positioning Component Reference Text in KiCad
 *
 * This example demonstrates how to control the position and appearance of
 * component reference designators (like U1, R1, etc.) when viewed in KiCad.
 */

import { Component, PCB } from '../index.js';

// Example 1: Basic reference positioning
// The reference designator 'U1' will appear at position (x: 0, y: -5) relative to the component
const U1 = new Component({
    reference: ['U1', { x: 0, y: -5, rotation: 0 }],
    value: 'ATmega328P',
    footprint: 'Package_DIP:DIP-28_W7.62mm',
    pcb: { x: 100, y: 100, rotation: 0 }
});

// Example 2: Reference with custom layer and font size
// Position the reference on the silkscreen layer with a larger font
const U2 = new Component({
    reference: ['U2', {
        x: 1,
        y: 1,
        rotation: 0,
        layer: 'F.SilkS',
        fontSize: 2.0,
        thickness: 0.3
    }],
    value: '74HC595',
    footprint: 'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm',
    pcb: { x: 150, y: 100, rotation: 0 }
});

// Example 3: Rotated reference text
// Useful when the component is rotated or for space-constrained layouts
const U3 = new Component({
    reference: ['U3', {
        x: -3,
        y: 0,
        rotation: 90  // Vertical text
    }],
    value: 'LM358',
    footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
    pcb: { x: 200, y: 100, rotation: 0 }
});

// Example 4: Hidden reference designator
// Useful for small components or when you don't want the reference visible by default
const U4 = new Component({
    reference: ['U4', {
        x: 0,
        y: 0,
        show: false  // Hidden in KiCad
    }],
    value: 'NE555',
    footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
    pcb: { x: 250, y: 100, rotation: 0 }
});

// Example 5: Reference positioning with additional custom text
// You can combine reference positioning with other text properties
const U5 = new Component({
    reference: ['U5', {
        x: 0,
        y: -4,
        rotation: 0,
        layer: 'F.SilkS',
        fontSize: 1.5
    }],
    value: 'OpAmp',
    footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
    pcb: { x: 100, y: 150, rotation: 0 },
    text: [
        {
            property: 'Note',
            text: 'Low Noise',
            x: 0,
            y: 4,
            layer: 'F.SilkS',
            fontSize: 1.0,
            show: true
        }
    ]
});

// Example 6: Old format still works (backward compatible)
// If you don't need to position the reference, use the simple string format
const U6 = new Component({
    reference: 'U6',
    value: 'Regulator',
    footprint: 'Package_TO_SOT_SMD:SOT-23',
    pcb: { x: 150, y: 150, rotation: 0 }
});

// Example 7: Reference with width and height
// Control the font dimensions independently
const U7 = new Component({
    reference: ['U7', {
        x: 0,
        y: -6,
        width: 3.0,   // Font width in mm
        height: 2.5,  // Font height in mm
    }],
    value: 'MCU',
    footprint: 'Package_QFP:TQFP-32_7x7mm_P0.8mm',
    pcb: { x: 200, y: 150, rotation: 0 }
});

// Example 8: Reference with bold and italic styling
// Make the reference stand out with font styles
const U8 = new Component({
    reference: ['U8', {
        x: 0,
        y: -5,
        bold: true,
        italic: true,
        fontSize: 1.8,
        layer: 'F.SilkS'
    }],
    value: 'Power IC',
    footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
    pcb: { x: 250, y: 150, rotation: 0 }
});

// Example 9: Reference with text justification
// Control how text is aligned relative to its position
const U9 = new Component({
    reference: ['U9', {
        x: 0,
        y: 0,
        justify: {
            horizontal: 'center',  // Can be 'left', 'right', or 'center'
            vertical: 'middle',    // Can be 'top', 'bottom', or 'middle'
            mirror: false          // Mirror the text
        }
    }],
    value: 'Centered',
    footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
    pcb: { x: 100, y: 200, rotation: 0 }
});

// Example 10: Reference with all styling options
// Combine all available options for maximum control
const U10 = new Component({
    reference: ['U10', {
        x: 2,
        y: -8,
        rotation: 45,
        layer: 'F.SilkS',
        width: 4.0,
        height: 3.0,
        fontSize: 2.0,
        thickness: 0.35,
        bold: true,
        italic: false,
        justify: {
            horizontal: 'center',
            vertical: 'top',
            mirror: false
        },
        show: true
    }],
    value: 'Fully Styled',
    footprint: 'Package_DIP:DIP-28_W7.62mm',
    pcb: { x: 150, y: 200, rotation: 0 }
});

// Example 11: Value positioning (works the same as reference)
// Position the value text independently
const R1 = new Component({
    reference: 'R1',
    value: ['10k', {
        x: 0,
        y: 3,
        rotation: 0,
        layer: 'F.Fab',
        fontSize: 1.2
    }],
    footprint: 'Resistor_SMD:R_0603_1608Metric',
    pcb: { x: 200, y: 200, rotation: 0 }
});

// Example 12: Both reference and value positioning
// Control both the reference and value text independently
const C1 = new Component({
    reference: ['C1', {
        x: 0,
        y: -3,
        rotation: 0,
        layer: 'F.SilkS',
        fontSize: 1.5,
        bold: true
    }],
    value: ['100nF', {
        x: 0,
        y: 3,
        rotation: 0,
        layer: 'F.SilkS',
        fontSize: 1.0
    }],
    footprint: 'Capacitor_SMD:C_0805_2012Metric',
    pcb: { x: 250, y: 200, rotation: 0 }
});

// Example 13: Fab layer positioning
// Control the fp_text user "${REFERENCE}" element on fab layer
const U11 = new Component({
    reference: 'U11',
    value: 'ATmega328P',
    footprint: 'Package_DIP:DIP-28_W7.62mm',
    pcb: { x: 100, y: 250, rotation: 0 },
    fab: ['U11', {
        x: 3.81,
        y: 8.89,
        rotation: 180,
        width: 1,
        height: 1,
        thickness: 0.15
    }]
});

// Example 14: Complete positioning control
// Use reference, value, and fab together for full control
const U12 = new Component({
    reference: ['U12', {
        x: 0,
        y: -6,
        rotation: 0,
        layer: 'F.SilkS',
        fontSize: 1.5,
        bold: true
    }],
    value: ['Controller', {
        x: 0,
        y: 6,
        rotation: 0,
        layer: 'F.SilkS',
        fontSize: 1.2
    }],
    fab: ['U12', {
        x: 5,
        y: 10,
        rotation: 90,
        layer: 'F.Fab',
        width: 1,
        height: 1,
        thickness: 0.15
    }],
    footprint: 'Package_QFP:TQFP-32_7x7mm_P0.8mm',
    pcb: { x: 150, y: 250, rotation: 0 }
});

// Example 15: Auto-assign reference with positioning
// Use undefined/null/empty string to let the reference counter auto-assign
// while still controlling the position
const R2 = new Component({
    reference: [undefined, {
        x: 0,
        y: 2,
        rotation: 0,
        layer: 'F.SilkS'
    }],
    value: '1k',
    footprint: 'Resistor_SMD:R_0603_1608Metric',
    pcb: { x: 200, y: 250, rotation: 0 },
    prefix: 'R'  // Will auto-assign as R1, R2, etc.
});

// Example 16: Use ${REFERENCE} placeholder in fab
// Use undefined/null/empty string to use ${REFERENCE} in fab text
// This keeps the placeholder in the footprint for KiCad to replace
const U13 = new Component({
    reference: 'U13',
    value: 'Microcontroller',
    footprint: 'Package_DIP:DIP-28_W7.62mm',
    pcb: { x: 250, y: 250, rotation: 0 },
    fab: [undefined, {
        x: 3.81,
        y: 8.89,
        rotation: 180,
        width: 1,
        height: 1,
        thickness: 0.15
    }]
    // fab text will be '${REFERENCE}' which KiCad will replace with 'U13'
});

// Example 17: Value positioning with footprint formatting
// When you use value positioning, it affects both:
// 1. The Value property in the text array (for schematic/property display)
// 2. The fp_text value node in the footprint (for PCB display)
const R3 = new Component({
    reference: 'R3',
    value: ['10k', {
        x: 0,
        y: 3,
        rotation: 90,
        layer: 'F.Fab',
        width: 1.5,
        height: 1.2,
        thickness: 0.2
    }],
    footprint: 'Resistor_SMD:R_0603_1608Metric',
    pcb: { x: 300, y: 250, rotation: 0 }
});

// Create PCB and add all components
const pcb = new PCB('reference_positioning_example');
pcb.add(U1);
pcb.add(U2);
pcb.add(U3);
pcb.add(U4);
pcb.add(U5);
pcb.add(U6);
pcb.add(U7);
pcb.add(U8);
pcb.add(U9);
pcb.add(U10);
pcb.add(R1);
pcb.add(C1);
pcb.add(U11);
pcb.add(U12);
pcb.add(R2);
pcb.add(U13);
pcb.add(R3);

/**
 * Reference, Value, and Fab Positioning Options:
 *
 * All three properties support the same positioning format:
 * - reference: ['RefDes', { options }] or 'RefDes' (backward compatible)
 *   - Special: Use [undefined, { options }] or [null, { options }] or ['', { options }]
 *     to auto-assign reference while controlling position
 * - value: ['ValueText', { options }] or 'ValueText' (backward compatible)
 * - fab: ['FabText', { options }] (always tuple format)
 *   - Special: Use [undefined, { options }] or [null, { options }] or ['', { options }]
 *     to use '${REFERENCE}' placeholder (KiCad will replace with actual reference)
 *
 * What each controls:
 * - reference: Controls the component's Reference property text (visible on silkscreen/fab)
 * - value: Controls BOTH the component's Value property text AND the fp_text value formatting in footprint
 * - fab: Controls the fp_text user "${REFERENCE}" element in the footprint (F.Fab layer)
 *
 * Required:
 * - x: number - X position relative to component center (in mm)
 * - y: number - Y position relative to component center (in mm)
 *
 * Optional - Position and Rotation:
 * - rotation?: number - Rotation angle in degrees (default: 0)
 * - layer?: string - KiCad layer name (e.g., 'F.SilkS', 'F.Fab')
 *
 * Optional - Font Sizing:
 * - fontSize?: number - Font size in mm (default: 1.27)
 * - width?: number - Font width in mm (overrides fontSize for width)
 * - height?: number - Font height in mm (overrides fontSize for height)
 * - thickness?: number - Line thickness in mm (default: 0.15)
 *
 * Optional - Font Styling:
 * - bold?: boolean - Bold text (default: false)
 * - italic?: boolean - Italic text (default: false)
 * - justify?: object - Text alignment relative to position point
 *   - horizontal?: 'left' | 'right' | 'center' - Horizontal alignment
 *   - vertical?: 'top' | 'bottom' | 'middle' - Vertical alignment
 *   - mirror?: boolean - Mirror the text (default: false)
 *
 * Optional - Visibility:
 * - show?: boolean - Visibility (true = visible, false = hidden)
 *
 * Common KiCad Layers:
 * - 'F.SilkS' - Front silkscreen (visible in manufacturing)
 * - 'F.Fab' - Front fabrication layer (assembly drawing)
 * - 'B.SilkS' - Back silkscreen
 * - 'B.Fab' - Back fabrication layer
 *
// Example 18: Reference with positioning-only format (auto-assign reference)
// The positioning-only format allows you to specify positioning without providing a reference string
// The reference will be auto-assigned (U1, U2, etc.) while still applying the positioning
const u18 = new Component({
    reference: { x: 0, y: -5, rotation: 0 },  // No reference string - will auto-assign
    value: 'Auto-Ref-IC',
    footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'
});
// u18.reference will be something like 'U19', 'U20', etc. (auto-assigned)
// The positioning (x: 0, y: -5, rotation: 0) is still applied

// Example 19: Value with positioning-only format (empty value string)
// When you only care about positioning the value text but don't have a value string
const r18 = new Component({
    reference: 'R18',
    value: { x: 0, y: 5, rotation: 90, width: 1.5, height: 1.2 },  // No value string
    footprint: 'Resistor_SMD:R_0603_1608Metric'
});
// r18.value will be '' (empty string)
// The positioning is applied to both the text array and footprint value node

// Example 20: Fab with positioning-only format (auto ${REFERENCE})
// When you only need to position the fab layer text without specifying custom text
const u19 = new Component({
    reference: 'U19',
    value: 'Position-Only-Fab',
    footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
    fab: { x: 3.81, y: 8.89, rotation: 180, width: 1, height: 1 }  // No text string
});
// u19.fab.text will be '${REFERENCE}' (auto-assigned placeholder)
// The positioning is applied to the fp_text user node in the footprint

 * Notes:
 * - Positions are relative to the component's center point
 * - Positive Y is typically down in KiCad's coordinate system
 * - reference/value positioning is added to the component's text array
 * - value positioning ALSO applies formatting to the fp_text value node in the footprint
 * - fab positioning modifies the fp_text user "${REFERENCE}" node in the footprint
 * - If text array already contains a 'Reference' or 'Value' property, it will be replaced
 * - width/height override fontSize when both are specified
 * - These options match the gr_text options for consistency
 * - You can position reference, value, and fab independently
 * - fab is specifically for the fabrication layer reference in the footprint
 * - value applies to both schematic properties and PCB footprint text
 * - Three ways to specify each property:
 *   1. Simple string: reference: 'U1'
 *   2. Positioning-only: reference: { x: 0, y: -5 } (auto-assigns reference)
 *   3. String + positioning: reference: ['U1', { x: 0, y: -5 }]
 */

export { U1, U2, U3, U4, U5, U6, U7, U8, U9, U10, R1, C1, U11, U12, R2, U13, R3, pcb };
