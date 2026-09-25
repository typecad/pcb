---
'@typecad/pcb': minor
---

The gerber/layout viewer's layer-theme picker vendors eight more KiCad color themes: KiCadMaxColors (MIT), Witch Hazel (Apache-2.0), and Behave Dark, Blue-Green Dark, Eagle Dark, KiCad 2020, KiCad Classic (converted from the KiCad 5 pcbnew fragment), and Nord from pointhi/kicad-color-schemes (CC0). Upstream JSONs and license notices live in `src/gerber_viewer/themes/`; the VS Code extension's Board viewer picks the new entries up automatically on the next render. The remaining pointhi themes (black-white, blue-tone, monokai, neon, solarized-dark/light, wdark, wlight) are schematic-only upstream — no board section exists to vendor.
