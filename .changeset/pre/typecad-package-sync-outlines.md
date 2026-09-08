---
'@typecad/pcb': major
---

#### No-postinstall package file sync

Component packages no longer need an npm `postinstall` script to install their KiCad files. When a `Package` subclass is constructed during a build, typeCAD automatically syncs the package's bundled `build/lib/` (symbols, footprints, 3D models) into the project's `./build/lib/` — mtime-guarded so repeat builds skip unchanged files. Works with any package name, registry layout, `file:` dependencies, and monorepo links.

- `Package` subclasses get the sync automatically in the constructor
- Hand-rolled classes can call the new exported `syncThisPackageBuildLib()` helper
- `typecad-pcb add package` no longer generates a `postinstall.js`

#### Irregular board outlines

New Edge.Cuts shape builders beyond the filleted rectangle:

- `outlinePolygon(points)` — arbitrary polygon boards
- `outlineCircle(cx, cy, r)` — circular boards
- `cutout(points)` / `cutoutCircle(cx, cy, r)` — internal cutouts (milled slots, mounting holes)
- `outlinePath(x, y)` builder with `.lineTo()`, `.arcTo()`, `.close()` for free-form mixed line/arc contours

#### Fixes

- Re-exported `Schematic` (restores the built-in NetTie API)
- `registerReference` is now idempotent — components constructed by a `Package` keep their references when `create()` registers them again, instead of being renamed
- Schematic rendering: via components (which have no symbol by design) are skipped instead of erroring; net-label pin owners are backfilled for standalone `new Pin(...)` declarations; power-symbol lookups no longer warn for auto-generated net names
- Updated dependencies: chalk 6, markdown-it 15 (types now bundled; `@types/markdown-it` removed), vitest 4, ESLint 10, changesets 3
