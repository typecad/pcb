---
'@typecad/pcb': minor
---

Hardened the `import` round-trip: the pipeline now proves itself on every
run instead of relying on the test suite having imagined the right failure.
Every write is preceded by a snapshot and followed by verification, and a
failed verification rolls your sources back untouched.

- **Convergence oracle with auto-rollback** — after any apply, every change
  category is recomputed against the written files; anything still pending
  (or any written file that no longer parses) restores the pre-cycle
  snapshot and reports exactly what failed. Non-convergent writes — the
  class behind every phantom-diff and corruption incident — can no longer
  land silently.
- **Per-cycle snapshots + `--restore`** — the analyzed source set is copied
  to `.typecad-import/snapshots/` before the first write (rotating
  `latest`/`previous`), because the per-pass `.backup` files only captured
  the state before the last pass. `import <board> --restore` undoes the
  most recent apply cycle.
- **`--dry-run`** — computes and prints every pending change across all
  categories, with per-edit `- old` / `+ new` previews, and writes nothing
  (no snapshot, no prompts).
- **Parser self-test** — the TS-capable parser is probed at startup (class
  fields + type annotations); a missing `acorn-typescript` now fails loudly
  instead of silently matching nothing. Also surfaced as a `doctor` check.
- **Write safety** — writes may only target files that were parsed in this
  cycle (ownership set); files edited on disk mid-cycle (an editor under
  `--watch`, or during interactive prompts) abort the write instead of
  interleaving ranges; `--watch` additionally watches `src/` so external
  source saves re-trigger a cycle.
- **Project lock** — two import processes (`npm run sync` plus a manual
  run) can no longer write the same project concurrently; stale locks
  (dead pid) are reclaimed.
- **Board fingerprint** — every import prints a 16-hex semantic hash of the
  parsed board (order- and formatting-insensitive), making "in sync" a
  verifiable claim across machines and runs.
- **Self-proving tests** — a seeded fuzz harness (random boards × random
  source styles: receivers, quotes, multiline objects, custom track-array
  names) asserts parse-after-apply, convergence, and byte idempotency; a
  burn-in test pins two full auto cycles to a byte-stable converged file;
  and the repo's real boards (rd_skeleton, simple_board, upgrade_test's
  1.1 MB KiCad-authored file) form a golden corpus, with the committed
  mod-ec source required to be exactly in sync with its board.
- **Adversarial hardening (red-team follow-up)** — corrupt or hostile
  inputs now degrade loudly instead of corrupting: footprints with
  non-finite coordinates (`nan`, `1e400` → Infinity) are dropped and
  reported (previously `nan` silently applied as position 0,0, moving real
  parts to the origin, and Infinity propagated into source as the valid
  JS identifier `Infinity`); the same guard covers segments, vias, text
  and layout positions; and a parseable file that is not a board (a
  `.kicad_sch` handed over by mistake) is refused outright instead of
  importing as an empty board and deleting source. Verified against
  unbalanced/garbage/BOM inputs, escaped quotes, unicode/bidi text,
  scientific notation, semicolon-free and CRLF source styles, block
  comments inside the routing section, and computed (non-literal) text
  arguments — all either handled correctly or safely skipped with a note.

- **Auto-named nets keep their identity on imported copper (red-team
  follow-up)** — the importer treated any net name starting with `net`
  ("net14" — typeCAD's auto-name for anonymous nets) as "unnamed" and
  emitted its tracks with no net at all. That copper then ran net-less
  against netted pads, which DRC reports as `shorting_items` and
  `solder_mask_bridge`. Only a genuinely empty net name is unnamed now;
  auto-named tracks import as `track_net14` with `{ net: 'net14' }`
  (verified to join the existing auto-named net on rebuild), and standalone
  vias carry the net too.

- **Through-via layer span in the native DRC (user report)** — the
  connectivity union-find gave a through via only its literal
  `(layers "F.Cu" "B.Cu")` tokens, so on a 4-layer board an In1/In2 track
  ending at that via never shared a layer with it: via-joined nets split
  into phantom `unconnected_items` (SWDIO/SWCLK on the demo board) that
  kicad-cli `pcb drc --refill-zones` does not report. A through via now
  spans every copper layer of the stack; blind/buried vias keep their
  declared span (regression-tested both ways).

- **Native DRC parity pass (5-board audit vs kicad-cli `--refill-zones`)** —
  `gapNm` now returns zero for crossing shapes (copper straddling the board
  edge — castellated pads — previously read a positive vertex-to-edge
  distance and passed the edge rule kicad-cli failed on); holes are checked
  against the board edge under the SAME edge-clearance constraint and
  reported as `copper_edge_clearance` (the separate `hole_edge_clearance`
  rule with its own stricter default produced 17 phantom violations);
  edge violations dedup per physical pad board-wide (duplicated pad
  numbers — PVSON rect+oval leads, castellated duals — are one pad to
  KiCad, on every layer); mask-web enforcement is opt-in like KiCad
  (32 phantom web warnings gone); silkscreen collection includes
  `fp_poly`/`gr_poly` outlines (silk-edge and silk-over-opening checks
  previously never saw polygon silk, missing all 13+24 items on the demo);
  `silk_over_mask` renamed to KiCad's `silk_over_copper`; and mask-bridge
  identity keys on `ref:padNumber` so a pad never bridges its own
  duplicated parts while genuinely no-net items still bridge.

- **`kicad_sync` is the round-trip's front door** — new projects get
  `npm run kicad_sync` (import `--watch --auto`) instead of the old
  one-shot `import --apply` script, and the VS Code extension gains
  **typeCAD/pcb: Start KiCAD Sync**, which runs it in a dedicated
  reused terminal. A news article on the typecad.dev site covers the
  import overhaul end to end.
