---
"@typecad/pcb": patch
---

`typecad-pcb create` now generates a `tsconfig.json` in the project's `hw/` directory (NodeNext, strict, `noEmit` — tsx still runs the build) and installs `typescript` as a devDependency, so `typecad-pcb validate` type-checks new projects out of the box instead of skipping the TypeScript step.
