---
"@typecad/pcb": patch
---

The gerber viewer gained a measurement tool. A ruler button in the toolbar arms it: click a start point, move the mouse to see the live distance (total plus dx/dy in board units), click again to stick the ruler; measurements accumulate so several can be compared, and `Escape` cancels the in-progress one, clears all rulers and disarms the tool. Rulers live in the pan/zoom layer, keep a constant on-screen size while zooming, and their colors follow the dark/light theme. Clicks are distinguished from pan-drags by a movement threshold, so panning still works with the tool armed.
