---
'@typecad/pcb': patch
---

Layout apply: a dragged Reference/Value/fab label now sticks for components whose layout lives in a standalone `var.referenceLayout = {…}` (etc.) statement — the shape every KiCad-imported project uses. The apply only knew the Component constructor's inline option, so it appended a constructor `referenceLayout:` that the later statement silently overrode at runtime and the rebuild reverted the drag. The label edit now rewrites the winning statement (keeping its unmanaged style keys) and leaves the constructor alone when a statement exists.
