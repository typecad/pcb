---
'@typecad/pcb': minor
---

Footprint library upgrades are now native: `add package`, `add component`
and the footprint loader migrate `.kicad_mod` files to the current format
in-process instead of shelling out to `kicad-cli fp upgrade` — same
transformation set (module→footprint rename, fp_text→property migration,
synthesized Value/Datasheet/Description properties, uuid fill-in,
stroke/fill normalization, pad-layer canonicalization with wildcard
compression, model transform completion, bare-token quoting, and the legacy
%R/%V text variables becoming ${REFERENCE}/${VALUE}), verified byte-for-byte against
kicad-cli 10 output. Two long-standing bugs went with it: the footprint
loader's and the exported `upgradeFootprint()`'s `--output` argument always
equaled the input, which kicad-cli rejects — those calls had never upgraded
anything; both now upgrade in place and actually work. Files already at or
newer than the target format are left untouched, and a malformed file no
longer aborts the whole library (errors are isolated per file).
