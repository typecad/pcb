# @typecad/jlcpcb-export

## 2.0.1-alpha.1

### Patch Changes

- `export gerbers` now passes `--check-zones` on KiCad ≥ 9. Fresh typeCAD builds write zone declarations without fill geometry (KiCad fills zones on demand), so fab gerbers need the pour refill at export to be assembly-ready. On KiCad 8 the export runs as-is; save the board from pcbnew once so fills exist in the file.
- Relicensed both packages to Apache-2.0 (from a bare "EULA" string with no license file), matching @typecad/pcb, @typecad/wiring, and @typecad/jlcpcb-parts. Each package now ships the full Apache-2.0 LICENSE text. Applies from this release forward; previously published versions remain under the terms they were released under.

## 2.0.1-alpha.0

### Patch Changes

- Updated dependencies to current majors: chalk 6 (and replace-in-file 9 for jlcpcb-export). Tests updated for vitest 4 constructor-mock semantics.
