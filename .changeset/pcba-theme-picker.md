---
'@typecad/pcb': minor
---

The board viewer's PCBA view gains a **theme picker** (a second combo box under the view switcher, visible in PCBA view only): Green ENIG (default), Red ENIG, Blue ENIG, Purple ENIG, Black HASL, White mask with black silkscreen, Yellow mask with black silkscreen, **OSH Park After Dark** (black substrate, gold ENIG pads, white silk), and the typeCAD house teal.

Switching remaps the embedded render's flat colors client-side — one render serves every theme, no re-export — and the mask-luminance ink is exempt so soldermask openings keep compositing correctly. The pick persists per board across reloads and rides into SVG/PNG exports (the colors are baked into attributes). The new colorways are also available to the CLI as `--theme red-enig|white-hasl|yellow-hasl|oshpark-after-dark`.
