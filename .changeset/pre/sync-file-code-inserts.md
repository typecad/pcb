---
'@typecad/pcb': minor
---

Auto-inserted code now lands in one machine-owned sidecar instead of
splicing into hand-written source: **`_sync.ts`**. The layout view's apply
and the board import share its grammar, so tool-written statements always
win the code-order battle and never compete with user code for insertion
points.

- **The sidecar** — `src/_sync.ts` exports `syncBoard(typecad, parts)`,
  which the entry file calls immediately before `typecad.create(...)` (and
  `...syncTracks` inside create() once routes exist). Because component
  state is read at create() time and public-field assignments override
  constructor options, everything the sidecar assigns always wins —
  placements and label layouts ride `parts.<var>.pcb` /
  `parts.<var>.<prop>Layout`, routes are loose `const routeN = new
  TrackBuilder(...)` chains pushed onto `syncTracks`. The only lines ever
  added to hand-written code are the import, the call, and the spread —
  all canonical, all idempotent. The file is created lazily on the first
  auto-insert and never touches an existing file that does not speak the
  grammar.
- **Layout view (vscode extension)** — moves/labels with no literal to
  rewrite and newly drawn routes now go to the sidecar instead of
  after-constructor/before-create inserts. Updates rewrite the sidecar's
  own literals in place; route deletes split chains with their own collect
  lines and emptied routes take theirs along; backups mark created files
  so a restore deletes rather than empties them. The whole apply still
  passes the dry-run parse gate, stale-view/board guards, atomic writes,
  post-write re-parse with auto-restore, and the rebuilt-board semantic
  check. A byte-identity contract test pins the extension's copy of the
  shared grammar module to the canonical one in `@typecad/pcb`.
- **`typecad-pcb import --apply`** — the rewriter now searches `x.pcb`
  and layout assignments sidecar-first over the constructor's own file
  (exactly the two places that can win at runtime), so a KiCad position
  edit updates the sidecar's override instead of fighting a stale
  constructor literal. The search never reaches further: variables are
  file-scoped, and a same-named variable in an unrelated module is a
  different component, not an override. The routing
  regen speaks the sidecar's loose dialect, regenerates its collect lines
  with the routes, and no longer refuses a routing section whose create()
  legitimately lives in another file (the `...syncTracks` spread delivers
  it) — converging byte-stably, pinned by tests.
- **Comment-blind structural scan** — `typecad.create(` is located through
  a comment/string-aware shadow (in the shared grammar module as well, so
  the entry-file wiring is covered too), and the canonical `typecad`
  receiver is preferred so an earlier unrelated `x.create(…)` cannot
  capture the rewrite; prose that merely mentions the call (the sidecar's
  own banner once did) can no longer capture a create() rewrite.
- **Deletes work on import-written copper** — the layout view's delete
  planner only parsed loose `const routeN = new TrackBuilder(…)` chains,
  so a project whose routing is entirely import-generated (`track_NET.push(
  typecad.track({ net }).from(…).to(…));`, including the no-options
  `typecad.track()` form unnamed nets get) reported "no TrackBuilder routes
  in source" and stranded every deleted trace. Push chains now parse
  alongside loose ones: matched links drop from the statement, middle
  breaks split it into two pushes on the same array, emptied statements
  vanish (the array and its `...spread` stay — an emptied array adds
  nothing, and the import's regen tidies the rest), a trailing via rides
  only the half that still ends at the chain's end, and via-kind deletes
  keep their established truncation semantics. The duplicate-absorption,
  near-source drift tagging, and insert-corridor guards all see push
  copper too. Verified by replaying a real rd_skeleton delete against
  mod-ec.ts: the exact skipped segment from the user report now applies
  as one surgical statement removal that still parses.
- **One routing owner per board** (width-change incident) — with routing
  statements in more than one file (the entry's per-net arrays AND the
  sidecar's loose builders), the import regenerated EACH from the full
  board IR, so every trace existed twice at two widths and the wider copy
  painted over the narrower in the gerbers — a narrowed trace looked
  unchanged no matter what the source said. The import now consolidates:
  the create()-owning routing file is regenerated from the board, every
  other routing file's section is emptied ("absorbed into …") — but only
  when the owner's regeneration actually happened or it was already in
  sync; a refused owner (unsupported constructs, no/multiple create())
  leaves every copy in place with a note, so copper is never deleted
  without its replacement — the orphaned `...syncTracks` spread leaves
  create() with the emptied sections, and
  buildTrackChains collapses exact-duplicate board segments (same
  net/layer/geometry, 1 nm-quantized, first copy wins) so an
  already-doubled board heals in one pass. Round-trips converge; the
  layout view re-uses the sidecar for its next insert as before.
- **Pad labels can no longer lag the board** (moved-component incident) —
  `build/<board>_pads.json` (the pin numbers/net names the viewer bakes
  over the copper) was written only by the build's board write, so a
  KiCad-side move that flowed through sync without a full rebuild left it
  one revision behind: the copper moved (gerbers re-export from the
  board) while the labels stayed at the old position — observed on C1,
  and earlier on U1. The manifest is now treated as the derived artifact
  it is: `export gerbers` (the step that runs on every viewer
  regeneration) and the viewer build itself heal it from the board file
  whenever it is missing or older, and the write is temp-file + rename
  with retries so a reader holding the file open on Windows cannot strand
  the previous revision. rd_skeleton's stale manifest was healed and the
  regenerated viewer verified aligned.
