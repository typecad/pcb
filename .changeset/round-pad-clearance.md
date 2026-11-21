---
"@typecad/pcb": patch
---

Layout routing measures round and obround pads by their true shape instead of their bounding box, so a trace clear of a round pad no longer turns red or gets refused at anchor.
