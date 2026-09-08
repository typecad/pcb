# Automate Your Hardware Design

## Why Automate Hardware Design?

Traditional hardware design is manual, error-prone, and time-consuming. **type**CAD brings the power of automation to electronic design, enabling you to **build smarter, faster, and more reliably** through code-driven workflows.

## Built-in Design Automation

### ⚡ **Electrical Rules Checking (ERC)**

```typescript
import { runERC } from "@typecad/pcb";

// Run ERC programmatically
let report = await runERC("./build/my_circuit.kicad_sch");

// Or use the CLI: typecad-pcb erc
```

Run ERC to validate your circuit against KiCAD's electrical rules. Catch connection errors, power mismatches, and pin type conflicts before they become hardware problems.

### 🔋 **Power-Aware Design Validation**

```typescript
// Power-aware tracks with automatic width calculation
let power_track = pcb.track()
  .powerInfo({ current: 2.0, maxTempRise: 10, thickness: 35 })
  .from({ x: 100, y: 100 }, "F.Cu", 0.2)
  .to({ x: 110, y: 100 });

// Power-aware vias with current capacity checking
let via = pcb.via({
  at: { x: 10, y: 10 },
  size: 0.8, drill: 0.4,
  powerInfo: { current: 1.5, maxTempRise: 5 }
});
```

**type**CAD automatically validates track widths, via sizes, and power delivery using IPC-2221 standards. No more manual calculations or thermal failures.

### 🎯 **Component Power Validation**

```typescript
// Define power requirements
let mcu = new Component({ /* ... */ });
mcu.pin(8, { powerInfo: { 
  minimum_voltage: 3.0, 
  maximum_voltage: 3.6, 
  current: 0.25 
}});

// Automatic power compatibility checking
let power_supply = new Power({ 
  power: mcu.pin(8),
  gnd: mcu.pin(4),
  voltage: 3.3, 
  current: 1.0,
  direction: "output" 
});
```

Automatically verify that power supplies can handle load requirements and voltage levels are compatible across your entire design.

## Custom Design Processing

### 📊 **Automated Documentation Generation**

```bash
typecad-pcb doc docs/board.md build/board.kicad_pcb -o output.html
```

The `typecad-pcb doc` command converts markdown files and KiCAD PCBs into comprehensive documentation with layer exports and 3D renders. Perfect for:

- **Assembly instructions** with layer-by-layer visuals
- **Technical documentation** with automated BOM generation  
- **Manufacturing packages** with pick-and-place files
- **Quality assurance** with automated test procedures

See the [DocGen](/docs/docgen) documentation for full details.

### 🔧 **In-House Design Processing**

Build custom automation workflows using **type**CAD's programmatic API:

```typescript
// Custom BOM processing
import { PCB } from "@typecad/pcb";

let pcb = new PCB("production_board");
// ... design your circuit ...

// Generate custom manufacturing outputs
pcb.create();
let bom = pcb.bom();

// Custom processing for your workflow
processForManufacturing(bom);
```

Create specialized outputs for your manufacturing partners, cost analysis tools, or inventory management systems.

## AI Integration

### 🤖 **typeCAD MCP Server**

```bash
npm install -g @typecad/pcb-mcp
```

The [typeCAD MCP Server](https://www.npmjs.com/package/@typecad/pcb-mcp) connects AI assistants directly to **type**CAD workflows:

- **"Create a new sensor board project"** → Automatically scaffolds project structure
- **"Add an ESP32-S3 with power regulation"** → Finds components and validates connections
- **"Validate this design against the datasheet"** → Runs comprehensive checks
- **"Generate assembly documentation"** → Creates manufacturing-ready outputs

### 🧠 **Intelligent Component Selection**

AI assistants can:
- **Analyze datasheets** and extract component specifications
- **Suggest optimal components** based on design requirements
- **Validate pin assignments** against manufacturer documentation
- **Generate test procedures** for quality assurance

## Automation vs. Manual Comparison

| Manual Design Process                | typeCAD Automation                     |
| ----------------------------------- | -------------------------------------- |
| 🔍 Manual ERC checking              | ⚡ Automatic electrical validation     |
| 📏 Calculate track widths by hand   | 🧮 Power-aware routing with IPC-2221  |
| 📋 Create BOMs manually             | 📊 Generated documentation packages   |
| 🔌 Hunt for component datasheets    | 🤖 AI-powered component analysis      |
| ⏰ Hours of validation work         | ⚡ Instant design rule checking       |

## The Automation Advantage

Bringing automation to hardware design delivers the same transformative benefits that revolutionized software development:

- **Reliability**: Catch errors before they reach hardware
- **Speed**: Instant validation and documentation generation
- **Consistency**: Standardized design rules across all projects
- **Scalability**: Handle complex designs with confidence
- **Integration**: Seamless CI/CD workflows for hardware

[Get Started →](/getting-started)