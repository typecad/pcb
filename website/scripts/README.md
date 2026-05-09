# Scripts

This directory contains utility scripts for the typeCAD documentation site.

## convert-md.js

Converts markdown files from the `src/routes` directory to the `llms` directory, stripping HTML elements and creating a clean version for LLM consumption.

**Usage:**
```bash
npm run convert-md
```

**What it does:**
- Reads all `.md` files from `src/routes`
- Strips HTML elements while preserving text content
- Converts SvelteKit route structure to flat markdown files
- Generates `llms.txt` with a table of contents
- Generates `llms-full.txt` with all content merged

## merge-api.js

Merges all API documentation from the `llms/api` directory into the `llms-full.txt` file, creating a complete documentation file that includes both user documentation and API reference.

**Usage:**
```bash
npm run merge-api
```

**What it does:**
- Reads all `.md` files from `llms/api`
- Includes `passives.md` from the `llms` directory
- Sorts them in logical order (Passives, Classes, Interfaces, Variables)
- Strips HTML elements and cleans up formatting
- Appends the API documentation to the existing `llms-full.txt`
- Creates human-friendly titles from filenames
- Maintains proper section structure with separators

**File processing order:**
1. passives.md
2. globals.md
3. Class.PCB.md
4. Class.Schematic.md
5. Class.Component.md
6. Class.ComponentRegistry.md
7. Class.Pin.md
8. Class.Power.md
9. Class.TrackBuilder.md
10. Class.KiCAD.md
11. Class.I2C.md
12. Class.UART.md
13. Class.USB.md
14. Interface.IComponent.md
15. Interface.IPinPowerInfo.md
16. Variable.kicad_path.md
17. Variable.kicad_cli_path.md

## prep-llm

A convenience script that runs the complete LLM preparation workflow in one command.

**Usage:**
```bash
npm run prep-llm
```

**What it does:**
1. Runs `convert-md` to generate clean markdown from `src/routes`
2. Runs `merge-api` to include API documentation in `llms-full.txt`
3. Copies `llms-full.txt` to the `static/` directory for web serving
4. Copies `llms.txt` to the `static/` directory for web serving

This is the recommended way to prepare all LLM documentation in one step.

## Workflow

The typical workflow for updating documentation:

1. **Update source files** in `src/routes`
2. **Run prep-llm** to generate and deploy all LLM documentation
3. **Commit changes** to version control

This ensures that both the website and the LLM-consumable documentation are kept in sync. 