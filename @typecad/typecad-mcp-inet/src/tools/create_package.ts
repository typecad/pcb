import { MCPServer } from '../server';

export function registerCreatePackageTool(server: MCPServer) {
  server.registerTool({
    name: "create_package",
    description: "Provides comprehensive instructions on how to create a complete typeCAD package (IC + supporting components) by analyzing a datasheet and schematic image. This tool guides you through the full package creation workflow including component analysis, package structure creation, and implementation. Use this when you want to create a reusable IC package with its typical application circuit, NOT for adding individual components.",
    inputSchema: {
      type: "object",
      properties: {
        random_string: {
          type: "string",
          description: "Dummy parameter for no-parameter tools"
        }
      },
      required: ["random_string"]
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'create_package') return;
    
    try {
      const createPackagePrompt = `
# TYPECAD PACKAGE CREATION INSTRUCTIONS

Create a typeCAD package for an IC by analyzing its datasheet and typical application schematic. Use the schematic image as the **primary reference** for the typical application circuit's components, values, and connections. Use the datasheet **primarily** for pin descriptions/types, component characteristics (voltage ratings, ESR, Isat, DCR), and understanding configuration options.

## Prerequisites
- IC Datasheet (PDF or text file)
- Typical Application Schematic Image (PNG, JPG, etc.)
- TypeCAD Documentation: downloaded using the \`download_typecad_docs\` tool

## Step-by-Step Process

### 1. Analyze Schematic Image and Datasheet

**Component Identification:**
- Identify the main IC part number shown in the schematic image or datasheet
- Examine the schematic image to identify all *core* external components (capacitors, resistors, inductors, etc.) *essential* for basic operation
- Note their schematic designations (C1, R1, etc.) and **values explicitly shown on the image**
- Cross-reference with datasheet for recommended characteristics (capacitor type/voltage, inductor Isat/DCR, resistor wattage/tolerance)
- Determine likely physical size (e.g., 0603, 0805) based on common practice or datasheet examples

**Pin Analysis:**
- Review datasheet for function and correct electrical type of each IC pin:
  - \`power_in\`, \`power_out\`, \`input\`, \`output\`, \`open_collector\`, \`passive\`
- Include absolute maximum and minimum voltage ratings for each pin
- Note pins connected in ways that imply required states (e.g., EN tied to VIN, MODE tied to GND)
- Identify configuration options suggested by schematic components

**User Confirmation:**
- Display list of essential components with values, characteristics, and likely size
- Prompt user to confirm or request modifications/additions/deletions
- Ask whether optional features should be included in package or left for external implementation

### 2. Create Package and IC Component File

**Use Terminal Command (NOT MCP tool):**
\`\`\`bash
npx @typecad/add-package ./src
\`\`\`

**CLI Interaction:**
- Choose **Component Package**
- Enter appropriate package name (e.g., \`lm7805\`)
- Select component source (KiCAD, local file, or EasyEDA/JLCPCB)
- Provide necessary identification info when prompted

**Expected Outcome:** Package directory (e.g., \`src/lm7805/\`) and initial IC component \`.ts\` file

### 3. Update IC Component File

**File Location:** Newly generated IC component \`.ts\` file within package directory

**Modifications:**
- Rename pin properties to match common datasheet names if needed
- Update \`Pin\` type for each pin to match correct electrical types from datasheet
- Update \`Pin\` type to include absolute voltage ratings from datasheet
- Ensure \`super()\` call passes optional \`reference\` parameter directly
- Add/update component's \`description\` and \`datasheet\` URL

**Pin Rating Example:**
\`\`\`typescript
new Pin(this.reference, 13, 'passive', this, { 
  minimum_voltage: -0.3, 
  maximum_voltage: 6.5 
});
\`\`\`

### 4. Populate Package Code (\`./src/[package_name]/index.ts\`)

**Imports:**
- Import main IC component class from local \`.ts\` file
- Import necessary passive component classes (default 0603 or identified size)
- Use \`@typecad/passives\` package for resistors, capacitors, LEDs, diodes, fuses, inductors
- For other components, use generic \`Component\` with inline comments

**Package Class Structure:**
\`\`\`typescript
export class lm7805 {
  public U1: MyIC;
  public C_IN: Capacitor;
  public C_OUT: Capacitor;
  // ... other components

  constructor(options: {
    input_capacitance?: number;
    output_capacitance?: number;
    passives?: '0402' | '0603' | '0805' | '1206';
  } = {}) {
    // Implementation
  }
}
\`\`\`

**Constructor Implementation:**
- Instantiate main IC without explicit \`reference\` argument
- Instantiate all essential external components using exact values from schematic
- Use constructor options to override default values if provided
- Implement all necessary net connections between IC and external components
- Connect grounds appropriately
- Handle conditional connections based on constructor options

**Component Grouping:**
\`\`\`typescript
this.pcb.group('[package_name]', ...this.components);
\`\`\`

**Connection Guidelines:**
- Use \`PCB::net()\` only, not \`PCB::named().net()\`
- All connections via \`PCB::net(...pins)\`
- Access pins through component properties (e.g., \`U1.VCC\`) or \`Component::pin()\`
- Passive component pins: \`Component.pin()\` method (e.g., \`R1.pin(1)\`)

**Documentation:**
- Write clear JSDoc comments for package class
- Describe purpose, configuration options (with defaults from schematic)
- Document required external connections
- Include usage examples

## Best Practices

1. **Prioritize Schematic Values:** Use values strictly from schematic image analysis
2. **Cross-Reference Datasheet:** Use datasheet for characteristics, not values
3. **No Placeholder Values:** Don't use placeholders if schematic value was identified
4. **Component Descriptions:** Include descriptive names and reference designators in descriptions
5. **Error Checking:** Review final file for errors and fix using typeCAD documentation

## Example Usage

\`\`\`typescript
import { lm7805 } from './src/lm7805';

const regulator = new lm7805({
  input_capacitance: 0.33,
  output_capacitance: 0.1,
  passives: '0603'
});
\`\`\`

Execute these steps sequentially, adapting component details based on the specific IC context. When finished, review the file for any errors and fix using the typeCAD documentation.
`;

      resolve(createPackagePrompt.trim());
    } catch (error) {
      reject(error);
    }
  });
}