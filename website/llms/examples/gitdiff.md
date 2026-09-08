# Visual PCB Diff

The `typecad-pcb diff` command lets you visually compare two KiCAD PCB files with an interactive HTML report showing layer-by-layer differences, netlist changes, and BOM differences.

## Basic Usage

Compare two PCB files:

```bash
typecad-pcb diff build/board_v1.kicad_pcb build/board_v2.kicad_pcb
```

This generates an HTML report and opens it in your browser. The report shows each PCB layer with changes highlighted in color.

## Git Revision Comparison

Compare against a previous git commit:

```bash
# Compare last commit vs current file
typecad-pcb diff HEAD~1 ./build/board.kicad_pcb

# Compare two specific commits
typecad-pcb diff v1.0.0 HEAD -- board.kicad_pcb
```

This is useful for code reviews — see exactly what changed on the PCB between revisions.

## Full Comparison

By default, only changed layers are included. Use `--full` to include all layers:

```bash
typecad-pcb diff --full board_v1.kicad_pcb board_v2.kicad_pcb
```

## What You'll See

The report includes:

1. **Visual layer diff**: Each copper, mask, silkscreen, and courtyard layer with changes highlighted
2. **Netlist comparison**: Added, removed, and modified nets
3. **BOM comparison**: Added, removed, and changed components
4. **Interactive viewer**: Side-by-side, overlay, onion skin, swipe, and diff-only modes

## In a CI/CD Pipeline

Add diff to your CI to automatically generate visual reports:

```bash
# Generate diff report without opening it
typecad-pcb diff HEAD~1 build/board.kicad_pcb --output diff-report.html
```