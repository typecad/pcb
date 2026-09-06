---
"@typecad/typecad": patch
---

`gerber-viewer serve` no longer exits when its port is taken — it walks up to the next free port (up to 50 attempts from the requested one) and logs where it landed, so a dev website or a second viewer instance no longer blocks startup. The startup log and `--open` use the actual bound port. Its default port also changed from 4173 to **4273**: 4173 is `vite preview`'s default and collided with the typeCAD website dev server.
