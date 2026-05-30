# CLI Reference

All **type**CAD commands are accessed through the `typecad` binary, included with `@typecad/typecad`.

## Global Options

| Option | Description |
|--------|-------------|
| `--json` | Output results as JSON |
| `--help` | Show help for any command |
| `--version` | Show the typeCAD version |

## Commands

### `typecad create`

Create a new typeCAD project.

```bash
typecad create [options]
```

| Option | Description |
|--------|-------------|
| `--name ` | Project name |
| `--pio ` | Create a PlatformIO project |
| `--board ` | PlatformIO board ID |
| `--git ` | Initialize a git repository |
| `--packages ` | Comma-separated list of packages to install |

### `typecad build`

Build the typeCAD project and generate KiCAD output files.

```bash
typecad build [options]
```

| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed build output |

### `typecad add component`

Add a component to the project.

```bash
typecad add component [options]
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

### `typecad add package`

Create a reusable typeCAD package.

```bash
typecad add package [options]
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

### `typecad search`

Search KiCAD symbol libraries with fuzzy matching.

```bash
typecad search  [options]
```

| Option | Description |
|--------|-------------|
| `--format ` | Output format (default: text) |
| `--sort ` | Sort results by field |
| `--limit ` | Maximum number of results |

### `typecad import`

Convert a KiCAD PCB file to typeCAD code.

```bash
typecad import  [options]
```

| Option | Description |
|--------|-------------|
| `--apply` | Interactively apply coordinates to source files |

### `typecad diff`

Compare two KiCAD PCB files visually.

```bash
typecad diff   [options]
```

| Option | Description |
|--------|-------------|
| `--full` | Compare all layers |
| `--theme ` | Color theme for the report |
| `--output ` | Output HTML file path |

### `typecad doc`

Generate HTML documentation from Markdown + KiCAD PCB.

```bash
typecad doc   [options]
```

| Option | Description |
|--------|-------------|
| `-o ` | Output HTML file path |
| `-v` | Verbose output |
| `-q` | Quiet mode |
| `--no-open` | Don't open the file after generation |

### `typecad doctor`

Check your environment for required tools.

```bash
typecad doctor [options]
```

| Option | Description |
|--------|-------------|
| `--fix` | Attempt automatic fixes |
| `--json` | Machine-readable output |

### `typecad validate`

Validate source without full build.

```bash
typecad validate [options]
```

| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed output |
| `--json` | Machine-readable output |

### `typecad drc`

Run KiCAD Design Rule Check.

```bash
typecad drc [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable output |

### `typecad erc`

Run KiCAD Electrical Rules Check.

```bash
typecad erc [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable output |

       Project Structure