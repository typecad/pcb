---
'@typecad/pcb': minor
---

ERC is now native, like DRC. The build runs a small engine over the typeCAD
object model itself (components, nets, pin electrical types — no file
parsing, no kicad-cli) and writes `<name>_erc.json` next to the schematic.
It checks electrical correctness only: pins no `net()`/`dnc()` ever touched
(`pin_not_connected`) and incompatible pin connections such as two outputs
on one net (`pin_to_pin`). Power pins never conflict — driver analysis is
out of scope and typeCAD's auto PWR_FLAG would false-positive every rail.

`typecad-pcb erc` reads that report by default; `--kicad` keeps the legacy
kicad-cli shell-out (still the only route for arbitrary external
schematics). `typecad-pcb check` uses the native report too, with
`--kicad-erc` as the opt-out. New API: `pcb.erc()` returns the report
programmatically. Severity overrides for both check ids come from the conf
constraints severities map.
