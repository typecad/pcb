---
'@typecad/pcb': patch
---

Fixes `check` (and `query`/`report`) reporting QFN exposed-pad paste splits
as unconnected pads — the unnamed `*.Paste`-only squares KiCad footprints
place over the thermal pad to split its stencil opening carry `(net 0 "")`
and no pad name by design, but the unconnected-pad analysis counted every
net-less pad, printing `U1. has no net` nine times for a single QFN-32
(reference + empty pad name). Pads with no copper layer (paste/mask-only
apertures) are now excluded from the unconnected-pad list and summary count;
genuinely unconnected copper pads are still reported.
