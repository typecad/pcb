---
'@typecad/pcb': minor
---

The autorouter screens every routed pin for escape-channel feasibility
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
