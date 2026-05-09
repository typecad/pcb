# typeCAD MCP Server

An MCP (Model Context Protocol) server that provides AI assistants with direct access to typeCAD tools and workflows. This enables seamless integration between AI coding assistants and typeCAD's electronic design automation capabilities.

## What is MCP?

MCP (Model Context Protocol) is a standard that allows AI assistants to connect to external tools and data sources. This server exposes typeCAD's functionality as MCP tools, letting AI assistants create projects, add components, validate designs, and more.

## Features

The server provides these typeCAD tools to AI assistants:

- **🏗️ Create Project** - Initialize new typeCAD projects with optional PlatformIO support
- **🧩 Add Component** - Add components from KiCAD libraries or JLCPCB catalog
- **📄 PDF to Text** - Convert component datasheets from PDF to text format
- **📚 Download Docs** - Fetch the latest typeCAD documentation
- **✅ Validate Component** - Verify component definitions against datasheets
- **📦 Create Package** - Generate complete IC packages from datasheets and schematics

### Passive Components
Quick access to common passive components using the @typecad/passives package:

- **💈 Add Resistor** - Create resistors with value, wattage, voltage rating options
- **🪫 Add Capacitor** - Create capacitors with value, voltage rating options  
- **💡 Add LED** - Create LEDs with voltage and brightness specifications
- **🔌 Add Diode** - Create diodes with voltage and efficiency specifications
- **🌀 Add Inductor** - Create inductors with inductance value specifications
- **🔒 Add Fuse** - Create fuses with current and voltage ratings
- **🔗 Add Connector** - Create connectors with pin count and footprint options
- **🎯 Add Testpoint** - Create testpoints with custom footprint options

### Power Management
Tools for defining and managing power in your designs:

- **🔋 Add Power Source** - Define power sources like batteries and regulators with voltage specs
- **⚡ Add Power Input** - Define power input requirements for components and modules

### PCB Layout & Routing
Advanced PCB design tools for layout and routing:

- **🔗 Add Via** - Create vias for layer transitions with size, drill, and power specifications
- **🛤️ Add Track** - Create PCB tracks with power-aware routing and layer management

### Connections & Networking
Tools for managing electrical connections between components:

- **🏷️ Create Named Net** - Create named connections between pins for better organization
- **🔌 Connect Pins** - Connect multiple pins together in electrical networks

### Component Management
Advanced component creation and modification tools:

- **🧩 Create Custom Component** - Create custom components with named pins and power specs
- **⚙️ Set Component Properties** - Modify component properties like DNP, reference, value, etc.

### Design Validation
Comprehensive design checking and validation tools:

- **✅ Validate Design** - Run comprehensive design validation including power and ERC checks
- **🔍 Run ERC** - Run Electrical Rules Check to validate pin connections and compatibility

## Installation

Install globally via npm:

```bash
npm install -g @typecad/typecad-mcp
```

## Configuration

Add this to your MCP configuration file:

```json
{
  "mcpServers": {
    "typecad-mcp": {
      "command": "npx",
      "args": ["-y",
        "@typecad/typecad-mcp"
      ],
      "env": {}
    }
  }
}
```

## Usage

Once configured, AI assistants can use typeCAD tools directly in conversation:

- "Create a new typeCAD project called 'sensor-board'"
- "Add the ESP32-S3 microcontroller to my project"
- "Validate this component against its datasheet"
- "Create a package for this voltage regulator IC"
- "Add a resistor/capacitor/inductor/diode/LED/fuse/testpoint/connector"
- "Add a power source"

The AI assistant will automatically call the appropriate MCP tools and guide you through any required inputs.

## Requirements

- Node.js 18 or higher
- typeCAD CLI tools (installed automatically when needed)

## License

MIT 