---
'@typecad/pcb': patch
---

The layout view's apply bridge now writes route edits to the file the
build actually runs. It previously planned against the first src file
carrying a `typecad.create(` call — with a stray copy in src/ (an old
duplicate with its own create()), every drawn route landed in the dead
copy: the source looked edited, the board rebuilt without the new traces,
and nothing reported the mismatch (one board lost three drawn routes this
way; the copy also accumulated syntactic damage from rewrites aimed at
its odd formatting). The planner now resolves the entry file from
typecad.conf.ts and orders it first, so rewrites go where the build
reads; the stale-copy capture is gone.
