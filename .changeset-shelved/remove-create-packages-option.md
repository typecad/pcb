---
"@typecad/pcb": minor
---

`typecad-pcb create` no longer offers optional packages. The interactive "Optional packages" multi-select prompt, the `--packages=<pkg1,pkg2>` flag, and the per-package scaffolding (extra imports, dependencies, and scripts in the generated project) are all gone. New projects install just the core dependencies; use `typecad-pcb package` to add optional packages to a project afterwards.
