---
'@typecad/pcb': patch
---

Reference designators follow `create()` argument order. They were assigned
from a module-global counter on the first read of `.reference` — so the
order nets happened to mention pins decided the numbering and a BOM could
contradict the user's source (a 10µF labeled C1 over a 100nF). The
schematic's counter now assigns in registration order; the global counter
only hands out display placeholders before registration. `add component`
emits the part number as the generated component's `value` for
part-number-like symbol names (`ATtiny85-20S`, `DS18B20`), overridable
with `--value`; `typecad-pcb create` derives its `@typecad/pcb@~<version>`
pin from the CLI release the user ran instead of a hardcoded alpha; the
placement JSDoc no longer shows the crashing `sameAs(r1).plus(2)` form;
and `search` stays silent on pipes (no ANSI spinner frames in piped logs)
with the redundant "Top match" trailer removed.
