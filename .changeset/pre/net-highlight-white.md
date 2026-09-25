---
'@typecad/pcb': patch
---

Clicking a net (or a component) in the board viewer paints the matched copper bright against a harder-dimmed board (unmatched copper now dims to 6% opacity):

- **Blueprint view** — the matched net is pure white at full opacity. The composite views now dim per element instead of per group: a dimmed group composites its opacity over the matched elements inside it, which previously made the clicked net FADE rather than pop.
- **Gerber / PCBA views** — the matched net takes the color copper already uses there, resolved per element from its nearest filled ancestor group (the layer group, the pads/copper-ghost wrappers) instead of a global lookup that resolved to the mask definition's black.

Pads recolor, traces restroke, both at forced opacity 1; zone fills keep their color, and everything restores exactly on clear.
