---
'@typecad/pcb': patch
---

doctor + create share one dependency source (core-deps.ts). `typecad-pcb doctor` computes its repair command from create's pinned line (never bare names, which would resolve to whatever `latest` is), `doctor --fix` actually performs the install, and projects still depending on the pre-rename `@typecad/typecad` / `@typecad/passives` packages are called out with migration guidance. Create's install failure now surfaces npm's actual stderr instead of "Is npm installed and on your PATH?".
