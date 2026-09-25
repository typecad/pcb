---
'@typecad/pcb': patch
---

The vscode extension learns to share a workspace with the typeCAD/hal extension instead of talking over it:

- Activation is `workspaceContains:**/typecad.conf.ts` only (no `onLanguage:typescript`) — the extension stays asleep in non-typeCAD TypeScript workspaces instead of planting a status chip there. Palette commands still activate it implicitly.
- The status bar chip hides when no typeCAD project is in the workspace (it used to squat in the bar saying "no project"), and sits at priority 101 — just left of typeCAD/hal's chip (99) — so the two no longer jostle for the same slot with the same circuit-board icon.
- Component hovers are scoped to TypeScript sources inside the hw folder (the same rule the ▶ Build Board lens uses). Firmware files are typeCAD/hal's hover domain; a component identifier in fw/ used to stack a PCB hover under hal's pin hover.
