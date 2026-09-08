---
'@typecad/jlcpcb-parts': patch
---

Two fixes to the add-to-project flow:

- It now shells out to the renamed `typecad-pcb` bin (lookup, cmd.exe invocation, messages, README) — it previously failed with "typecad command not found" for projects on `@typecad/pcb`.
- Running `jlcpcb-search` outside a typeCAD project no longer offers the add option (which then failed deep inside the typeCAD CLI). The add prompt is only shown when the current directory is a project — it has a `typecad.conf.ts`/`.js`/`.json`; otherwise the tool says so and points at `npx @typecad/pcb create`.
