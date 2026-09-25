# TypeCAD Wiring

🤖 Programmatically 💥 Create 🪢 Wiring Diagrams

TypeCAD Wiring is a TypeScript library and CLI for programmatically generating wiring harness diagrams and bill of materials (BOM) using code. Design your connectors, cables, and connections with type-safe code, then generate visual diagrams and BOMs automatically.

## Features

- **Programmatic Creation** - Define your entire wiring harness using TypeScript/JavaScript
- **Visual Diagrams** - Generate Graphviz DOT files (or SVG/PNG/PDF) with pin cross-references (WireViz style)
- **Multi-Page Diagrams** - Split large harnesses across named pages
- **Bill of Materials** - Detailed or MPN-grouped BOMs in CSV format
- **Wire Cut List** - Manufacturing-ready wire run list (color, gauge, length, from/to)
- **Design Rule Checks** - Unused pins, duplicate wires and shorts reported
- **Taps & Splices** - Multi-endpoint nets fan out from a single wire row
- **Standalone CLI** - Generate, validate, scaffold and watch diagrams without a typeCAD project

## Installation

```bash
npm install @typecad/wiring
```
This package will generate a GraphViz DOT file. The intended workflow is to use VSCode to generate, and then preview the DOT file. There are two recommended extensions for this:
- [Graphviz Interactive Preview](https://marketplace.visualstudio.com/items?itemName=tintinweb.graphviz-interactive-preview) - requires no additional configuration, but cannot use DOT files that show embedded images
- [Graphviz Preview](https://marketplace.visualstudio.com/items?itemName=EFanZh.graphviz-preview) - can use embedded images, but requires [Graphviz](https://graphviz.org/download/) to be installed.

## Usage

There are two ways to use typeCAD Wiring:

1. **Standalone CLI** - run `typecad-wiring` against an entry file, no typeCAD project needed
2. **As a library** - import it inside a typeCAD (or any Node) project and call it from your own code

### Standalone CLI

Write an entry file that builds your harness and **default-exports** the `Wiring` instance:

```typescript
// wiring.ts
import { Connector, Cable, Wiring } from '@typecad/wiring';

const mcu = new Connector({
  name: 'MCU',
  type: 'Header',
  subtype: '1x4',
  pins: ['VCC', 'GND', 'SDA', 'SCL'],
});

const sensor = new Connector({
  name: 'SENSOR',
  type: 'JST',
  subtype: 'SH 1.0mm',
  mpn: 'SM04B-SRSS-TB',
  pins: ['VCC', 'GND', 'SDA', 'SCL'],
});

const cable = new Cable({
  name: 'I2C_BUS',
  type: 'Ribbon',
  gauge: '28 AWG',
  length: '20cm',
});

cable.net({ color: 'red', left: mcu.pin(1), right: sensor.pin(1) });     // VCC
cable.net({ color: 'black', left: mcu.pin(2), right: sensor.pin(2) });   // GND
cable.net({ color: 'blue', left: mcu.pin(3), right: sensor.pin(3) });    // SDA
cable.net({ color: 'yellow', left: mcu.pin(4), right: sensor.pin(4) });  // SCL

const harness = new Wiring();
harness.connectors(mcu, sensor);
harness.cables(cable);

export default harness; // <- the CLI takes over from here
```

Then generate the diagram (and optionally a BOM):

```bash
npx typecad-wiring wiring.ts --out ./output --bom
```

```
Usage:
  typecad-wiring [entry] [options]   Generate the wiring diagram (default command)
  typecad-wiring validate [entry]    Validate the harness and run DRC checks
  typecad-wiring bom [entry]         Generate only the BOM CSV
  typecad-wiring init [path]         Scaffold a starter entry file (default: ./wiring.ts)

Arguments:
  entry                 Path to a TypeScript or JavaScript file that
                        default-exports a Wiring instance
                        (default: ./wiring.ts, fallback ./src/wiring.ts)
  path                  Target file for init

Options:
  -o, --out <dir>       Directory to write generated files into (default: .)
  -f, --format <fmt>    Output format: dot (default), svg, png, pdf — rendered via Graphviz
      --bom [<file>]    Also generate a BOM CSV (default: <entry>-bom.csv)
      --bom=grouped     BOM aggregated by MPN with summed quantities (or --grouped)
      --cutlist [<f>]   Also generate a wire cut list CSV (default: <entry>-cutlist.csv)
      --strict          Validate the harness and treat DRC warnings as errors
  -w, --watch           Regenerate when the entry file (or its siblings) change
  -q, --quiet           Silence per-component library output
      --force           With init: overwrite an existing file
      --json            Machine-readable output
  -h, --help            Show this help
  -v, --version         Show version
```

TypeScript entries are supported out of the box — no tsconfig or extra tooling required.

Handy invocations:

```bash
typecad-wiring init                      # scaffold ./wiring.ts from a template
typecad-wiring                          # generate from ./wiring.ts
typecad-wiring --format svg --strict     # render SVG, validate + DRC first
typecad-wiring --bom --cutlist --quiet   # BOM + wire cut list, quiet output
typecad-wiring --watch --out ./output    # regenerate on every save
typecad-wiring bom --grouped             # only the grouped BOM
typecad-wiring validate wiring.ts        # validation report, no files written
```

### As a library (e.g. inside a typeCAD project)

```typescript
import { Connector, Cable, Wiring } from '@typecad/wiring';

// ...define connectors, cables and connections as above...

const harness = new Wiring();
harness.connectors(mcu, sensor);
harness.cables(cable);

// Create outputs yourself
harness.create('./i2c_sensor');        // writes i2c_sensor.dot
harness.bom('./i2c_sensor_bom.csv');   // writes the BOM CSV
```

When run inside a typeCAD project, `typecad-pcb build` executes your entry file via `tsx`, so the calls above run as part of your normal build.

## Documentation

### Core Components

#### `Connector`

Represents a physical connector with pins.

```typescript
new Connector({
  name: string,              // Connector name
  type?: string,             // Connector type (JST, Molex, etc.)
  subtype?: string,          // Connector subtype (XH, PH, etc.)
  mpn?: string,              // Manufacturer part number
  pins?: (string | { number: number, name?: string })[],
                             // Pin labels/names (sequential) or explicit pin definitions
  additionals?: Array<{      // Additional components
    quantity?: number,
    item?: string,
    mpn?: string
  }>,
  note?: string,             // Notes about the connector
  image?: {                  // Image for diagrams
    src?: string,
    caption?: string
  },
  page?: string              // Diagram page for multi-page harnesses
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
  mpn?: string,              // Manufacturer part number
  bundle?: boolean,          // Is this a bundled cable?
  additionals?: Array<{      // Additional components
    quantity?: number,
    item?: string,
    mpn?: string
  }>,
  note?: string,             // Notes about the cable
  image?: {                  // Image for diagrams
    src?: string,
    caption?: string
  },
  page?: string              // Diagram page for multi-page harnesses
});
```

Create connections with `net()` and `shield()` methods:

```typescript
cable.net({
  name?: string,             // Net name shown in the diagram and cut list
  color?: string,            // Wire color (X11 name like 'red'/'darkgreen', or hex '#ff0000')
  left?: Pin | Pin[],        // Left (source) pin(s) — arrays create taps/splices
  right?: Pin | Pin[],       // Right (destination) pin(s)
  striped?: string           // Secondary color for striped wires
});

cable.shield({               // Create a shield connection
  left?: Pin,                // Multiple calls add pins to the same shield
  right?: Pin
});
```

Colors are validated up front against the X11 color names Graphviz understands (including numbered variants like `gray50`), so typos fail fast with a clear error instead of producing a broken diagram.

**Taps and splices**: pass arrays of pins to `net()` to create one multi-endpoint net — rendered as a single wire row fanning out to every pin:

```typescript
// One wire from J1:1 tapped to both J2:1 and J3:1
cable.net({ name: 'SDA', color: 'orange', left: j1.pin(1), right: [j2.pin(1), j3.pin(1)] });
```

**Multi-page diagrams**: give connectors and cables the same `page` value to split the harness across diagram sheets. The default page keeps the base filename; named pages get a suffix (`wiring.dot`, `wiring-aux.dot`). A cable referencing a connector on a different page fails with a clear error.

#### `Wiring`

Main class for managing the entire wiring harness.

```typescript
const wiring = new Wiring();

// Add components
wiring.connectors(...connectors);
wiring.cables(...cables);

// Generate output
wiring.create(filename);     // Generate Graphviz DOT file(s), one per page
wiring.bom(filename, {       // Generate BOM CSV file
  grouped?: boolean          //   grouped: aggregate rows by MPN with summed quantities
});
wiring.cutlist(filename);    // Generate the wire cut list CSV
                             //   (wire, color, gauge, length, from/to pins)

// Checks
wiring.validate();           // Validate the entire harness (throws on errors)
wiring.drc();                // Design rule checks: returns unused-pin,
                             //   duplicate-wire and short findings

// Utility methods
wiring.getConnector(name);   // Get a connector by name
wiring.getCable(name);       // Get a cable by name
wiring.getConnectors();      // Get all connectors
wiring.getCables();          // Get all cables
```

### Silencing library output

Constructors and `connectors()`/`cables()` print progress messages. Capture or silence them:

```typescript
import { setLogger } from '@typecad/wiring';

setLogger(null);                          // silence everything
setLogger({ info: (msg) => log(msg) });   // route to your own logger
```

The CLI's `--quiet` flag does this automatically (via the `TYPECAD_WIRING_QUIET` environment variable, which is honored even when the entry file loads its own copy of the library).

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

## Development

```bash
npm install        # install dependencies
npm run build      # compile src/ to dist/ (tsc)
npm run typecheck  # type-check without emitting
npm test           # run the vitest suite
```

The CLI can be run from source after a build with `node dist/cli/bin.js`.

## Requirements

- Node.js v18 or higher
- GraphViz (for rendering the output diagrams)

## License

Licensed under [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)

## Notices
This project was inspired by [WireViz](https://github.com/wireviz/WireViz). Python and YAML were replaced by a TypeScript implementation.
