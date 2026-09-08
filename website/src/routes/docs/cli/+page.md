<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    let { data }: { data: PageData } = $props();
</script>

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

<ScrollArea orientation="both">

```bash
typecad-pcb create [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--name <name>` | Project name |
| `--pio <true\|false>` | Create a PlatformIO project |
| `--board <id>` | PlatformIO board ID |
| `--git <true\|false>` | Initialize a git repository |

### `typecad-pcb build`

Build the typeCAD project and generate KiCAD output files.

<ScrollArea orientation="both">

```bash
typecad-pcb build [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed build output |

### `typecad-pcb add component`

Add a component to the project.

<ScrollArea orientation="both">

```bash
typecad-pcb add component [options]
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

### `typecad-pcb add package`

Create a reusable typeCAD package.

<ScrollArea orientation="both">

```bash
typecad-pcb add package [options]
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

### `typecad-pcb search`

Search KiCAD symbol libraries with fuzzy matching.

<ScrollArea orientation="both">

```bash
typecad-pcb search <query> [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--format <text\|json>` | Output format (default: text) |
| `--sort <field>` | Sort results by field |
| `--limit <n>` | Maximum number of results |

### `typecad-pcb import`

Convert a KiCAD PCB file to typeCAD code.

<ScrollArea orientation="both">

```bash
typecad-pcb import <pcb_file> [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--apply` | Interactively apply coordinates to source files |

### `typecad-pcb diff`

Compare two KiCAD PCB files visually.

<ScrollArea orientation="both">

```bash
typecad-pcb diff <original> <modified> [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--full` | Compare all layers |
| `--theme <name>` | Color theme for the report |
| `--output <path>` | Output HTML file path |

### `typecad-pcb doc`

Generate HTML documentation from Markdown + KiCAD PCB.

<ScrollArea orientation="both">

```bash
typecad-pcb doc <markdown> <pcb> [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `-o <path>` | Output HTML file path |
| `-v` | Verbose output |
| `-q` | Quiet mode |
| `--no-open` | Don't open the file after generation |

### `typecad-pcb doctor`

Check your environment for required tools.

<ScrollArea orientation="both">

```bash
typecad-pcb doctor [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--fix` | Attempt automatic fixes |
| `--json` | Machine-readable output |

### `typecad-pcb validate`

Validate source without full build.

<ScrollArea orientation="both">

```bash
typecad-pcb validate [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed output |
| `--json` | Machine-readable output |

### `typecad-pcb drc`

Run KiCAD Design Rule Check.

The rules DRC validates against are configurable in code — see
[Board Layout → Design Rules](/docs/board_layout#design-rules).

<ScrollArea orientation="both">

```bash
typecad-pcb drc [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable output |

### `typecad-pcb erc`

Run KiCAD Electrical Rules Check.

<ScrollArea orientation="both">

```bash
typecad-pcb erc [options]
```
</ScrollArea>

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable output |

### `typecad-pcb skills`

List and query typeCAD skills and API patterns.

<ScrollArea orientation="both">

```bash
typecad-pcb skills list [options]
typecad-pcb skills get <name> [options]
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
typecad-pcb skills list
typecad-pcb skills get resistor
typecad-pcb skills get power --json
```
</ScrollArea>

