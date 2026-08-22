---
title: Packages without install scripts
description: Component packages now sync their KiCad files at build time — no postinstall required
date: '2026-8-21'
categories:
  - typecad
  - package
  - npm
  - security
published: true
cover: https://images.unsplash.com/photo-1518770660439-4636190af475?w=640
---

# Packages without install scripts

npm is deprecating `postinstall` and other install scripts for security reasons, and typeCAD packages historically relied on exactly that: a generated `postinstall.js` that copied each package's bundled KiCad symbol and footprint files from `node_modules` into the project's `./build/` directory at install time.

That script is gone. The same copy now happens at **build time**, inside typeCAD itself — with no install scripts, no special npm flags, and no user interaction.

## How it works

When a component package that bundles a `./build/lib/` directory is used, typeCAD resolves the package's own source directory and syncs its contents into the project's `./build/lib/` the first time the `Package` is constructed during a build:

```bash
package/build/lib/
├── ISL9120IRTNZ.kicad_sym          → ./build/lib/ISL9120IRTNZ.kicad_sym
├── footprints/
│   └── QFN50P300X300X75-13N-D.kicad_mod
                                    → ./build/lib/footprints/QFN50P300X300X75-13N-D.kicad_mod
```

The sync runs on every build but is mtime-guarded — files that are already up to date are skipped, so repeat builds only pay for a few `stat` calls. Because the package's location is resolved from the running code itself, it works with any package name, any registry layout (npm, yarn, pnpm), `file:` dependencies, and monorepo links.

## For package authors

- If your package's class **extends `Package`**: nothing to do. The base-class constructor handles the sync automatically.
- If your package uses a **hand-rolled class**, call the exported helper once in your constructor:

```ts
import { syncThisPackageBuildLib } from '@typecad/typecad';

export class MyModule {
  constructor(options) {
    syncThisPackageBuildLib();
    // ...
  }
}
```

`typecad add package` scaffolds new packages with the `Package` base class and no install scripts.

## For package consumers

Nothing changes. `npm install` your packages as usual — zero lifecycle scripts run — and build. The files appear in `./build/lib/` exactly where KiCad expects them (`fp-lib-table` and the runtime loaders already point there).
