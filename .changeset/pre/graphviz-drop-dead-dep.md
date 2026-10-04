---
'@typecad/graphviz': patch
---

Drop the unused `string-comparison` dependency — it was imported but never
called, so published installs no longer pull it (and its transitive tree).
