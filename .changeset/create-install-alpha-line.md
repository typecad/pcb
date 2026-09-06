---
"@typecad/typecad": patch
---

`typecad create` now installs `@typecad/typecad@~1.0.0-alpha.2` instead of `latest`. The scaffolded `gerber_viewer` npm script references the `gerber-viewer` bin, which only exists in the 1.0 line — fresh projects installing `latest` (0.3.4) failed with `sh: gerber-viewer: not found` when running it. The tilde range picks up newer 1.0 alphas and the eventual 1.0.0 stable, and is spelled with `~` because the Windows npm spawn goes through cmd.exe, which treats `^` as an escape character.
