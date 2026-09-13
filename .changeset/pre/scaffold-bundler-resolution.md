---
'@typecad/pcb': patch
---

`typecad-pcb create` now scaffolds the project `tsconfig.json` with `module: "ESNext"` / `moduleResolution: "Bundler"` instead of `NodeNext`. The extensionless relative import that `add component` prints for its generated class (`import { LD3985G25R_TSOT23 } from './LD3985G25R_TSOT23';`) is now valid as-is in editors and in `typecad validate` — under NodeNext it was flagged with "Relative import paths need explicit file extensions", forcing a manual `.js` suffix even though the build (tsx) never needed one. Bundler resolution matches the actual runtime: projects are always executed through tsx's esbuild resolver and tsc only ever type-checks (`noEmit`), so nothing is ever loaded as raw Node ESM.
