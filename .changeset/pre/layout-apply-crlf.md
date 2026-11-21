---
"vscode-typecad-pcb": patch
"@typecad/pcb": patch
---

fix: layout view source → board → source round trip.

Layout apply:
- Saves on Windows no longer fail with "Could not save the planned source edits" (CRLF vs LF compare).
- An orphaned `_sync.ts` (one the entry never imports) is reset instead of being edited.
- Applies keep the whole `syncBoard(typecad, { … })` parts map and the `syncTracks`/`syncArt` imports that `create()` still spreads.
- Labels land where they are dropped on rotated parts and on back-side parts (the planner used the wrong rotation direction, wrote angles relative to the part, and ignored the back-side flip).
- Fab labels write `fabLayout`, the field the importer reads.
- A part's first move keeps the rotation and side it got from its constructor `pcb:` option.
- Value edits and renames work on parts without a `reference:` literal (`new Resistor({ value })`).
- A label on a never-moved part converts against its board position instead of being skipped.
- The semantic check reads a back-side part's side correctly and expects the placement that was actually written.
- The sidecar import goes on its own line after a semicolon-less import.

Import / check-sync:
- `_sync.ts` routes compare by copper geometry (split legs, net order, mid-chain vias vs standalone vias), not text.
- A `keepout()` with omitted restrictions uses the build's default (not allowed).
- A size-less `pcb.text()` no longer reads as an edit on every import.
- Label rotations compare modulo 360°.

CLI:
- Entry auto-detection (no `typecad.conf.ts`) ignores `_sync.ts`.
