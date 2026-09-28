---
'@typecad/pcb': patch
---

`typecad-pcb create` now installs the firmware dependencies itself when the
HAL scaffold's own install step didn't take (`fw/package.json` present but
no `node_modules`). hal ≤ 1.0.0-alpha.20 cannot spawn npm on Windows, so a
fresh project opened with a `fw/` that VS Code's Vitest extension
immediately flagged ("vitest not found in fw folder") until `npm install`
was run there by hand.
