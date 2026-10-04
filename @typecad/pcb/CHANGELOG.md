# @typecad/pcb

## 1.0.0-alpha.9

### Minor Changes

- a5511ff: The chip passives now work out of the box on machines with no KiCad
  install. @typecad/pcb bundles the six `Device` symbols the passive size
  tables default to (`R_Small`, `C_Small`, `L_Small`, `D_Small`,
  `LED_Small`, `Fuse_Small`) plus the 34 chip footprints those tables
  reference (R/C/L/D/LED in 0201–1210, Fuse in 0603–1210), resolved as the
  last resort after install/conf paths and the project's `build/lib/` —
  so `new Resistor()` and friends build with zero setup. `doctor` and
  `typecad-pcb lib list` report the bundled set alongside the other
  sources. Bundled footprint 3D-model references keep their upstream env
  form; fetch models per project with `lib add --footprint` when the 3D
  view matters.
- 7f87876: Components deleted in KiCad now import: the reverse direction of the sync.

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

- 081813f: `typecad-pcb diagnostics` (and `build --diagnostics`) now runs ERC/DRC
  through the native engines by default, like `erc`, `drc` and `check`.
  ERC reads the `<name>_erc.json` report the build writes (a report older
  than the schematic is not trusted), DRC runs the native engine on the
  board. Pass `--kicad` to either command to run the checks through
  kicad-cli instead. The native step helpers moved to a shared module used
  by both `check` and `diagnostics`.
- 081813f: `typecad-pcb doc` now renders layer, drill-map and stackup images natively —
  the gerber exporter and SVG renderer plot the board in-process, so generating
  documentation no longer requires a KiCad install. `{Render/...}` 3D images
  still use kicad-cli `pcb render` when it's available — when it isn't, they
  are skipped with a console warning instead of failing the document (all other
  images are unaffected). Each document plots the board once and reuses it across all
  images instead of spawning one kicad-cli process per image, `kicad_theme`
  front-matter resolves against the gerber viewer's registered board themes
  (KiCad's default palette included), and back-side layer combinations keep
  their mirrored bottom-view presentation. Images may name the full built-in
  user-layer range (User.1–User.9) like kicad-cli did, and boards without an
  authored stackup get the synthesized KiCad default for their copper count
  instead of skipping the stackup image. Also fixed along the way: the
  interactive gerber viewer applied the wrong color to inner copper layers when
  a layer theme was selected, and inlined doc images now carry unique SVG symbol
  ids so several images can coexist in one HTML file.
- 081813f: `typecad-pcb diff` (and the `typecad-gitdiff` entry point) now renders every
  layer image natively — the same gerber-writer + SVG-renderer pipeline the
  docs use — so board diffs no longer require a KiCad install and no longer
  spawn one kicad-cli process per layer. Pad-level changes now annotate
  correctly: pads render as absolute-coordinate shapes, so a moved or resized
  pad shows up as red/green geometry instead of being hidden inside shared
  symbols. GUI layer spellings (`F.Silkscreen`, `User.Drawings`, …) are
  accepted like kicad-cli accepted them, back-side layers keep their mirrored
  presentation, and the diff report can now also be generated when running
  straight from the source tree (the viewer template assembles in memory if
  the built copy isn't there yet).

  Follow-up fixes from visual verification: unchanged geometry now dims out of
  the diff-only view on BOTH sides (the modified layer used to keep the whole
  board visible under the highlights), changed zone pours render as thin
  outlines instead of translucent slabs covering the change that moved them,
  the shared-bbox crop addresses the flipped viewBox correctly (the diff
  panels previously rendered blank), and zoom-to-change lands on the actual
  change again (screen-space offset math), and the diff-only view now shows the selected layers dimmed behind the highlights instead of a blank canvas. Layer inks default to the typeCAD theme — the same palette the VS Code
  addon's board viewer shows (`--theme` still overrides) — and the
  added-feature highlight is red instead of green, which collided with the
  green typeCAD copper.

- 7284ad8: `typecad-pcb import --apply` now writes back the elements that used to be
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

  - **Text section** — board text now round-trips instead of only updating
    calls that already exist: `gr_text` elements with no matching
    `typecad.text()` call are inserted (position, layer, size, thickness,
    font, mirror/justify, `hide: true` all included), and source calls whose
    text is no longer on the board are removed. Duplicate labels (two GNDs,
    two X marks) pair position-aware, so an update never teleports the wrong
    instance.
  - **Arc tracks** — KiCad's arc-shaped `(arc (start) (mid) (end))` tracks are
    imported: they are tessellated into straight segments on the same
    net/width/layer, so the copper follows the drawn path instead of
    silently vanishing. Zone outline arcs already tessellated; zone-internal
    arcs are not mistaken for tracks.
  - **Stackup depth** — the per-layer stackup detail (thickness, material,
    epsilon_r, loss_tangent, color for copper/dielectric/mask/silk layers,
    plus copper finish) is imported into the `typecad.stackup(N, { layers: … })`
    options. Apply mode regenerates the call — including inserting it when
    the source has none — so a rebuilt board's dielectric geometry matches
    what KiCad had instead of the library preset.
  - **Board graphics on silk/user layers** — `gr_line`/`gr_rect`/
    `gr_circle`/`gr_arc`/`gr_poly` outside Edge.Cuts import as
    `pcb.line()/rect()/circle()/arc()/poly()` calls (v6 `width` and v7+
    `stroke` forms both read; `fill` mapped). Apply mode pairs them
    position-aware, regenerates moved/resized shapes, deletes ones removed
    from the board, and appends new ones. Edge.Cuts items continue to feed
    the outline and stay out of the graphics sync.
  - **Unsupported elements are reported against the file-format spec** — the
    import now declares everything it leaves behind, with counts, instead of
    dropping it quietly: dimensions; `bezier`/`gr_curve` curves (both the
    v7+ and legacy tokens); images, `gr_bbox` and text boxes; the title
    block; board-level properties; embedded font declarations;
    footprint-embedded zones; per-footprint graphic edits (silk drawn in the
    board editor); footprint user text annotations; and blind/buried vias
    (imported as through vias — the standalone via API cannot express layer
    spans yet).
  - **Stability fixes found by burn-in** — three ways the apply cycle could
    fight itself or the project are gone: a bare `(justify)` element (KiCad's
    default-alignment marker) parsed as an empty object and flagged phantom
    justify changes forever; the source justify was compared as a raw
    PropertyValue record against the board's plain object, flagging every
    mirrored text on every run while writing back identical text; and a
    source file that fails to parse (transient read race, editor mid-save
    under `--watch`) was silently treated as absent, so components matched
    into whichever file still parsed and positions/routing/text were written
    there — the cycle now reports the unparseable files and skips entirely.
  - **Duplicate-label text sync (audit follow-up)** — the source analyzer
    recorded every `typecad.text()` call twice (the statement handler and a
    generic call visitor both fired), so on boards with duplicate labels
    (two GNDs, two X marks) the surplus entries paired against the wrong
    board text and the updater rewrote a call to its sibling's position —
    silently collapsing distinct labels onto one spot over repeated
    import/build cycles. Calls are now recorded once, updates match on text
    AND source line, and regression tests pin both labels keeping their own
    positions through a move. A missing-terminator bug in freshly inserted
    `typecad.stackup(...)` statements was also fixed (the no-semicolon
    compare text leaked into the insert path).
  - **Hand-written source patterns (audit follow-up)** — apply-mode write-back
    now recognizes code the way users actually write it, not just the
    generator's canonical shapes: zone geometry given as
    `bounds: { left, top, width, height }`; fill settings written flat on the
    options object (`thermalGap: …`) instead of grouped under `fill:`; outline
    calls using the bounds-object argument (previously corrupted into
    `outline(0, 0)`); class-field components (`private r1 = new Component(…)`),
    which now match and update their inline props in place — and never get
    `this.r1.pcb = …` statements inserted into the class body, which produced
    unparseable source. Zone calls in any of these styles compare semantically
    and are left untouched when they already match the board, so the importer
    no longer rewrites hand-written style into canonical form just to
    converge.
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
    other project files with their own `create()` are never touched. Track
    arrays are declared with `const` (they are only ever pushed to).
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

- c54d344: Hardened the `import` round-trip: the pipeline now proves itself on every
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

- 081813f: KiCad symbols and footprints no longer require a KiCad install. Library
  resolution is decoupled from the kicad-cli binary: symbols resolve from
  the install, then `typecad.conf.ts` (`symbols_path`/`footprints_path`
  override the install), then the project's `build/lib/`, then the `power`
  library now bundled inside @typecad/pcb (the renderer's power-symbol and
  PWR_FLAG generation always works). A machine with no install builds from
  `build/lib/` alone — component packages already sync there.

  New `typecad-pcb lib` command fills `build/lib/` on demand from the
  official KiCad library repos: `lib add Device Connector` fetches whole
  symbol libraries, `lib add Device:R_Small` fetches a single symbol,
  `lib add power` copies the bundled library offline, and `lib list` shows
  the active sources. Fetching a footprint also downloads its 3D model(s)
  from kicad-packages3D into `build/lib/3dshapes/` and rewrites the
  footprint's reference to `${KIPRJMOD}/lib/3dshapes/…`, so the KiCad GUI
  3D viewer and kicad-cli raytrace renders find the project-owned models
  with no environment setup. Downloads go through a user-level cache
  (`~/.typecad/cache/kicad-libs`) and land inside the project (committable;
  the board builds offline from then on). Builds never fetch — resolution
  failures now point at `lib add` instead of "install KiCad".
  `doctor` reports all active library sources and marks the CLI as optional
  for the native flow.

- 7f87876: Multi-board projects: more than one PCB per project — mother/daughter
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

- 01d3d7d: ERC is now native, like DRC. The build runs a small engine over the typeCAD
  object model itself (components, nets, pin electrical types — no file
  parsing, no kicad-cli) and writes `<name>_erc.json` next to the schematic.
  It checks electrical correctness only: pins no `net()`/`dnc()` ever touched
  (`pin_not_connected`) and incompatible pin connections such as two outputs
  on one net (`pin_to_pin`). Power pins never conflict — driver analysis is
  out of scope and typeCAD's auto PWR_FLAG would false-positive every rail.

  `typecad-pcb erc` reads that report by default; `--kicad` keeps the legacy
  kicad-cli shell-out (still the only route for arbitrary external
  schematics). `typecad-pcb check` uses the native report too, with
  `--kicad-erc` as the opt-out. New API: `pcb.erc()` returns the report
  programmatically. Severity overrides for both check ids come from the conf
  constraints severities map.

- 081813f: Footprint library upgrades are now native: `add package`, `add component`
  and the footprint loader migrate `.kicad_mod` files to the current format
  in-process instead of shelling out to `kicad-cli fp upgrade` — same
  transformation set (module→footprint rename, fp_text→property migration,
  synthesized Value/Datasheet/Description properties, uuid fill-in,
  stroke/fill normalization, pad-layer canonicalization with wildcard
  compression, model transform completion, bare-token quoting, and the legacy
  %R/%V text variables becoming ${REFERENCE}/${VALUE}), verified byte-for-byte against
  kicad-cli 10 output. Two long-standing bugs went with it: the footprint
  loader's and the exported `upgradeFootprint()`'s `--output` argument always
  equaled the input, which kicad-cli rejects — those calls had never upgraded
  anything; both now upgrade in place and actually work. Files already at or
  newer than the target format are left untouched, and a malformed file no
  longer aborts the whole library (errors are isolated per file).
- 081813f: The layout view's E properties dialog now follows the selection and covers
  every element's properties. An open panel rebuilds for whatever the next
  press lands on (part, trace, via, or text — no reopening per element), keeps
  placement fields fresh through drags, rotations, and undo, and never steals
  focus from the canvas keys. Panels gained full property coverage: parts show
  board side, the pin→net map from the PCB pad manifest, and any named net
  class claiming their nets; traces show the net's class defaults and the
  computed impedance of the current width on its layer (stackup permitting);
  vias show the annular ring and the board's via floor; texts are newly
  editable in the dialog — content, placement, and the full style block
  (character width/height, stroke thickness, font face, italic, bold, and
  horizontal/vertical/mirrored justification), parsed from the board, previewed
  live, and written back into source on apply as a diff (only changed keys
  travel): board gr_texts rewrite their `.text({ … })` literals, part labels
  edit through the Component's referenceLayout/valueLayout/fab options (a
  reference label's content renames the part, a value label's edits its value)
  with existing unmanaged keys in those literals preserved — and parts with no
  matchable constructor literal (subclass factories like `new LED({…})`,
  prefix-derived references) get their label edits written as public-field
  assignments after the constructor (`led.referenceLayout = { … }`), the same
  door moves use. Pressing a claimed text glyph near copper now selects the
  text instead of the trace underneath.

  Two robustness fixes found in the wild: route re-apply idempotency now
  recognizes chains in CRLF-authored files (a pending session route on a
  Windows project re-inserted itself as a duplicate on every apply, and the
  duplicate insertion colliding with a delete rewrite corrupted the source),
  and the layout apply dry-runs its whole plan and parse-checks every touched
  file before writing — a planner bug now surfaces as a refused apply with a
  message instead of broken source the build chokes on.

  Undo of a segment delete no longer leaves the restored tracks stuck
  highlighted: the delete's DOM capture now excludes transient visuals (the
  selection overlay, pad-highlight clones, text previews) so undo cannot
  resurrect them, every undo/redo re-syncs the selection overlays from the
  live sets, detached members leave the selection, and the redo path's
  snapshot (which crashed on partially-deleted tracks) carries its track
  reference again.

  The arrow keys now nudge the selected ink as well as parts: selected trace
  segments translate by a grid step (Alt fine, same as parts) with same-layer
  neighbors stretching to stay connected, selected vias jump and carry every
  attached trace end across layers, and each move serializes through the same
  delete + session-route contract a segment drag uses — apply & rebuild writes
  the moved track into source, and Ctrl+Z restores the original geometry.

  Via visuals match the board's truth: the selection ring is sized in board
  units off each barrel's own diameter (it was a fixed 2px screen stroke that
  blew up to several via-widths through aperture-scaled flash symbols), a
  session via renders its drill hole from the moment it is placed (a .cut
  sibling riding the barrel through resizes, rips, and arrow-key nudges — a
  resize overlay carries its own hole too), and deleting a board via removes
  its drill-layer hole along with the barrel unless a pad owns the same spot.

  A stale DRC report (older than the board) no longer locks a permanent
  "DRC markers show the PREVIOUS board revision" banner into the viewer's
  status line — the provenance note goes to the typeCAD/pcb output channel
  only, leaving the status line free for normal operation.

  Editing session ink no longer re-materializes phantom traces: a rewritten
  chain that belongs to a not-yet-applied route (a D-slide or an arrow nudge)
  reconciles that route's own geometry — the entry carries the new polyline
  and moved barrels their new positions — instead of writing the pre-edit
  trace beside the new one after apply & rebuild.

  Layout applies now write each stage as ONE whole-document replacement
  composed exactly like the dry-run the parse gate validates — VS Code's
  multi-range WorkspaceEdit resolves entries sequentially and silently drops
  overlapping ones, so a dropped delete left the live document longer than
  the plan's text and later stages' ranges landed early, splicing tokens into
  source (the recurring `width: 0.3const route15` corruption). Application is
  now byte-identical to what the gate checked.

  A source backup system lands under the apply bridge: every apply snapshots
  the files it will touch into build/layout-backups/<timestamp>/ (20 kept), a
  post-write parse check auto-restores the snapshot the instant anything
  unparsable hits disk, and a new "typeCAD: Restore Source from Backup"
  command lists snapshots and restores them from a picker. A hardening matrix
  test drives combined gestures (routes + deletes + labels + texts + values)
  over both LF and CRLF projects, asserting the composed source parses, no
  route declaration duplicates, and create() carries every declared route.

  Semantic verification closes the loop after every apply & rebuild: the
  rebuilt .kicad_pcb is checked against what the apply intended — added route
  segments and vias present (right layer, either orientation, tolerance for
  rounding), deleted segments actually gone, moved components sitting at
  their computed final positions, edited texts landed — with each miss
  reported to the output channel, the status bar, and the viewer status, so
  "parses but wrong" bugs surface instead of silently shipping. The
  workspace-bundled extension now self-updates: at activation it compares its
  version against the project's own @typecad/pcb dependency asset (once per
  day), copies the newer asset over itself, and offers a window reload — the
  bundled copy can no longer rot at its scaffold-time version. A
  `sync:extension` script in @typecad/pcb refreshes the shipped asset from a
  built extension for maintainers.

  Apply application is now a single atomic write: each touched file's final
  composed text (the exact strings the parse gate validated) lands in ONE
  whole-document WorkspaceEdit, after verifying the live document still
  matches the text the plan was built against — a keystroke landing between
  planning and writing previously shifted every offset and spliced tokens,
  caught by the post-write check's auto-restore but leaving the apply to
  retry; now the race refuses cleanly before anything is written.

  A fresh session via no longer wears a dark ring: the drill-hole sibling the
  barrel carries from placement inherits the .cut rule's !important stroke
  with the SVG default 1mm width, painting a background-colored circle around
  the via until the rebuild replaced it with the real drill render — the hole
  now carries an explicit zero stroke-width.

  A stale view can no longer seed phantom traces: when a replacement gesture
  (deletes + a new route on the same net) has deletes that match no source
  segment — the page computed them against a board render that predates the
  source — the apply refuses with instructions to reopen the Board tab and
  redo, instead of leaving the unmatched geometry's chain fragment beside the
  new route (seen as a phantom trace, via, and nub between two parts).

  Routing gets a rubber band: the moment a route starts from a pad, the
  ratsnest re-ties — the walk's end connects to the nearest still-stranded
  pad of the net (the pad to route to) and follows every mousemove instead of
  staying behind pad-to-pad; hovering the target drops the band (the arrival
  is the signal), and cancel or commit restores the ordinary stranded wires.
  The start pad now drops out by position too (island pads carry no pin
  field, so the pin-keyed skip never matched).

  The ratsnest is now connectivity-based: per-net union-find over pads and
  ink elements (each M-subpath is its own conductor, endpoints join within
  half-widths) computes connected components, and wires are only owed
  BETWEEN components — a route that exists but broke in the middle no longer
  counts as wired at both pads (the old pad-granular test drew nothing until
  every segment was deleted), while complete routes, pour-covered nets, and
  stubs behave as before. The routing rubber band draws in the gerber frame
  the ratsnest group renders (the earlier y negation mirrored it: moving the
  cursor up moved the band down), and the start/target pad drop-outs compare
  positions across the board/gerber frame boundary.

  Ratsnest wires now land on the CLOSEST pair of contact points between
  connectivity components — a partial trace's dangling end talks directly to
  the far pad instead of pad-center to pad-center — and the routing rubber
  band ties to the nearest point of the unreached components (a dangling
  trace end included), dropping the component the route grows from and the
  hovered target's.

  Pending gesture deletes no longer wedge every later apply: a failed apply
  leaves its deletes in the session's persisted state, the board rebuilds
  anyway (a plain npm run build), and the restored deletes then describe
  geometry only the OLD board had — accumulating across retries until every
  apply refused as "the view was stale" even on a freshly generated viewer.
  Deletes are now pruned against the live board ink (segments either
  orientation, vias by position, board-frame aware) both when the pending
  state restores and again at the apply door: dead deletes drop silently,
  deletes matching existing ink ride, and the stale-view refusal only fires
  for genuine source/board divergence.

  Unmatched-delete triage ends the false staleness refusals: the page pushes
  a via-delete at EVERY deleted-segment endpoint (most endpoints carry no
  via), and a via-delete claims its source segment first — leaving the
  segment delete itself apparently unmatched and every apply refusing as
  stale even on a freshly built board. Deletes that match copper another
  delete already removes now absorb as duplicates, unmatched via-kind
  deletes never refuse, and only a SEGMENT delete drifting within 0.3mm of
  its net's source copper trips the stale-view guard (the phantom recipe);
  everything else drops with an output-channel note.

  The source↔board↔viewer chain is now self-syncing: source edits under src/
  (or typecad.conf.ts) auto-build after a 2s debounce, opening a workspace
  whose board predates its sources builds once immediately, and a status bar
  item shows the pipeline state (✓ typeCAD synced · "building…" · "build
  failed" with the error) — clicking it opens the Board view. Applies set a
  busy flag so their own source writes never double-build. Every generated
  viewer page embeds the mtime of the board it renders and carries it with
  each apply; when the board has since been rebuilt (auto-build, external
  edit), the apply regenerates the viewer and tells the user to redo the
  edit on the fresh view instead of splicing edits from a superseded board.

  Route retries can no longer stack parallel corridors: a same-net chain
  already connecting a new route's endpoints (either direction, bends
  ignored) is that connection — the retry skips instead of adding a
  near-duplicate route beside it. This was the delete/retry loop that piled
  five R1→D1 corridors: each failed apply left its drawn route pending, and
  byte-level idempotency missed the reversed and jittered variants.

  A gesture's own deletes ride the apply again: the anti-staleness prune ran
  once more at the apply door, where a gesture's deletes have already had
  their ink removed by the gesture itself — the prune read them as dead
  state and dropped them, so deleting a route and drawing its replacement
  left BOTH in source after apply. Pruning now belongs to restorePending
  only, compared against a freshly rendered board.

  The viewer sidebar collapses to a single button's width: the toggle stays
  as a slim rail, and the layer list swaps to a compact selector — minimal
  swatch + checkbox per layer (no names, no opacity sliders) that inherits
  the full list's selection state and keeps editing in tandem (either view
  mirrors to the other and drives the board groups). The collapse state
  persists per browser, and theme recoloring updates the compact swatches
  alongside the full-list chips.

  Pad-manifest rotation is pinned against the gerber plot: 90°/270°/0° unit
  tests assert the three-pin layout lands where KiCad actually draws it (pin
  3 alone on top at 90°, on the bottom at 270°, right at 0°) — the manifest
  drives both the pad labels and trace snapping, and a mismatch mirrors them
  about the part center (seen once after a mid-edit build; verified 111/111
  pads matching ink after a clean rebuild).

  A first placement insert can no longer jump a part to ~(0,0): a component
  placed via the constructor's inline pcb option has no `var.pcb = {…}`
  literal, and the apply bridge's insert path wrote the drag DELTA as the
  absolute position — the inserted reassignment then overrode the constructor
  placement, so every constructor-placed part "moved" landed far up-left of
  where it was placed. The move payload now carries the part's final
  absolute board position (ax/ay), and the insert path writes it (older pages
  fall back to the delta); the six mis-written literals in the user's project
  were reconstructed as constructor placement + recorded drag delta.

  Layout polish: parts no longer wear the yellow warning border in any case
  (overlap, off-outline — the amber text list in the layout panel is the
  whole warning surface), the collapsed sidebar actually shows its compact
  layer rail (it sat inside the hidden sidebar body, leaving only the toggle
  button), and the layout grid controls — step (0.1/0.25/0.5/1), snap,
  visible grid, mil units — persist across the page reload every rebuild
  triggers.

  KiCad interaction model: source navigation moved from double-click to
  Enter — hovering or clicking a component (pin-aware via the pad manifest)
  or trace records the probe, Enter jumps to its source line, and an active
  route keeps owning both keys. Parts no longer move by drag: a press only
  selects, M grabs the selection (centers snap to the cursor on the first
  move, multi-select offsets preserved), the cursor moves it, click drops,
  Esc reverts — with full undo.

  The viewer sidebar keeps its height bounded (height 100%, min-height 0,
  overflow hidden on the sidebar and its body) so the layer list scrolls
  internally and the toolbar row — fit/all/none, theme selector, measure,
  DRC — always stays inside the viewport; the collapsed compact rail gets
  the same treatment, so theme swatches render at full size instead of a
  crushed sliver when the layer list is tall.

  The collapsed rail is wide enough to actually show its swatches: 18px
  clipped the stacked checkbox+chip column to slivers — the rail is now 34px
  with padding clearing the toggle button, so every layer reads as a full
  checkbox over a full color chip.

  Enter on a SELECTED trace now lands on the TrackBuilder `.to()` that drew
  that exact segment — the viewer sends the selected segments' board-frame
  endpoints and the host matches them against chain geometry in src/**/*.ts
  (either orientation, 0.05 mm tolerance, net-aware) — falling back through
  the net's `typecad.named('…')` declaration (for highlighted-but-unselected
  nets) and then the recorded route/net source as before.

  Segment-to-source matching now reads BOTH authoring forms: multi-line
  `const x = new TrackBuilder(…)` chains AND the one-line
  `typecad.track({ net: '…' }).from(…).to(…)` chains the apply bridge emits
  (seen in mod-ec.ts — 292 chain points, previously zero matches, so Enter
  always fell through to the net line).

- 7f87876: Auto-inserted code now lands in one machine-owned sidecar instead of
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

- 081813f: `materializeZoneFills()` now fills zones with the native engine instead of
  round-tripping the board through `kicad-cli pcb drc --refill-zones
--save-board` — no KiCad install needed, and the written `filled_polygon`
  blocks come from the same fill engine the native DRC, gerber export and
  docgen images use, so the saved fills and every consumer agree. The refill
  core (`refillZoneFills`) moved from the export command into
  `pcb/pcb_zone_fill.ts` and is re-exported from the export command for
  existing importers. The `KICAD_NOT_AVAILABLE=1` escape hatch is retired —
  there is no external dependency left to escape from.

### Patch Changes

- 7f87876: Gerber export: chamfered roundrect pads now plot their chamfers. Pads carrying `(chamfer …)`/`(chamfer_ratio …)` previously plotted as plain squares (or plain rounded rects), losing the corner cuts in the fabrication output — the castellated header's inner pads are the visible example. The writer now emits the same polygon aperture KiCad does (45° cuts measured from the corner, plain corners rounded at 4 segments per 90°, the pad angle carried in the macro's rotation parameter), and FreePoly macros match KiCad's emission byte-for-byte (closing-vertex repeat in the count, one macro reused across rotations). Also fixes an off-by-one in the FreePoly polygon vertex count.
- c54d344: Fixes `check` silently skipping ERC ("– erc / No .kicad_sch found") when
  build/ holds more than one schematic. `findBuildFile` only returns a file
  when exactly one matches, so stray `.kicad_sch` files left in build/ by
  earlier projects made the ERC step report "No .kicad_sch found" even though
  the project's schematic was right there. The schematic is now resolved the
  same way the board is: anchored on the build manifest's board stem
  (`mod-ec.kicad_pcb` → `mod-ec.kicad_sch`), falling back to the lone
  `.kicad_sch` only without a board to anchor on — and when several
  schematics remain ambiguous, the message says so instead of claiming none
  were found. `diagnostics` picks its schematic the same way.
- c54d344: Fixes `check` (and `query`/`report`) reporting QFN exposed-pad paste splits
  as unconnected pads — the unnamed `*.Paste`-only squares KiCad footprints
  place over the thermal pad to split its stencil opening carry `(net 0 "")`
  and no pad name by design, but the unconnected-pad analysis counted every
  net-less pad, printing `U1. has no net` nine times for a single QFN-32
  (reference + empty pad name). Pads with no copper layer (paste/mask-only
  apertures) are now excluded from the unconnected-pad list and summary count;
  genuinely unconnected copper pads are still reported.
- c54d344: Every file typeCAD writes is now marked `(generator "typeCAD/pcb")` with
  `(generator_version …)` auto-numbered from the package's real version, so
  any board, schematic, or library file can be traced to the exact writer
  build. Previously boards and schematics claimed `generator "typecad"` with
  a hardcoded `0.1.0`, and the new-project template even claimed `pcbnew`,
  which the KiCad file spec reserves for KiCad itself.

  - Board writer, schematic renderer, footprint upgrades (the project's local
    `build/lib` copies), symbol-library merges, and the create-project
    template all stamp the shared identity.
  - A rebuild re-stamps the board even when kicad-cli resaves (zone fills,
    DRC) had rewritten the marker to `pcbnew` — the regenerated file is our
    output, and preserving a stale pcbnew marker misattributed every rebuild
    to KiCad.
  - Local library footprints carrying the legacy `typecad` marker are
    re-stamped in place; upstream KiCad footprints keep their own generator
    (they are not ours to claim).
  - `generatorVersion()` resolves from package.json at runtime (src/ and
    dist/ layouts both work), falling back to `0.0.0-dev` only when the
    manifest is unreadable.

- aea99fd: Import audit — `typecad-pcb import` fixes found by walking the full pipeline
  against the rd_skeleton demo board (KiCad 9/10 writer plus kicad-cli resave
  forms):

  - `acorn-typescript` is now a real dependency. It was imported optionally and
    never installed, so every TypeScript source with type annotations failed to
    parse and `--apply` matched 0 components on any real project.
  - Segments and vias keep their net names: the inline `(net "NAME")` form the
    kicad-cli zone-fill resave writes was silently dropped, so all 120 demo
    tracks imported as `unnamed_Track`. Tracks now group per net
    (`track_VCC.push(typecad.track({ net: 'VCC' })…)`), chain vias match by
    net identity, and standalone vias carry their net.
  - Zones: the singular `(layer "F.Cu")` form produced `layers: []` in the
    generated code; `*.Cu` / `F&B.Cu` wildcards now expand against the stackup
    copper count; `(arc (start) (mid) (end))` vertices inside zone outlines are
    tessellated into polygon points; `arc_segments` fills parse and emit.
  - Apply mode: an omitted `rotation` prop no longer reports a phantom move
    (unset means 0, and angles compare modulo 360, so -90 ≡ 270); rotation and
    side are inserted into the pcb object when missing instead of being
    silently dropped.
  - Matching: passives (Resistor/Capacitor without an explicit footprint) match
    by exact reference; a stale Code-property file path (renamed source file)
    falls back to searching the variable name; anonymous components can no
    longer be bound to two different references; text changes scan every
    project source file, not just files that declare footprints.
  - Hidden board text (`(hide yes)`) imports as `hide: true` instead of
    resurrecting as visible silkscreen.
  - Elements the importer does not consume — dimensions, Edge.Cuts bezier
    curves, zones embedded in footprints — are now reported with counts
    instead of vanishing silently.

- 7f87876: Layout apply: a dragged Reference/Value/fab label now sticks for components whose layout lives in a standalone `var.referenceLayout = {…}` (etc.) statement — the shape every KiCad-imported project uses. The apply only knew the Component constructor's inline option, so it appended a constructor `referenceLayout:` that the later statement silently overrode at runtime and the rebuild reverted the drag. The label edit now rewrites the winning statement (keeping its unmanaged style keys) and leaves the constructor alone when a statement exists.
- 7f87876: Viewer sidebar layer list shows layer names, not file names. Rows read
  `F_Cu`, `B_Silkscreen`, `In1_Cu`, `Edge_Cuts`, `Drill` instead of
  `board-F_Cu.gtl`-style file names — the board-name prefix and the file
  extension are dropped per file (the old shortener only stripped a prefix
  shared by EVERY file, so a gerbers directory carrying one stray file from
  another board — or a single-layer viewer — showed full file names and the
  layer truncated out of view). The full file name stays on the row as its
  tooltip, and drills with no layer token in their name display their
  detected kind (`Drill` / `NPTH Drill`).
- 7f87876: Pad manifest: net names now survive every `(net …)` reference form a board can carry. The manifest read only the pad node's inline name — KiCad's `(net N "name")` — so a board last saved in kicad-cli's reserialized name-only form (`(net "name")`) or the legacy coded form (`(net N)`, names only in the top-level table) produced a manifest with pin numbers but no net names: the viewer's pad labels dropped to numbers-only after such a sync, until a full typeCAD rebuild rewrote the inline names. Both writers (build and the export/viewer-path healer) now resolve through the board's net table, so labels keep their net names regardless of which tool saved the board last.
- 7f87876: Hardening fixes from the post-merge review of the sync-sidecar work:

  - **Viewer script-block escapes actually escape** — the `routes` and
    `layout-comps` JSON blocks in the generated viewer page ran a no-op
    `.replace(/</g, '<')` (the other eight blocks correctly emit
    `\u003c`), so board-derived net names or values containing
    `</script>` could break out of the `<script type="application/json">`
    block. Both now escape like their siblings.
  - **Import apply counts only what it wrote** — a pending footprint or
    layout change whose target statement vanished between compute and
    apply (the file drifted) was silently dropped while still being
    counted as applied. It is now reported as a note and excluded from
    the applied count, in both the auto and interactive passes.
  - **Pads manifest temp files never strand** — the atomic manifest write
    retried every rename error class (a read-only directory does not heal
    by waiting) and left `<name>_pads.json.tmp` behind when the final
    rename failed; retries are now limited to transient Windows lock
    errors and the temp is unlinked on failure. The from-board refresh
    also re-stats the board after reading, so a write racing the refresh
    can no longer mint a manifest that suppresses the next heal.
  - **Zone-refill temp board is cleaned up** — exporting gerbers with
    unfilled zones wrote a filled copy of the board into the system temp
    dir and never removed it (one leaked board per export); it is deleted
    once the plots are written.
  - **Layout view matches every Component declaration shape** — the
    constructor scan required a bare `const x = new Component(…)`; a
    type-annotated declaration (`const u1: Component = new Component(…)`,
    annotated or exported) silently skipped value/rename/label edits.
    Annotations and non-declaring usages both match again, and the label
    statement search still keys off the declaring variable only when one
    exists.

- 7f87876: Layout-view routing fixes for net-less copper, found on the castellated J2 pads (two pads per pin showing a permanent 1-1 ratsnest wire):

  - Routes started with X inherit the pad's net even when net-less trace ink (or a selected segment) sits on the pad — previously the press resolved to the net-less copper and every route committed without a net, which the ratsnest can't credit and the DRC reports as a short.
  - DRC marker halos no longer intercept presses. The 11-px halo sits exactly on the violating copper, so every flagged pad became unclickable/unroutable — a trap that bred more net-less routes (the small center pip keeps the hover tooltip).

- 6a713db: Fixes multi-unit KiCad symbols rendering as a single unit in generated
  schematics. Components like the TS3A24159 dual switch (switch A / switch B /
  power units) placed only unit 1, so the sheet showed one switch while units
  2+ were never drawn — and because their pin lookup ignored units, nets on
  those pins dropped labels at coordinates that coincided with unit 1's pins
  or floated in empty space, visually merging distinct nets and hiding the
  pins from ERC entirely. The renderer now places one `(symbol ...)` instance
  per pin-carrying unit (same reference, KiCad's own file shape, top-level
  `(unit N)` only past the first), spaced by the widest unit's bounding box,
  and resolves every net label against the owning unit's origin. Verified
  against a TS3A24159DRC design: all three units place, DRIVE/REF_SW/CH2_COM
  labels separate from PROBE_1/RANGE_SW/CH1_NO, and `kicad-cli sch erc` now
  reports the previously invisible pins 9 and 11.
- 081813f: Building no longer warns when a component's `sch` object doesn't specify a
  placement. Components without `sch` coordinates (or with missing
  `x`/`y`/`rotation`) are still defaulted and placed deterministically — the
  same schematic output, now silently. The per-component "missing schematic
  placement data" warnings and the one-line "placed deterministically"
  summary are gone.
- c54d344: Fixes the infinite `sync`/viewer storm ("exporting gerbers… / viewer refresh
  failed: Cannot read properties of null (reading 'raw')" repeating forever) —
  two independent feedback loops, both closed:

  - **arc_segments ping-pong (the loop driver)** — the viewer's gerber export
    runs kicad-cli's zone refill, which resaves the board and DROPS
    `(arc_segments 16)` (KiCad's default). The importer then re-added
    `arcSegments: 16` to the source, the next build re-wrote it to the board,
    and the next export dropped it again — source and board chasing each
    other forever, every step firing every watcher in the workspace,
    including a running `import --watch`. The parser now reads an absent
    `arc_segments` as the default 16 and the emitter skips the default, so a
    gerber export leaves the round-trip exactly in sync.
  - **Viewer failure storm (the amplifier)** — a `generate()` that threw fell
    into the same 4s retry used for mid-build settles, and watcher events
    (the export pipeline touching build/) re-ran the failing export too; each
    retry's kicad-cli board resave re-fired the watchers again. Failures now
    back off exponentially (30s → 60s → 5min cap, reset on success), and
    watcher events against the unchanged failed board are ignored — only a
    genuinely new board revision or the ladder's own scheduled retry re-runs.
  - **null.raw crash hardened** — the gerber exporter's non-null assertions
    (`child('at')!`, `child('center')!`, …) crashed with `Cannot read
properties of null (reading 'raw')` on structurally partial board items
    (a pad without `at`, a primitive without `center`); every site now skips
    the malformed item instead of crashing the whole export.
  - **Malformed-footprint guard** — the board generator silently placed pads
    without an `(at x y)` at the footprint origin, which collapsed a corrupted
    library footprint into one stacked copper/silk blob. A pad missing its
    position now fails the build naming the footprint file and the re-add
    command, instead of shipping wrong copper.

- 7f87876: Layout view: silk/fab text inside a component body is clickable, selectable, and draggable again. Three things stacked to swallow those presses, each fixed:

  - The layout overlay's invisible part handles sit above every layer, and courtyard/mask ink renders above silk — a part drag now first walks the hit-test stack beneath the overlay and hands the press to a claimed text stroke (`data-text`) when one is under the pointer. Shift still forces the part grab, and double-clicks delegate the same way (text edits the text, not the part value).
  - Drill holes render above silk/fab with no handler of their own — they are the absence of material, so they now carry `pointer-events="none"` and presses pass through to the ink beneath.
  - Unattributed ink with no handler (the last fallthrough before box-select) also delegates to a claimed text beneath it, as a safety net.

  `elementsFromPoint` is guarded for non-browser harnesses (jsdom), where it does not exist.

- 081813f: The git-diff and documentation viewers are branded `typeCAD/pcb` (headers,
  page titles, and "Generated by" credits), each linking to
  https://www.typecad.dev/pcb, and the side-by-side view mode is removed from the diff viewer (Diff Only, Overlay, Onion Skin and Swipe remain).
- 7f87876: Viewer: **Flip Board** — a toolbar toggle that views the board from the
  back. The gerber stack gains a horizontal mirror (`#yflip` goes from
  `scale(1,-1)` to `scale(-1,-1)`, a 180° turn in gerber space) and the
  viewBox mirrors with it, so back-side copper and silk — plotted mirrored,
  read from the top — read the right way round while the front side reads
  mirrored, exactly like the physical board's back. `gerberAt` and the
  board-coordinate readouts invert the same mirror, so every gesture keeps
  editing the geometry it points at while flipped: part grabs and nudges,
  routing, segment/via deletes, probing, measuring, the DRC markers, the
  ratsnest, and the status-bar coordinates all stay consistent (the move
  deltas sent to source are computed in board space and remain correct — an
  edit made in the flipped view lands where the flipped view showed it).
  The toggle arms its button while active and persists per board in the
  viewer store alongside the viewport, so a rebuild reloads still flipped.
  Flipping also corrects the pan/zoom window (`tx` negates with the viewBox
  swap — the window describes the old x range, and without the correction a
  zoomed view shows empty space past the mirrored board), mirrors the
  outside-the-stack overlays (DRC markers and the cross-probe outlines via a
  group x-mirror; the measuring ruler negates x in its own math so its text
  label stays readable), and re-swaps the pad labels' upright counter-flip
  so they don't render mirrored while flipped. The screen→board converters
  invert exactly the added mirror — x only: the base y-flip is present in
  both states, so gestures (marquee select, part grabs, routing, deletes,
  probes, rulers) and the coordinate readout track the pointer 1:1 while
  flipped. Sessions that drew with the broken converters could commit an
  interactive route at mirrored coordinates; an unapplied route like that
  used to restore as a ghost via/trace far off-board forever (its delete
  always reporting "matched no source route"). Restoring pending routes now
  drops any whose geometry lies outside the board's own extent — the same
  stale-state pruning pending deletes already had — and re-persists the
  pruned state so the dead entries leave storage instead of re-arriving on
  every load.
- 7f87876: Gerber viewer + import fixes found on the castellated-header demo board:

  - Viewer: macro outline (primitive 4) rotation is now read from the last parameter instead of an index derived from the declared vertex count — KiCad counts closing-vertex repeats into that count (and lists extras), so the old index landed on a coordinate (e.g. −0.6 read as degrees), silently unrotating mirrored/moved pads and warping the polygon by fractions of a degree. A pad rotated 180° (the right-edge castellated header) rendered with its chamfers pointing off-board; explicit closing repeats are also dropped from the parsed point list.
  - Import apply: loose `const routeN = new TrackBuilder(...)` chains (written by the viewer's apply bridge beside create()) are now part of the routing section the regeneration owns — their statements and create() arguments are removed in the same change as the arrays are regenerated from the board. Left in place, every track they carried would exist twice after the next build (the golden-corpus sync test caught exactly that state).

## 1.0.0-alpha.8

### Minor Changes

- 2ce39f0: `typecad-pcb search <query> --footprint` searches installed KiCad footprint
  libraries instead of symbol libraries — symbols alone can't answer "what
  pads does this part have". Results list `library:footprint` ids with their
  pad numbers (and the description when the library carries one), ready to
  paste into `new Component({ footprint: '...' })`. `--limit` caps the list
  (default 10 for footprint searches), and `--json` returns the same results
  as data for scripts and agents.
- 2ce39f0: The autorouter screens every routed pin for escape-channel feasibility
  before any search work starts. A pad flanked by neighbours on both sides
  (a QFP/SOIC/SOT row) must escape through the corridor between them, and a
  trace of width W at clearance C needs W + 2×C of corridor to do it. When
  the corridor can't fit that, each pad gets one line with the actual
  numbers — `U3.7 must escape through a 0.31mm corridor between its
neighbouring pads, but a 0.25mm trace at 0.2mm clearance needs 0.65mm` —
  plus the fix (a narrower net class for that net, or necking the trace near
  the part), instead of a wall of DRC clearance violations after the build.
  Pads open on one side (chip passives, row ends) are never flagged, and
  same-net flanks don't count.
- 2d86f24: The gerber/layout views have a house layer theme. `typecad` is built from the
  typecad.dev design system — near-black canvas, typeCAD green front copper,
  darker green back copper, white silk and board edge, zinc grays for secondary
  layers, and a five-color rotation for inner copper. It leads the layer-theme
  picker and is the default on first open (and for anyone whose saved pick was
  the old `typeCAD` no-theme placeholder). The raw palette the placeholder used
  to show is still there, as the `Default` option. Vendored KiCad themes are
  unchanged and keep winning over the default once picked.

  The pcba view's old `typeCAD house` colorway is gone — it was a teal stub
  that never matched the brand, and the name now belongs to the layer theme.
  `--theme typecad` on the pcba image renderer no longer resolves to a builtin;
  use a JSON theme file for custom pcba palettes.

- 2bf1a7c: The scaffolded starter is now a complete circuit instead of a lone resistor: a 3 V CR2450 coin cell (Keystone 3008 holder, `Device:Battery_Cell` symbol, `BT` prefix) lights a red 0603 LED through a 150 Ω resistor, wired over named nets `+BATT`/`led_a`/`GND` with a `Power` source for simulation. A fresh project therefore exercises every board-view view on first open — real nets to drag and route in the layout view, and an ngspice deck that solves (3 V rail, ~8.4 mA). The starter's footer comments and the scaffolded `AGENTS.md` document the new `simulate` script, and `create` adds it to `hw/package.json`.

  The bundled VS Code extension now runs `typecad-pcb simulate` itself during viewer generation — best-effort, only when `build/<board>_op.json` is missing or older than the netlist — so the ngspice view has hover voltages/currents without a manual simulate step (previously nothing in the build or export pipeline produced the op file). A failure (ngspice not installed, entry error) only logs and skips; the viewer still generates. Net names matter for the auto power symbols: nets named like KiCad's power library entries (`GND`, `+BATT`) get schematic power glyphs, so the starter uses those.

### Patch Changes

- 21e9d51: The pads manifest (`build/<board>_pads.json` — per-pad world position,
  extents, copper layers, pin numbers, and net names measured from the final
  board) is now announced at info level and listed in the build output
  summary instead of being written silently at debug level. The pcb-placement
  skill doc now points placement work at it so measured pad geometry is used
  over datasheet estimates.
- 2ce39f0: `typecad-pcb create --name=agent-demo` no longer refuses to run: hyphens,
  spaces and other punctuation fold to underscores ("agent-demo" becomes
  `agent_demo`), with a yellow note when the name changed. The interactive
  prompt normalizes the same way, so pasting a name with spaces no longer
  bounces. A name is only rejected when nothing identifier-like remains.
- 2bf1a7c: `typecad-pcb create` now installs the firmware dependencies itself when the
  HAL scaffold's own install step didn't take (`fw/package.json` present but
  no `node_modules`). hal ≤ 1.0.0-alpha.20 cannot spawn npm on Windows, so a
  fresh project opened with a `fw/` that VS Code's Vitest extension
  immediately flagged ("vitest not found in fw folder") until `npm install`
  was run there by hand.
- 2ce39f0: The board viewer now renders inner copper layers. KiCad plots them as
  `.g1`–`.g30`, which the gerber extension allowlist didn't carry, so any
  4+-layer board silently lost every layer between front and back copper.
  Inner layers now join the stack in the viewer and pick up theme colors
  like the outer ones.
- 2bf1a7c: The layout view's apply bridge now heals a create() argument drift instead
  of letting it silently delete traces. The route rewrite stages maintain
  "every declared TrackBuilder is passed to typecad.create()" one edit at a
  time; a name that slipped through (seen once: an untouched route's
  argument dropped while its declaration survived a multi-route rewrite)
  made the route build nothing — its copper vanished from the board and the
  viewer with nothing in the log. Any route/delete apply now re-adds every
  declared-but-uncreated route name to create() as a final pass.
- 2bf1a7c: The layout view's apply bridge now writes route edits to the file the
  build actually runs. It previously planned against the first src file
  carrying a `typecad.create(` call — with a stray copy in src/ (an old
  duplicate with its own create()), every drawn route landed in the dead
  copy: the source looked edited, the board rebuilt without the new traces,
  and nothing reported the mismatch (one board lost three drawn routes this
  way; the copy also accumulated syntactic damage from rewrites aimed at
  its odd formatting). The planner now resolves the entry file from
  typecad.conf.ts and orders it first, so rewrites go where the build
  reads; the stale-copy capture is gone.
- 2bf1a7c: The layout view's layer-edit preview now paints the target layer's own
  theme color, and the layout view no longer hue-rotates back copper. Two
  invented color transforms made layer edits unreadable: the live preview
  shifted the re-layered trace's hue by a fixed 150°, and entering the
  layout view applied the same rotation to every back copper group — so in
  Nord a trace sent to B.Cu painted orange (the rotated blue ≈ Nord's own
  front-copper rust, i.e. "nothing changed"), and the rebuilt board showed
  the same off-theme orange that exists nowhere in the theme (gruvbox's
  green back copper rendered purple). Both transforms are gone: a re-
  layered trace repaints instantly in the resolved theme ink of its target
  layer — verbatim what the rebuilt board will paint there — and the
  layout stack keeps each copper layer in its theme's own color, with the
  existing 75% translucency providing the front-over-back depth cue.
  The properties dialog's apply also drops the segment selection now: the
  selection highlight is a solid white line at the trace's own width, and
  left standing it covered the very stroke the layer edit just repainted —
  the recolor was there all along but invisible until the selection
  cleared (reported as "the layer change does nothing until rebuild").
  The net highlight's paint snapshot no longer reverts a re-layer either:
  clearing a highlight restores every matched element's saved stroke, and
  that snapshot is now kept in sync when a layer edit (or its undo)
  repaints a trace — plus the dialog's apply clears the highlight — so
  clicking elsewhere after an edit leaves the new layer color standing
  instead of repainting the pre-edit color over it. The edited trace is now
  a NATIVE member of its target layer: the path and its hit lines move
  into the target copper group and carry that group's own `var(--ink-…)`
  stroke, so theme switches, the layer visibility checkbox, the per-layer
  opacity slider, and the layout view's translucency apply to it exactly as
  they do to the layer's built ink — undo returns it to its original group
  with its original stroke.
- 2ce39f0: Vias placed by one edge of a multi-pin net are now visible to the router
  when it places the rest of the net: they're appended to a shared
  hole-to-hole list (drill edges need clearance even between same-net vias)
  and rasterized into the routing grid as net-aware pads, so later edges
  connect through their own vias instead of stacking a second via a fraction
  of a millimetre away or routing tracks blind through the first one. Vias
  already staged on the board before routing starts are included, and rip-up
  rollbacks re-snapshot the list for the next attempt.
- 2bf1a7c: The VS Code Board viewer no longer keeps serving a page built by an older
  viewer after the viewer tooling itself updates. The panel cached its
  generated HTML keyed on the board's mtime alone, so a `gerber-viewer`
  rebuild (or any out-of-band regeneration of `build/serve/viewer.html`)
  that didn't touch the board left every already-open workspace serving the
  pre-update page — with `retainContextWhenHidden` keeping that stale page
  alive across tab switches, a rendering fix could land and the user would
  still see the old behavior until the board next changed or the window
  reloaded. `show()` and the watcher refresh now adopt an on-disk viewer
  page that is newer than the served one and still describes the current
  board revision (the same freshness rule the panel-restore fast path
  already used), swapping it in without rerunning the export pipeline, and
  never while a generation is mid-write. Every generated page now carries a
  `tc-viewer-build` stamp, and the extension logs it on each page
  assignment, so the output channel always answers "which page build is
  this webview running" — including "pre-stamp page" for pages older than
  the stamp itself.
- 2bf1a7c: the thermal (Copper ΔT) view no longer paints its relatively-hottest trace
  full-scale white on a thermally quiet board: the auto ramp is now floored at
  1 °C, so a board whose every rise is millidegrees renders all-cold instead of
  clamping a 3.7 m°C hairline to the white end of the stops while the hover
  readout says "+0.0°C". The hover rise itself now prints in engineering
  notation ("trace +3.71m°C ≈ 25.0°C"), so the color scale and the status text
  can never disagree about the same trace. The "color by margin" path is
  unchanged — a user-specified allowed rise still sets the scale exactly.
- 2ce39f0: Schematic export is quieter about the code-only workflow. Components
  created without `sch` coordinates (which the renderer places
  deterministically) are now reported as one summary line naming them all,
  instead of a warning per component that trained you to ignore the log. And
  when a power net has no matching KiCad power symbol, the warning says what
  that means — the net still connects via labels, but the schematic shows no
  rail glyph and ERC cannot verify it — and suggests real rails the power
  library carries (`+3V3` | `+5V` | `GND` | …) instead of a bare "not
  found".
- 2ce39f0: The measure tool owns its clicks. Ruler points now land on parts, pads and
  copper — the viewer's grab handlers used to swallow the pointer press, so
  a ruler couldn't start there; the tool now captures the press at the
  window before any of them see it. Two quick points on one spot are a
  double-click to the browser: while measuring, that no longer opens the
  part value editor, and in VS Code it no longer jumps the editor to the
  component's source or clears the saved highlight — the probe client stands
  down while the ruler is armed. Also in VS Code, `Build Board` leaves the
  command palette: the viewer builds the board on open, so an explicit
  rebuild lives where the intent is — the ▶ Build Board lens, the status
  chip, and the stale-board prompts.
- 2ce39f0: `typecad-pcb add-component --folder=./src` now writes the component into
  that directory instead of nesting `src/src/` beneath it, and the "use it
  with" hint prints the import path relative to where the command ran
  (`./src/AP2112K_3_3`, not a hardcoded `./AP2112K_3_3` that only works from
  inside src).
- 21e9d51: kicad2typecad: axis-aligned rectangular zones and keepouts now import as
  `x/y/width/height` instead of a 4-point polygon, matching the rect form the
  zone/keepout docs teach (same collapse the outline importer already did for
  `gr_rect`). Non-rectangular polygons still import as explicit `points`.
  The zone skill doc gained a points-form example and a geometry note.
- 2bf1a7c: The layout view's trace-properties dialog (E) can no longer write a width
  below the board's own minimum. The `[`/`]` width keys already stopped at
  the rules island's `minTrackWidthMm`, but the dialog clamped at a
  hardcoded 0.05 mm floor — an under-minimum value typed there rode the
  apply bridge into source verbatim (seen as a 0.05 mm trace that rendered
  sub-pixel in the viewer: "my trace vanished after the layer change").
  Both the dialog and the shared resize path now floor at the rules
  minimum, and the dialog's hint shows it (`min 0.2 mm` when the board
  carries one).
- 2bf1a7c: Board viewer: the layout view now derives from the gerbers' X2 pad attributes alone, so a fresh board with nothing connected still gets it — previously the overlay (and the Layout dropdown entry) only appeared when the netlist carried at least one pad→net mapping, which meant the very project `create` scaffolds opened without a layout view. Ratsnest wires are now the layout view's alone: the plain gerber stack renders the fabricated board without them (they had been drawn into every view that renders the gerbers, including the viewer's first open in gerber mode). Routing keys and drags were already layout-gated, so no interaction lost them.
- 2bf1a7c: Selecting traces in the layout view no longer needs pixel-perfect aim.
  The clickable corridor of each segment now carries round linecaps — the
  visible ink bulges a half-width past each endpoint in round caps, and a
  butt-capped corridor left the dangling end tips unclickable. And a press
  that lands on nothing interactive now captures the nearest segment within
  ~9 px: tiny cleanup fragments (a 0.2 mm leftover stub's whole clickable
  area was a few pixels) and the air beside a thin trace both select the
  trace instead of falling through to deselect. Presses on parts, pads, or
  near a dangling end (the route-start arm owns those) are untouched, and a
  click in genuinely empty board space still clears the selection.
- 2ce39f0: `typecad-pcb doctor` checks dependencies by resolving them the way an
  `import` would, instead of looking for a nested `node_modules/<dep>`
  directory. npm workspaces and parent-folder installs — where the project
  itself has no `node_modules` — no longer fail the node_modules and
  core-deps checks on setups that work perfectly.
- 21e9d51: kicad2typecad: imported TrackBuilder chains now carry their net names.
  Named nets used to survive only as `// Net:` comments and variable names —
  the generated `typecad.track().from(...)` calls were electrically
  anonymous, forcing re-annotation of every imported chain by coordinate
  matching. The importer now emits `typecad.track({ net: 'GND' }).from(...)`
  for named nets (vias inherit the net from the builder), so copper imports
  round-trip with their connectivity intact.

## 1.0.0-alpha.7

### Patch Changes

- 2073522: Fix `create` starving the spawned HAL wizard of console input on Windows. The interactive branch prompted with `@inquirer/prompts` and then spawned `npx -y @typecad/hal@latest create` via `execFileSync('cmd.exe', …, { stdio: 'inherit' })`; an @inquirer raw-mode console reader cannot be fully stopped after prompting, and the blocked event loop of a synchronous exec keeps libuv draining the console input buffer — so the inherited-stdio HAL child (any version) never received a keystroke and its board picker sat unresponsive. The three questions now use plain `readline/promises` behind a drop-proof line queue (also fixes piped-stdin answer sheets being partially discarded), and the HAL step spawns asynchronously and awaits the child. Verified end-to-end on a real console via WriteConsoleInput injection: name → hal → git → board filter → select → starter → both hw/ and fw/ scaffold.

## 1.0.0-alpha.6

### Minor Changes

- 8ae4765: The board viewer gains a fifth view — **Copper ΔT** — answering "given this operating point, where is the layout thermally stressed?":

  - Wires are colored by estimated temperature rise from the inverted IPC-2221 formula — the same constants the `powerInfo` width sizer uses — applied to each wire's solved current (the flow graph's per-edge value) and its real gerber width. A wire sized for its current reads exactly its rated rise; a neck-down carrying the same amps lights up.
  - Zone pours get a 2D sheet-resistance solve over the actual fill polygon (0.6 mm raster, red-black SOR, 1.724e-8 Ω·m at 35 µm), driven by the per-pad current injections — so heating appears where the copper truly funnels, and stitch-via bottlenecks show up as hot rings. Pours render as a clipped heat image; confidence is visually distinct from the per-wire computation.
  - The board renders near-monochrome graphite with an incandescent ramp (muted copper → warm → orange → near-white) instead of the electrical purple ramp; zero-current copper stays inert. Controls: ambient temperature (ΔT → absolute), allowed rise, and a color-by-margin mode; the legend shows the board's own ΔT range.
  - Copper-loss estimate only, and labeled as such: external-layer constants throughout, no component self-heating, no enclosure or lateral spreading. In parallel with a pour, a routed wire's share of the current is not modeled (the flow graph sends pad current along wires; the pour solve spreads the same injections over the sheet).

  Known follow-ups: per-via currents from the coupled two-layer solve, inner-layer constants from the stackup, and a hover report card (width/copper/current/resistance/loss/ΔT/margin).

  Via modeling: netted ref-less copper pads are vias — their current is an equal share of the net's total injection (stated in the legend; a coupled two-layer pour solve would give the true split), rated by the inverted IPC-2152 barrel formula on the drill diameter found in the drill marks, and their pads color like wires so a stressed via ring reads at a glance. Library-side, `TrackBuilder.via()` now inherits the builder's `net` option (vias previously landed un-netted) and the powerInfo solve is clamped to the board's fabrication floors — a modest current at 35 µm plating solved to sub-fab drills like 0.072 mm.

  Layer indication: the schematic-family renders (ngspice + Copper ΔT views) now include EVERY copper layer instead of only the front — the top layer draws solid as-is, the second layer as a thin centerline through its traces, the third as centerline plus one edge line, the fourth as centerline plus the other edge (deeper layers fall back to centerlines; out of scope for now). Real trace widths ride in a `data-w` attribute so the flow/thermal models use true geometry regardless of the visible stroke, and via counting dedupes the per-layer flashes.

  The board (FR4) itself joins the solve: a stacked two-layer steady-state model (1.2 mm raster) where every copper loss — wire I²R, via barrels, pour J²·Rs — heats the laminate, conducted laterally by copper/FR4, through the core, and convected from both faces. It renders as one continuous translucent field over the entire board (no trace gap — copper, pours and components draw above it), painted on a 3×-fine grid with bilinear sampling of the solved field; the legend reports the board's own ΔT.

  Component self-heating joins the board field: each device's solved watts (from the OP data the ngspice view already uses) are injected into the FR4 solve at its pads, split across its pins and spread over each pad's footprint. Since the model ignores component-surface convection, all of a part's dissipation conducts in through its leads — an upper bound, and now stated that way in the legend ("board ≈ +N°C (FR4 + parts)"). Accuracy companions in the same pass: via barrels now conduct heat between the two solved layers (previously the layers coupled only through the FR4 core — a via is ~15× a cell's core conductance), component pads count as in-plane copper, and the via copper-loss conductance was corrected to the electrical barrel value (σ·π·d·t/L ≈ 600 S at a 0.15 mm drill — the old constant used the thermal conductivity with a mm/m slip, overstating via I²R heat ~145×).

  Hover readout: in the Copper ΔT view the status bar now reports the temperature under the cursor — the trace's or via's own IPC rise when over copper (both via flashes of a barrel answer), and the bilinearly-sampled FR4 field everywhere else, each as rise-plus-absolute at the ambient setting.

- 7417cec: Native gerber export (Phase 1): new `gerber_export` module plots copper layers from a `.kicad_pcb` without kicad-cli. Byte-parity with kicad-cli 10.0.0 output on the `features` golden fixture (all 4 copper layers) and structural parity on `rd_skeleton` (pours equal within KiCad refill variance). Encodes the full observed KiCad convention set: aperture macros (RoundRect/HorizOval/RotRect/Outline4P/FreePoly), X2 object/aperture attributes, absolute pad angles, via/track/NPTH emission rules, and saved zone fills. Not yet wired into `typecad-pcb export` — parity harness lives in `gerber_spec/tools/parity.ts`.
- 7417cec: Native gerber export (Phase 2): graphics layers — Edge.Cuts, mask, paste, silkscreen geometry, fab geometry, courtyard, adhesive, margin and user layers now plot natively from `.kicad_pcb` board items, on top of the Phase 1 copper writer. Parity with kicad-cli 10.0.0 goldens: every non-text layer byte-exact on both fixtures (mask/paste openings, edge profiles with CW-normalized arcs, courtyard `TO.C` groups, filled-circle fat-pen rendering, canonicalized rects); silk/fab text strokes remain Phase 4. Encoded conventions include the quirky user-layer `FileFunction`s (`OtherDrawing,Comment`, `Other,ECO1`, …), gr-before-fp item ordering, and filled-poly stroke+region rendering.
- 7417cec: Native gerber export (Phase 3): Excellon drill and `.gbrjob` job files now plot natively, and `typecad-pcb export gerbers --native` writes the complete fabrication set (26+ gerbers, `.drl`, `-job.gbrjob`) without kicad-cli. Byte-parity with kicad-cli 10.0.0 goldens on both fixtures. Reverse-engineered and encoded KiCad's drill conventions: sequential tool numbering (vias → component drills → NPTH), a two-pass body (all plain hits, then routed `G85` slots per tool), slot axes rotating with the position matrix, and the exact coordinate formatter — digit-wise nm parsing with `nm × 1e-6` double arithmetic and round-half-even printing, verified against 16 probe/golden data points. Job files synthesize the default stackup for boards without one and derive Size/DesignRules from board geometry.
- 7417cec: Native gerber export (Phase 4): text rendering. Silkscreen/fab/user-layer text now plots natively via KiCad's built-in stroke font (newstroke glyph data embedded for U+0020–U+00FF, decoded with the exact `value + 'R'` / `FONT_OFFSET −8` / `1/21` conventions) and TTF texts render from the board's own `render_cache` polygons as filled regions. Text placement replicates the probe-verified KiCad 10 rules: file `(size H W)` axis order, cap-middle justification offsets (`sy − 0.052·th + max(0, 0.013·(0.8·sy − w))` base with the 1.17-height fudge), negated rotation for the internal y-down frame, nm-truncating point conversion, per-segment MoveTo/LineTo emission, hidden-property skipping (symbol-valued `hide yes`), properties-only footprint text, and the texts-before-graphics two-pass ordering with bare (attribute-free) text runs. Also: legacy `fp_text user` items render except `${REFERENCE}`/`${VALUE}`
  placeholders, and `typecad-pcb export gerbers` now defaults to the native
  plotter for all users (`--kicad` opts back into the legacy kicad-cli path;
  the legacy path keeps passthrough flags and zone-refill behavior). The features fixture now
  matches kicad-cli on all 26 output files; rd_skeleton matches everywhere
  except ~30 lines of silk (one identical-geometry ring rotation + tie
  rounding) and ~80 lines of fab (tie rounding, one swapped arc pair),
  all documented in gerber_spec/SPEC.md. Late fixes: font data pinned to
  the KiCad 10.0 branch, gr_text raw indexing, ${REFERENCE}/${VALUE}
  substitution, ClampTextPenSize pen clamping (positions keep the
  unclamped thickness), and closing-vertex ring dedupe.
- 7417cec: Native zone fill: copper pours are computed in-process with clipper-lib (Boost) — clearance from foreign pads/tracks/arcs/vias, thermal-relief spokes built analytically, edge pullback via chained Edge.Cuts outlines, keyhole-ring output that KiCad re-reads. Hatch-mode zones render as KiCad-style border rings plus 45°/135° capsule hatch lines (hatch_thickness/gap/orientation/min_hole_area honored). `typecad-pcb export gerbers` now refills declared-but-unfilled zones automatically (the --check-zones equivalent), so pour copper is never silently missing; boards with saved fills plot them unchanged. Also switches `export drill` to the native writer (--kicad escapes to the legacy plotter) and adds a permissive Hershey "futural" stroke font (public domain) replacing KiCad's GPL newstroke data for license compatibility — text layers diverge from kicad-cli goldens by design (structure still verified).
- 4b55bbb: Manual routing in the layout view: X over a highlighted pad arms a route — X over a trace arms from the trace, silently (the status line alone says where X starts), and a press within the pad-snap radius of a segment end arms there, ending the needle-threading at a 0.3 mm stub tip. The walk draws clearance-checked, corridor-hinted, via-capable tracks in 0/45/90 that actually reach the pad: 0/90 prioritized (diagonals and bends cost extra), a drag-trail interaction, placed-but-unstaged components are routing obstacles, and a pad snap finishes; V drops a via (the live layer flip actually flips), double-click commits without folding the last hop onto itself, and the rubber-band preview renders from the instant the route starts — layer ink and a start dot, no invisible anchors. Track segments are selectable on source tracks, not just interactive routes: click highlights, Delete removes (the deletions ride apply), U expands exactly one hop per press, committed and source-authored vias are first-class selectable elements, and single-segment selection names the declaring source in the status line — netless hand routes resolve their TrackBuilder declaration line. Track provenance reads at a glance: autorouter nets candy-cane stripe (RIP UP hides them, not greys) and every TrackBuilder-authored track — netted or netless — never stripes. Field hardening: the router can no longer wedge permanently (routeCancel clears state before cleanup, routeKey unwinds a half-built route on any throw), a peripheral throw no longer fails a built route, tie-in arming validates its geometry at the source, small traces route reliably (a real-coordinate sweep over the board's 12 shortest segments routes 11/12 — the last sits under a pour hatch stroke), the 1.2 mm magnetic radius applies only to empty-space presses near a dangling tip so mid-trace intent wins on small traces, walk endpoints snap to traces and via barrels like pads, via preview markers no longer leak as stuck highlights, pour clicks no longer net-dim the board, and a net-highlight cycle restores the layout view's legitimate zone subduing instead of flashing pours to full strength. TrackBuilder `from()`/`to()` accept both call styles — positional and object.
- 4b55bbb: The gerber/layout viewer's layer-theme picker vendors eight more KiCad color themes: KiCadMaxColors (MIT), Witch Hazel (Apache-2.0), and Behave Dark, Blue-Green Dark, Eagle Dark, KiCad 2020, KiCad Classic (converted from the KiCad 5 pcbnew fragment), and Nord from pointhi/kicad-color-schemes (CC0). Upstream JSONs and license notices live in `src/gerber_viewer/themes/`; the VS Code extension's Board viewer picks the new entries up automatically on the next render. The remaining pointhi themes (black-white, blue-tone, monokai, neon, solarized-dark/light, wdark, wlight) are schematic-only upstream — no board section exists to vendor.
- 4b55bbb: The layout view's arrangement surface grows real editor interactions: marquee box selection renders where you drag it (shift-click toggles members, click deselects, a single selected part collapses its highlight), Escape unselects everything, right-hold pans the board while parts move only when already selected, and the toolbar slims down (the layout hint, fab report panel, and zoom/export buttons are gone). Unrouted-net ratsnest wires show from first open, in every gerber-stack view. Every pad carries pin-number + net-name labels from the PCB model, rendered topmost; a part drag carries its labels live — the whole footprint moves as one group — and rotated parts' refdes always reads keep-upright (L→R or B→T). Pin highlight is component-style ants+brackets+tint instead of a blue circle, body-hidden pads (BGA balls) become selectable, and board presses hand keyboard focus to the svg so keys always reach it.
- 4b55bbb: The router runs against real board rules. A rules island (`build/<board>_rules.json`: min trace width, min clearance, copper-to-edge clearance, per-class width/via defaults) reaches the page when generate runs with `--rules`, and width stepping refuses to go below the floor — the readout warns. The live route carries a gray keep-out halo, the DRC clearance envelope around every drawn piece, that tints red on violation (via rings included, resized in lockstep), and copper samples inside it owe the copper-to-edge clearance to the nearest board edge. Widths come from where you'd expect: each net remembers the last width and via used, W opens the width control, `[`/`]` step the trace width (Alt for fine) and `{`/`}` the via — a via sized by explicit choice is decoupled from the trace width; otherwise the barrel tracks it, floors respected. Net-class defaults from the rules outrank the copper heuristics (regex pattern → class), I eyedrops an existing trace's width, P sizes a power net by current (IPC-2221, the same constants as the library's powerInfo sizer, ΔT 10 °C target, per-layer copper weight from the stackup), and Z solves a controlled-impedance width (Hammerstad microstrip ported verbatim from pcb_impedance.ts, clamped at a 3 mm cap). `?` toggles a legend.
- 6f0fe23: The board viewer gains a sixth view — **Layout** — a KiCad-editor-style arrangement surface over the real gerber stack: zones subdue to blueprint-faint, and every component renders as a draggable outline box (position from its pad centroid, orientation from the pad layout, body size from the footprint name — all derived from the gerbers, so it works in plain browser tabs). Dragging a component snaps to 0.5 mm (arrow keys nudge, Alt for 0.1 mm) and **rips up** its connected copper — every trace, via and pour edge on its nets, plus its pads — greying them until a rebuild lands. Trace provenance comes from a new `build/<board>_routes.json` the board writer emits (`manual` = TrackBuilder-built, `auto` = autorouter, `mixed`): TrackBuilder traces render dashed, autorouted ones solid, with legend chips. "apply & rebuild" hands the move deltas to the VS Code host (disabled in plain browser tabs), which rewrites each component's `<var>.pcb = { x, y }` literal in the board source and rebuilds the project and viewer — computed placements are skipped and reported, never mangled. **Phase 2:** R rotates the selection in 90-degree steps and apply writes the accumulated delta into the literal's `rotation` (added when absent). TrackBuilder endpoints are sticky — any `.from({ x, y })` / `.to({ x, y })` literal sitting on a moved component's ORIGINAL pads (within 0.05 mm, each literal's decimal precision preserved) translates with the part, so hand-built routes follow instead of dangling. Shift-click selects several components; `align row` snaps them to a common snapped Y, `distribute X` spaces them evenly between the outermost two (ends pinned). Arrow keys now nudge the whole selection.

  **Phase 3 guardrails:** every move re-checks live — a moved component that leaves the board outline (the gerber edge layer's bounds) or overlaps another footprint's rotated box warns in the panel and flags the offending boxes amber, and each ripped-up pad draws a thin dashed ratsnest line to the nearest surviving pad of its net, so what stays stranded until the rebuild reads at a glance. All of it clears on revert.

  **Phase 4 — the whole footprint moves:** drag handles are no longer generic boxes — each one is the component's exact footprint outline (the Fab-layer contour when the gerbers carry one, chamfers included, else the convex hull of the pad land pattern), in the layer stack alongside the copper. And a move now relocates the ENTIRE footprint like the KiCad editor: pads, mask/paste openings, fab/courtyard/silkscreen outlines and the component's drill hits all travel with the handle (live during the drag, rotation included) and nothing of the part lingers at the old spot — only the net's routing (traces/vias) rips up grey. The renderer now tags fab/courtyard/silk outline paths with `data-ref` (from `%TO.C` attributes) so every layer of a footprint is addressable, and unattributed drill circles are claimed by matching pad centers. Fab/silkscreen value and reference texts, which KiCad often plots as plain graphics without %TO.C, are claimed geometrically (within the footprint's reach) so the "1k" never stays behind. Revert puts every layer back exactly, and the pending arrangement is a layout-view-only rendering: switching to any other view (gerber, thermal, ...) restores the shared stack to the authored board, and re-entering re-applies the pending moves.

  **Silk/fab text editing:** board texts (gr_text — the `pcb.text()` API, parsed from the board file) are now editable in the layout view. Clicking the actual strokes grabs the whole text; dragging repositions it like a component (0.5 mm snap, R rotates about its anchor). Double-click edits the value in place — the strokes swap for a live preview until the rebuild re-plots real glyphs. "apply & rebuild" matches the source `.text({ ... })` literal by its authored value + anchor and rewrites value, x/y and rotation, keeping every other property (layer, font, sizes) untouched.

  **Component-owned text grabs:** a part's own silkscreen/fab ink — refdes and value strokes, outlines, courtyard — is now grabbable: clicking and dragging it moves the whole component (KiCad-style; the label is part of the footprint), and double-clicking opens an in-place editor for the component's VALUE, synced on apply to the `new Component({ … value: '…' })` constructor literal (inserted after `reference` when absent). The synthetic blue refdes labels are gone — the board's real silkscreen already names every part — and the editor double-click no longer jumps to source in the layout view (the probe reveal yields to in-place editing there).

  **Grab fix:** KiCad plots most footprint refdes/value texts with no `%TO.C` attribute at all — those strokes now bind to their nearest component (same reach the whole-footprint move claims with), so dragging the fab "1k" or the silk "R1" moves the part and double-click edits its value. Binding measures geometry through toggled-off layers too (getBBox zeroes for non-rendered elements), and listeners bind once instead of piling up on every view switch.

  **Independent label positioning:** every part's Reference and Value texts are now independent, API-addressable objects — drag the actual strokes to reposition a label anywhere (0.5 mm snap), R rotates it about its own anchor, and the component stays put. Apply converts the final world position to footprint-local coordinates against the part's final placement and writes `referenceLayout` / `valueLayout` into the `new Component({ … })` constructor (inserted after `reference` when absent) — exactly what the board writer's fp_text layout support consumes, so the rebuild lands the label where you dragged it. Label anchors are parsed from the board file (footprint `at` + property offsets, rotation-composed), strokes claim to their nearest label anchor, and double-clicking a Value label still edits the part's value; reference names stay fixed.

  **Interaction fixes:** component drags now carry their Reference/Value labels (they are footprint children — an independently dragged label stays pinned at its absolute spot instead). Label claiming is layer-scoped: dragging a silkscreen refdes can no longer swallow nearby fab strokes. Double-clicking the refdes opens a rename editor (apply rewrites `reference: '…'`, collision-guarded against existing refs), and value/reference edits hide the part's old label strokes and show a plain preview at the label's anchor. The extension applies value/rename/label edits as ONE constructor replacement — overlapping literal ranges can no longer collide inside a single apply.

  **Independent fab refdes text:** the small `${REFERENCE}` text inside a part's fab outline is now its own text object — the `Component` `fab` option positions it, so it drags and rotates independently of the value text instead of moving in tandem. Cluster claiming compares each stroke's distance to an anchor normalized by that text's own reach, so tightly-packed label clusters split correctly regardless of text size.

- 4b55bbb: DRC goes native: `typecad-pcb check` runs the in-process engine by default (`--kicad-drc` keeps kicad-cli). The copper core is built for KiCad-report parity — multi-polygon zones, oval drills, layer-aware unions, arcs/roundrect/trapezoids, annular-ring dedup, VALUE substitution, uuid collision and missing-dimension checks — and constraints come from the board's own `.kicad_pro` design settings (previously engine defaults ran, mislabeling compliant vias as undersized), with a conf-referenced JSON rules file for overrides. DFM advisories report as their own bucket — no kicad-cli counterpart, excluded from parity divergence. Tier 1: dangling tracks, hole-to-edge, aspect ratio, acid traps (structural copper only — hatched pour junctions no longer false-positive), outline integrity, silk/mask text checks, via-in-pad. Tier 2 unlocks copper slivers and mask webs through an erode-and-survive width primitive, plus courtyard overlap, thermal spoke resolution, and paste slivers. Hatched boards drop from >10 minutes under kicad-cli to ~18 s.
- 9428e2e: ngspice simulation now runs the whole circuit without per-component ceremony, headlessly, with a fully featured analysis API:

  - `simulate()` takes no arguments: passives (R/C/L/D references) are netlisted automatically — no `simulation: { include: true }` opt-ins — and power rails are discovered from the `Power` objects already attached to the circuit (voltage ratings stamped on pins). Passing `Power` objects explicitly still works and wins. `simulation: { exclude: true }` opts a component out.
  - `.tran()` no longer opens ngspice plot windows and blocks until you quit them — transient analysis runs in batch mode (`ngspice_con` on Windows) and returns the parsed `NgspiceResult` waveform, just like `.op()` (a final-value summary table replaces the per-point dump). Pass `openPlots = true` as the last argument to get the old interactive plot windows back.
  - New analyses: `.dc(source, start, stop, increment)` sweeps a named source (name one with `new Power({ …, name: 'VS' })`; auto sources are `V1`, `V2`, …), `.ac(sweep, points, fstart, fstop)` runs a small-signal frequency sweep — sources gain an `ac:` magnitude, and complex results come back with `getMagnitude` / `getDb` / `getPhaseDeg` for Bode-style checks. Sweep axes are the `v(v-sweep)` and `frequency` variables.
  - Custom devices: `simulation.model` emits a `.model` card (e.g. `'DLED D (IS=1a RS=3.3 N=1.8)'`), `simulation.subckt` + `simulation.library` instantiate `.subckt` parts from vendor-style `.lib` files (the `.include` path is rewritten relative to the generated netlist), `simulation.pinOrder` maps component pins onto model/subckt terminals, and `simulation.params` appends instance parameters (`'m=2'`, area factors, `W=/L=` …). Device cards now emit every connected pin, so multi-terminal parts work.
  - `Power` sources got `name`, `ac` (small-signal magnitude) and `waveform` (raw ngspice source expression such as `PULSE(0 5 1m 1u 1u 5m 20m)` or `SIN(0 1 1k)`).
  - Results API: `getWaveform(name)` for full data columns, `getAt(name, index)` for a point, plus `getMagnitude` / `getDb` / `getPhaseDeg` over the new `imaginary` arrays.
  - Fixed `.model` emission: the component's `value` was inserted before the model name on the device card, so modeled devices generated invalid SPICE and failed to converge. Model-based cards now reference the model name directly.
  - Fixed diode card pin order: KiCad's Device library numbers diodes `1=K` (cathode) and `2=A` (anode), but the ngspice `D` card lists anode first — every auto-netlisted diode/LED solved reverse-biased relative to its schematic symbol. The netlister now flips the pair; an explicit `simulation.pinOrder` still names the card order directly.
  - Fixed the ngspice ASCII parser to reset per data point — previously only the first point of a multi-point result was captured.
  - Per-device `.probe` vectors (`i(ref)`, `ref:power`) are now collected in every analysis mode, including headless transients.
  - Values are validated to a single token: ngspice 44+ strictly rejects extra tokens on device cards, so a `value: '10k ohm'` (or `'100nF X7R'`) would abort the whole simulation with a cryptic parser error — the netlister now warns and skips such components instead, with a message pointing at the whitespace.

  Known ngspice 44.2 strictness: named instance parameters (`area=2`, `m=2`, `off`, `temp=25`) parse fine, but _positional_ tokens on device cards (`D1 a c MODEL 2`) are rejected with "could not find a valid modelname" — use named forms in `simulation.params`.

- 9428e2e: The PCBA render gains a brand identity:

  - A signature **typecad** theme — deep teal soldermask, champagne-gold pad finish, warm-white silk — available as `--theme typecad`; the classic green stays the default.
  - Every render carries an **engineering title block** below the board: board name, date, dimensions, and a "made with typeCAD" wordmark in the theme's accent color. `--no-title-block` renders a clean image.
  - `--style blueprint` draws the board as an **engineering drawing** instead of an assembled render: plain blueprint paper, the board and component outlines in ink strokes, thin outlined pads, drill marks, and the title block in drawing ink — designators come from the fab layer (KiCad places them out of the way), with synthetic labels only when the layer set has no fab layer. Element classes stay distinct: traces keep their real widths and zone pours render as explicit diagonal hatch lines clipped to the pour outline (plain geometry — SVG pattern fills rendered as a solid wash in exported files and as arbitrary colors in third-party viewers), with a faint boundary and a faint solid underlay so copper under a pour stays legible.
  - The board viewer's switcher gains a third entry — **Blueprint view** — riding the same coordinate frame: pan/zoom, ruler, DRC markers, and cross-probing work there too.
  - The blueprint draws like a fab drawing: **dimension lines** with extension lines and arrowheads measure the board's overall width (top) and height (left) against the stitched outline, and **crop-style corner extents ticks** mark the board's four corners.- The blueprint paper now extends to fully contain every drawing annotation on all four sides — dimension lines and their text above/left, corner extents ticks on every edge (previously the annotations ran past the paper edge onto the canvas), and an **info block** in the bottom-left corner lists the layers the drawing was built from, units and side, the generating version, and up to two parse warnings.

- 9428e2e: The board viewer's PCBA view gains a **theme picker** (a second combo box under the view switcher, visible in PCBA view only): Green ENIG (default), Red ENIG, Blue ENIG, Purple ENIG, Black HASL, White mask with black silkscreen, Yellow mask with black silkscreen, **OSH Park After Dark** (black substrate, gold ENIG pads, white silk), and the typeCAD house teal.

  Switching remaps the embedded render's flat colors client-side — one render serves every theme, no re-export — and the mask-luminance ink is exempt so soldermask openings keep compositing correctly. The pick persists per board across reloads and rides into SVG/PNG exports (the colors are baked into attributes). The new colorways are also available to the CLI as `--theme red-enig|white-hasl|yellow-hasl|oshpark-after-dark`.

- 9428e2e: The board viewer gains a fourth view — **ngspice** — focused on components and traces: white paper, zone pours subdued to a gray hatch (never solid), traces at their real widths, and the PCBA component glyphs rendered semi-transparent on top so the routing reads through them. Designators are always shown.

  When an operating point is embedded, traces are **heat-mapped by voltage**: each stroke takes its net's solved DC voltage, interpolated continuously across the board's own min–max range — black at the coldest net (ground) through blue, green, yellow and orange to red, with purple marking the hottest, every voltage getting its own gradation (no fixed buckets). The ramp is the same one the component power map uses, so both scales read alike. A sidebar legend mirrors the ramp with the board's actual range at the ends, and nets outside the solve render gray so unsolved copper never masquerades as a voltage.

  Components get the same treatment **by power**: a translucent heat-map shape is laid over each solved component's glyph (on top of the component layer, pointer-transparent so hover/click still reach the pads), colored by its dissipated watts — the same continuous interpolation over the board's own power range, extended with purple above red so the single hottest part stands out. The shape hugs the component **body** — the glyph's largest filled geometry, so through-hole lead wires don't stretch it and round cans get round overlays. Hovering a component body reads the device's own operating point (`R2 · 330uA 1.09mW`); unsolved parts show no overlay and no readout. A second legend shows the power range.

  **Current flow** animates on top of the traces: white particles glide along each wire in the conventional-current direction (the EE convention, not electron flow) with speed and size scaled by the log of the wire's current within the board's own range, pausable via a checkbox and adjustable via a 0–4× speed slider — both persisted with the board's other viewer state so they survive reloads. Direction and magnitude come from new per-pad branch data — the solve reports each pad's signed current injection by net (device currents mapped through the card pin order, plus the source terminals) — resolved on the board's actual route graph: each entering pad's current walks its own path to the nearest exit, so branch currents are per-branch (a rail stub ending at a DC-open cap carries nothing and stays still, even though its net is live). In the solver API the same data is available as `result.branches`.

  Hovering a trace displays the net's **ngspice operating point** — voltage plus the connected devices' current and power (e.g. `net2 · 3.3V · R1 1.2mA 3.9mW`):

  - `typecad-pcb simulate` re-runs the project entry with `TYPECAD_SIMULATE=op`; `pcb.create()` then solves the DC operating point via ngspice and writes `build/<board>_op.json` (per-net voltages, per-device current/power). The viewer pipeline embeds it beside the DRC report — absent file, no readout. Transient analysis is deliberately out of scope for now.
  - Two-terminal passives whose pins were only partially instantiated (typeCAD creates pin objects lazily) previously emitted ngspice cards with too few nodes, aborting the whole solve; missing terminals now become isolated nodes so the solve completes.
  - The island names are normalized case-insensitively (ngspice lowercases every name while the gerber X2 attributes keep the schematic's case — hovering `VCC` finds `vcc`), probed power arrives as `r1:power` in ngspice's raw output and is matched alongside the `.probe p(R1)` spelling, and ground is pinned to 0 V (ngspice's node 0 never appears in the v() list).
  - Readout values use engineering notation (`32.84mV`, `330uA`, `1.09mW`); an exact zero reads `0V`/`0A` rather than `0uV`.

- 43acb9f: The board viewer's Copper ΔT view gets a full accuracy overhaul to its thermal/electrical math.

  **Stackup-driven geometry.** The board writer now emits `build/<board>_stackup.json` (resolved from the PCB object's `stackupGeometry`), the `gerber-viewer` CLI accepts `--stackup` (and auto-discovers it beside the netlist), and the VS Code addon passes it through. The viewer uses it for per-layer copper weight (sheet resistance and the IPC rise both scale with real thickness — 2 oz halves the rise) and the real dielectric/board thickness. Absent the file, the old 35 µm / 1.6 mm defaults apply.

  **Electro-thermal coupling.** Copper I²R now self-heats through the resistivity temperature coefficient (+0.39%/°C): the board field solve adds the temperature-dependent loss back into the source, so hot traces dissipate more and run hotter.

  **Real boundary conditions.** The lumped h≈12 W/m²·K is replaced by an orientation-aware natural-convection correlation (vertical / horizontal-face-up / horizontal-face-down) plus linearized radiation (ε≈0.9), so the two outer faces shed heat as a function of their actual temperature excess.

  **Transistor terminal currents.** The operating-point solve now probes each BJT/MOSFET/JFET terminal (`i(q1:c) i(q1:b) i(q1:e)`, etc.) and adds them to the flow-graph `branches`, so current routes through transistor pins (previously it vanished there, breaking conservation), and component heat can inject at the actual current-carrying pins. Subcircuit port currents remain unsupported (ngspice doesn't expose them via `i(x:port)`).

  **Accuracy fixes.** Pour copper loss now actually heats the board (the 2D sheet solve's per-cell loss carried a stray mm²→m² factor that cancels exactly — six orders of magnitude too small); non-square pour cells use anisotropic conductance (`cellY/(Rs·cellX)` / `cellX/(Rs·cellY)`); internal layers use the internal IPC constant (k=0.024) via `data-inner`; component self-heating distributes by pad area; the component power overlay interpolates in log space (with a legend sampling the same ramp); FR4 in-plane conductivity is corrected to ~0.3 W/m·K; and SOR solvers report non-convergence ("approximate") instead of stopping silently.

  The per-wire and per-via rise formulas still invert the library's `powerInfo` sizers exactly; a numeric test extracts the shipped kernels from the generated viewer and locks down their units, the sizer round-trips, the copper-weight scaling, and the convection/radiation coefficients.

  Known remaining idealizations: a two-slab thermal model for multi-layer boards (per-layer current distribution needs the coupled multi-layer electrical solve), no component θ_JC/θ_JB package models (no thermal database yet), and DC copper-loss only (no skin/AC effects).

### Patch Changes

- 9428e2e: The vscode extension grows HAL-style ambient board state plus three new commands:

  - A **status bar entry** shows the build target — `rd_skeleton · 28 parts · 3 unconnected · 2E 5W` — with a `stale` flag when hw sources are newer than the built board; click opens the Board viewer.
  - **Unconnected pads and single-pin nets** appear in the Problems pane as warnings aimed at the declaring source lines (via the Code/net provenance), with an italic "R1 · 2 unconnected pads" chip after the declaration line.
  - **Run DRC** runs `typecad-pcb drc` and maps violations into Problems aimed at their source (a clearance hit on `net2` points at the `pcb.route` line); counts land in the status bar, and the Board viewer renders the same report's markers.
  - **Browse Components** is a QuickPick over the compiled board (ref — value · footprint · source variable) that zooms the Board viewer to the pick.
  - **Diff Board vs HEAD** renders the generated board's visual diff against git HEAD in a panel (`typecad-pcb diff` gained `--no-open` for embedded callers; `query components --json` now carries each component's `source` location).

  Review fixes folded in: Problems diagnostics and declaration chips clear when the board (or project) goes away instead of lingering from the previous revision; chip paths compare case-insensitively so a differently-cased open file still gets its chips on Windows; a warnings-only DRC count reads `· 2W` with its own separator; the DRC net fallback aims at the longest matching name (VCC_3V3 beats VCC); the diff panel locks down with the same per-page nonce CSP as the Board viewer (`applyNoncePolicy`, extracted from `injectProbeClient` — no more `script-src 'unsafe-inline'`); and the viewer guards all three data-overlay flags (netlist/DRC/stackup) behind one existsSync check so a missing artifact renders without that overlay instead of failing the whole export. The bundled editor-extension copies (assets/editor-extensions + the rd_skeleton demo) are regenerated — both predated the 0.11.11 `--stackup` pass-through and silently never shipped it.

- c8a90a1: The vscode addon's UX follow-ups — cross-probing lands where the question was asked, and the loop closes:

  - **Pad double-clicks land on the net.** Double-clicking a specific pad in the Board viewer now reveals the line that declared or routed that pad's net (the same preference as trace double-clicks); component outlines still go to the component's own declaration. The pin the client already reported is finally used.
  - **Quick fixes on every Problems entry.** Unconnected-pad, single-pin-net, and DRC diagnostics carry _Show R1 on board_ / _Show net VCC on board_ actions that jump into the Board viewer; entries with no component or net (the board-file catch-alls, which otherwise open the huge generated text) offer _Open Board viewer_ instead.
  - **The diff panel survives window reloads** like the Board viewer: a serializer restores it instantly from the on-disk report when one exists, or re-runs `typecad-pcb diff` when the board changed since.
  - **View Component is now a picker.** The palette command opens one QuickPick for browsing and typing — the compiled board's components (ref — value · footprint · source variable), the filter seeded from the cursor word, and a typed designator matching no item is still attempted. This subsumes the separate Browse Components command, which is gone.
  - **New setting `typecad-pcb.drcOnBuild`** (default off): run the design rule check automatically after every board build, once the board file has settled for 10s and no source is newer — violations land in Problems and the status chip without a manual run.

- 1fd32d3: A UX pass over the vscode addon — every dead end now leads somewhere, and net cross-probing runs in both directions:

  - **Net hovers + net selection.** Hover the quoted net name in a `pcb.net(…)` / `pcb.route(…)` call for a net card — declared/routed source lines, a single-pin warning, and a _show on board_ link that highlights the net's traces in the Board viewer (`typecad/pcb: View Net on Board` does the same from the palette, seeded from the quoted string under the cursor). Previously only components crossed the editor→board direction, while trace double-clicks already went board→editor.
  - **Actionable notifications.** Every "no compiled board yet" message carries a Build Board button; render-failure and diff-failure messages get an Open Output button.
  - **State-aware status chip.** Clicking the status bar entry follows the board's state — build when there is no board, a build-or-view prompt when stale, open the viewer when fresh. The tooltip is markdown with clickable Build Board / Run DRC links, and says when DRC has not run for the current revision (counts reset on every rebuild, so a fresh chip no longer reads as a clean one by accident).
  - **Silent failures speak up.** A selection the viewer page never acks (5s timeout) and a probe whose component fails to resolve now show a transient status message instead of writing only to the output channel.

- 9428e2e: A **▶ Build Board** CodeLens sits above the first line of every TypeScript source in the hw folder (the HAL addon's Flash & Monitor pattern): one click runs `npm run build` in a reused terminal, and the board watcher refreshes an open Board viewer when the build lands.
- 9428e2e: `typecad-pcb drc` now refills zones in memory before checking (`--refill-zones`, KiCad ≥ 9) — matching KiCad's GUI DRC, which refills by default. Since builds ship zone declarations without fill geometry (fills are computed by the consumer), a plain check validated a board that never exists: every via tying into a pour read as dangling, flooding the report with phantom violations (the demo board reported 203 violations / 499 unconnected items unfilled; its true count is 4 warnings / 0 unconnected). Extra kicad-cli flags still pass through after `--`.
- 9428e2e: Viewer exports are faithful and work inside the vscode webview again:

  - The webview CSP now allows `img-src data: blob:` — the PNG export rasterizes the serialized SVG through a data: URL, which `default-src 'none'` silently blocked ("could not be rasterized").
  - Blueprint zone pours carry a faint solid twin under the hatch pattern: renderers without pattern support (some viewers, office suites) fall back on the tint instead of an arbitrary blob color, so the pour still reads as marked copper.
  - Exported SVGs bake their page-CSS styling into explicit attributes: clear-polarity shapes keep the canvas color and DRC markers keep their red fills/strokes (a standalone file has no page stylesheet, so class-only styling fell back to SVG-default black).

- 4b55bbb: Export hygiene: the fab dir no longer accumulates foreign-board artifacts — export prunes files from other boards on each run — and fabrication outputs identify as typeCAD/pcb with the package version. Board discovery prefers the project's own board when several boards are around.
- 9428e2e: Clicking a net (or a component) in the board viewer paints the matched copper bright against a harder-dimmed board (unmatched copper now dims to 6% opacity):

  - **Blueprint view** — the matched net is pure white at full opacity. The composite views now dim per element instead of per group: a dimmed group composites its opacity over the matched elements inside it, which previously made the clicked net FADE rather than pop.
  - **Gerber / PCBA views** — the matched net takes the color copper already uses there, resolved per element from its nearest filled ancestor group (the layer group, the pads/copper-ghost wrappers) instead of a global lookup that resolved to the mask definition's black.

  Pads recolor, traces restroke, both at forced opacity 1; zone fills keep their color, and everything restores exactly on clear.

- 9428e2e: Fix `npx @typecad/pcb <command>` failing with `could not determine executable to run`. When a package exposes multiple bins, npm only auto-picks one whose name matches the package's unscoped name (`pcb`); the package only offered `typecad-pcb`/`gerber-viewer`/`kicad-symbols`/`kicad2typecad`, so the documented `npx @typecad/pcb create` quick-start (README + website) errored before the CLI ever ran. Added a `pcb` bin alias pointing at the same `dist/cli/typecad/index.js` entry as `typecad-pcb`; existing bin names are unchanged.
- 9428e2e: The vscode extension learns to share a workspace with the typeCAD/hal extension instead of talking over it:

  - Activation is `workspaceContains:**/typecad.conf.ts` only (no `onLanguage:typescript`) — the extension stays asleep in non-typeCAD TypeScript workspaces instead of planting a status chip there. Palette commands still activate it implicitly.
  - The status bar chip hides when no typeCAD project is in the workspace (it used to squat in the bar saying "no project"), and sits at priority 101 — just left of typeCAD/hal's chip (99) — so the two no longer jostle for the same slot with the same circuit-board icon.
  - Component hovers are scoped to TypeScript sources inside the hw folder (the same rule the ▶ Build Board lens uses). Firmware files are typeCAD/hal's hover domain; a component identifier in fw/ used to stack a PCB hover under hal's pin hover.

- 9428e2e: Zoom-to-component (in-viewer search and the vscode extension's select flow) no longer lands zoomed out in the PCBA view: each hit element's own transform is now folded into its bounding box before the fit union. `getBBox()` ignores an element's own transform, and PCBA component glyphs are `translate(centroid) rotate(angle)` groups — their local boxes unioned with the pads' board-frame boxes stretched the fit from the board origin to the part, so every selection rendered the whole board instead of the component.
- 9428e2e: Fixed `pcb.stitch()` voiding the entire bounding square of an angled track.

  - Track obstacles carry their exact segment geometry, but the stitch clearance check only tested the obstacle's AABB — for the autorouter's 45° segments that AABB is the whole square containing the diagonal, so a routed signal voided ~8×8 stitch cells above and below it instead of a thin band along the copper.
  - Stitch candidates are now measured with the same point-to-centerline (capsule) distance the routing grid's precise check uses: `distance - width/2 < via radius + clearance` blocks, everything else stitches. Orthogonal tracks are unaffected (their capsule matches their AABB).

## 1.0.0-alpha.5

### Minor Changes

- PCBA image renderer for the gerber viewer: `gerber-viewer <dir> --render pcba` renders the fab output as a flat, themed 2D "assembled board" SVG — the PcbDraw look computed from gerbers alone, with no board file, KiCad install, lighting or perspective involved.

  - The board surface is painted bottom-up by SVG compositing: substrate from the Edge.Cuts outline (traces are chained into closed contours, regions close implicitly), copper, pad flashes in the finish color, then the soldermask film with the mask gerber's openings punched through an SVG `<mask>` so pads/copper/substrate show exactly where the real openings are — followed by silkscreen and drilled holes.
  - Components are Fritzing-inspired stylized glyphs drawn from the X2 `%TO.P` pad attributes — no part library. Grouping pad flashes by reference recovers each part's layout; the package family (two-pad, dual-row IC, QFN/perimeter, generic) is inferred from the pad pattern, and each glyph gets metal leads at its pads, a rounded body, a pin-1 dot and a DIP notch for through-hole ICs. Mounting holes and single-pad test points are skipped.
  - Copper ghosting through the mask: real soldermask is translucent, so traces and pours under it render in a darker mask tone — a new `maskCopper` theme color painted over the film (still masked off at the openings, so pads keep their finish color). Every builtin theme ships a matching value. Raw copper is never painted under the film: mask-opening rings around pads reveal substrate only, so no copper-colored halo leaks around components (the `copper` color appears solely in the no-mask bare-board fallback), and the default `pads` finish is a copper tone (`#cf8a4d`) to match.
  - Netlist metadata is now auto-discovered: when no `--netlist` is passed, the pcba render looks for a sibling `*.net` beside the input directory (the typeCAD build layout: `build/gerbers` + `build/<board>.net`), so the plain command gets exact package dims, values and name-based classification. `--no-netlist` opts out. Without any netlist the pad-topology fallbacks still improved: a Y/X reference on a two-pad part renders the crystal metal can, and a perimeter pad ring classifies as QFP (long protruding gull-wing pads) versus QFN (short flush pads) by pad length, checked before the ball-array grid test so a QFP's pad lattice can't read as a BGA.
  - Chip resistors/caps draw a true top view: a sharp-cornered body with silver termination caps on its ends — `[copper pad [silver | black | silver] copper pad]` — with the board's own exposed pads visible past the part, instead of silver pads under a capsule.
  - Exact body outlines from the Fab layer: each component claims the fab ink nearest its pads (reaching 4mm past the land pattern, since bodies like terminal blocks overhang their pins), the group is stitched into closed contours with junction-aware walking (smallest-turn preference with backtracking, so tee connections such as terminal-block dividers don't break the loop), and the largest contour's bounding box becomes the body rectangle — exact package dimensions where the land pattern extends past the package (the QFN's pads peek out on all four sides). Orientation cuts in the fab drawing, like QFN pin-1 chamfered corners, are squared off rather than rendered verbatim; the pin-1 dot marks orientation. Value-text strokes and pin marks lose the area contest; footprint-name dims and pad heuristics remain the fallbacks when no Fab layer is present.
  - A package grammar now covers the common archetypes, each drawn as a procedural top-view glyph: two-terminal chips (resistor/capacitor/inductor with winding stripes/diode/LED/ferrite), axial through-hole parts, radial electrolytic cans (dark circle, centered polarity stripe), through-hole LED domes (tinted, die dot), SOT small transistors, SOIC/TSSOP gull-wing ICs, DIPs (notch), QFN/DFN and BGA, QFP, pin headers, terminal blocks (gold screw dots), shrouded connectors (USB/barrel/JST — body extended past the pad row, shield pads as tabs), crystals, metal-can modules (oscillators/RF shields — metal lid, inset detail, no legs), TO/SOT-223 power packages (tab), trimmer potentiometers (light-blue body `bodyTrimmer`, silver screw in the bottom-right corner), slide switches (rounded internal track the actuator rides in), rotary encoders (shaft filling most of the body), pushbuttons, generic fallback. New names classify to the new families (CP_Radial→radial, USB|BarrelJack|JST→connector, Oscillator|TCXO|RF_Module→can, Potentiometer→trimmer, RotaryEncoder→rotary, SW_DIP|SW_Slide→slide, LED_D→dome) and the nameless topology fallback infers them from reference prefixes (C on two TH pads → radial, LED → dome, RV → trimmer, SW on three pads → slide; the exposed-pad exclusion now skips zero-span collinear rows).
  - Semantic appearance from the reference prefix plus the netlist value: through-hole resistors get the classic tan body (`bodyResistor` theme color) with real color bands parsed from their value ("10k" → brown black orange + gold) — SMD chips carry none, like real parts — MLCCs render beige, inductors/ferrites charcoal, diodes carry a cathode stripe at the pin-2 end, LEDs render as a tinted translucent package with a die square — all overridable through new theme keys (`bodyMlcc`, `bodyResistor`, `bodyInductor`, `stripe`, `ledTint`, `crystal`). `Resistor_THT`/axial footprint names classify as axial parts, and the SOT-223/DPAK tab starts at the body edge and reaches ~2/3 over its pad instead of covering it.
  - Component bodies size from the package when a netlist is passed (`--netlist build/board.net`, the same flag the viewer uses): footprint names like `R_0603_1608Metric` and `QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm` carry the real body dimensions (1.6×0.8mm, 4×4mm), which override the pad-geometry heuristics. Through-hole parts render as DIPs, headers, terminal blocks or axial parts instead of being skipped; only mounting holes, test points and unclassifiable through-hole patterns draw nothing. Pad geometry from KiCad's RoundRect aperture macros reads its real extent instead of a 0.3mm fallback.
  - Synthetic refdes labels use the theme's `labelFont` (`'OCR A Std', 'Courier New', monospace` by default) to match typeCAD boards; the board's own silkscreen text (including fonts like `OCR A Std`, vectorized by KiCad's plotter) renders faithfully from the gerber outlines.
  - Themes are a small PcbDraw-style JSON palette with builtins `green-enig` (default), `purple-enig`, `black-hasl` and `blue-enig`; `--theme <name|file.json>` accepts any subset override. `--side front|back` flips the render (back views mirror x, labels stay readable), and refdes labels are auto: suppressed when the silkscreen layer already carries them so they don't double the silk text (`--labels`/`--no-labels` force either way).
  - The viewer's PNG export rasterizes at ~1600px on the long edge instead of 2x viewBox units: the export clone carries explicit pixel dimensions, so the vector decodes at full target resolution — previously a ~113mm board exported as a ~230px thumbnail, and the canvas upscaled the blur.

  - Rendering internals are now shared: `renderLayerInk`/`renderDrillInk` (exported) factor the per-layer SVG emission out of `renderSvg` unchanged, and aperture-macro comment lines (primitive code 0) are skipped silently per the Gerber spec instead of warning — KiCad's `RoundRect` macro pads no longer produce spurious warnings.

  - The interactive board viewer gains a view switcher: a combo box under the project title toggles between the classic Gerber view (layer stack, visibility/opacity controls) and the new PCBA view. Both render into one SVG sharing a single coordinate frame, so pan/zoom, the measurement ruler, DRC markers, component search and the vscode cross-probing (double-click→source, source→component highlight) work in either view; the PCBA view hides the layer controls, and the selected view persists per board.

  - Render-cycle cost: zone fills were the hidden giant (~20s of every kicad-cli gerber export). The build no longer fills at all — see the zone-fills-on-demand changeset — so `npm run build` is refill-free, and the vscode panel gates on board mtime stability (never rendering kicad-cli's truncate-then-write intermediate states), cutting one full export chain per build.

  - The vscode panel's refresh is now gated, fixing the flaky "only refreshes once" behavior: the board's mtime is compared against the last render — spurious FileSystemWatcher events (Windows fires onChange loosely; anything that touches the workspace) no longer trigger a pointless export when the board didn't change — and a skipped or failed refresh self-retries, because the build's final board write can coalesce into the in-flight generate call and never fire the watcher again. A board written moments ago is given 3s to settle before its export runs, so an export never races the writer.

- `gerber-viewer serve` is removed, along with the `gerber_viewer` npm script it was wired into by `typecad-pcb create` — the VS Code extension's Board viewer now covers that loop (re-export + rerender on every `npm run build`) with cross-probing on top. The one-shot CLI (`gerber-viewer <dir> -o board.html [--netlist] [--drc] [--render pcba]`) is unchanged; the programmatic gerber-viewer exports lose `startGerberViewerServer`, `findBoardFile` (the gerber-viewer one) and `RELOAD_CLIENT`. Existing projects can delete the `gerber_viewer` script from `hw/package.json` — nothing else references it.
- Port the typeCAD HAL CLI ergonomics to `typecad-pcb` (same invocation shapes as `typecad-hal`):

  - **Watch mode** — `typecad-pcb build --watch` (or `-w`): tracks the entry file plus its local import graph (parsed with acorn, `.js` → `.ts` resolution included) and rebuilds on change, debounced. A failed rebuild prints the error and keeps watching; editors that save atomically are handled by re-arming watchers after every event.
  - **Output directory** — `--outDir=<dir>` (also `--out-dir`), accepted on every command: redirects both the library's writes (netlist, board, BOM, contract, SPICE, package `build/lib` sync) and the CLI's artifact discovery (query, drc, erc, export, edit, check, diagnostics, doctor) via the `TYPECAD_BUILD_DIR` override. Default remains `./build/`.
  - **`typecad-pcb clean`** — removes the generated build directory; refuses directories without KiCAD build artifacts unless `--force` is given, and always refuses the working directory itself. `--json` and `--outDir` supported.
  - **Bare-file invocation** — `typecad-pcb main.ts --watch` now behaves like `typecad-pcb build main.ts --watch`.
  - **`build --diagnostics` is now best-effort** like HAL's: a report-generation failure logs a warning instead of failing the build.

  Also included from the earlier diagnostics work: the `typecad-pcb diagnostics` command and `build --diagnostics` flag (markdown + JSON report with BOM, nets, pin map, mermaid graphs, ERC-lite electrical checks, kicad-cli ERC/DRC, and routing status), plus three `board_model` parsing fixes for fresh typeCAD output (fp_text references, numeric pad names) and kicad-cli-resaved boards without a global net table.

- `typecad-pcb create` now bundles the typeCAD/pcb VS Code extension into every new project (`hw/.vscode/extensions/typecad-pcb/`), zero-install like the HAL addon:

  - **Pin hovers** — hover a component variable in `src/` to see its reference, footprint, placement, and a pad-by-pad table with connected/unconnected status (net-less `np_thru_hole` pads read as mechanical). A declared component missing from the compiled board explains itself instead of hovering silent.
  - **Cross-probe board viewer** — _typeCAD/pcb: View Board_ renders the compiled board (gerbers + netlist, zones refilled) in a webview beside the editor; the hover's _view on board_ link zooms to the component (and _View Component on Board_ from the palette prompts for a designator, seeded with the word under the cursor), and double-clicking any pad or outline in the viewer jumps back to the declaring source line — traces too: `pcb.net`/`pcb.route` callsites are now stamped into the netlist (Code/Route properties) and surface through `query nets`, so a trace hover reads "net2 { source board.ts:83 }" and double-clicking a trace reveals that line (single clicks — measurement ruler points included — always stay inside the viewer). Viewport, layer settings, and highlight survive board-change reloads, and an open Board panel is restored across VS Code window reloads too — instantly from the last generated view when the board hasn't changed, or with a brief placeholder while the export reruns. While a rebuild's new render is being generated, the viewer's lower-left status text announces it — and locks the readout so the mouse-coordinate display cannot overwrite the notice — unlocking when the new view lands. The hover readout names the source variable beside the designator ("R1 { source r1 }"), and the PNG export rasterizes at ~1600 px.
  - **Editor integration** — `.vscode/extensions.json` force-installs the extension workspace-scoped; `.vscode/settings.json` hides its manifest from the NPM Scripts pane and the Explorer (ported from the HAL addon's npm-hiding settings).

  Also in this change:

  - The footprint `Code` property now always embeds the declaring `file:line` (previously only anonymous components carried it), normalized to a POSIX project-relative path so committed boards stay machine-independent. This is what the reverse cross-probe and the hover's source row read.
  - `gerber-viewer` one-shot mode gained `--netlist`/`--drc` flags, a `#typecad-probe` SVG group and a `window.typecadViewer` embedding API, board-coordinate (y-down) mouse readout, and viewport persistence across reloads.
  - `typecad-pcb export gerbers` (and `jlcpcb-export`) pass `--check-zones` on KiCad ≥ 9 — builds write zone declarations without fill geometry, so the export computes the pour copper at plot time.
  - Board lookup (`query`, `export`, `drc`, `check`) picks the newest `.kicad_pcb` in `build/` instead of refusing when stray boards share the directory.
  - A new workspace package `packages/vscode-typecad-pcb` develops the extension; `npm run bundle` ships the compiled copy into `assets/editor-extensions/` (now included in the npm `files`).

- Zone fills are no longer typeCAD's job at build time — each operation that needs fill geometry now computes it itself, so `npm run build` writes zone declarations only and skips the ~20s kicad-cli refill round-trip entirely (the rd_skeleton demo board builds in ~3.5s where it took ~30s).

  - `pcb.create()` no longer calls `materializeZoneFills` after writing the board. The board file carries zone declarations without `(filled_polygon)` geometry — valid as far as KiCad is concerned; KiCad fills zones on demand.
  - `typecad-pcb export gerbers` always passes `--check-zones` (KiCad ≥ 9), so plotted gerbers include the pour copper even though the `.kicad_pcb` never materialized it.
  - `typecad-pcb check` refills as part of its DRC pass, as before.
  - `materializeZoneFills(pcb, state)` remains exported for callers that want to force a fill-and-save on the board file itself (e.g. before handing it to a tool that can't refill).
  - The zone-fill sidecar files (`.zonefill`) are gone — with the build no longer filling, there was nothing left to record. The board viewer detects completed builds by file mtime stability instead.

### Patch Changes

- Consolidated KiCad symbol parsing into a single shared core (`src/symbol_core.ts`). The CLI add flows, the schematic renderer (`SymbolLibraryManager`), and symbol embedding (`loadSymbolLib`) now share one extends resolver and one pin walker instead of four parallel `.kicad_sym` readers. `kicad_sym_utils` is now a stateless facade (`readSymbol` / `readSymbolFile`), which removes the hidden call-order coupling between `kicad_symbol()` and `kicad_pins()`.

  Behavior improvements that come with the unified semantics:
  - Pin extraction is now fully recursive: pins hanging directly on the symbol node and deeply nested unit symbols are found (previously only one level of unit nesting was scanned).
  - `extends` parents written as `Lib:Name` now resolve across libraries (previously mangled and silently unresolved), with circular-chain detection.
  - Local `.kicad_sym` files with multiple symbols now yield the pins of the chosen symbol only — previously every symbol's pins in the file were merged into the component.
  - `typecad-pcb add package` local non-interactive mode no longer reads pins from stale internal state; the symbol is resolved properly (with a warning when it can't be found).
  - Symbols whose `Footprint` property has an empty value are now usable in the add flows (previously treated as invalid).

  No public API was removed; the changes are internal to the CLI flows and renderer.

- - `create` no longer offers a PlatformIO firmware project; the optional `./fw` is now a typeCAD HAL project (`--hal=<true|false>`, interactive question after the project name). When chosen, it runs `npx @typecad/hal create <name> --outDir fw` in the project root so HAL's own wizard picks the board, and `fw/` joins the generated `.code-workspace` whenever it exists. `--pio`/`--board` are gone from the CLI, help, and skill docs.
  - Fixed the interactive `create` flow silently skipping the firmware and git questions: the command shim assigned `undefined` to absent `--hal`/`--git` flags, which the prompt flow read as explicitly answered. All three questions (name, HAL firmware, git) now always appear when the flags aren't passed.
- - Dead code cleanup (~750 lines): removed the unused routing worker modules (`worker_pool`, `segment_worker`, `simple_routing_grid`), `pcb_board_context`, `pcb_kicad_window`, the unused `kicad-symbols` barrels and `GlobalErrorHandler`, two unused test helpers, and two orphaned ambient type declarations (`@typecad/pcb-astar`, `which`). No public API was removed.
  - `pcbRegisterRouter` is now exported from the package root. The custom-router registration point was implemented, tested, and referenced by the `layout` skill docs, but was unreachable because it was never re-exported from `index.ts`.
  - Tightened module boundaries: ~60 symbols that were only used inside their own module are no longer exported, including a dead type re-export block in `pcb.ts` and a redundant `LibraryInfo`/`SymbolInfo`/`KiCadCacheMetadata` re-export in `kicad-symbols/types`.
  - Removed unused devDependencies: `tsx`, `typedoc`, `typedoc-plugin-markdown`.
- Relative-placement fixes from a full end-to-end API exercise: footprint-string
  targets now resolve, and outline-less board reads explain themselves in the
  console instead of silently returning zeros.

  - `below()/above()/rightOf()/leftOf()` — `.by(gap, "Lib:Footprint")` now
    measures the gap against the named footprint's bounds at rotation 0.
    Previously the string was silently ignored and the new component's own
    footprint was used, contradicting the documented signature (verified
    end-to-end: `.by(2, 'Capacitor_SMD:C_0805_1608Metric' ...)` on a resistor
    now lands at the capacitor-derived coordinate).
  - Plain-number board geometry reads (`pcb.board.center.x`, `left/right/top/
bottom`, `width/height`, corners) before `pcb.outline()` now log a console
    warning — they snapshot zeros and never re-resolve, unlike `from*()` /
    `centered()` placement values which safely follow the final outline at
    `create()`. Several reads on one `pcb.board` object dedupe to a single
    warning. Unknown footprint strings passed to `.by()` already warned via
    `getFootprintBounds`; that is unchanged.
  - JSDoc corrected: `.by(gap, target)` never returned "a plain number
    immediately" — it always returns a deferred placement value; the docs now
    describe actual Component/string target semantics.
  - Docs (`board_layout` page, llms mirror, llms-full bundle): removed the
    stale `import { board } from '@typecad/pcb'` — placement lives on
    `pcb.board`, which is the only supported entry point.

- `typecad-pcb create` now scaffolds the project `tsconfig.json` with `module: "ESNext"` / `moduleResolution: "Bundler"` instead of `NodeNext`. The extensionless relative import that `add component` prints for its generated class (`import { LD3985G25R_TSOT23 } from './LD3985G25R_TSOT23';`) is now valid as-is in editors and in `typecad validate` — under NodeNext it was flagged with "Relative import paths need explicit file extensions", forcing a manual `.js` suffix even though the build (tsx) never needed one. Bundler resolution matches the actual runtime: projects are always executed through tsx's esbuild resolver and tsc only ever type-checks (`noEmit`), so nothing is ever loaded as raw Node ESM.
- Fixed `pcb.stitch()` placing body keep-out boxes at the footprint bounds center instead of the footprint origin.

  - Many footprints' origin is pin 1 or a corner (DIPs, pin headers, most THT connectors), not the body center. The stitch grid treated the origin-relative bounds box as centered on the component position, so it shadowed open board up-and-left of the part — refusing vias that would fit, e.g. the row above and the column left of a `DIP-8_W7.62mm` — while leaving the real body open down-and-right, where stitch vias could punch straight through the part.
  - Blockers are now built from the box's rotated corners anchored at the component position (mirrored about the X axis for back-side parts), matching the placement code's `rotatedBox` semantics.

- Reference-designator prefixes are now read from the symbol's `(property "Reference" ...)` — the same property KiCad editors use — instead of being guessed from the first letter of the footprint name. An ATtiny3227 in a QFN footprint now correctly becomes `U1` instead of `Q1`, with no code changes needed in existing projects.

  Precedence, highest first:
  1. an explicit `reference` (`new ATtiny3227_M('U1')` or `init.reference`)
  2. an explicit `prefix` (`u1.prefix = 'U'` or `init.prefix`)
  3. the symbol's Reference property, resolved through the global KiCad libraries or `<buildDir>/lib` (extends chains inherit the base symbol's prefix; results are cached per symbol)
  4. the previous footprint-name heuristic, now only a fallback for components without a resolvable symbol

  `typecad-pcb add component` / `add package` also pass the resolved symbol and prefix into the generated class through the `Component` init object (`super({ footprint, symbol, prefix })`), so correct designators survive even when the symbol library isn't installed at build time (e.g. CI).

  Also fixes the designator being resolved too early: pin declarations as class fields (`PA0 = this.pin(1)`) used to read the reference before the constructor body could set the symbol, which forced the footprint-name fallback and produced wrong prefixes (Q1 for a QFN-packed MCU). `Pin.reference` and `Pin.uuid` are now resolved lazily through the owning component, so inference always happens after construction completes.

  `resolveExtends` now returns a genuinely flattened symbol: graphics and pins from the extends-chain base, properties overridden by each derived level, and the node named after the requested `library:symbol` (with unit sub-symbols renamed to match). Previously the embedded `lib_symbols` entry carried the BASE symbol's name (an ATtiny3227 embedded as `ATtiny807-M`), so the placed symbol's `lib_id` had no matching definition and KiCad silently dropped the component from netlist export and ERC.

## 1.0.0-alpha.4

### Major Changes

- **`@typecad/typecad` is renamed to `@typecad/pcb`, and `@typecad/passives` is merged into it.** One package, one version line: the passives/typecad peer-pairing (and the ERESOLVE failures from mixing their stable and alpha lines) is structurally gone. Fresh projects install `tsx` + `@typecad/pcb` — nothing else.

  Migration:

  - `import ... from '@typecad/typecad'` → `from '@typecad/pcb'` (deep imports `/routing`, `/search`, `/diff`, `/docgen`, `/sexpr`, `/gerber-viewer` keep their paths under the new name)
  - `npm install @typecad/pcb` replaces both `@typecad/typecad` and `@typecad/passives`

  Passives are now built-in with a single-API redesign — sizes are constructor options, not import paths:

  ```ts
  import { PCB, Resistor, LED } from '@typecad/pcb';

  let r1 = new Resistor({ value: '10k' }); // 0603 (default)
  let r2 = new Resistor({ value: '10k', size: '0805' }); // explicit size
  ```

  - One import for everything; `size` is a typed union (`'0201' | '0402' | '0603' | '0805' | '1206' | '1210'`, Fuse excludes the two smallest) and an explicit `footprint` still always wins
  - `Testpoint` → `TestPoint`, `Tie` → `NetTie` (now on standard `ComponentInit` — `pcb`/`sch` placement instead of `xy`)
  - `Connector` gains a `series` preset (`'pin-header'` default, `'JST-SH'`) that templates symbol and footprint from `number`, so the pin count lives in one place only
  - `Package` provides `this.passives` (0603) out of the box — the `{ passives: await import("@typecad/passives/0603") }` wiring is gone; shift a whole package with `{ passiveSize: '0805' }`, or override with `passiveFactory(size)`
  - `typecad-pcb doctor` now flags legacy `@typecad/typecad`/`@typecad/passives` dependencies and points them at `@typecad/pcb`

### Minor Changes

- `route()` now errors loudly when it is called before the net's components are placed: routing captures the pads' current positions and never re-anchors when a late placement resolves at `create()`, so a `route()` above the placement code silently draws the trace at the default (0, 0) position — and the stray segments pollute the board bounds that zones and `typecad.board` placements derive from. The error names the unplaced components and states the required order: `outline() → place components (.pcb = {...}) → route() → zone()/stitch() → create()`.

## 1.0.0-alpha.3

### Patch Changes

- 9d90f35: `typecad create` now installs the alpha dependency line its scaffold requires: `@typecad/typecad@~1.0.0-alpha.2` and `@typecad/passives@~0.2.3-alpha.0`, instead of both packages' `latest` tags. The scaffolded `gerber_viewer` npm script references the `gerber-viewer` bin, which only exists in the typeCAD 1.0 line — and passives `latest` (0.2.2) declares a typecad peer of `^0.3.0`, so mixing the lines fails with an ERESOLVE error on fresh installs. Ranges use `~` rather than `^` because the Windows npm spawn goes through cmd.exe, which treats `^` as an escape character.
- doctor: new "CLI line" check — compares the RUNNING CLI's major line against the project's declared `@typecad/typecad` spec. The registry's `latest` tag is the 0.x line while alpha-line projects depend on 1.0.0-alpha.x, and the two lines register different commands (check/query/edit exist only on 1.x) — so a stale global `typecad` (installed bare from `latest`) silently hides subcommands even though the project's own node_modules copy has them. The mismatch now fails doctor with the explanation and a caret-free fix (`npm install -g @typecad/typecad@~<declared version>`, safe to paste into cmd.exe); `--fix` deliberately does not touch global installs. `npx typecad <command>` always runs the project's copy.
- doc: fix `md.utils.assign is not a function`. markdown-it-multimd-table-ext (4.2.35, the newest release) initializes against the `md.utils.assign` polyfill that markdown-it 14 removed — and we pin markdown-it ^15 — so every `typecad doc` run died at plugin load. A per-instance shim now restores the removed helper (cloned `md.utils`, no global mutation) before the plugin loads; a canary test documents that the shim can be deleted once the plugin ships a markdown-it 14+ compatible release. Verified end-to-end: `typecad doc` on a table-bearing document renders `<table>` output again.
- doctor + create: respect the two dependency lines. The registry carries a stable line (typecad 0.x `latest` + passives 0.2.2, peers ^0.3.0) and an alpha line (typecad 1.0.0-alpha.x + passives 0.2.3-alpha) that must never be mixed — a mixed package.json ERESOLVEs on `npm install`, which aborts wholesale and leaves node_modules hollow (the "Core dependencies: missing @typecad/typecad, @typecad/passives, tsx" doctor report). `typecad doctor` now computes its fix from the project's package.json: an alpha-line project gets the alpha pair installed (never bare names, which would either silently flip the project to the 0.x line — no gerber-viewer bin — or ERESOLVE), `doctor --fix` actually performs the install, and the mixed-lines state is called out in the failure output as the reason plain `npm install` fails. The dependency list is shared with `typecad create` (core-deps.ts, one source), and create's install failure now surfaces npm's actual stderr instead of "Is npm installed and on your PATH?".
- 422b2c9: Fixed ballooned TrueType text on the gerber viewer's dark canvas. The dark-theme recoloring for silkscreen/paste/drill matched every element carrying a `stroke` attribute — including region paths that carry `stroke="none"` (TrueType text glyphs, pour outlines) — which painted a ~1mm outline around each glyph. The stroke override now excludes `stroke="none"`, so filled polygon text like a board's title renders crisp while stroke-font designators keep their recolored strokes.
- 1307bb2: The gerber viewer gained a measurement tool. A ruler button in the toolbar arms it: click a start point, move the mouse to see the live distance (total plus dx/dy in board units), click again to stick the ruler; measurements accumulate so several can be compared, and `Escape` cancels the in-progress one, clears all rulers and disarms the tool. Rulers live in the pan/zoom layer, keep a constant on-screen size while zooming, and their colors follow the dark/light theme. Clicks are distinguished from pan-drags by a movement threshold, so panning still works with the tool armed.
- 53b6c2e: The gerber viewer now remembers layer settings across rebuilds. Visibility toggles and opacity sliders are stored in the browser's localStorage (keyed per board title) and re-applied when the serve-mode page reloads after a build, so a hand-tuned layer view survives the live-reload instead of snapping back to defaults. New layers added by a rebuild fall back to their defaults; All/None buttons persist too.
- 6930ebf: `gerber-viewer serve` no longer exits when its port is taken — it walks up to the next free port (up to 50 attempts from the requested one) and logs where it landed, so a dev website or a second viewer instance no longer blocks startup. The startup log and `--open` use the actual bound port. Its default port also changed from 4173 to **4273**: 4173 is `vite preview`'s default and collided with the typeCAD website dev server.
- f07505d: The gerber viewer's ruler tool gained angle snapping: holding `Shift` while measuring constrains the endpoint to 45-degree increments (0/45/90/...) from the start point, at the same radial distance. The snap applies to the live ruler while moving and to the ruler that sticks on the second click; releasing Shift restores free placement.
- 7f0ab3b: The gerber viewer gained a dark/light theme toggle in the sidebar header, and the theme now covers the board canvas too. The choice is saved in localStorage (per browser, shared across boards) and re-applied on every page load, including the serve-mode live-reload after builds; on first visit the theme follows the OS `prefers-color-scheme`. On the dark canvas, near-black layer colors (silkscreen, paste, drill) are automatically recolored — with matching sidebar chips — so they stay visible, and clear-polarity cutouts follow the canvas color instead of showing as light boxes.

## 1.0.0-alpha.2

### Major Changes

- a8c8751: Placement moved onto `pcb.board`; free functions removed.

  - `pcb.board` is the complete placement namespace: live outline bounds (`center`, edges, corners, `fromLeft()`/`fromRight()`/`fromTop()`/`fromBottom()`) plus the component-relative verbs `below(c)`, `above(c)`, `rightOf(c)`, `leftOf(c)`, `sameAs(c)`. Readable before or after `pcb.outline()`; values follow the final outline.
  - **Breaking**: the free functions (`below`, `above`, `rightOf`, `leftOf`, `sameAs`, `board`, `PlacementValue`, `isPlacementValue`) are no longer exported from the package root, and the verbs are not PCB-class methods. Replace `board(pcb).fromLeft(5)` with `pcb.board.fromLeft(5)`, `below(r1).by(3)` with `pcb.board.below(r1).by(3)`, `sameAs(r1).x` with `pcb.board.sameAs(r1)` (assignable directly). Placement _types_ (`PlacementBuilder`, `BoardBounds`, `SameAsResult`, `PlacementNumber`, `PlacementInput`) remain exported.

### Minor Changes

- 8c41df1: Deterministic builds and the agent loop. Build output is now byte-identical across runs: every UUID in the schematic and board is derived (UUIDv5) from design content — component references, net names, geometry — instead of `randomUUID()`, and auto-placed components land on stable grid cells via a seeded hash. This makes git diffs of `build/` meaningful and enables golden tests.

  Three new CLI commands form a verify-then-edit loop for agents:

  - `typecad check` — build + unconnected-pad analysis + ERC + DRC in one pass, one JSON report (`--skip-erc` / `--skip-drc` to scope). Exits non-zero on failure; in `--json` mode build output is captured so stdout stays parseable.
  - `typecad query <subject>` — inspect the compiled board as data: `summary`, `nets`, `net <name>`, `components`, `component <ref>`, `unconnected`, `power`. Component entries carry their source variable name (from the Code property); `unconnected` lists floating pads (mounting holes excluded) and single-pin nets.
  - `typecad edit <op>` — checked semantic source edits validated against the built board before anything is written: `connect R1.1 U1.3`, `connect GND C1.2 C2.2`, `move U1 --right-of=C3 --gap=2.54`, `route U1.3 R1.1 --width 0.25`, with `--dry-run`, did-you-mean suggestions, and generated code that references your variable names. Route calls are inserted before the first `create()`.

  Routing order is now a guarded contract: `route()` (and batch autorouting) after `create()` throws a `TypeCadError` with reordering guidance instead of silently returning a failed result — the board is already written at that point, so routes staged afterwards could never reach it. `typecad query routes` reports per-net copper connectivity (pads, vias, segments, pours — including pour-assisted planes and unrouted pin groups), and `typecad query zones` lists pours and keepouts.

  Skills upgrades: `typecad skills search <query>` fuzzy-finds skills; `typecad skills export --out <dir>` emits every skill as a SKILL.md for `.claude/skills`-style tooling; `typecad create` scaffolds AGENTS.md from the live skill registry (can no longer drift) and gains `--yes` for fully non-interactive project creation with defaults.

  **Zone fills are now materialized.** `pcb.zone({ fill: true })` (the default) declares a pour, and at `create()` the written board is round-tripped through `kicad-cli pcb drc --refill-zones --save-board` so the fill geometry exists in the file — fabrication exports include pour copper and DRC judges real connectivity (a stitching-via board previously reported dozens of phantom "unconnected" items; with fills materialized it reports zero). Opt out per zone with `fill: false` or globally with `new PCB(name, { fill_zones: false })`; without kicad-cli the fill is skipped with a warning. Because KiCad's resave used to invent random UUIDs for pads, base properties, and footprint graphics, typeCAD now emits deterministic UUIDs for all of them — build + refill is byte-identical across runs. `typecad check` runs its DRC with `--refill-zones --save-board` as well, and `typecad query zones` distinguishes declared pours from materialized ones (resaved `(net "NAME")` zone and pad forms are parsed).

- ada1e65: N-layer boards: the copper layer set is now a first-class, always-resolved property of the PCB.

  - `new PCB(name, { layers: N })` sets the copper-layer count at construction (2–32); `pcb.copperLayers` exposes the resolved layer names and `pcb.layerCount` the count. `pcb.stackup()` still configures stackup materials and overrides the count.
  - Routing defaults now derive from the board's layer set: `pcb.route()` uses every declared copper layer when no `layers` are passed, through-hole pads are expanded to the board's layers for obstacle avoidance, and through vias block every copper layer they span.
  - Layer references are validated when the board is written — a zone, keepout, via, or route referencing an undeclared layer (e.g. `"In1.Cu"` on a 2-layer board, or a typo like `"f.cu"`) fails with an actionable error instead of producing a `.kicad_pcb` KiCad cannot load. `pcb.route()` rejects undeclared routing layers up front.
  - `track.via()` without an explicit span now always defaults to a through via (F.Cu→B.Cu) instead of guessing a blind span from the current layer.
  - `copperLayerNames`, `validateLayerCount`, `MAX_COPPER_LAYERS`, and `MIN_COPPER_LAYERS` are exported from the package root.

- ada1e65: Honest API surface, real impedance tolerance, and complete zone round-tripping in `typecad import`.

  - Differential pair routing is non-functional, so its phantom surface is gone: user net classes no longer get hard-coded `diff_pair_gap`/`diff_pair_via_gap`/`diff_pair_width` written into the `.kicad_pro` (KiCad's DRC had been enforcing geometry nobody chose — KiCad now fills its own defaults), and the dormant differential-pairs demo test is unwired while its code is kept for when coupled routing lands.
  - `impedance.tolerance` is now a real, optional option. With a tolerance, the solved trace width snaps to a 0.01mm fabrication grid whose achieved impedance stays within `target ± tolerance` (`widthForImpedanceWithinTolerance`, also exposed as `pcb.impedanceWidth(layer, target, tolerance)`); when the design-rule floor or an explicit width forces the trace outside the band, routing warns with the achieved impedance. `tolerance` was previously accepted and never used.
  - `typecad import` now round-trips zones and rule areas instead of silently dropping them: filled pours emit `pcb.zone({...})` with polygon `points`, the grouped `fill` object, thermal/pad-connection and island settings; rule areas emit `pcb.keepout({...})` with their per-category restrictions and `placement`. Unconnected pours (KiCad net 0) import without a net — `pcb.zone()` accordingly accepts an unconnected pour (neither `pin` nor `net`), while providing both is still an error.
  - Import review fixes: legitimate zero values survive parsing (`island_removal_mode 0` — "never remove islands" — was dropped by a truthiness check); `locked` zones detect KiCad's bare-atom form; `locked`, `filledAreasThickness`, and hatch outline settings are now emitted; and rule-area codegen emits only options `pcb.keepout()` actually accepts (KiCad-authored rule areas carry `min_thickness`/`fill` blocks that previously produced non-compiling code).
  - Removed the keepout `smoothing`/`smoothingRadius` options: they were serialized as zone-level `(smoothing ...)`, a token KiCad's parser rejects (verified against KiCad 10) — setting them produced unloadable boards.

- ada1e65: Late `component.pcb = { x, y }` assignment now accepts deferred placement values.

  - The `pcb` field is a resolving accessor: assignment takes `PlacementNumber` (e.g. `board(pcb).fromLeft(5)`), resolves against the component's footprint immediately, and validates finiteness — reads always return plain numbers, so every downstream consumer (serializer, autorouter, placement) stays type-clean. Previously only the constructor accepted placement values; assigning after construction was both a type error and silently stored the unresolved value.

- ada1e65: Relative placement is order-independent — no more call-order fore-knowledge.

  - `below()`, `above()`, `rightOf()`, `leftOf()` no longer bake the source component's position into a number at `.by()` time: every placement value re-reads the source's live position and bounds when resolved. Position a component relative to another _before_ either has its final position, and the relationship holds.
  - `board(pcb)` no longer snapshots the outline at call time — all properties (`center`, `left`, `fromTop()`, ...) are re-read on every access. `board()` can be called before `pcb.outline()`; values follow the final outline.
  - `sameAs(c).x/.y` return placement values (still assignable wherever a number was) that re-read the component's position at resolve time.
  - Components re-resolve their deferred placement expressions at `create()` (fixpoint over chains: `r3` below `r2` below `r1` settles regardless of assignment order). Manually moving a component after assigning an expression freezes that axis — the manual value wins.
  - `.by(gap, target)` now returns a deferred `PlacementValue` instead of an immediately-resolved number (assignable anywhere a `PlacementNumber` is expected; `resolvePlacement(value, footprint)` is exported for manual resolution).
  - `pcb` coordinates now accept the placement helpers directly: `j1.pcb = { x: sameAs(mh1), y: below(mh1) }` works without `.x` / `.by()` — a builder resolves with its default gap, and a `sameAs` result picks the axis being assigned. `PlacementInput` is the accepted union.
  - Edge-to-edge math is now origin-relative and rotation-faithful: footprint bounds carry the occupied box relative to the footprint origin (`minX/minY/maxX/maxY` — many origins are pin 1 or a corner, not the body center), and placement rotates the full box with the same transform KiCad uses for pads before computing edges. `below(mh1).by(0.1)` now yields exactly a 0.1mm physical gap for a rotated, off-center part like a terminal block — previously the gap was silently off by several mm. Create()-time re-resolution passes the component's rotation (fixed a bug where it re-resolved unrotated).

- ada1e65: Font selection for board text.

  - Component text layouts (`referenceLayout`, `valueLayout`, `fabLayout`, and `text` entries) accept `font` — a TrueType face name written as KiCad's `(face "Name")` inside the text effects. Omit it for KiCad's default stroke font. Example: `r1.referenceLayout = { x: 0, y: -1.5, font: 'Arial', bold: true }`.
  - Fixed `bold` and `italic` on component text being dead options: they are now emitted as the font-block symbols (previously accepted and silently dropped).
  - `pcb.text({ font })` already emitted `(face ...)` and is unchanged; both paths verified against the KiCad 10 parser.

- ada1e65: N-layer boards, phase 2: layer roles, net-class layer affinity, and a via manufacturing policy.

  - `pcb.plane(net, layer)` dedicates a copper layer to a net. At `create()` the plane is materialized as a board-covering filled zone on that layer (through-hole-only pad connections), and the layer is excluded from the autorouter's default routing layers. The plane extent comes from the board outline, so `pcb.outline()` must be called before `create()`; a layer can carry only one plane.
  - Net classes accept `layers: string[]` — preferred routing layers for the class's nets. The autorouter anchors the net's through-hole endpoints on the class's layer and favors it while routing. Layers must be declared copper layers; plane layers are ignored.
  - `pcb.viaPolicy({ type: 'through' | 'blind-buried', maxSpan? })` controls the spans of vias placed by the autorouter. The default is `through` (every router via spans F.Cu→B.Cu — the budget-fab-friendly choice); `blind-buried` lets the router use the exact layer pair a route transitions between, within `maxSpan` layer boundaries (default 2), falling back to through vias for deeper transitions. Previously inner-layer transitions always emitted blind/buried spans.
  - `IViaPolicy` is exported from the package root.

- ada1e65: Via stitching, teardrops, and arc graphics.

  - `pcb.stitch(net, options?)` ties a net across layers with a clearance-aware grid of vias — the standard way to connect outer-layer pours to inner planes. Candidates on a pitch grid over the board outline (inset by `margin`) or an explicit `area` are skipped when they would violate clearance against existing copper (pads, tracks, vias, zones, keepouts) on any layer the stitch spans; same-net pours and tracks never block (connecting through them is the point), while same-net pads/vias still enforce hole-to-hole spacing. Components block stitches regardless of net — including components that are only net-registered and not yet placed (discovered from the schematic) — so stitches never land on footprints. A partial `layers` span emits blind vias over exactly that span, and a pitch below via size + clearance is rejected. Options: `layers` (span, default all copper), `pitch` (default 1.5mm), `size`/`drill`, `area`, `margin`. Returns the number of vias placed.
  - `pcb.teardrops(options?)` reinforces track-to-via junctions. It writes KiCad's teardrop tool configuration (`teardrop_options`/`teardrop_parameters`, fixture-verified shape) to the `.kicad_pro`, and — for vias placed by the autorouter — generates the teardrop geometry itself as tapered side segments on each layer the via's tracks arrive and leave, part of the routed net. Options: `vias`/`throughHolePads`/`smdPads`/`trackEnds` targets, `shape: 'round' | 'rect'`, `maxLength` (default 1mm), `maxHeight` (default 2mm).
  - `pcb.arc({ start, mid, end, layer, width })` draws arcs on any board layer — KiCad's three-point arc definition — completing the graphics set alongside line/circle/rect/poly.
  - The `Default` net class seed in `.kicad_pro` output no longer carries hard-coded `diff_pair_*` values (matching the earlier fix for user classes).
  - Text blocks stitches: `pcb.text()` elements, component reference/value/fab text (explicit layouts, text entries, and the footprint's default positions — transformed for rotation and back-side placement), and reference designators all keep stitch vias off their bounding boxes on the side of the board they occupy.

- 8efc912: Rectangle-geometry APIs accept a `bounds` object — `pcb.board` passes straight through.

  - `pcb.zone()`, `pcb.keepout()`, `pcb.rect()`, and `pcb.stitch({ area })` accept `bounds`/`area` as a bounds-style rectangle: `{ left, top, width, height }` (e.g. `pcb.board`) or `{ x, y, width, height }`. `pcb.zone({ net: 'GND', bounds: pcb.board, layers: [...] })` replaces the field-by-field `x: board.left, y: board.top, width: board.width, height: board.height` mapping. Bounds shift with group offsets like the other geometry forms, and combining `bounds` with `points` or `x/y/width/height` is rejected. `IBoundsLike` is exported.

- ada1e65: N-layer boards, phase 3: stackup physics — material overrides, controlled-impedance routing, span-weighted via costs.

  - `pcb.stackup(n, { layers: { ... } })` accepts per-layer overrides (thickness, material, epsilon_r, loss_tangent, color) keyed by layer name — coppers (`"In1.Cu"`), dielectrics (`"dielectric 2"`), and masks. Overridden dielectric thickness is compensated by the remaining dielectrics so the board still totals `pcb.thickness`; unknown names and over-budget overrides throw with actionable messages.
  - Controlled impedance is now real: `pcb.impedanceWidth(layer, targetOhms)` computes the trace width for a target characteristic impedance from the board's resolved stackup geometry (microstrip on outer layers, symmetric stripline on inner). `pcb.route({ impedance: { target, tolerance } })` applies it automatically — the trace widens to hit the target, never below the design-rule floor. `impedanceOfWidth`, `widthForImpedance`, and `stackupImpedanceGeometry` are exported for custom calculations. Engineering-grade accuracy (typically within fab tolerance).
  - Under the `blind-buried` via policy the router's via cost now scales with the number of layer boundaries a transition crosses, so it prefers shallow blind/buried vias over deep ones.
  - Fixed a pre-existing docgen bug where stackup extraction (`extractStackup`) could not parse any board file — symbol-headed S-expression nodes were never matched, so the rendered stackup was always empty. Inner copper layers now parse correctly, and the gitdiff inner-layer detection (`detectInnerCopperLayers`) is covered by tests.

- ada1e65: `pcb.stitch()` is now declarative — no `pcb.add()` or ordering knowledge needed.

  - `pcb.stitch(net, options)` records a request (validating net, pitch, and layers at the call) and the vias are placed at `create()` time against the complete board contents. Every component passed to `create()` is visible to the stitcher — netted or not — so mounting holes and other mechanical parts no longer need `pcb.add()` beforehand, matching how `pcb.plane()` already works. Repeated `create()` calls replace previously placed stitch vias instead of duplicating them.
  - **Breaking**: `stitch()` no longer returns the via count (placement is deferred); count vias in the generated board if needed. Region errors (no outline and no `area`) surface at `create()` instead of at the call.

- 92bfaa1: Placement DX: targeted errors, live arithmetic, body-centering, bounds warnings.

  - Bad coordinate assignments now fail with actionable messages instead of cryptic ones — passing an un-called helper (`y: pcb.board.fromLeft` instead of `fromLeft(5)`) reports `pcb.y received the function "fromLeft" — did you mean to call it?`; strings, null, and keyless objects report the axis and what was received.
  - `PlacementValue.plus(n)` / `.minus(n)` return new deferred values — `x: pcb.board.sameAs(r1).x.plus(2)` nudges while staying live (re-resolves at `create()` if r1 moves). `sameAs(c).x/.y` are typed `PlacementValue` so the chain type-checks.
  - `pcb.board.centered()` returns `{ x, y }` placement values that center the component's occupied box (rotation- and origin-aware), unlike `board.center` which centers the origin point: `u1.pcb = { ...pcb.board.centered() }`.
  - A footprint whose bounds cannot be resolved (bad name/library path) warns once per name the first time any placement math uses it, instead of silently collapsing to zero-size.

- 327f04e: Footprint text overrides become fully optional and autocompletable. `TextEntry.property` now suggests the conventional KiCad property names (`Reference`, `Value`, `Footprint`, `Datasheet`, `Description`, `MPN`) while still accepting any custom name. All other entry fields (`text`, `x`, `y`, rotation, layer, font, visibility) are optional: omitted fields keep the footprint's own layout instead of being reset, and `show: false` on `referenceLayout`/`valueLayout` now actually hides the designator (three-state — omitting `show` leaves footprint visibility untouched). Via stitching no longer reserves avoidance boxes for hidden text, and text entries without a position no longer produce degenerate boxes.
- ada1e65: Zone property coverage: polygon geometry and previously dead or missing options.

  - `pcb.zone()` accepts its fill settings grouped in an optional `fill` object (mirroring KiCad's `(fill ...)` block): `mode`, `arcSegments`, `thermalGap`, `thermalBridgeWidth`, `smoothing`/`smoothingRadius`, `islandRemovalMode`/`islandAreaMin`, and the seven `hatch*` options. `fill: false` creates an unfilled zone outline. The existing flat fill options remain supported; when both are given, the `fill` object wins per field. `IZoneFillOptions` is exported from the package root.
  - `pcb.zone()` and `pcb.keepout()` accept an explicit polygon via `points` (≥ 3 vertices) as an alternative to the `x`/`y`/`width`/`height` rectangle — L-shaped and irregular pours/keepouts are now expressible. Providing both forms (or neither) is rejected with an error. The zone's bounding box fields stay consistent, so obstacle building and board math work identically.
  - `filledAreasThickness` is now serialized as `(filled_areas_thickness yes|no)` — it was accepted but silently dropped before.
  - `islandRemovalMode` now actually defaults to 2 (remove islands below `islandAreaMin`), matching the documented behavior; the value is emitted to the board.
  - Fixed hatched zones producing boards KiCad cannot load: the fill mode was serialized as `(mode hatched)`, but KiCad's parser only accepts `hatch` (or `polygon`/`segment`). Hatched zones now emit `(mode hatch)` — verified against the KiCad 10 parser.
  - Keepouts (rule areas) accept `placement` (also applies to footprints placed from a schematic sheet), serialized as `(placement (enabled ...) (sheetname ""))` — verified against the KiCad 10 parser.
  - `hatchWidth` is accepted as an alias of `hatchThickness` (flat and in the `fill` object) — KiCad's zone dialog labels the setting "Hatch width" while the file token is `hatch_thickness`; the file-token name wins when both are given at the same level.

### Patch Changes

- ada1e65: Via stitching keeps clear of mechanical footprints' full keep-clear zones.

  - `pcb.stitch()` body blockers now use the footprint's **full graphical extent** (pads + silkscreen/courtyard geometry, rotation-aware via `getFootprintBounds`) instead of the pad bounding box — a mounting hole's pad is drill-sized while its screw-head keep-clear zone is the footprint outline. Falls back to pad bounds when the footprint file can't resolve.
  - Netless components (`pcb.add()`ed mechanical parts like mounting holes) are now discovered for stitching via `schematic.components` — previously only net-referenced components were found, so parts with no net were invisible to the stitcher.

- Board viewer, built in: a zero-dependency Gerber (RS-274X) + Excellon parser now lives in this package (`@typecad/typecad/gerber-viewer` for programmatic use; `parseGerber`, `parseExcellon`, `detectLayer`, `renderSvg`, `buildViewerFromFiles`, `startGerberViewerServer`). The `gerber-viewer` CLI ships with the package: `gerber-viewer <dir> -o view.html` renders a self-contained interactive viewer, and `gerber-viewer serve` watches a project's `build/*.kicad_pcb`, re-exports gerbers via `typecad export`, and live-reloads the page on every `npm run build`. `typecad create` scaffolds every new project with a `gerber_viewer` npm script wired to it (http://localhost:4173); the generated `.gitignore` excludes `build/serve/` and the generated AGENTS.md documents the script.

## 1.0.0-alpha.1

### Major Changes

- #### No-postinstall package file sync

  Component packages no longer need an npm `postinstall` script to install their KiCad files. When a `Package` subclass is constructed during a build, typeCAD automatically syncs the package's bundled `build/lib/` (symbols, footprints, 3D models) into the project's `./build/lib/` — mtime-guarded so repeat builds skip unchanged files. Works with any package name, registry layout, `file:` dependencies, and monorepo links.

  - `Package` subclasses get the sync automatically in the constructor
  - Hand-rolled classes can call the new exported `syncThisPackageBuildLib()` helper
  - `typecad add package` no longer generates a `postinstall.js`

  #### Irregular board outlines

  New Edge.Cuts shape builders beyond the filleted rectangle:

  - `outlinePolygon(points)` — arbitrary polygon boards
  - `outlineCircle(cx, cy, r)` — circular boards
  - `cutout(points)` / `cutoutCircle(cx, cy, r)` — internal cutouts (milled slots, mounting holes)
  - `outlinePath(x, y)` builder with `.lineTo()`, `.arcTo()`, `.close()` for free-form mixed line/arc contours

  #### Fixes
  - Re-exported `Schematic` (restores the public API expected by `@typecad/passives/tie`)
  - `registerReference` is now idempotent — components constructed by a `Package` keep their references when `create()` registers them again, instead of being renamed
  - Schematic rendering: via components (which have no symbol by design) are skipped instead of erroring; net-label pin owners are backfilled for standalone `new Pin(...)` declarations; power-symbol lookups no longer warn for auto-generated net names
  - Updated dependencies: chalk 6, markdown-it 15 (types now bundled; `@types/markdown-it` removed), vitest 4, ESLint 10, changesets 3
