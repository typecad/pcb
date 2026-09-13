---
'@typecad/pcb': minor
---

Port the typeCAD HAL CLI ergonomics to `typecad-pcb` (same invocation shapes as `typecad-hal`):

- **Watch mode** — `typecad-pcb build --watch` (or `-w`): tracks the entry file plus its local import graph (parsed with acorn, `.js` → `.ts` resolution included) and rebuilds on change, debounced. A failed rebuild prints the error and keeps watching; editors that save atomically are handled by re-arming watchers after every event.
- **Output directory** — `--outDir=<dir>` (also `--out-dir`), accepted on every command: redirects both the library's writes (netlist, board, BOM, contract, SPICE, package `build/lib` sync) and the CLI's artifact discovery (query, drc, erc, export, edit, check, diagnostics, doctor) via the `TYPECAD_BUILD_DIR` override. Default remains `./build/`.
- **`typecad-pcb clean`** — removes the generated build directory; refuses directories without KiCAD build artifacts unless `--force` is given, and always refuses the working directory itself. `--json` and `--outDir` supported.
- **Bare-file invocation** — `typecad-pcb main.ts --watch` now behaves like `typecad-pcb build main.ts --watch`.
- **`build --diagnostics` is now best-effort** like HAL's: a report-generation failure logs a warning instead of failing the build.

Also included from the earlier diagnostics work: the `typecad-pcb diagnostics` command and `build --diagnostics` flag (markdown + JSON report with BOM, nets, pin map, mermaid graphs, ERC-lite electrical checks, kicad-cli ERC/DRC, and routing status), plus three `board_model` parsing fixes for fresh typeCAD output (fp_text references, numeric pad names) and kicad-cli-resaved boards without a global net table.
