---
'@typecad/pcb': patch
---

- `create` no longer offers a PlatformIO firmware project; the optional `./fw` is now a typeCAD HAL project (`--hal=<true|false>`, interactive question after the project name). When chosen, it runs `npx @typecad/hal create <name> --outDir fw` in the project root so HAL's own wizard picks the board, and `fw/` joins the generated `.code-workspace` whenever it exists. `--pio`/`--board` are gone from the CLI, help, and skill docs.
- Fixed the interactive `create` flow silently skipping the firmware and git questions: the command shim assigned `undefined` to absent `--hal`/`--git` flags, which the prompt flow read as explicitly answered. All three questions (name, HAL firmware, git) now always appear when the flags aren't passed.
