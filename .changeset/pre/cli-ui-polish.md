---
"@typecad/pcb": minor
---

feat: CLI polish — consistent output, stricter option checking, shell completion.

- `--quiet`/`-q` and `--verbose`/`-v` now work on every command (they steer the logger and any child build). `-v` alone is still `--version`. `--json` output is never silenced by `--quiet`.
- Options are checked per command: `build --fix` or `drc --zip` is rejected with "not an option of 'build'" and a did-you-mean from that command's own options, instead of being silently ignored. A mistyped subcommand (`export gerber`) gets a suggestion too, and `buidl` now suggests `build`.
- One result format for ERC, DRC and check (`✔ DRC: passed (0.8s)`, `✖ DRC: 1 error, 2 warnings`), one set of status symbols (ASCII fallback on legacy Windows consoles), and a spinner while kicad-cli runs.
- `build` ends with `✔ built src/main.ts → build/ (1.4s)`. `build --watch` stamps each run, runs rebuilds one at a time (a save during a build queues one more), reports when the watched file set changes, and takes `--clear` to clear the screen between runs.
- New `typecad-pcb completion <bash|zsh|pwsh>`. Help is generated from one command table, shows the `npx` form in usage lines, adds a "Typical workflow" block, and writes value options as `--flag=<value>`.
