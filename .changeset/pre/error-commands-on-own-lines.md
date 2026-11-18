---
'@typecad/pcb': patch
---

Errors that tell you to run something now put each command on its own
indented, colored line (no quotes or backticks) so it copies cleanly, and
`typecad-pcb` commands are always shown as `npx typecad-pcb ...`. Covers the
missing-library/footprint errors, the "no board in build/" errors
(`drc`, `erc`, `export`, `viewer`, `check-sync`, `query`, `edit`), unknown
command/subject/skill/net/component hints, `doctor` fixes, project creation
and docgen dependency errors. Color is dropped when output isn't a terminal
or `NO_COLOR` is set; `--json` messages stay plain text.
