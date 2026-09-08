---
'@typecad/pcb': patch
---

doctor: new "CLI line" check — compares the RUNNING CLI's major line against the project's declared `@typecad/pcb` spec. The registry's `latest` tag is the 0.x line while alpha-line projects depend on 1.0.0-alpha.x, and the two lines register different commands (check/query/edit exist only on 1.x) — so a stale global `typecad` (installed bare from `latest`) silently hides subcommands even though the project's own node_modules copy has them. The mismatch now fails doctor with the explanation and a caret-free fix (`npm install -g @typecad/pcb@~<declared version>`, safe to paste into cmd.exe); `--fix` deliberately does not touch global installs. `npx typecad <command>` always runs the project's copy.
