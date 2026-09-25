---
'@typecad/pcb': patch
---

A UX pass over the vscode addon — every dead end now leads somewhere, and net cross-probing runs in both directions:

- **Net hovers + net selection.** Hover the quoted net name in a `pcb.net(…)` / `pcb.route(…)` call for a net card — declared/routed source lines, a single-pin warning, and a *show on board* link that highlights the net's traces in the Board viewer (`typecad/pcb: View Net on Board` does the same from the palette, seeded from the quoted string under the cursor). Previously only components crossed the editor→board direction, while trace double-clicks already went board→editor.
- **Actionable notifications.** Every "no compiled board yet" message carries a Build Board button; render-failure and diff-failure messages get an Open Output button.
- **State-aware status chip.** Clicking the status bar entry follows the board's state — build when there is no board, a build-or-view prompt when stale, open the viewer when fresh. The tooltip is markdown with clickable Build Board / Run DRC links, and says when DRC has not run for the current revision (counts reset on every rebuild, so a fresh chip no longer reads as a clean one by accident).
- **Silent failures speak up.** A selection the viewer page never acks (5s timeout) and a probe whose component fails to resolve now show a transient status message instead of writing only to the output channel.
