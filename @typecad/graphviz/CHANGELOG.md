# @typecad/graphviz

## 1.0.4-alpha.1

### Patch Changes

- 081813f: Drop the unused `string-comparison` dependency — it was imported but never
  called, so published installs no longer pull it (and its transitive tree).

## 1.0.4-alpha.0

### Patch Changes

- Relicensed both packages to Apache-2.0 (from a bare "EULA" string with no license file), matching @typecad/pcb, @typecad/wiring, and @typecad/jlcpcb-parts. Each package now ships the full Apache-2.0 LICENSE text. Applies from this release forward; previously published versions remain under the terms they were released under.
