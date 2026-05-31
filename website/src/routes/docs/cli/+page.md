<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    let { data }: { data: PageData } = $props();
</script>

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

<ScrollArea orientation="both">

```bash
typecad create [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--name <name>` | Project name |
| `--pio <true\|false>` | Create a PlatformIO project |
| `--board <id>` | PlatformIO board ID |
| `--git <true\|false>` | Initialize a git repository |
| `--packages <list>` | Comma-separated list of packages to install |

### `typecad build`

Build the typeCAD project and generate KiCAD output files.

<ScrollArea orientation="both">

```bash
typecad build [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed build output |

### `typecad add component`

Add a component to the project.

<ScrollArea orientation="both">

```bash
typecad add component [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--symbol_source <kicad\|local\|jlcpcb>` | Source for the symbol file |
| `--footprint_source <kicad\|local\|jlcpcb>` | Source for the footprint file |
| `--symbol <library:symbol>` | Symbol library path and name |
| `--footprint <library:footprint>` | Footprint library path and name |
| `--c <C###>` | JLCPCB component number |
| `--symbol_file <path>` | Path to local symbol file |
| `--footprint_file <path>` | Path to local footprint file |

### `typecad add package`

Create a reusable typeCAD package.

<ScrollArea orientation="both">

```bash
typecad add package [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--empty <true\|false>` | Create an empty package |
| `--component <true\|false>` | Create a component-based package |
| `--name <name>` | Package name |
| `--kicad <true\|false>` | Use KiCAD as source |
| `--local <true\|false>` | Use local files as source |
| `--jlcpcb <true\|false>` | Use JLCPCB as source |
| `--symbol <library:symbol>` | Symbol for component package |
| `--footprint <library:footprint>` | Footprint for component package |
| `--c <C###>` | JLCPCB component number |

### `typecad search`

Search KiCAD symbol libraries with fuzzy matching.

<ScrollArea orientation="both">

```bash
typecad search <query> [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--format <text\|json>` | Output format (default: text) |
| `--sort <field>` | Sort results by field |
| `--limit <n>` | Maximum number of results |

### `typecad import`

Convert a KiCAD PCB file to typeCAD code.

<ScrollArea orientation="both">

```bash
typecad import <pcb_file> [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--apply` | Interactively apply coordinates to source files |

### `typecad diff`

Compare two KiCAD PCB files visually.

<ScrollArea orientation="both">

```bash
typecad diff <original> <modified> [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--full` | Compare all layers |
| `--theme <name>` | Color theme for the report |
| `--output <path>` | Output HTML file path |

### `typecad doc`

Generate HTML documentation from Markdown + KiCAD PCB.

<ScrollArea orientation="both">

```bash
typecad doc <markdown> <pcb> [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `-o <path>` | Output HTML file path |
| `-v` | Verbose output |
| `-q` | Quiet mode |
| `--no-open` | Don't open the file after generation |

### `typecad doctor`

Check your environment for required tools.

<ScrollArea orientation="both">

```bash
typecad doctor [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--fix` | Attempt automatic fixes |
| `--json` | Machine-readable output |

### `typecad validate`

Validate source without full build.

<ScrollArea orientation="both">

```bash
typecad validate [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed output |
| `--json` | Machine-readable output |

### `typecad drc`

Run KiCAD Design Rule Check.

<ScrollArea orientation="both">

```bash
typecad drc [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable output |

### `typecad erc`

Run KiCAD Electrical Rules Check.

<ScrollArea orientation="both">

```bash
typecad erc [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable output |

### `typecad skills`

List and query typeCAD skills and API patterns.

<ScrollArea orientation="both">

```bash
typecad skills list [options]
typecad skills get <name> [options]
```
</ScrollArea>

| Subcommand | Description |
|------------|-------------|
| `list` | List all available skills, grouped by category |
| `get <name>` | Show details for a specific skill (usage, parameters, examples) |

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable output |

<ScrollArea orientation="both">

```bash
typecad skills list
typecad skills get resistor
typecad skills get power --json
```
</ScrollArea>

