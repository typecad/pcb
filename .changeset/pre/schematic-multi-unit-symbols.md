---
'@typecad/pcb': patch
---

Fixes multi-unit KiCad symbols rendering as a single unit in generated
schematics. Components like the TS3A24159 dual switch (switch A / switch B /
power units) placed only unit 1, so the sheet showed one switch while units
2+ were never drawn — and because their pin lookup ignored units, nets on
those pins dropped labels at coordinates that coincided with unit 1's pins
or floated in empty space, visually merging distinct nets and hiding the
pins from ERC entirely. The renderer now places one `(symbol ...)` instance
per pin-carrying unit (same reference, KiCad's own file shape, top-level
`(unit N)` only past the first), spaced by the widest unit's bounding box,
and resolves every net label against the owning unit's origin. Verified
against a TS3A24159DRC design: all three units place, DRIVE/REF_SW/CH2_COM
labels separate from PROBE_1/RANGE_SW/CH1_NO, and `kicad-cli sch erc` now
reports the previously invisible pins 9 and 11.
