---
"@typecad/pcb": patch
---

The gerber viewer gained a dark/light theme toggle in the sidebar header, and the theme now covers the board canvas too. The choice is saved in localStorage (per browser, shared across boards) and re-applied on every page load, including the serve-mode live-reload after builds; on first visit the theme follows the OS `prefers-color-scheme`. On the dark canvas, near-black layer colors (silkscreen, paste, drill) are automatically recolored — with matching sidebar chips — so they stay visible, and clear-polarity cutouts follow the canvas color instead of showing as light boxes.
