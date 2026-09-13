# typeCAD/pcb (VS Code extension)

A Visual Studio Code extension that puts the compiled board under the cursor and
on a second screen: hover a component variable in a typeCAD project's TypeScript
source to see its pads, nets, and unconnected pins, and open a live Board viewer
that renders the built board and cross-probes with the source in both
directions.

```ts
let r1 = new Resistor({ value: '1kohm' });
//  ^ hover: R1 — 1kohm · footprint · placement · pad table with per-pad nets
```

This is the PCB counterpart of the HAL `typecad-debug` extension and ships the
same way: `typecad-pcb create` copies the compiled extension into the new
project's `hw/.vscode/extensions/` folder, where VS Code 1.89+ installs it
workspace-scoped with no marketplace and no global state.

## Pin hovers

Hover (or place the cursor on) a component variable in `src/`:

- Reference, value, footprint, and placement (x/y/rotation/side).
- A pad-by-pad table: pad number, net, signal type, and connected /
  unconnected status — net-less `np_thru_hole` pads read as mechanical.
- A *view on board* link that zooms the Board viewer to the component.
- A declared component missing from the compiled board explains itself instead
  of hovering silent.

## Board viewer

**typeCAD/pcb: View Board** renders the compiled board (gerbers + netlist,
zones refilled at plot time) in a panel beside the editor, with two views
sharing one coordinate frame — switch with the combo box under the title:

- **Gerber view** — the fab output, layer by layer: per-layer visibility and
  opacity controls, a collapsible *fab report* (board dimensions, per-layer
  trace lengths and widths, the drill table), and DRC violation markers when a
  `typecad-pcb drc` report exists (hover for the message, toggle with `DRC`).
- **PCBA view** — a flat, themed 2D "assembled board" render: substrate,
  soldermask with its openings, silkscreen, and Fritzing-style component
  glyphs (ICs with pin-1 dots and notches, banded resistors, axial diodes,
  crystals, connectors…) drawn from the gerbers' X2 pad attributes.

In either view:

- **Pan/zoom** (wheel + drag), **fit** (`0`/`f`), and a **ruler** — click two
  points to measure; hold `Shift` to snap to 0/45/90°.
- **Component search** — type `U3`, press Enter, the view zooms to its pads.
- **Net highlighting** — click copper to highlight a whole net and its
  component; `Esc` or click empty space to clear.
- **Hover readout** — the status line shows what is under the cursor;
  over a component it reads the designator plus the source variable that
  created it (`R1 { source r1 }`), and over a trace the net plus the line
  that declared it or its route (`net2 { source board.ts:83 }`).
- **Dark/light theme** toggle that follows your OS preference.
- **SVG / PNG export** of the current view (theme, visibility, and highlight
  included; PNG rasterizes at ~1600 px).

### Cross-probing, both directions

- **Editor → board:** the hover's *view on board* link, or
  **typeCAD/pcb: View Component on Board** from the palette (it prompts for a
  designator, pre-filled with the word under the cursor).
- **Board → editor:** **double-click** any pad or component outline to jump to
  the source line that declares it. Single clicks — ruler points included —
  always stay inside the viewer.

### It stays current

- Every `npm run build` re-renders the open viewer automatically; the status
  readout announces "generating new render…" while it works (and locks against
  the mouse-coordinate readout overwriting it).
- Viewport, layer settings, active view, and highlight survive every reload —
  rebuilds and VS Code window reloads alike. An open Board panel is restored
  across window reloads too: instantly from the last generated view when the
  board hasn't changed, or behind a brief placeholder while the export reruns.

## How it works

The extension owns no board analysis. It shells out to `typecad-pcb query` in
the folder that carries `typecad.conf.ts` (resolved across all workspace
folders — typeCAD projects are multi-root `hw/` + `fw/` workspaces):

- `query components --json` — cached index of every component, including the
  source variable name recovered from the footprint's `Code` property.
- `query component <ref> --json` — cached per-component pad table: pad, net,
  signal type, and connected/unconnected status.

The viewer runs `typecad-pcb export gerbers`/`export drill` and the
`gerber-viewer` CLI one-shot against `build/`, then embeds the result with a
probe client for cross-probing.

Hover resolution: exact source variable (`r1`), then reference designator
case-insensitively (`R1`, `u3`). Everything invalidates when
`build/**/*.kicad_pcb` changes on disk.

## Commands

| Command | Title | What it does |
|---|---|---|
| `typecad-pcb.refreshBoardData` | typeCAD/pcb: Refresh Board Data | Re-query the compiled board |
| `typecad-pcb.viewBoard` | typeCAD/pcb: View Board | Open (or refresh) the Board viewer |
| `typecad-pcb.viewComponent` | typeCAD/pcb: View Component on Board | Prompt for a designator (seeded from the cursor) and zoom to it |

The hover's *view on board* link invokes the last command directly with the
reference, skipping the prompt.

## Development

```sh
cd packages/vscode-typecad-pcb
npm install
npm test          # vitest over the pure core (query parsing, matching, hover markdown)
npm run compile   # tsc → out/
npm run bundle    # compile + copy the installable extension into
                  # @typecad/pcb/assets/editor-extensions/typecad-pcb/
                  # (what `typecad-pcb create` ships into new projects)
```

This package is `private: true` and is not published to npm or the Marketplace;
the bundled copy under `@typecad/pcb/assets/` is the distribution.

## Limitations

- Requires a compiled board — hover shows a build hint until `npm run build`
  has produced `build/<board>.kicad_pcb`.
- Pads are shown by pad number and net name; symbolic pin names (from the
  symbol library) are not in the `.kicad_pcb` and would need netlist parsing.
- Per-pad copper status (which pads of a net sit on the same routed island) is
  per-net data the component query doesn't carry; `typecad-pcb query routes`
  has it if the hover grows that ambitious.
