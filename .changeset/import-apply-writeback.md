---
'@typecad/pcb': minor
---

`typecad-pcb import --apply` now writes back the elements that used to be
display-only. Outline, zone/keepout, and the whole routing section round-trip:
move a via, drag a zone corner, grow the board outline, or reroute a trace in
KiCad, run `npm run import`, select the changes, and the source is patched —
rebuild and the board matches.

Two new flags on `import`:

- **`--auto`** — applies every detected change without the interactive
  checkboxes (implies `--apply`). What would be applied is still listed in
  the output; the safety rails (unsupported constructs, non-contiguous
  routing regions) behave exactly as in interactive mode and fall back to
  notes instead of guessing.
- **`--watch`** — watches the .kicad_pcb file and re-runs the import on
  every save (500 ms debounce; touch-without-write cycles are skipped;
  a partially written or locked file logs a warning and the next save
  retries instead of killing the session). Combined with `--auto`
  (`import build/board.kicad_pcb --watch --auto`) the typeCAD source is
  live-synced while the board is edited in KiCad; Ctrl+C stops. Without
  `--auto`, watch re-runs display mode on each save.

The `--capture-layouts` flag is gone: text layout positions
(referenceLayout, valueLayout, fabLayout) are now imported and updated by
default on every `--apply`/`--auto` run, and the import is not in sync
until they match the board. Existing layout assignments in source are
updated as before; new ones are inserted for components without them
(a layout identical to the unset default produces no change).

- **Outline** — positional args of `typecad.outline(...)`/`outlineCircle(...)`
  update in place; fillet radii appear/disappear; polygon outlines and
  cutouts rewrite their point arrays; removed or added Edge.Cuts shapes
  delete or append the corresponding calls.
- **Zones** — zone/keepout calls are matched to board zones by net, layers,
  and center, then semantically diffed through the same code generator the
  console output uses (so "no change" means truly equal); geometry rewrites
  keep the rect form when the polygon is still a rectangle and fall back to
  `points` when it is not; fill options, restrictions, and scalars all
  update. Zones deleted on the board are removed, new zones appended.
- **Routing** — the track section (declarations, pushes, standalone vias,
  and the `typecad.create(...)` spreads) is regenerated as a whole from the
  board whenever any vertex, via, or net differs, and stays byte-identical
  when in sync. Chains are built by one shared pure generator
  (`buildTrackChains`/`trackBlockSource`) that the console display also uses,
  so import output, apply output, and manual copies can never drift. Safety
  rails: statements with `powerInfo`/spreads/unknown builder calls, or
  non-contiguous routing regions, are left alone with an explanatory note;
  routing is only ever inserted into the single file that owns `create()` —
  other project files with their own `create()` are never touched.
- **create() track list hygiene** — older generated code passed track arrays
  as bare identifiers (`create(j1, track_VCC)`); when the board's net set
  changes, such a name can lose its declaration and crash the build
  (`ReferenceError: track_VCC is not defined`). The create list is now
  rewritten independently of the routing region diff: bare track-array
  identifiers are recognized and dropped, only component arguments are
  preserved, spreads are emitted for the board's current nets, and the
  generated text matches the replaced range exactly so repeated applies
  converge instead of growing whitespace.

Verified end-to-end on the rd_skeleton demo: KiCad-side edits (via move,
zone corner drag, outline resize, trace reroute) → `--apply` → rebuild
reproduce every edit in the rebuilt board, and re-import reports zero
pending changes.
