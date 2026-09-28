---
'@typecad/pcb': patch
---

The measure tool owns its clicks. Ruler points now land on parts, pads and
copper — the viewer's grab handlers used to swallow the pointer press, so
a ruler couldn't start there; the tool now captures the press at the
window before any of them see it. Two quick points on one spot are a
double-click to the browser: while measuring, that no longer opens the
part value editor, and in VS Code it no longer jumps the editor to the
component's source or clears the saved highlight — the probe client stands
down while the ruler is armed. Also in VS Code, `Build Board` leaves the
command palette: the viewer builds the board on open, so an explicit
rebuild lives where the intent is — the ▶ Build Board lens, the status
chip, and the stale-board prompts.
