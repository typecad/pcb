---
'@typecad/pcb': patch
---

Fixes the infinite `sync`/viewer storm ("exporting gerbers… / viewer refresh
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
