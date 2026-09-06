---
"@typecad/typecad": patch
---

`typecad create` now scaffolds every new project with a `gerber_viewer` npm script (`gerber-viewer serve`) and installs `@typecad/gerber-viewer`. The script serves an interactive board viewer at http://localhost:4173 that re-exports gerbers and live-reloads the page on every `npm run build`. Generated `.gitignore` also excludes `build/serve/`, and the generated AGENTS.md documents the script.
