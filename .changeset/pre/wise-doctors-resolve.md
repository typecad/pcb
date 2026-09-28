---
'@typecad/pcb': patch
---

`typecad-pcb doctor` checks dependencies by resolving them the way an
`import` would, instead of looking for a nested `node_modules/<dep>`
directory. npm workspaces and parent-folder installs — where the project
itself has no `node_modules` — no longer fail the node_modules and
core-deps checks on setups that work perfectly.
