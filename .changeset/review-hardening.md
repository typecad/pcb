---
'@typecad/pcb': patch
---

Hardening fixes from the post-merge review of the sync-sidecar work:

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
