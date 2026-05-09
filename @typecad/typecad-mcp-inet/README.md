# typeCAD MCP Server

An MCP (Model Context Protocol) server that provides AI assistants with direct access to typeCAD tools and workflows. This enables seamless integration between AI coding assistants and typeCAD's electronic design automation capabilities.

## What is MCP?

MCP (Model Context Protocol) is a standard that allows AI assistants to connect to external tools and data sources. This server exposes typeCAD's functionality as MCP tools, letting AI assistants create projects, add components, validate designs, and more.

## Features

The server provides these typeCAD tools to AI assistants:

- **🏗️ Create Project** - Initialize new typeCAD projects with optional PlatformIO support
- **🧩 Add Component** - Add components from KiCAD libraries or JLCPCB catalog with intelligent file location management, automatic validation, and enhanced error reporting
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

## Installation & Deployment

### Local Installation (Traditional MCP)

Install globally via npm:

```bash
npm install -g @typecad/typecad-mcp
```

Add this to your MCP configuration file:

```json
{
  "mcpServers": {
    "typecad-mcp": {
      "command": "npx",
      "args": ["-y", "@typecad/typecad-mcp"],
      "env": {}
    }
  }
}
```

### Web Hosting (HTTP MCP Server)

This server can also be hosted as a web service, making it accessible via HTTP instead of stdio:

#### Development
```bash
# Clone the repository
git clone <repository-url>
cd typecad-mcp

# Install dependencies
npm install

# Run in web mode
npm run dev:web
```

The server will be available at `http://localhost:3000` with:
- **MCP Endpoint**: `POST /mcp` - Main MCP protocol endpoint
- **Health Check**: `GET /health` - Server status
- **Tools Info**: `GET /tools` - List available tools
- **Web UI**: `GET /` - Browser-based testing interface

#### Production Deployment

**Docker:**
```bash
# Build and run with Docker
docker build -t typecad-mcp .
docker run -p 3000:3000 typecad-mcp

# Or use docker-compose
docker-compose up -d
```

**Vercel:**
```bash
# Deploy to Vercel
npm run build
vercel --prod
```

**Other Platforms:**
The server works on any Node.js hosting platform (Heroku, Railway, DigitalOcean, AWS, etc.)

#### Environment Variables
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode (development/production)

#### Web Client Usage

You can interact with the web-hosted MCP server using HTTP requests:

```javascript
// Initialize MCP session
const response = await fetch('http://your-server.com/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "web-client", version: "1.0.0" }
    }
  })
});

// Call a tool
const toolResponse = await fetch('http://your-server.com/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "mcp_typecad_mcp_echo",
      arguments: { text: "Hello World!" }
    }
  })
});
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

### Enhanced Add Component Tool

The `add_component` tool has been significantly improved based on user feedback:

#### Key Improvements
- **🎯 Intelligent File Location Management**: Automatically handles working directory context and output folder specification
- **🔍 Enhanced File Discovery**: Searches multiple common directories and uses recursive search to find created files
- **⚠️ Comprehensive Error Reporting**: Provides detailed error messages with specific error codes and actionable suggestions
- **✅ Automatic Validation**: Validates symbol/footprint formats and provides suggestions for corrections
- **📍 Context-Aware Operation**: Supports both relative and absolute paths with proper working directory handling
- **🛠️ Improved Recovery**: Offers specific suggestions for common issues like missing files or incorrect formats

#### New Parameters
- `cwd`: Specifies the project working directory (absolute path recommended)
- Enhanced `output_folder`: Better handling of relative vs absolute paths
- Detailed validation with helpful error messages and format suggestions

#### Better Error Handling
- **MISSING_SOURCE**: Clear guidance when source type is not specified
- **INVALID_SYMBOL_FORMAT**: Format validation with examples and suggestions
- **INVALID_FOOTPRINT_FORMAT**: Footprint validation with common library examples
- **COMPONENT_FILE_NOT_FOUND**: File location troubleshooting with search details
- **COMMAND_EXECUTION_FAILED**: Installation and configuration guidance

#### Example Usage
```json
{
  "name": "add_component",
  "args": {
    "cwd": "/path/to/project",
    "source": "kicad", 
    "symbol": "MCU_Microchip_ATtiny:ATtiny85-20X",
    "footprint": "Package_DIP:DIP-8_W7.62mm",
    "output_folder": "src"
  }
}
```

## Requirements

- Node.js 18 or higher
- typeCAD CLI tools (installed automatically when needed)

## License

MIT 