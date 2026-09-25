# @typecad/jlcpcb-parts

## 1.2.1-alpha.1

### Patch Changes

- - The add-to-project flow now shells out to the renamed `typecad-pcb` bin (lookup, cmd.exe invocation, messages, README) — it previously failed with "typecad command not found" for projects on `@typecad/pcb`.
  - Running `jlcpcb-search` outside a typeCAD project no longer offers the add option (which then failed deep inside the typeCAD CLI). The add prompt is only shown when the current directory is a project — it has a `typecad.conf.ts`/`.js`/`.json`; otherwise the tool says so and points at `npx @typecad/pcb create`.
  - Relicensed from MIT to Apache-2.0, matching @typecad/pcb and @typecad/wiring. Applies from this release forward; previously published versions remain under the terms they were released under.

## 1.2.1-alpha.0

### Patch Changes

- Updated dependencies to current majors: chalk 6 (and replace-in-file 9 for jlcpcb-export). Tests updated for vitest 4 constructor-mock semantics.
