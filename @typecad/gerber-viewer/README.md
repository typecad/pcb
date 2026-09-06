# @typecad/gerber-viewer

Parse Gerber (RS-274X) and Excellon drill files and render them as an interactive, self-contained HTML viewer — zero runtime dependencies. Built for typeCAD boards, works with any KiCad / fab house output.

## Install

```bash
npm install @typecad/gerber-viewer
```

## CLI

Point it at the gerber directory that `jlcpcb-export` (or `kicad-cli pcb export gerbers`) produces:

```bash
npx gerber-viewer gerbers/ -o board-view.html --open
```

Or run the dev server inside a typeCAD project — it watches `build/*.kicad_pcb`, re-exports
gerbers via `typecad export` and live-reloads the page on every `npm run build`:

```bash
npx gerber-viewer serve            # http://localhost:4173
npx gerber-viewer serve --port 5050 --open
```

```
gerber-viewer <files... | directory> [options]   one-shot viewer HTML
gerber-viewer serve [dir] [options]              dev server for a typeCAD project

serve options:
  [dir]               project root containing build/ (default: cwd)
  -p, --port <n>      port to listen on (default: 4173)
  --open              open the viewer in the default browser

Options:
  -o, --out <file>    output HTML path (default: gerber-viewer.html)
  --svg <file>        also write a standalone SVG of the board
  --open              open the viewer in the default browser
  -h, --help          show help
  -v, --version       print version
```

Both modes produce a single self-contained page (no server-side assets beyond the page itself):
layer list with per-layer visibility + opacity, wheel zoom about the cursor, drag panning, Fit
button, and a live coordinate readout in board units. Copper, edge and drill layers are visible
by default; mask / paste / silk / fab layers start hidden. The dev server regenerates the page
into `build/serve/viewer.html` whenever the board changes.

## API

```ts
import {
  parseGerber,       // RS-274X -> GerberImage
  parseExcellon,     // drill  -> DrillImage
  detectLayer,       // filename + X2 attrs -> LayerInfo (kind, side, color, stackup order)
  finalizeAndSortLayers,
  renderSvg,         // layers -> SVG string
  buildViewerHtml,   // svg + layers -> self-contained interactive HTML
  buildViewerFromFiles, // one-shot: directory of fab files -> { svg, html, layers, warnings }
} from '@typecad/gerber-viewer';
```

Programmatic use:

```ts
import { buildViewerFromFiles } from '@typecad/gerber-viewer';
import fs from 'node:fs';

const { html, layers, warnings } = buildViewerFromFiles(['gerbers/'], { title: 'my board' });
fs.writeFileSync('view.html', html);
console.log(layers.map((l) => `${l.kind} ${l.name}`));
```

## What's supported

- RS-274X (extended Gerber): `%FS` (L/T zero omission, absolute coords), `%MO`, `%AD` standard
  apertures (C/R/O/P with holes), `%AM` aperture macros with full arithmetic expression
  evaluation (primitives 1, 2/20, 21, 4, 5), `%LP` dark/clear polarity, `%TF` X2 file
  attributes, G01/G02/G03 with G74/G75 single/multi-quadrant arcs (including full circles),
  G36/G37 regions with multiple contours.
- Excellon (FMAT 2): tool definitions, point drills, routed slots (G00/G01/M15/M16),
  METRIC/INCH with LZ/TZ zero suppression and decimal coordinates, embedded X2 attributes.
- Layer detection from X2 `%TF.FileFunction` with filename fallback (KiCad `F_Cu`-style names
  and legacy Protel extensions `.gtl/.gbl/.gto/...`), KiCad-like colors, stackup ordering.

## Known limitations (warn, never throw)

- Step-and-repeat (`%SR`) and aperture blocks (`%AB`) render once / inline.
- Aperture macro primitives 6 (moiré) and 7 (thermal) are skipped with a warning.
- Clear polarity uses painter's algorithm (drawn in background color), which is correct for
  typical fab output where clear shapes follow dark ones.
- Traces drawn with non-circular apertures are approximated with a round stroke.

## Development

```bash
npm run typecheck
npm test        # unit tests + an integration test that exports real gerbers via kicad-cli
                # (skipped automatically when kicad-cli is not installed)
npm run build
```
