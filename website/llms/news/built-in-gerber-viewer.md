---
title: See Your Board — A Built-In Gerber Viewer
description: typeCAD now ships a zero-dependency Gerber/Excellon viewer — a one-shot HTML render of your fab outputs, or a dev server that live-reloads on every build
date: '2026-09-05'
categories:
  - features
  - pcb
  - gerber
  - visualization
published: true
cover: https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?w=640
---

# See Your Board — A Built-In Gerber Viewer

A typeCAD build is deterministic — the same code produces byte-identical KiCad files — but "correct" and "looks right" are different things. Zones pour, planes stitch, the autorouter weaves tracks between pads, and until now the only way to actually *see* the result was to open KiCad and refill zones by hand. The latest release fixes that: **`@typecad/pcb` now ships a built-in Gerber viewer** — a parser for RS-274X and Excellon, an SVG renderer, and an interactive board view, all with **zero npm dependencies**.

Gerbers are the right thing to look at, too. They're the ground truth of what a fab house will actually make — not a rendering of your source, but the compiled output itself.

### One command, one file, your board

Point the new `gerber-viewer` CLI at any gerber directory — the `build/gerbers/` folder `typecad-pcb export` writes, a `jlcpcb-export` output, or any KiCad fab set:

```bash
typecad-pcb export gerbers
npx gerber-viewer build/gerbers -o board-view.html --open
```

You get a single self-contained HTML file — no server, no assets, works over `file://` or attached to an email. The layer sidebar lists every copper, mask, paste, silk, edge, and drill file with visibility toggles and per-layer opacity. Wheel zooms about the cursor, drag pans, `0` fits the board, and a readout tracks the cursor in board coordinates. Copper, edge, and drill layers are visible by default; the rest are one click away.

### The loop: build → see → change → build

The viewer is more useful as a live companion. In any project created with `typecad-pcb create` you'll find a `gerber_viewer` npm script wired to the serve mode:

```bash
npm run gerber_viewer    # http://localhost:4273
```

The dev server watches `build/*.kicad_pcb`. Every time you run `npm run build`, it re-exports the gerbers (`typecad-pcb export gerbers` + drill), re-renders the viewer, and live-reloads the open page. Change a component value in code, rebuild, and the board on screen updates — no KiCad launch, no manual export, no browser refresh. Before the first build it shows a "waiting" page that flips to the board the moment one exists.

It reuses the project's own `typecad-pcb export` under the hood, so KiCad discovery, drill output, and zone-refilled boards all behave exactly as they do everywhere else.

### It speaks fab files properly

The parser covers the parts of the Gerber spec real boards actually use: `%FS` coordinate formats with leading- or trailing-zero omission, all four standard aperture templates, aperture macros with full arithmetic evaluation (thermal-style donut pads from your footprints render correctly), multi-quadrant and single-quadrant arcs including full circles, regions with clear polarity, and X2 attributes. Drill files come in Excellon FMAT-2 flavor — point holes and routed slots.

Layer detection reads `%TF.FileFunction` first and falls back to filenames — both KiCad's `F_Cu`/`In2_Cu` style and legacy `.gtl`/`.gbo` extensions — then orders layers in stackup order with KiCad-like colors, so a 4-layer board looks like a 4-layer board. Anything it doesn't understand produces a warning, never a crash; a board with an exotic macro still renders with everything else intact.

### In code, not just on the CLI

Everything is importable via a subpath export — parse fab files, inspect geometry, or embed rendering in your own tooling:

```ts
import { parseGerber, detectLayer, renderSvg } from '@typecad/pcb/gerber-viewer';

const image = parseGerber(fs.readFileSync('board-F_Cu.gbr', 'utf8'));
const layer = detectLayer('board-F_Cu.gbr', image); // copper, front
renderSvg([{ info: layer, image }]); // → SVG string
```

`buildViewerFromFiles` runs the whole pipeline — parse, detect, order, render, wrap in the interactive HTML — and `startGerberViewerServer` exposes the live server for custom dev setups.

### Try it

Update to the latest alpha and open any board you've already built:

```bash
npx @typecad/pcb create   # new projects include the gerber_viewer script
# or in an existing project:
npx gerber-viewer serve
```

The viewer is part of `@typecad/pcb` — no extra install, no extra dependencies, nothing new to keep at arm's length. Build your board, open `localhost:4273`, and see what your code just made.