import { MCPServer } from '../server';

export function registerCreatePackageTool(server: MCPServer) {
  server.registerTool({
    name: "create_package",
    description: "Create a complete typeCAD package (IC + supporting components) by analyzing a datasheet and schematic image. This tool guides you through the full package creation workflow including component analysis, package structure creation, and implementation. Use this when you want to create a reusable IC package with its typical application circuit, NOT for adding individual components.",
    inputSchema: {
      type: "object",
      properties: {
        datasheet: {
          type: "string",
          description: "Path to the IC datasheet (PDF or text file)"
        },
        schematic: {
          type: "string", 
          description: "Path to the typical application schematic image (PNG, JPG, etc.)"
        }
      },
      required: ["datasheet", "schematic"]
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'create_package') return;
    
    try {
      const { datasheet, schematic } = args;
      
      const createPackagePrompt = `
TYPECAD PACKAGE CREATION INSTRUCTIONS

Create a typeCAD package for the IC identified in the provided schematic image and datasheet. Use the schematic image as the **primary reference** for the typical application circuit's components, values, and connections. Use the datasheet **primarily** for pin descriptions/types, component characteristics (voltage ratings, ESR, Isat, DCR), and understanding configuration options. Use the typeCAD documentation and website for reference on class usage. This process will involve creating the IC's component file using the typeCAD tooling, requiring your interaction.

**Context:**
*   IC Datasheet: \`@${datasheet}\`
*   Typical Application Schematic Image: \`@${schematic}\` *(Primary Reference for Circuit)*
*   TypeCAD Documentation: \`llms-full.txt\`

**Tasks:**

1.  **Analyze Schematic Image and Datasheet:**
*   Identify the main IC part number shown in the schematic image (\`@*.png\`) or datasheet (\`@*.txt\`).
*   Examine the schematic image (\`@*.png\`) to identify all *core* external components (capacitors, resistors, inductors, etc.) *essential* for the basic operation shown. Note their schematic designations (C1, R1, etc.) and **values explicitly shown on the image**. If image analysis isn't available, prompt the user to enter a textual description.
*   Cross-reference these components with the datasheet (\`@*.txt\`) to find recommended characteristics (e.g., Capacitor Type/Voltage, Inductor Isat/DCR, Resistor Wattage/Tolerance). Note the likely physical size (e.g., 0603, 0805) based on common practice or datasheet examples.
*   **Stop here and display the list of essential components** with their values (**strictly from image**), characteristics (from datasheet/inference), and likely size. Prompt the user to confirm or request modifications/additions/deletions. **Do not proceed until confirmed.**
*   Once the essential component list is confirmed, determine the necessary electrical connections between the IC and these components based **primarily on the schematic image**.
*   Review the datasheet (\`@*.txt\`) for the function and correct electrical type (\`power_in\`, \`power_out\`, \`input\`, \`output\`, \`open_collector\`, \`passive\`, etc.) of each IC pin. Also look for the absolute maximum and minimum voltage ratings for each pin and include this information in each Pin object (new Pin(this.reference, 13, 'passive', this, { minimum_voltage: -0.3, maximum_voltage: 6.5 });).
*   Note any pins shown in the schematic image connected in a way that implies a required state (e.g., EN tied to VIN, MODE tied to GND).
*   Identify any configuration options suggested by components in the schematic (e.g., specific resistor values on SET or ADJ pins) and cross-reference with the datasheet to understand their effect. Note these for potential inclusion as package constructor options, using **schematic image values as defaults**. *Ask the user for clarification if the configuration shown requires a choice or if alternatives should be offered.*
*   Identify optional features shown in the schematic image (like status LEDs, specific pull-ups/pull-downs). **Stop here and ask the user** whether these optional features should be included in the package or left for external implementation.

2.  **Create Package and IC Component File (Requires User Interaction):**
*   **IMPORTANT: Use the terminal/shell command, NOT the add_component MCP tool or npx @typecad/add-component command**
*   Run the shell command: \`npx @typecad/add-package ./src\`
*   **Interact with the CLI prompts:**
*   Choose **Component Package**.
*   Enter an appropriate package name, typically \`[ic_name_lowercase]\` (e.g., \`lm7805\`).
*   Select the component source (KiCAD, local file, or EasyEDA/JLCPCB).
*   Provide the necessary identification info (symbol/footprint names, file paths, or C#) when prompted, using the info you prepared.
*   *Expected Outcome:* A package directory (e.g., \`src/lm7805/\`) and the initial IC component \`.ts\` file (e.g., \`src/lm7805/LM7805_TO220.ts\`) are created.

3.  **Update IC Component File (in the newly created .ts file):**
*   Locate the newly generated IC component \`.ts\` file within the package directory.
*   **(Self-Correction Check): Briefly compare the pin names/numbers in the generated file with the datasheet pinout analyzed in Step 1. Note any significant discrepancies, but proceed with using the generated file's structure.**
*   Modify this file:
*   Rename pin properties to match common datasheet names if the generated names are unclear or differ significantly from the datasheet pinout noted in Step 1.
*   Update the \`Pin\` type for each pin declaration to match the correct electrical types determined from the datasheet analysis in Step 1.
*   Update the \`Pin\` type for each pin declaration to match the correct electrical absolute ratings as determined from the datasheet analysis in Step 1.
*   In the \`constructor\`, ensure the \`super()\` call passes the received optional \`reference\` parameter directly: \`super({ reference: reference, /* other props */ })\`.
*   Add/Update the component's \`description\` and \`datasheet\` URL in the \`super()\` call, referencing the datasheet.

4.  **Populate Package Code (\`./src/[package_name]/index.ts\`):**
*   Edit the \`index.ts\` file within the package directory.
*   Import the main IC component class from its local \`.ts\` file.
*   Import necessary passive component classes (defaulting to \`0603\` or the size identified in Step 1). Passive components in the @typecad/passives package include resistors, capacitors, LEDs, diodes, fuses, and inductors. **If something other than those components are needed, or a specific footprint is required, use a generic \`Component\` and notate what it should be in an inline comment.**
*   If components had descriptive names (e.g. C_IN, R_PULLUP) include that in the component's description property. If the component was given a reference designator, put that in the description.
*   Define the package class structure (e.g., \`export class lm7805\`).
*   Add configuration options identified in Step 1 to the constructor's interface/parameters, using **values strictly from the schematic image analysis** as defaults. Allow \`passives\` size override. Do not include a \`reference\` option. Do not use reference designators for components either. 
*   Do not use \`.named\` connections, only \`.net\` (e.g. PCB::net() only, not PCB::named().net()). 
*   All connections are made by calling \`PCB::net(...pins);\`. Pins are accessed either through component properties (e.g. \`U1.VCC\`) or through \`Component::pin()\` where a number is passed to refer to the pin number. Passive component pins are normally referred to with the \`Component.pin()\` method (e.g. \`R1.pin(1)\`).
*   Add public class member properties for the main IC (\`U1\`) and all *essential* external components confirmed in Step 1. Include properties for conditionally created components if applicable.
*   In the \`constructor\`:
*   Instantiate the main IC (\`this.U1 = new MyIC()\`), **without** passing an explicit \`reference\` argument.
*   Instantiate all *essential* external components. **Use the exact values identified from the schematic image in Step 1.** Cross-reference the datasheet only for non-value characteristics (voltage, type). Use constructor options to override default values if provided. **Do not use placeholder values if the schematic value was identified.** If a schematic value is genuinely missing or ambiguous for an essential component, use a datasheet recommendation and note this, or ask the user.
*   Instantiate *conditional* external components based on constructor options.
*   Implement all necessary net connections between \`this.U1\` and the instantiated external components based **primarily on the schematic image analysis**. Connect grounds appropriately. Handle conditional connections based on constructor options.
*   Call \`this.pcb.group('[package_name]', ...this.components)\` including the IC and all *instantiated* external components using spread syntax (\`...\`).
*   Attempt to place components in their approximate locations as described by the datasheet. Do not create any tracks.
*   Write clear JSDoc comments for the package class, describing its purpose, configuration options (with defaults derived **explicitly from the schematic image**), required external connections (like EN pin state, pull-ups if omitted), and usage examples. 

Execute these steps sequentially, adapting component details based on the specific IC context provided, prioritizing the schematic image for circuit components, values, and connections. When finished, review the file for any errors (refer to typecad documentation) and fix. 
`;

      resolve(createPackagePrompt.trim());
    } catch (error) {
      reject(error);
    }
  });
}