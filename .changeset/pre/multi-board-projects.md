---
'@typecad/pcb': minor
---

Multi-board projects: more than one PCB per project — mother/daughter
boards, board/jig setups.

- **Build** — `typecad.conf.ts` gains `boards: { mother: './src/mother.ts',
  daughter: './src/daughter.ts' }`; `typecad-pcb build` runs every entry
  (or one with `--board <stem>`), each writing its own
  `build/<stem>.kicad_pcb`. The build manifest (.typecad-board.json) now
  MERGES: `boards` accumulates every board the project produces and
  `board` stays the most recent one (single-board projects read exactly
  as before). Watch mode rebuilds all boards on any change (union of the
  entries' import graphs).
- **Discovery + selection** — `check`, `drc`, `export gerbers/drill`, and
  `query` take `--board <stem>` and resolve that board; an unknown stem
  reports the project's known boards instead of failing blindly.
- **Per-board fab dirs** — once the manifest lists more than one board,
  gerbers export to `build/gerbers/<stem>/` (single-board projects keep
  the shared `build/gerbers/`). Without this, each board's export pruned
  the other's layers as "foreign" — one board's fab output literally
  deleted its sibling's. The viewer reads the same per-stem dir.
- **Sync scoping** — `import --apply` on a multi-board project scopes its
  cycle to the board's entry import graph (found by the file constructing
  `new PCB('<stem>')`), so every name-based guard — variable ambiguity,
  the sidecar-first assignment search, routing ownership — sees only
  files that can legally hold that board's components. The same `r1` on
  two boards is no longer ambiguous; a KiCad-side deletion on one board
  can never remove a sibling board's component. Single-board projects
  keep the whole-src scan.
- **Per-board sidecar** — multi-board sidecars are named
  `_sync.<stem>.ts` (single-board keeps `_sync.ts`), each wired into its
  own entry's create() through the same shared grammar.
- **Viewer** — typeCAD/pcb: **Switch Board** picks which of the
  manifest's boards the panel shows; multi-board projects get one page
  per board (`build/serve/<stem>.html`) and one gerbers dir each, so the
  page title/path — and with it the viewer store, flip state, and
  pending-edit session keys — are per board for free.
