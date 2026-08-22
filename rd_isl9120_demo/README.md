# rd_isl9120_demo

A minimal consumer project for the [`@typecad/rd_isl9120ir`](../rd_isl9120_impl/hw/src/rd_ISL9120IR) component package, demonstrating the **no-postinstall import process** and **irregular board outlines**.

## Irregular board outline

The demo entry (`src/isl9120_demo.ts`) shapes the board with the free-form outline builders instead of a plain rectangle:

- `outlinePath(x, y)` + `.lineTo()` / `.arcTo()` / `.close()` — the main board contour: straight edges, two rounded corners (three-point arcs), an angled chamfer, and an auto-closing edge back to the start
- `cutout([...points])` — an internal trapezoidal milled slot (KiCad treats nested closed contours on Edge.Cuts as holes)
- `cutoutCircle(cx, cy, r)` — a circular mounting-hole cutout

Also available: `outlinePolygon([...points])` for arbitrary polygon boards and `outlineCircle(cx, cy, r)` for circular boards.


## What this demonstrates

The `rd_ISL9120IR` package ships KiCad symbol and footprint files in its own `build/lib/` directory:

```
rd_ISL9120IR/build/lib/
├── ISL9120IRTNZ.kicad_sym
├── DFE201610P-1R0M=P2.kicad_sym
└── footprints/
    ├── QFN50P300X300X75-13N-D.kicad_mod
    └── 1285ASH1R0MP2.kicad_mod
```

Historically a npm `postinstall` script copied these into the consuming project's `./build/` at install time. That script is gone — npm is deprecating install scripts, and this package no longer ships one. Instead:

1. `npm install` places the package (and its bundled files) into `./node_modules/` — **zero lifecycle scripts run**.
2. The first time `new rd_isl9120ir(...)` executes during a build, typeCAD resolves the package's own source directory from the call stack and syncs its `build/lib/**` into the project's `./build/lib/` (mtime-guarded, so unchanged files are skipped on repeat builds).
3. KiCad then reads the files from the usual locations pinned in `build/fp-lib-table` (`${KIPRJMOD}/lib/footprints`) and `build/sym-lib-table`.

Packages whose classes extend the `Package` base class get step 2 automatically in their constructor — `rd_isl9120ir` extends `Package`, so no sync code exists in the package at all. (For hand-rolled classes that don't extend `Package`, the exported `syncThisPackageBuildLib()` helper provides the same behavior with one call.)

## Running it

```bash
npm install
npm run build
```

`npm run build` invokes the `typecad build ./src/isl9120_demo.ts` CLI command (the `typecad` bin installed from the linked `@typecad/typecad` package), which runs the entry through tsx.

Watch `./build/lib/` — it starts empty (only the `footprints/` directory scaffold exists). After the build you'll find the package's symbols and footprints there, copied from `./node_modules/@typecad/rd_isl9120ir/build/lib/`, alongside the generated `isl9120_demo.kicad_pcb` / `.kicad_sch` output.

## Dependencies

Both `@typecad/rd_isl9120ir` and `@typecad/typecad` are linked with `file:` paths in this demo because the auto-sync API is not yet published to npm. Once published, the dependencies become normal version ranges and nothing else changes:

```json
"@typecad/rd_isl9120ir": "^1.0.4",
"@typecad/typecad": "^0.3.5"
```

The `.npmrc` in this project sets `install-links=true`, which makes npm install `file:` dependencies as packed copies inside `./node_modules/` — the same layout a registry install produces — instead of symlinking back to the source folders. That matters for two reasons:

- it faithfully simulates the real post-publish install this demo represents, and
- the installed package resolves `@typecad/typecad` against *this* project's `node_modules/`, not whatever version happens to sit next to the package's source folder.

`@typecad/passives` is pinned to `^0.2.2` because it is the first passives release whose peer range (`@typecad/typecad ^0.3.0`) accepts the local typecad build.
