# TypeCAD Wiring

🤖 Programmatically 💥 Create 🪢 Wiring Diagrams

TypeCAD Wiring is a TypeScript library for programmatically generating wiring harness diagrams and bill of materials (BOM) using code. Design your connectors, cables, and connections with type-safe code, then generate visual diagrams and BOMs automatically. 

## Features

- **Programmatic Creation** - Define your entire wiring harness using TypeScript/JavaScript
- **Visual Diagrams** - Generate Graphviz DOT files for visual representation
- **Bill of Materials** - Automatically create BOMs in CSV format
- **Detailed Customization** - Define colors, pin labels, connectors, and more

## Installation

```bash
npm install @typecad/wiring
```
This package will generate a GraphViz DOT file. The intended workflow is to use VSCode to generate, and then preview the DOT file. There are two recommended extensions for this:
- [Graphviz Interactive Preview](https://marketplace.visualstudio.com/items?itemName=tintinweb.graphviz-interactive-preview) - requires no additional configuration, but cannot use DOT files that show embedded images
- [Graphviz Preview](https://marketplace.visualstudio.com/items?itemName=EFanZh.graphviz-preview) - can use embedded images, but requires [Graphviz](https://graphviz.org/download/) to be installed.

## Quick Start

```typescript
import { Connector, Cable, Wiring } from '@typecad/wiring';

let harness = new Wiring();
  
  // Arduino/microcontroller connector
  let mcu = new Connector({
    name: 'MCU',
    type: 'Header',
    subtype: '1x4',
    pins: ['VCC', 'GND', 'SDA', 'SCL'],
  });
  
  // I2C sensor connector
  let sensor = new Connector({
    name: 'SENSOR',
    type: 'JST',
    subtype: 'SH 1.0mm',
    mpn: 'SM04B-SRSS-TB',
    pins: ['VCC', 'GND', 'SDA', 'SCL'],
  });
  
  // Connecting cable
  let cable = new Cable({
    name: 'I2C_BUS',
    type: 'Ribbon',
    gauge: '28 AWG',
    length: '20cm',
    additionals: [
      {quantity: 1, item: 'JST-SH housing', mpn: 'SSH-004T-P0.2'},
      {quantity: 4, item: 'JST-SH crimps', mpn: 'SSH-003T-P0.2'}
    ]
  });
  
  // Create connections
  cable.net({color: 'red', left: mcu.pin(1), right: sensor.pin(1)});       // VCC
  cable.net({color: 'black', left: mcu.pin(2), right: sensor.pin(2)});     // GND
  cable.net({color: 'blue', left: mcu.pin(3), right: sensor.pin(3)});      // SDA
  cable.net({color: 'yellow', left: mcu.pin(4), right: sensor.pin(4)});    // SCL
  
  // Add to harness
  harness.connectors(mcu, sensor);
  harness.cables(cable);
  
  // Create outputs
  harness.create('./i2c_sensor');
  harness.bom('./i2c_sensor_bom.csv');
```

## Documentation

### Core Components

#### `Connector`

Represents a physical connector with pins.

```typescript
new Connector({
  name: string,              // Connector name
  type?: string,             // Connector type (JST, Molex, etc.)
  subtype?: string,          // Connector subtype (XH, PH, etc.)
  color?: string,            // Connector color
  mpn?: string,              // Manufacturer part number
  pins?: string[],           // Pin labels/names
  additionals?: Array<{      // Additional components
    quantity?: number,
    item?: string,
    mpn?: string
  }>,
  note?: string,             // Notes about the connector
  image?: {                  // Image for diagrams
    src?: string,
    caption?: string,
    height?: number
  }
});
```

#### `Cable`

Represents a cable connecting pins between connectors.

```typescript
new Cable({
  name: string,              // Cable name
  type?: string,             // Cable type (Stranded, Solid, etc.)
  gauge?: string,            // Wire gauge (AWG)
  length?: string,           // Cable length
  color?: string,            // Cable color
  mpn?: string,              // Manufacturer part number
  bundle?: boolean,          // Is this a bundled cable?
  note?: string,             // Notes about the cable
  image?: {                  // Image for diagrams
    src?: string,
    caption?: string,
    height?: number
  }
});
```

Create connections with `net()` and `shield()` methods:

```typescript
cable.net({
  color?: string,            // Wire color
  left?: Pin,                // Left (source) pin
  right?: Pin,               // Right (destination) pin
  striped?: string           // Secondary color for striped wires
});

cable.shield({               // Create a shield connection
  left?: Pin,
  right?: Pin
});
```

#### `Wiring`

Main class for managing the entire wiring harness.

```typescript
const wiring = new Wiring();

// Add components
wiring.connectors(...connectors);
wiring.cables(...cables);

// Generate output
wiring.create(filename);     // Generate Graphviz DOT file
wiring.bom(filename);        // Generate BOM CSV file

// Utility methods
wiring.validate();           // Validate the entire harness
wiring.getConnector(name);   // Get a connector by name
wiring.getCable(name);       // Get a cable by name
```

### Error Handling

The library uses specific error classes for better error identification:

- `TypeCadWiringError` - Base error class
- `ConnectorError` - Connector-specific errors
- `PinError` - Pin-specific errors
- `CableError` - Cable-specific errors
- `NetError` - Connection-specific errors
- `DiagramError` - Diagram generation errors
- `BomError` - BOM generation errors
- `ValidationError` - General validation errors

## Output Examples

### Wiring Diagram (Graphviz DOT)

The library generates Graphviz DOT files that can be converted to images using various Graphviz tools.

```
graph {
  // Graph generated by https://typeCAD.net
  // Graphviz look heavily influenced by https://github.com/wireviz/WireViz
  graph [bgcolor="#FFFFFF" fontname=arial nodesep=0.33 rankdir=LR ranksep=2]
  node [fillcolor="#FFFFFF" fontname=arial height=0 margin=0 shape=none style=filled width=0]

  // Connector nodes, cable nodes, and edges...
}
```

### Bill of Materials (CSV)

```
Designator,Description,Quantity,MPN
motor_power,Stranded 2x 22AWG 30cm,1,
motor_controller,JST XH 3-pin,1,
motor,Terminal 2-pin,1,
```

## Requirements

- Node.js v14 or higher
- TypeScript/JavaScript environment
- GraphViz (for rendering the output diagrams)

## License

Licensed under [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)

## Notices
This project was inspired by [WireViz](https://github.com/wireviz/WireViz). No code comes from the project, but the idea for their visual representation does. 