<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    let { data }: { data: PageData } = $props();
</script>

# Tooling

**type**CAD provides a unified CLI tool with a collection of commands to make the development process easier. All commands are accessed through the `typecad` binary, which is included when you install `@typecad/typecad`.

## `typecad create`

To create a new project:

<ScrollArea orientation="both">

```bash
typecad create
```
</ScrollArea>

You'll be prompted to enter project details:
- name for the project
- if you want to create a PlatformIO project and if so, the [board ID](https://docs.platformio.org/en/latest/boards/index.html)
- if you want to create a `git` repository
- install optional utility packages

A project will be created in the current directory. Inside the project directory, there will be a VSCode `workspace` file that will open the project in VSCode.

### Non-interactive mode
All the information can be passed by command-line arguments and the script will automatically create a project. `--help` will show all the parameters.

<ScrollArea orientation="both">

```bash
typecad create --name=typecad_project --git=false --pio=false
```
</ScrollArea>

---

## `typecad build`

Builds your typeCAD project, running the TypeScript entry file and generating KiCAD output files.

<ScrollArea orientation="both">

```bash
typecad build
```
</ScrollArea>

The outputs will be in `./build/`. Use `--verbose` for detailed output.

## `typecad add component`

Adds a component to the project. It is available as the `Add Component` script in VSCode's NPM Scripts sidebar.

<ScrollArea orientation="both">

```bash
typecad add component
```
</ScrollArea>

When the command runs, you'll be asked the source for the symbol and footprint files. You can mix any of the sources ie. a KiCAD symbol, but a local file. 
- If it's a KiCAD library component, you'll be prompted to enter the symbol and footprint names
- If it's a local file, you'll be prompted to enter the path to the file
- If it's an EasyEDA/JLCPCB component, you'll be asked for the `C###` number

A `[component].ts` file will be generated along with instructions on how to use it. Files will also be copied into the `./build/` directory.

### Non-interactive mode

<ScrollArea orientation="horizontal">

```bash
typecad add component --symbol_source=kicad --footprint_source=local --symbol=MCU_Microchip_ATtiny:ATtiny3227-M --footprint=MyLib:MyFootprint

typecad add component --symbol_source=jlcpcb --footprint_source=kicad --c=C3217148 --footprint=Package_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm
```
</ScrollArea>

<br>

> [!important]
> There's no need to add passives (resistors, capacitors etc.) this way. See the  [Passives](/docs/passives) page for more information.

## `typecad add package`

Creates a reusable **type**CAD package with all the boilerplate code. It sets up the package for easy publishing and reuse. It is discussed in more detail in the [Package Overview](/docs/package/overview) page.

Execute in `./hw` of an already existing **type**CAD project.

<ScrollArea orientation="both">

```bash
typecad add package
```
</ScrollArea>

### Non-interactive mode

<ScrollArea orientation="horizontal">

```bash
typecad add package --empty=true --name=my_package
typecad add package --component=true --name=attiny_package --kicad=true --symbol=MCU_Microchip_ATtiny:ATtiny3227-M --footprint=Package_DFN_QFN:DFN-20-1EP_3x4mm_P0.5mm_EP1.65x3.1mm
```
</ScrollArea>

## `typecad search`

Search KiCAD's symbol libraries with fuzzy matching:

<ScrollArea orientation="both">

```bash
typecad search "attiny"
typecad search "voltage regulator" --format=json --limit=10
```
</ScrollArea>

Results include symbol names, footprint suggestions, and component parameters.

## `typecad import`

Convert an existing KiCAD `.kicad_pcb` file into typeCAD TypeScript code. Useful for importing existing designs. See [Import](/docs/import) for details.

<ScrollArea orientation="both">

```bash
typecad import build/board.kicad_pcb
```
</ScrollArea>

## `typecad diff`

Compare two KiCAD PCB files visually with layer-by-layer diff, netlist comparison, and BOM diff. See [Git Diff](/docs/gitdiff) for details.

<ScrollArea orientation="both">

```bash
typecad diff board_v1.kicad_pcb board_v2.kicad_pcb
typecad diff HEAD~1 ./build/board.kicad_pcb
```
</ScrollArea>

## `typecad doc`

Generate HTML documentation from Markdown and KiCAD PCB files. Supports layer exports, 3D renders, and rich formatting. See [DocGen](/docs/docgen) for details.

<ScrollArea orientation="both">

```bash
typecad doc docs/board.md build/board.kicad_pcb -o output.html
```
</ScrollArea>

## `typecad doctor`

Check that your environment has all the required tools installed and properly configured.

<ScrollArea orientation="both">

```bash
typecad doctor
typecad doctor --fix
typecad doctor --json
```
</ScrollArea>

Use `--fix` to attempt automatic fixes, and `--json` for machine-readable output.

## `typecad validate`

Validate your typeCAD source code without performing a full build.

<ScrollArea orientation="both">

```bash
typecad validate
typecad validate --verbose --json
```
</ScrollArea>

## `typecad drc`

Run KiCAD's Design Rule Check as a passthrough to `kicad-cli`.

The board-wide rules DRC validates against (minimum clearance, track width, via
dimensions) default to the JLCPCB no-surcharge standard and are configurable in
code — see [Board Layout → Design Rules](/docs/board_layout#design-rules).

<ScrollArea orientation="both">

```bash
typecad drc
```
</ScrollArea>

## `typecad erc`

Run KiCAD's Electrical Rules Check as a passthrough to `kicad-cli`.

<ScrollArea orientation="both">

```bash
typecad erc
```
</ScrollArea>

<br />

> [!note] Global options
> All `typecad` commands support `--json` for machine-readable output, `--help` for usage info, and `--version` to check the version.

