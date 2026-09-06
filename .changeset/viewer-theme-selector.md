---
"@typecad/typecad": patch
---

The gerber viewer gained a dark/light theme toggle in the sidebar header. The choice is saved in localStorage (per browser, shared across boards) and re-applied on every page load, including the serve-mode live-reload after builds; on first visit the theme follows the OS `prefers-color-scheme`. The board canvas stays light in both themes — silkscreen and fab layers render in near-black colors and clear-polarity cutouts assume a light background.
