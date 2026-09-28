---
'@typecad/pcb': patch
---

The board viewer now renders inner copper layers. KiCad plots them as
`.g1`–`.g30`, which the gerber extension allowlist didn't carry, so any
4+-layer board silently lost every layer between front and back copper.
Inner layers now join the stack in the viewer and pick up theme colors
like the outer ones.
