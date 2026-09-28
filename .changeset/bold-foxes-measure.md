---
'@typecad/pcb': minor
---

`typecad-pcb search <query> --footprint` searches installed KiCad footprint
libraries instead of symbol libraries — symbols alone can't answer "what
pads does this part have". Results list `library:footprint` ids with their
pad numbers (and the description when the library carries one), ready to
paste into `new Component({ footprint: '...' })`. `--limit` caps the list
(default 10 for footprint searches), and `--json` returns the same results
as data for scripts and agents.
