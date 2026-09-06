---
"@typecad/typecad": patch
---

`typecad create` now installs the alpha dependency line its scaffold requires: `@typecad/typecad@~1.0.0-alpha.2` and `@typecad/passives@~0.2.3-alpha.0`, instead of both packages' `latest` tags. The scaffolded `gerber_viewer` npm script references the `gerber-viewer` bin, which only exists in the typeCAD 1.0 line — and passives `latest` (0.2.2) declares a typecad peer of `^0.3.0`, so mixing the lines fails with an ERESOLVE error on fresh installs. Ranges use `~` rather than `^` because the Windows npm spawn goes through cmd.exe, which treats `^` as an escape character.
