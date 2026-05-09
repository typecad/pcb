import { MCPServer } from '../server';

export function registerValidateComponentTool(server: MCPServer) {
  server.registerTool({
    name: "validate_component",
    description: "Validate a TypeCAD component .ts file against its datasheet and fix any issues",
    inputSchema: {
      type: "object",
      properties: {
        component_file_path: {
          type: "string",
          description: "Path to the TypeCAD component .ts file"
        },
        datasheet_path: {
          type: "string", 
          description: "Path to the component datasheet (PDF or text)"
        },
        auto_fix: {
          type: "boolean",
          description: "Automatically fix issues found",
          default: true
        }
      },
      required: ["component_file_path", "datasheet_path"]
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'validate_component') return;
    
    try {
      const { component_file_path, datasheet_path, auto_fix = true } = args;
      
      const validationPrompt = `
Create a typeCAD component for the IC identified in the datasheet. This process will involve creating the IC's component file using the typeCAD tooling, requiring your interaction.

**Context:**
*   IC Datasheet: \`${datasheet_path}\`
*   TypeCAD Component File: \`${component_file_path}\`
*   TypeCAD Documentation: \`llms-full.txt\`

**Tasks:**

1.  **Analyze Datasheet:**
    *   Identify the main IC part number from the datasheet (\`@*.txt\` or \`@*.pdf\`).
    *   Review the datasheet for the function and correct electrical type (\`power_in\`, \`power_out\`, \`input\`, \`output\`, \`open_collector\`, \`passive\`, etc.) of each IC pin.
    *   Look for the absolute maximum and minimum voltage ratings for each pin and note this information for inclusion in each Pin object (new Pin(this.reference, 13, 'passive', this, { minimum_voltage: -0.3, maximum_voltage: 6.5 });).
    *   Identify the correct pin names and numbers from the datasheet pinout diagram.
    *   Note any special pin characteristics or requirements mentioned in the datasheet.
    *   Identify sub-circuit requirements, such as pins that must be pulled LOW or HIGH (ENable, boot etc), or any other required passives to operate. This can be found in a description for the minimal circuit, if available. 


2.  **Create Component File (Requires User Interaction):**
    *   Run the \`npx @typecad/add-package --folder=./src\` command in the terminal so that the created file will be in the \`./src\` directory.
    *   **Interact with the prompts:**
        *   Choose **Component Package**.
        *   Enter an appropriate package name, typically \`[ic_name_lowercase]\` (e.g., \`lm7805\`). It must also be valid TypeScript (no spaces, special characters, starts with a number)
        *   Select the component source (KiCAD, local file, or EasyEDA/JLCPCB).
        *   Provide the necessary identification info (symbol/footprint names, file paths, or C#) when prompted.
    *   *Expected Outcome:* A component file (e.g., \`src/lm7805.ts\`) is created.

3.  **Update IC Component File (in the newly created .ts file):**
    *   Locate the newly generated IC component \`.ts\` file.
    *   **(Self-Correction Check): Briefly compare the pin names/numbers in the generated file with the datasheet pinout analyzed in Step 1. Note any significant discrepancies, but proceed with using the generated file's structure.**
    *   Modify this file:
        *   Rename pin properties to match datasheet names if the generated names are unclear or differ significantly from the datasheet pinout noted in Step 1.
        *   Update the \`Pin\` type for each pin declaration to match the correct electrical types determined from the datasheet analysis in Step 1.
        *   Update the \`Pin\` voltage ratings for each pin declaration to match the correct electrical absolute ratings as determined from the datasheet analysis in Step 1.
        *   In the \`constructor\`, ensure the \`super()\` call passes the received optional \`reference\` parameter directly: \`super({ reference: reference, /* other props */ })\`.
        *   Add/Update the component's \`description\` and \`datasheet\` URL in the \`super()\` call, referencing the datasheet.
        *   Write clear JSDoc comments for the component class, describing its purpose, pin functions, and usage notes based on the datasheet.

${auto_fix ? '4. **Auto-Fix**: Since auto_fix is enabled, make the necessary corrections to align the component with the datasheet.' : '4. **Report Issues**: Since auto_fix is disabled, report the discrepancies found without making changes.'}

Execute these steps sequentially, focusing on creating an accurate component representation based on the datasheet specifications. When done, cleanup the extra files: llms-full.txt, the datasheet, and the prompt.
`;

      resolve(validationPrompt.trim());
    } catch (error) {
      reject(error);
    }
  });
}