---
'@typecad/pcb': patch
---

The layout view's apply bridge now heals a create() argument drift instead
of letting it silently delete traces. The route rewrite stages maintain
"every declared TrackBuilder is passed to typecad.create()" one edit at a
time; a name that slipped through (seen once: an untouched route's
argument dropped while its declaration survived a multi-route rewrite)
made the route build nothing — its copper vanished from the board and the
viewer with nothing in the log. Any route/delete apply now re-adds every
declared-but-uncreated route name to create() as a final pass.
