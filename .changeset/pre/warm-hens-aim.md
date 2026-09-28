---
'@typecad/pcb': patch
---

Selecting traces in the layout view no longer needs pixel-perfect aim.
The clickable corridor of each segment now carries round linecaps — the
visible ink bulges a half-width past each endpoint in round caps, and a
butt-capped corridor left the dangling end tips unclickable. And a press
that lands on nothing interactive now captures the nearest segment within
~9 px: tiny cleanup fragments (a 0.2 mm leftover stub's whole clickable
area was a few pixels) and the air beside a thin trace both select the
trace instead of falling through to deselect. Presses on parts, pads, or
near a dangling end (the route-start arm owns those) are untouched, and a
click in genuinely empty board space still clears the selection.
