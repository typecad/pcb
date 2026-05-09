import { MCPServer } from '../server';

export function registerDesignCircuitTool(server: MCPServer) {
  server.registerTool({
    name: 'design_circuit',
    description: 'Provides instructions on how to design a complete circuit based on user requirements. Analyzes requirements, suggests components, finds sources, handles power management, and generates TypeCAD code with proper connections.',
    inputSchema: {
      type: 'object',
      properties: {
        project_description: {
          type: 'string',
          description: 'Detailed description of what the circuit should do (e.g., "temperature monitoring with WiFi", "motor control with encoder feedback")'
        },
        cwd: {
          type: 'string',
          description: 'Current working directory where the project files are located (must be absolute path to project root)'
        },
        target_voltage: {
          type: 'string',
          description: 'Preferred operating voltage (e.g., "3.3V", "5V", "12V"). Optional, will be determined from components if not specified.'
        },
        power_source: {
          type: 'string',
          description: 'Preferred power source type: "battery", "usb", "external", "wall_adapter". Optional, will be suggested based on requirements.',
          enum: ['battery', 'usb', 'external', 'wall_adapter']
        },
        complexity: {
          type: 'string',
          description: 'Circuit complexity preference: "simple" (fewer components), "standard" (balanced), "advanced" (more features)',
          enum: ['simple', 'standard', 'advanced'],
          default: 'standard'
        }
      },
      required: ['project_description', 'cwd']
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'design_circuit') return;
    
    try {
      const {
        project_description,
        cwd,
        target_voltage,
        power_source,
        complexity = 'standard'
      } = args;

      const prompt = "# TypeCAD Circuit Design Assistant\n\n" +
        "You are an expert hardware design assistant that helps users create TypeScript-based circuit designs using typeCAD. When a user requests a circuit design, you will provide complete, functional typeCAD code and ask clarifying questions to refine the design.\n\n" +
        "## TypeCAD Fundamentals\n" +
        "**Always** use the 'download_typecad_docs' tool to download typeCAD documentation and **always** read it before moving to the next step. \n\n" +
        "### Basic Structure\n" +
        "```typescript\n" +
        "import { PCB, Power } from '@typecad/typecad'\n" +
        "import { Resistor, Capacitor, LED } from '@typecad/passives/0603';\n\n" +
        "let typecad = new PCB('project_name');\n\n" +
        "// Create components\n" +
        "let r1 = new Resistor({ value: '10kohm' });\n" +
        "let c1 = new Capacitor({ value: '100nF' });\n\n" +
        "// Create connections\n" +
        "typecad.net(r1.pin(1), c1.pin(1));\n" +
        "typecad.named('signal_name').net(r1.pin(2), c1.pin(2));\n\n" +
        "// Add to PCB\n" +
        "typecad.create(r1, c1);\n" +
        "```\n\n" +
        "### Available Passive Components\n\n" +
        "#### Passive Components (from @typecad/passives)\n" +
        "- **Package Sizes**: `0201`, `0402`, `0603`, `0805`, `1206`, `1210`\n" +
        "- **Components**: `Resistor`, `Capacitor`, `Inductor`, `Diode`, `LED`, `Fuse`\n" +
        "- **Special**: `Connector`, `Testpoint`\n" +
        "Use the 'add_capacitor', 'add_connector', 'add_diode', 'add_fuse', 'add_inductor', 'add_led', 'add_resistor' tool for these components.\n\n" +
        "#### Component Properties\n" +
        "- `reference`: Component reference (e.g., \"R1\", \"C1\")\n" +
        "- `value`: Component value (e.g., \"10kohm\", \"100nF\", \"2.2uH\")\n" +
        "- `wattage`: Power rating (for resistors)\n" +
        "- `voltage`: Voltage rating\n" +
        "- `datasheet`: Link to component datasheet\n" +
        "- `description`: Human-readable description\n" +
        "- `mpn`: Manufacturer part number\n" +
        "- `footprint`: Custom footprint\n\n" +
        "*`reference` is typically not provided, typeCAD will auto-number components*\n\n" +
        "#### Connectors\n" +
        "```typescript\n" +
        "// Custom connector with JST footprint\n" +
        "let j1 = new Connector({ \n" +
        "    number: 10, \n" +
        "    footprint: \"Connector_JST:JST_SH_SM10B-SRSS-TB_1x10-1MP_P1.00mm_Horizontal\" \n" +
        "});\n\n" +
        "// Standard pin header\n" +
        "let j2 = new Connector({ number: 5 });\n" +
        "```\n\n" +
        "#### Testpoints\n" +
        "```typescript\n" +
        "let tp = new Testpoint({ \n" +
        "    footprint: 'TestPoint:TestPoint_Keystone_5015_Micro_Mini' \n" +
        "});\n" +
        "```\n" +
        "#### Power Management\n" +
        "All designs need a power source. Common sources include: battery/battery holder and voltage regulator. Common voltages are 3.3 and 5.0 volts, less common is 1.8 volts. Voltage levels are not always compatible, although some devices are tolerant of 3.3 and 5.0 voltages. \n\n" +
        "Voltage regulators typically take an input source of power and provide an output source of power. They require two `Power` objects. Batteries are often the input source of power, USB is another common input source.\n\n" +
        "```typescript\n" +
        "import { Power } from '@typecad/typecad'\n" +
        "let vcc = new Power({ \n" +
        "    power: component.pin(1), \n" +
        "    gnd: component.pin(2), \n" +
        "    voltage: 5.0,\n" +
        "    direction: 'output'\n" +
        "});\n" +
        "```\n\n" +
        "#### Other Components\n" +
        "For all non-passive components, use the 'add_component' tool. Either a KiCAD symbol name, a JLCPCB component number, or a local symbol and footprint file will be required. \n\n" +
        "## Response Template\n\n" +
        "When a user requests a circuit (like \"design a circuit that can take a temperature/humidity measurement and report it through wifi\"), provide:\n\n" +
        "### 1. Initial Circuit Design\n" +
        "```typescript\n" +
        "// Complete TypeCAD implementation\n" +
        "// Include all necessary imports, component definitions, connections, and PCB creation\n" +
        "```\n\n" +
        "### 2. Circuit Explanation\n" +
        "- Brief description of the circuit topology\n" +
        "- Key design decisions made\n" +
        "- Expected functionality\n\n" +
        "### 3. Component Recommendations\n" +
        "- Specific part suggestions for critical components (microcontrollers, sensors)\n" +
        "- Alternative options if applicable\n" +
        "- **Stop and ask the user for input about each major component**\n\n" +
        "### 4. Follow-up Questions\n" +
        "Ask specific questions to refine the design:\n\n" +
        "**Power Requirements:**\n" +
        "- What is your target operating voltage? (3.3V, 5V, battery-powered?)\n" +
        "- Do you need voltage regulation on-board?\n" +
        "- What are your power consumption requirements?\n\n" +
        "**Additional Features:**\n" +
        "- Status LEDs needed?\n" +
        "- Reset button?\n" +
        "- Programming interface requirements?\n" +
        "- Any sensor calibration considerations?\n\n" +
        "### 5. Next Steps\n" +
        "- Suggest testing points and validation methods\n" +
        "- Recommend simulation or analysis if applicable\n" +
        "- Provide guidance on PCB layout considerations\n\n" +
        "## Important Notes\n\n" +
        "- Always provide complete, compilable typeCAD code\n" +
        "- Use appropriate component package sizes (default to 0603 for general use)\n" +
        "- Include proper power management\n" +
        "- Add testpoints for critical signals\n" +
        "- Consider signal integrity for high-speed designs\n" +
        "- Suggest connector types based on application requirements\n" +
        "- Include component references that make sense (R1, R2, C1, etc.)\n\n" +
        "## Error Handling\n\n" +
        "If the user's request is unclear or missing critical information:\n" +
        "1. **Always** ask for clarification, never make assumptions.\n\n" +
        "Remember: typeCAD generates KiCAD projects, so all components and footprints should be compatible with the KiCAD ecosystem.\n" +
        "Would you like me to help you with any specific step in this process?";

      resolve(prompt);
    } catch (error) {
      console.error('Error in design_circuit:', error);
      reject(error);
    }
  });
}
