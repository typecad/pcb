# JLCPCB Export

CLI tool to generate all files needed for [JLCPCB](https://jlcpcb.com/) assembly from a [typeCAD](https://typecad.net) project.

Runs DRC, validates the git repo, then outputs drill, position, gerbers, and BOM files formatted for JLCPCB -- zipped and ready to upload.

## Prerequisites

- A [typeCAD](https://typecad.net) project with a `typecad.conf.ts` file
- [KiCad](https://www.kicad.org/) installed (the CLI searches common install paths automatically)

## Installation

```bash
npm i @typecad/jlcpcb-export
```

Or run without installing:

```bash
npx @typecad/jlcpcb-export
```

## Usage

```bash
npx jlcpcb-export [board-name] [options]
```

The board name is auto-detected from the `entry` field in `typecad.conf.ts`. Given:

```ts
export default defineConfig({
  entry: './src/my-board.ts',
});
```

The board name `my-board` is used automatically. You can override it by passing an argument:

```bash
npx jlcpcb-export other-board
```

### Options

```
Arguments:
  board-name              Board name (auto-detected from typecad.conf.ts if omitted)

Options:
  -i, --ignore            Ignore DRC failures and dirty git repo
  --input <path>          Input build directory (default: ./build)
  --output <path>         Output directory (default: ./build/jlcpcb-{version})
  --kicad-cli <path>      Path to kicad-cli binary (default: auto-discovered)
  -v, --version           Print version
  -h, --help              Print help
```

### KiCad CLI path

The tool searches for `kicad-cli` in common install locations. If it's not found, specify the path via CLI:

```bash
npx jlcpcb-export --kicad-cli "/Applications/KiCad/kicad-cli"
```

Or in `typecad.conf.ts`:

```ts
export default defineConfig({
  entry: './src/my-board.ts',
  kicad_cli: '/Applications/KiCad/kicad-cli',
});
```

## Adding to a typeCAD Project

To run JLCPCB export automatically after building, add it to your project's `package.json` scripts:

```json
{
  "scripts": {
    "build": "typecad build",
    "export": "jlcpcb-export",
  },
  "devDependencies": {
    "@typecad/jlcpcb-export": "^2.0.0"
  }
}
```

Then run:

```bash
npm run build && npm run export
```

`export` will fail if DRC fails or the git repo has uncommitted changes. Use `export:force` to ignore those checks.

## Output

All files are written to `./build/jlcpcb-export/<package-slug>-<version>/`:

```
build/jlcpcb-export/
  my-project-1.0.0/
    my-board_cpl.csv      Component placement list (Pick & Place)
    my-board.csv           BOM with JLCPCB part numbers
    gerbers.zip            Zipped gerbers + drill file
    gerbers/               Raw gerber and drill files
```
