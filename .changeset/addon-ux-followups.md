---
'@typecad/pcb': patch
---

The vscode addon's UX follow-ups — cross-probing lands where the question was asked, and the loop closes:

- **Pad double-clicks land on the net.** Double-clicking a specific pad in the Board viewer now reveals the line that declared or routed that pad's net (the same preference as trace double-clicks); component outlines still go to the component's own declaration. The pin the client already reported is finally used.
- **Quick fixes on every Problems entry.** Unconnected-pad, single-pin-net, and DRC diagnostics carry *Show R1 on board* / *Show net VCC on board* actions that jump into the Board viewer; entries with no component or net (the board-file catch-alls, which otherwise open the huge generated text) offer *Open Board viewer* instead.
- **The diff panel survives window reloads** like the Board viewer: a serializer restores it instantly from the on-disk report when one exists, or re-runs `typecad-pcb diff` when the board changed since.
- **View Component is now a picker.** The palette command opens one QuickPick for browsing and typing — the compiled board's components (ref — value · footprint · source variable), the filter seeded from the cursor word, and a typed designator matching no item is still attempted. This subsumes the separate Browse Components command, which is gone.
- **New setting `typecad-pcb.drcOnBuild`** (default off): run the design rule check automatically after every board build, once the board file has settled for 10s and no source is newer — violations land in Problems and the status chip without a manual run.
