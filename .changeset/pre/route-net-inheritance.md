---
'@typecad/pcb': patch
---

Layout-view routing fixes for net-less copper, found on the castellated J2 pads (two pads per pin showing a permanent 1-1 ratsnest wire):

- Routes started with X inherit the pad's net even when net-less trace ink (or a selected segment) sits on the pad — previously the press resolved to the net-less copper and every route committed without a net, which the ratsnest can't credit and the DRC reports as a short.
- DRC marker halos no longer intercept presses. The 11-px halo sits exactly on the violating copper, so every flagged pad became unclickable/unroutable — a trap that bred more net-less routes (the small center pip keeps the hover tooltip).
