---
'@typecad/pcb': patch
---

`typecad-pcb create --name=agent-demo` no longer refuses to run: hyphens,
spaces and other punctuation fold to underscores ("agent-demo" becomes
`agent_demo`), with a yellow note when the name changed. The interactive
prompt normalizes the same way, so pasting a name with spaces no longer
bounces. A name is only rejected when nothing identifier-like remains.
