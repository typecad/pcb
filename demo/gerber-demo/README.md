# gerber-demo

A minimal typeCAD project for manually exercising the **native fabrication
export** (no kicad-cli): gerbers, Excellon drill, job file, and the zone-fill
engine — including **hatched** pours.

It resolves the in-development `@typecad/pcb` from the repo root workspace, so
it always tests local code. Rebuild first after editing the package:

```
cd @typecad/pcb && npm run build
```

## Layout

```
src/gerber_demo.ts   the board (edit hatch params here)
typecad.conf.ts      entry point
scripts/check-gerbers.mjs   sanity checks an export dir
build/               outputs (gitignored)
```

## Commands

```
npm run all            build board → native gerbers → verify
npm run build          typecad-pcb build              → build/gerber_demo.kicad_pcb
npm run gerbers        native export (always refills zones) → build/gerbers/
npm run gerbers:saved  same but plots the board's SAVED fills (--saved-fills)
npm run gerbers:kicad  legacy kicad-cli export for A/B comparison (--kicad)
npm run check          file set + pour regions + drill tools + job
npm run view           open the exported gerbers in the gerber viewer
```

## What to look for

- `npm run gerbers` prints `Zones: 1 refilled natively` — the pour is computed
  at export time (nothing stale). `--saved-fills` skips the refill, and since
  the generated board ships no fills, that output's copper layers carry **no**
  pour region (`npm run check -- build/gerbers-saved` shows the failure mode).
- `npm run check` must report **≥ 1 pour region on both F_Cu and B_Cu** and
  non-zero pad flashes — the hatched pour is a `G36` region per layer.
- The hatch geometry lives in `src/gerber_demo.ts`'s `typecad.zone(...)`:
  thickness/gap/orientation are the knobs. Flip `fillMode: 'solid'` and re-run
  `npm run all` to compare solid vs hatched copper area in the viewer.
- `npm run gerbers:kicad` (needs KiCad installed) writes the same set through
  kicad-cli into `build/gerbers-kicad` for side-by-side inspection.
