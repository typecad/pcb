---
'@typecad/pcb': patch
---

CLI UX: unknown options and commands now fail with a did-you-mean hint (exit 2), `--flag value` works for search/diff/add flags, short flags no longer swallow the next argument, `add`/`simulate`/`check-sync` have help screens, `--help --json` returns JSON, a missing KiCad points to `doctor`, `create` fails clearly when its input ends, and `diff --no-open` works.
