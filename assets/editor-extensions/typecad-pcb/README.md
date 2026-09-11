# vscode-typecad-pcb

A Visual Studio Code extension that puts the compiled board under the cursor:
hover a component variable in a typeCAD project's TypeScript source to see its
pads, nets, and unconnected pins.

```ts
let r1 = new Resistor({ value: '1kohm' });
//  ^ hover: R1 — 1kohm · footprint · placement · pad table with per-pad nets
```

This is the PCB counterpart of the HAL `typecad-debug` extension and ships the
same way: `typecad-pcb create` copies the compiled extension into the new
project's `hw/.vscode/extensions/` folder, where VS Code 1.89+ installs it
workspace-scoped with no marketplace and no global state.

## How it works

The extension owns no board analysis. It shells out to `typecad-pcb query` in
the folder that carries `typecad.conf.ts` (resolved across all workspace
folders — typeCAD projects are multi-root `hw/` + `fw/` workspaces):

- `query components --json` — cached index of every component, including the
  source variable name recovered from the footprint's `Code` property.
- `query component <ref> --json` — cached per-component pad table: pad, net,
  signal type, and connected/unconnected status (a pad is unconnected when it
  carries no net and is not `np_thru_hole`).

Hover resolution: exact source variable (`r1`), then reference designator
case-insensitively (`R1`, `u3`). Everything invalidates when
`build/**/*.kicad_pcb` changes on disk.

## Commands

| Command | Title |
|---|---|
| `typecad-pcb.refreshBoardData` | typeCAD: Refresh Board Data |

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
