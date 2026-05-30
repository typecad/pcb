<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    import { buttonVariants } from "$lib/components/ui/button";
    import ChevronRight from "lucide-svelte/icons/chevron-right";
    let { data }: { data: PageData } = $props();
</script>

# Git Diff

The `typecad diff` command provides visual comparison of KiCAD PCB files with layer-by-layer diff, netlist comparison, and BOM diff. It generates an interactive HTML report you can open in any browser.

## Usage

### File-to-file comparison

<ScrollArea orientation="both">

```bash
typecad diff board_v1.kicad_pcb board_v2.kicad_pcb
```
</ScrollArea>

### Git revision comparison

Compare a git revision against the current working copy:

<ScrollArea orientation="both">

```bash
typecad diff HEAD~1 ./build/board.kicad_pcb
```
</ScrollArea>

Compare two git revisions:

<ScrollArea orientation="both">

```bash
typecad diff HEAD~1 HEAD -- board.kicad_pcb
```
</ScrollArea>

## Options

| Option | Description |
|--------|-------------|
| `--full` | Include User layers (User.1–9, User.Drawings, User.Comments, User.Eco1/2) in the comparison |
| `--theme <name>` | Color theme for the report (default: `Monokai`) |
| `--output <path>` | Output HTML file path |

## View Modes

The generated HTML report supports multiple view modes:

- **Side-by-side**: View original and modified layers next to each other
- **Overlay**: Superimpose both versions to see alignment
- **Onion skin**: Semi-transparent overlay for precise comparison
- **Diff only**: Show only the differences with color highlighting
- **Swipe**: Drag a divider to reveal before/after

## Textual Diff

In addition to the visual comparison, `typecad diff` provides:

- **Netlist diff**: Shows added, removed, and modified nets with their connected pins
- **BOM diff**: Compares component lists between revisions, highlighting added/removed/changed parts

## Programmatic API

You can also use the diff functionality programmatically:

<ScrollArea orientation="both">

```ts
import { generateDiffs } from '@typecad/typecad/diff';

await generateDiffs({
  originalFile: 'old.kicad_pcb',
  modifiedFile: 'new.kicad_pcb',
  fullMode: false,
  theme: 'Monokai',
  outputHtmlPath: './report.html',
});
```
</ScrollArea>

<div class="relative">
<br/>
<br/>
<br/>
    <p class="absolute right-0">
       <a href="/docs/docgen" class={buttonVariants({ variant: "outline" })}>DocGen<ChevronRight /></a>
    </p>
</div>
