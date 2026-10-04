---
'@typecad/pcb': minor
---

Components deleted in KiCad now import: the reverse direction of the sync.

- **`typecad-pcb import --apply`** — matching always ran board → source, so
  a component deleted in KiCad simply produced no footprint and its source
  declaration stayed: the import reported "everything is in sync" and the
  next build resurrected the part. A new deletion pass computes the reverse
  set (source components with no board counterpart) and removes each one
  everywhere it lives — the declaration statement, standalone
  `x.pcb`/`parts.x.…` overrides, the identifier in every `typecad.create()`
  argument list, its `syncBoard(…)` parts-map entry, and its `x.pin(…)`
  references in `.net()`/`.joint()` calls — through one shared,
  comment/string-aware grammar module. Deletions run FIRST in the cycle
  (before positions/text/routing are planned) under the snapshot/rollback,
  drift-stamp, and parse gates, and an applied deletion must converge (not
  reappear as a candidate) or the cycle rolls back. Safety rails: a board
  with zero footprints never deletes anything (wrong file, not an empty
  project); a component never passed to `create()` is work-in-progress and
  is left alone with a note; a variable name declared in more than one file
  is ambiguous and left for manual deletion; and a removal whose identifier
  would survive anywhere is refused loudly — a dangling reference breaks
  the build, so nothing is written for it. Interactive imports get a
  checkbox per deleted component; `--auto`/`--watch` apply them (verified
  end-to-end on the mod-ec board: R1 deleted in KiCad → r1 gone from
  source, project compiles, rebuild produces the board without R1).
- **Layout view: `Delete` on a selected part removes it** — parts had move
  (M), nudge, probe (Enter), and edit, but no delete. `Delete` with
  segments/vias selected keeps its copper semantics; with PARTS selected it
  now rips the part's ink (overlay handle, pads, outlines, drills —
  reversible via undo/revert, and its autorouter copper rips with it), the
  ratsnest drops its pads, and the deletion rides the apply: the host runs
  the same shared grammar to remove the component from source, with the
  same ambiguity and dangling-reference refusals reported as skips. Pending
  part deletions persist across page reloads like routes and segment
  deletes do, and the apply summary counts them.
- The grammar module (`component_delete.ts`) is byte-pinned between
  `@typecad/pcb` and the VS Code extension exactly like `_sync.ts`'s, with
  a contract test that fails when the copies drift.
