# Code as Schematic

## Why Write Code Instead of Dragging Components?

Traditional electrical design tools force you to click, drag, and manually wire components in a GUI. **type**CAD takes a different approach: **write TypeScript code to describe your circuit**, then build it into a KiCAD project.

## The Coding Experience

### � **Familiar Developer Tools**

```typescript
import { PCB, Resistor, Capacitor } from "@typecad/pcb";

let typecad = new PCB("my_circuit");
let r1 = new Resistor({ value: "10kohm" });
let c1 = new Capacitor({ value: "100nF" });
```

Use VS Code, TypeScript intellisense, and all your favorite developer tools. Get autocomplete for component properties, instant error checking, and refactoring support that actually understands your circuit.

### 🎯 **Declarative Circuit Description**

```typescript
// Describe what you want, not how to draw it
typecad.net(mcu.VCC, r1.pin(1), c1.pin(1)); // Power rail
typecad.net(mcu.GND, r1.pin(2), c1.pin(2)); // Ground rail
typecad.net(mcu.ADC0, r1.pin(2)); // Sensor input
```

Focus on the electrical connections and component relationships, not pixel-perfect wire routing. The code describes the circuit's behavior and intent clearly.

### 📐 **Parametric and Calculated Values**

```typescript
// Let code do the math
function ledResistor(vcc: number, vf: number, current: number) {
  return new Resistor({ value: `${(vcc - vf) / current}ohm` });
}

let r_led = ledResistor(5.0, 2.1, 0.02); // 145Ω for 20mA LED
```

No more manual calculations or looking up resistor values. Define your requirements and let TypeScript calculate the exact component values you need.

## Code vs. GUI Comparison

| GUI Schematic Tools                 | typeCAD Code                          |
| ----------------------------------- | ------------------------------------- |
| 🖱️ Click, drag, place components    | ⌨️ `new Resistor({ value: "1kohm" })` |
| 🔌 Manually draw wires              | 🔗 `typecad.net(pin1, pin2)`          |
| 📏 Eyeball component values         | 🧮 Calculate exact values with code   |
| 🔍 Hunt through component libraries | 📦 Import from npm packages           |
| 📋 Manual component lists           | 📊 Generated BOMs and docs            |

## The Developer Advantage

Writing hardware as code brings the same benefits that transformed software development:

- **Readability**: Circuit intent is clear from the code structure
- **Maintainability**: Easy to modify and extend existing designs
- **Consistency**: Standardized patterns across all your projects
- **Speed**: Express complex circuits in just a few lines
- **Precision**: Exact component values, no manual entry errors

Ready to design hardware like you write software?

[Get Started →](/getting-started)