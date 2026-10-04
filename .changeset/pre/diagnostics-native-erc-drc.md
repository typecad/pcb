---
'@typecad/pcb': minor
---

`typecad-pcb diagnostics` (and `build --diagnostics`) now runs ERC/DRC
through the native engines by default, like `erc`, `drc` and `check`.
ERC reads the `<name>_erc.json` report the build writes (a report older
than the schematic is not trusted), DRC runs the native engine on the
board. Pass `--kicad` to either command to run the checks through
kicad-cli instead. The native step helpers moved to a shared module used
by both `check` and `diagnostics`.
