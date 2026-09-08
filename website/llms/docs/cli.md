# CLI Reference

All **type**CAD commands are accessed through the `typecad` binary, included with `@typecad/pcb`.

## Global Options

| Option | Description |
|--------|-------------|
| `--json` | Output results as JSON |
| `--help` | Show help for any command |
| `--version` | Show the typeCAD version |

## Commands

### `typecad-pcb create`

Create a new typeCAD project.

```bash
typecad-pcb create [options]
```

| Option | Description |
|--------|-------------|
| `--name ` | Project name |
| `--pio ` | Create a PlatformIO project |
| `--board ` | PlatformIO board ID |
| `--git ` | Initialize a git repository |

### `typecad-pcb build`

Build the typeCAD project and generate KiCAD output files.

```bash
typecad-pcb build [options]
```

| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed build output |

### `typecad-pcb add component`

Add a component to the project.

```bash
typecad-pcb add component [options]
```

| Option | Description |
|--------|-------------|
| `--symbol_source ` | Source for the symbol file |
| `--footprint_source ` | Source for the footprint file |
| `--symbol ` | Symbol library path and name |
| `--footprint ` | Footprint library path and name |
| `--c ` | JLCPCB component number |
| `--symbol_file ` | Path to local symbol file |
| `--footprint_file ` | Path to local footprint file |

### `typecad-pcb add package`

Create a reusable typeCAD package.

```bash
typecad-pcb add package [options]
```

| Option | Description |
|--------|-------------|
| `--empty ` | Create an empty package |
| `--component ` | Create a component-based package |
| `--name ` | Package name |
| `--kicad ` | Use KiCAD as source |
| `--local ` | Use local files as source |
| `--jlcpcb ` | Use JLCPCB as source |
| `--symbol ` | Symbol for component package |
| `--footprint ` | Footprint for component package |
| `--c ` | JLCPCB component number |

### `typecad-pcb search`

Search KiCAD symbol libraries with fuzzy matching.

```bash
typecad-pcb search  [options]
```

| Option | Description |
|--------|-------------|
| `--format ` | Output format (default: text) |
| `--sort ` | Sort results by field |
| `--limit ` | Maximum number of results |

### `typecad-pcb import`

Convert a KiCAD PCB file to typeCAD code.

```bash
typecad-pcb import  [options]
```

| Option | Description |
|--------|-------------|
| `--apply` | Interactively apply coordinates to source files |

### `typecad-pcb diff`

Compare two KiCAD PCB files visually.

```bash
typecad-pcb diff   [options]
```

| Option | Description |
|--------|-------------|
| `--full` | Compare all layers |
| `--theme ` | Color theme for the report |
| `--output ` | Output HTML file path |

### `typecad-pcb doc`

Generate HTML documentation from Markdown + KiCAD PCB.

```bash
typecad-pcb doc   [options]
```

| Option | Description |
|--------|-------------|
| `-o ` | Output HTML file path |
| `-v` | Verbose output |
| `-q` | Quiet mode |
| `--no-open` | Don't open the file after generation |

### `typecad-pcb doctor`

Check your environment for required tools.

```bash
typecad-pcb doctor [options]
```

| Option | Description |
|--------|-------------|
| `--fix` | Attempt automatic fixes |
| `--json` | Machine-readable output |

### `typecad-pcb validate`

Validate source without full build.

```bash
typecad-pcb validate [options]
```

| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed output |
| `--json` | Machine-readable output |

### `typecad-pcb drc`

Run KiCAD Design Rule Check.

The rules DRC validates against are configurable in code — see
[Board Layout → Design Rules](/docs/board_layout#design-rules).

```bash
typecad-pcb drc [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable output |

### `typecad-pcb erc`

Run KiCAD Electrical Rules Check.

```bash
typecad-pcb erc [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable output |

### `typecad-pcb skills`

List and query typeCAD skills and API patterns.

```bash
typecad-pcb skills list [options]
typecad-pcb skills get  [options]
```

| Subcommand | Description |
|------------|-------------|
| `list` | List all available skills, grouped by category |
| `get ` | Show details for a specific skill (usage, parameters, examples) |

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable output |

```bash
typecad-pcb skills list
typecad-pcb skills get resistor
typecad-pcb skills get power --json
```