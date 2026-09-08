---
'@typecad/pcb': patch
---

doc: fix `md.utils.assign is not a function`. markdown-it-multimd-table-ext (4.2.35, the newest release) initializes against the `md.utils.assign` polyfill that markdown-it 14 removed — and we pin markdown-it ^15 — so every `typecad doc` run died at plugin load. A per-instance shim now restores the removed helper (cloned `md.utils`, no global mutation) before the plugin loads; a canary test documents that the shim can be deleted once the plugin ships a markdown-it 14+ compatible release. Verified end-to-end: `typecad doc` on a table-bearing document renders `<table>` output again.
