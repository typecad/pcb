/**
 * Example: Adding Custom Text Properties to Components
 *
 * This example demonstrates how to add custom text properties to components
 * that will appear in the KiCad PCB footprint.
 */

import { Component, PCB } from '../index.js';

// Example 1: Create a component with custom text properties
const U1 = new Component({
    reference: 'U1',
    value: 'ATmega328P',
    footprint: 'Package_DIP:DIP-28_W7.62mm',
    pcb: { x: 100, y: 100, rotation: 0 },
    text: [
        // Add an extra property visible on F.Fab layer
        {
            property: 'PartNumber',
            text: 'ATMEGA328P-PU',
            x: 0,
            y: -10,
            rotation: 0,
            layer: 'F.Fab',
            show: true  // Visible in KiCad
        },
        // Add a note on the silkscreen
        {
            property: 'Note',
            text: 'Program before soldering',
            x: 0,
            y: 10,
            layer: 'F.SilkS',
            fontSize: 1.5,
            thickness: 0.2,
            show: true
        },
        // Add a hidden internal note
        {
            property: 'InternalNote',
            text: 'Tested OK 2024-01-15',
            x: 5,
            y: 5,
            layer: 'F.Fab',
            show: false  // Hidden in KiCad by default
        }
    ]
});

// Example 2: Customize existing properties (Reference, Value, etc.)
// This is useful for changing the position, size, or appearance of standard properties
const U2 = new Component({
    reference: 'U2',
    value: '74HC595',
    footprint: 'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm',
    pcb: { x: 150, y: 150, rotation: 0 },
    text: [
        // Customize the Reference property to appear on silkscreen with larger font
        {
            property: 'Reference',
            text: 'U2',
            x: 0,
            y: -5,
            layer: 'F.SilkS',
            fontSize: 2.0,
            thickness: 0.25,
            show: true
        },
        // Customize the Value property position and appearance
        {
            property: 'Value',
            text: '74HC595',
            x: 0,
            y: 5,
            layer: 'F.Fab',
            show: true
        }
    ]
});

// Create PCB and add the components
const pcb = new PCB('custom_text_example');
pcb.add(U1);
pcb.add(U2);

/**
 * The generated KiCad footprint will include property nodes like:
 *
 * (property "PartNumber" "ATMEGA328P-PU"
 *   (at 0 -10 0)
 *   (layer "F.Fab")
 *   (uuid "...")
 *   (effects
 *     (font
 *       (size 1.27 1.27)
 *       (thickness 0.15)
 *     )
 *   )
 *   (hide no)
 * )
 *
 * Text Property Options:
 * - property: string - The property name (e.g., "PartNumber", "Note", "Reference", "Value")
 * - text: string - The text to display
 * - x, y: number - Position relative to component center (in mm)
 * - rotation?: number - Rotation angle (default: 0)
 * - layer?: string - KiCad layer name (default: "F.Fab")
 * - fontSize?: number - Font size (default: 1.27)
 * - thickness?: number - Line thickness (default: 0.15)
 * - show?: boolean - Visibility: true = visible (hide no), false/undefined = visible (hide no)
 *   Note: By default, text is visible. Set show: false to hide it.
 *
 * Important Notes:
 * - If a property with the same name already exists in the footprint (e.g., "Reference", "Value"),
 *   it will be updated in place rather than creating a duplicate.
 * - This allows you to customize the position, size, and appearance of standard properties.
 * - New custom properties will be added to the footprint.
 */

export { U1, U2, pcb };
