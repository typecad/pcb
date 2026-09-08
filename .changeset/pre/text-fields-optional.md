---
'@typecad/pcb': minor
---

Footprint text overrides become fully optional and autocompletable. `TextEntry.property` now suggests the conventional KiCad property names (`Reference`, `Value`, `Footprint`, `Datasheet`, `Description`, `MPN`) while still accepting any custom name. All other entry fields (`text`, `x`, `y`, rotation, layer, font, visibility) are optional: omitted fields keep the footprint's own layout instead of being reset, and `show: false` on `referenceLayout`/`valueLayout` now actually hides the designator (three-state — omitting `show` leaves footprint visibility untouched). Via stitching no longer reserves avoidance boxes for hidden text, and text entries without a position no longer produce degenerate boxes.
