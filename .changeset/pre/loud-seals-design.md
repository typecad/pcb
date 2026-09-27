---
'@typecad/pcb': patch
---

Fix `create` starving the spawned HAL wizard of console input on Windows. The interactive branch prompted with `@inquirer/prompts` and then spawned `npx -y @typecad/hal@latest create` via `execFileSync('cmd.exe', …, { stdio: 'inherit' })`; an @inquirer raw-mode console reader cannot be fully stopped after prompting, and the blocked event loop of a synchronous exec keeps libuv draining the console input buffer — so the inherited-stdio HAL child (any version) never received a keystroke and its board picker sat unresponsive. The three questions now use plain `readline/promises` behind a drop-proof line queue (also fixes piped-stdin answer sheets being partially discarded), and the HAL step spawns asynchronously and awaits the child. Verified end-to-end on a real console via WriteConsoleInput injection: name → hal → git → board filter → select → starter → both hw/ and fw/ scaffold.
