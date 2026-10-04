---
'@typecad/pcb': patch
---

Viewer: **Flip Board** — a toolbar toggle that views the board from the
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
