---
'@typecad/pcb': patch
---

Fix `npx @typecad/pcb <command>` failing with `could not determine executable to run`. When a package exposes multiple bins, npm only auto-picks one whose name matches the package's unscoped name (`pcb`); the package only offered `typecad-pcb`/`gerber-viewer`/`kicad-symbols`/`kicad2typecad`, so the documented `npx @typecad/pcb create` quick-start (README + website) errored before the CLI ever ran. Added a `pcb` bin alias pointing at the same `dist/cli/typecad/index.js` entry as `typecad-pcb`; existing bin names are unchanged.
