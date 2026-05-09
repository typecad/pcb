# @typecad/kicad2typecad

Parse KiCad PCB board files (`.kicad_pcb`) and generate typeCAD code. This tool is designed to convert KiCad PCB design data into typeCAD format with optional TypeScript variable name mapping.

## Features

- Parses tracks and transforms them into typeCAD `TrackBuilder` chains.
- Parses components to generate component placement code, including rotation.
- Parses vias sections to generate via code.
- **Optional TypeScript analysis**: Automatically extracts variable names from existing TypeScript code
- Outputs ready-to-use typeCAD code

## Installation

To use this package, ensure you have Node.js and npm installed. Then, install the package using npm:

```bash
npm install -g @typecad/kicad2typecad
```

## Usage

### Basic Usage

Uses KiCad reference designators as-is:

```bash
kicad2typecad <path_to_kicad_pcb_file>
```

### With TypeScript Code Analysis

Automatically extract variable names from your existing TypeScript code:

```bash
kicad2typecad <path_to_kicad_pcb_file> circuit.ts
```

This will analyze your TypeScript file for component declarations like:
```typescript
let r1 = new Resistor({ value: '1kohm' });
const decouplingCap = new Capacitor({ value: '100nF' });
this.microcontroller = new IC({ ... });
```

## Output

### Without TypeScript Analysis
```typescript
this.R1.pcb = { x: 10, y: 20, rotation: 0 };
this.C1.pcb = { x: 15, y: 25, rotation: 90 };
this.U1.pcb = { x: 30, y: 40, rotation: 180 };
```

### With TypeScript Analysis
```typescript
this.r1.pcb = { x: 10, y: 20, rotation: 0 };
this.decouplingCap.pcb = { x: 15, y: 25, rotation: 90 };
this.microcontroller.pcb = { x: 30, y: 40, rotation: 180 };
```

The TypeScript analysis automatically maps KiCad references to your actual variable names, allowing you to copy-paste the generated code directly into your typeCAD project.