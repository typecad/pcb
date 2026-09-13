# @typecad/pcb

## 1.0.0-alpha.5

### Minor Changes

- PCBA image renderer for the gerber viewer: `gerber-viewer <dir> --render pcba` renders the fab output as a flat, themed 2D "assembled board" SVG — the PcbDraw look computed from gerbers alone, with no board file, KiCad install, lighting or perspective involved.
  
  - The board surface is painted bottom-up by SVG compositing: substrate from the Edge.Cuts outline (traces are chained into closed contours, regions close implicitly), copper, pad flashes in the finish color, then the soldermask film with the mask gerber's openings punched through an SVG `<mask>` so pads/copper/substrate show exactly where the real openings are — followed by silkscreen and drilled holes.
  - Components are Fritzing-inspired stylized glyphs drawn from the X2 `%TO.P` pad attributes — no part library. Grouping pad flashes by reference recovers each part's layout; the package family (two-pad, dual-row IC, QFN/perimeter, generic) is inferred from the pad pattern, and each glyph gets metal leads at its pads, a rounded body, a pin-1 dot and a DIP notch for through-hole ICs. Mounting holes and single-pad test points are skipped.
  - Copper ghosting through the mask: real soldermask is translucent, so traces and pours under it render in a darker mask tone — a new `maskCopper` theme color painted over the film (still masked off at the openings, so pads keep their finish color). Every builtin theme ships a matching value. Raw copper is never painted under the film: mask-opening rings around pads reveal substrate only, so no copper-colored halo leaks around components (the `copper` color appears solely in the no-mask bare-board fallback), and the default `pads` finish is a copper tone (`#cf8a4d`) to match.
  - Netlist metadata is now auto-discovered: when no `--netlist` is passed, the pcba render looks for a sibling `*.net` beside the input directory (the typeCAD build layout: `build/gerbers` + `build/<board>.net`), so the plain command gets exact package dims, values and name-based classification. `--no-netlist` opts out. Without any netlist the pad-topology fallbacks still improved: a Y/X reference on a two-pad part renders the crystal metal can, and a perimeter pad ring classifies as QFP (long protruding gull-wing pads) versus QFN (short flush pads) by pad length, checked before the ball-array grid test so a QFP's pad lattice can't read as a BGA.
  - Chip resistors/caps draw a true top view: a sharp-cornered body with silver termination caps on its ends — `[copper pad [silver | black | silver] copper pad]` — with the board's own exposed pads visible past the part, instead of silver pads under a capsule.
  - Exact body outlines from the Fab layer: each component claims the fab ink nearest its pads (reaching 4mm past the land pattern, since bodies like terminal blocks overhang their pins), the group is stitched into closed contours with junction-aware walking (smallest-turn preference with backtracking, so tee connections such as terminal-block dividers don't break the loop), and the largest contour's bounding box becomes the body rectangle — exact package dimensions where the land pattern extends past the package (the QFN's pads peek out on all four sides). Orientation cuts in the fab drawing, like QFN pin-1 chamfered corners, are squared off rather than rendered verbatim; the pin-1 dot marks orientation. Value-text strokes and pin marks lose the area contest; footprint-name dims and pad heuristics remain the fallbacks when no Fab layer is present.
  - A package grammar now covers the common archetypes, each drawn as a procedural top-view glyph: two-terminal chips (resistor/capacitor/inductor with winding stripes/diode/LED/ferrite), axial through-hole parts, radial electrolytic cans (dark circle, centered polarity stripe), through-hole LED domes (tinted, die dot), SOT small transistors, SOIC/TSSOP gull-wing ICs, DIPs (notch), QFN/DFN and BGA, QFP, pin headers, terminal blocks (gold screw dots), shrouded connectors (USB/barrel/JST — body extended past the pad row, shield pads as tabs), crystals, metal-can modules (oscillators/RF shields — metal lid, inset detail, no legs), TO/SOT-223 power packages (tab), trimmer potentiometers (light-blue body `bodyTrimmer`, silver screw in the bottom-right corner), slide switches (rounded internal track the actuator rides in), rotary encoders (shaft filling most of the body), pushbuttons, generic fallback. New names classify to the new families (CP_Radial→radial, USB|BarrelJack|JST→connector, Oscillator|TCXO|RF_Module→can, Potentiometer→trimmer, RotaryEncoder→rotary, SW_DIP|SW_Slide→slide, LED_D→dome) and the nameless topology fallback infers them from reference prefixes (C on two TH pads → radial, LED → dome, RV → trimmer, SW on three pads → slide; the exposed-pad exclusion now skips zero-span collinear rows).
  - Semantic appearance from the reference prefix plus the netlist value: through-hole resistors get the classic tan body (`bodyResistor` theme color) with real color bands parsed from their value ("10k" → brown black orange + gold) — SMD chips carry none, like real parts — MLCCs render beige, inductors/ferrites charcoal, diodes carry a cathode stripe at the pin-2 end, LEDs render as a tinted translucent package with a die square — all overridable through new theme keys (`bodyMlcc`, `bodyResistor`, `bodyInductor`, `stripe`, `ledTint`, `crystal`). `Resistor_THT`/axial footprint names classify as axial parts, and the SOT-223/DPAK tab starts at the body edge and reaches ~2/3 over its pad instead of covering it.
  - Component bodies size from the package when a netlist is passed (`--netlist build/board.net`, the same flag the viewer uses): footprint names like `R_0603_1608Metric` and `QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm` carry the real body dimensions (1.6×0.8mm, 4×4mm), which override the pad-geometry heuristics. Through-hole parts render as DIPs, headers, terminal blocks or axial parts instead of being skipped; only mounting holes, test points and unclassifiable through-hole patterns draw nothing. Pad geometry from KiCad's RoundRect aperture macros reads its real extent instead of a 0.3mm fallback.
  - Synthetic refdes labels use the theme's `labelFont` (`'OCR A Std', 'Courier New', monospace` by default) to match typeCAD boards; the board's own silkscreen text (including fonts like `OCR A Std`, vectorized by KiCad's plotter) renders faithfully from the gerber outlines.
  - Themes are a small PcbDraw-style JSON palette with builtins `green-enig` (default), `purple-enig`, `black-hasl` and `blue-enig`; `--theme <name|file.json>` accepts any subset override. `--side front|back` flips the render (back views mirror x, labels stay readable), and refdes labels are auto: suppressed when the silkscreen layer already carries them so they don't double the silk text (`--labels`/`--no-labels` force either way).
  - The viewer's PNG export rasterizes at ~1600px on the long edge instead of 2x viewBox units: the export clone carries explicit pixel dimensions, so the vector decodes at full target resolution — previously a ~113mm board exported as a ~230px thumbnail, and the canvas upscaled the blur.
  
  - Rendering internals are now shared: `renderLayerInk`/`renderDrillInk` (exported) factor the per-layer SVG emission out of `renderSvg` unchanged, and aperture-macro comment lines (primitive code 0) are skipped silently per the Gerber spec instead of warning — KiCad's `RoundRect` macro pads no longer produce spurious warnings.
  
  - The interactive board viewer gains a view switcher: a combo box under the project title toggles between the classic Gerber view (layer stack, visibility/opacity controls) and the new PCBA view. Both render into one SVG sharing a single coordinate frame, so pan/zoom, the measurement ruler, DRC markers, component search and the vscode cross-probing (double-click→source, source→component highlight) work in either view; the PCBA view hides the layer controls, and the selected view persists per board.
  
  - Render-cycle cost: zone fills were the hidden giant (~20s of every kicad-cli gerber export). The build no longer fills at all — see the zone-fills-on-demand changeset — so `npm run build` is refill-free, and the vscode panel gates on board mtime stability (never rendering kicad-cli's truncate-then-write intermediate states), cutting one full export chain per build.
  
  - The vscode panel's refresh is now gated, fixing the flaky "only refreshes once" behavior: the board's mtime is compared against the last render — spurious FileSystemWatcher events (Windows fires onChange loosely; anything that touches the workspace) no longer trigger a pointless export when the board didn't change — and a skipped or failed refresh self-retries, because the build's final board write can coalesce into the in-flight generate call and never fire the watcher again. A board written moments ago is given 3s to settle before its export runs, so an export never races the writer.
- `gerber-viewer serve` is removed, along with the `gerber_viewer` npm script it was wired into by `typecad-pcb create` — the VS Code extension's Board viewer now covers that loop (re-export + rerender on every `npm run build`) with cross-probing on top. The one-shot CLI (`gerber-viewer <dir> -o board.html [--netlist] [--drc] [--render pcba]`) is unchanged; the programmatic gerber-viewer exports lose `startGerberViewerServer`, `findBoardFile` (the gerber-viewer one) and `RELOAD_CLIENT`. Existing projects can delete the `gerber_viewer` script from `hw/package.json` — nothing else references it.
- Port the typeCAD HAL CLI ergonomics to `typecad-pcb` (same invocation shapes as `typecad-hal`):
  
  - **Watch mode** — `typecad-pcb build --watch` (or `-w`): tracks the entry file plus its local import graph (parsed with acorn, `.js` → `.ts` resolution included) and rebuilds on change, debounced. A failed rebuild prints the error and keeps watching; editors that save atomically are handled by re-arming watchers after every event.
  - **Output directory** — `--outDir=<dir>` (also `--out-dir`), accepted on every command: redirects both the library's writes (netlist, board, BOM, contract, SPICE, package `build/lib` sync) and the CLI's artifact discovery (query, drc, erc, export, edit, check, diagnostics, doctor) via the `TYPECAD_BUILD_DIR` override. Default remains `./build/`.
  - **`typecad-pcb clean`** — removes the generated build directory; refuses directories without KiCAD build artifacts unless `--force` is given, and always refuses the working directory itself. `--json` and `--outDir` supported.
  - **Bare-file invocation** — `typecad-pcb main.ts --watch` now behaves like `typecad-pcb build main.ts --watch`.
  - **`build --diagnostics` is now best-effort** like HAL's: a report-generation failure logs a warning instead of failing the build.
  
  Also included from the earlier diagnostics work: the `typecad-pcb diagnostics` command and `build --diagnostics` flag (markdown + JSON report with BOM, nets, pin map, mermaid graphs, ERC-lite electrical checks, kicad-cli ERC/DRC, and routing status), plus three `board_model` parsing fixes for fresh typeCAD output (fp_text references, numeric pad names) and kicad-cli-resaved boards without a global net table.
- `typecad-pcb create` now bundles the typeCAD/pcb VS Code extension into every new project (`hw/.vscode/extensions/typecad-pcb/`), zero-install like the HAL addon:
  
  - **Pin hovers** — hover a component variable in `src/` to see its reference, footprint, placement, and a pad-by-pad table with connected/unconnected status (net-less `np_thru_hole` pads read as mechanical). A declared component missing from the compiled board explains itself instead of hovering silent.
  - **Cross-probe board viewer** — *typeCAD/pcb: View Board* renders the compiled board (gerbers + netlist, zones refilled) in a webview beside the editor; the hover's *view on board* link zooms to the component (and *View Component on Board* from the palette prompts for a designator, seeded with the word under the cursor), and double-clicking any pad or outline in the viewer jumps back to the declaring source line — traces too: `pcb.net`/`pcb.route` callsites are now stamped into the netlist (Code/Route properties) and surface through `query nets`, so a trace hover reads "net2 { source board.ts:83 }" and double-clicking a trace reveals that line (single clicks — measurement ruler points included — always stay inside the viewer). Viewport, layer settings, and highlight survive board-change reloads, and an open Board panel is restored across VS Code window reloads too — instantly from the last generated view when the board hasn't changed, or with a brief placeholder while the export reruns. While a rebuild's new render is being generated, the viewer's lower-left status text announces it — and locks the readout so the mouse-coordinate display cannot overwrite the notice — unlocking when the new view lands. The hover readout names the source variable beside the designator ("R1 { source r1 }"), and the PNG export rasterizes at ~1600 px.
  - **Editor integration** — `.vscode/extensions.json` force-installs the extension workspace-scoped; `.vscode/settings.json` hides its manifest from the NPM Scripts pane and the Explorer (ported from the HAL addon's npm-hiding settings).
  
  Also in this change:
  
  - The footprint `Code` property now always embeds the declaring `file:line` (previously only anonymous components carried it), normalized to a POSIX project-relative path so committed boards stay machine-independent. This is what the reverse cross-probe and the hover's source row read.
  - `gerber-viewer` one-shot mode gained `--netlist`/`--drc` flags, a `#typecad-probe` SVG group and a `window.typecadViewer` embedding API, board-coordinate (y-down) mouse readout, and viewport persistence across reloads.
  - `typecad-pcb export gerbers` (and `jlcpcb-export`) pass `--check-zones` on KiCad ≥ 9 — builds write zone declarations without fill geometry, so the export computes the pour copper at plot time.
  - Board lookup (`query`, `export`, `drc`, `check`) picks the newest `.kicad_pcb` in `build/` instead of refusing when stray boards share the directory.
  - A new workspace package `packages/vscode-typecad-pcb` develops the extension; `npm run bundle` ships the compiled copy into `assets/editor-extensions/` (now included in the npm `files`).
- Zone fills are no longer typeCAD's job at build time — each operation that needs fill geometry now computes it itself, so `npm run build` writes zone declarations only and skips the ~20s kicad-cli refill round-trip entirely (the rd_skeleton demo board builds in ~3.5s where it took ~30s).
  
  - `pcb.create()` no longer calls `materializeZoneFills` after writing the board. The board file carries zone declarations without `(filled_polygon)` geometry — valid as far as KiCad is concerned; KiCad fills zones on demand.
  - `typecad-pcb export gerbers` always passes `--check-zones` (KiCad ≥ 9), so plotted gerbers include the pour copper even though the `.kicad_pcb` never materialized it.
  - `typecad-pcb check` refills as part of its DRC pass, as before.
  - `materializeZoneFills(pcb, state)` remains exported for callers that want to force a fill-and-save on the board file itself (e.g. before handing it to a tool that can't refill).
  - The zone-fill sidecar files (`.zonefill`) are gone — with the build no longer filling, there was nothing left to record. The board viewer detects completed builds by file mtime stability instead.

### Patch Changes

- Consolidated KiCad symbol parsing into a single shared core (`src/symbol_core.ts`). The CLI add flows, the schematic renderer (`SymbolLibraryManager`), and symbol embedding (`loadSymbolLib`) now share one extends resolver and one pin walker instead of four parallel `.kicad_sym` readers. `kicad_sym_utils` is now a stateless facade (`readSymbol` / `readSymbolFile`), which removes the hidden call-order coupling between `kicad_symbol()` and `kicad_pins()`.
  
  Behavior improvements that come with the unified semantics:
  - Pin extraction is now fully recursive: pins hanging directly on the symbol node and deeply nested unit symbols are found (previously only one level of unit nesting was scanned).
  - `extends` parents written as `Lib:Name` now resolve across libraries (previously mangled and silently unresolved), with circular-chain detection.
  - Local `.kicad_sym` files with multiple symbols now yield the pins of the chosen symbol only — previously every symbol's pins in the file were merged into the component.
  - `typecad-pcb add package` local non-interactive mode no longer reads pins from stale internal state; the symbol is resolved properly (with a warning when it can't be found).
  - Symbols whose `Footprint` property has an empty value are now usable in the add flows (previously treated as invalid).
  
  No public API was removed; the changes are internal to the CLI flows and renderer.
- - `create` no longer offers a PlatformIO firmware project; the optional `./fw` is now a typeCAD HAL project (`--hal=<true|false>`, interactive question after the project name). When chosen, it runs `npx @typecad/hal create <name> --outDir fw` in the project root so HAL's own wizard picks the board, and `fw/` joins the generated `.code-workspace` whenever it exists. `--pio`/`--board` are gone from the CLI, help, and skill docs.
  - Fixed the interactive `create` flow silently skipping the firmware and git questions: the command shim assigned `undefined` to absent `--hal`/`--git` flags, which the prompt flow read as explicitly answered. All three questions (name, HAL firmware, git) now always appear when the flags aren't passed.
- - Dead code cleanup (~750 lines): removed the unused routing worker modules (`worker_pool`, `segment_worker`, `simple_routing_grid`), `pcb_board_context`, `pcb_kicad_window`, the unused `kicad-symbols` barrels and `GlobalErrorHandler`, two unused test helpers, and two orphaned ambient type declarations (`@typecad/pcb-astar`, `which`). No public API was removed.
  - `pcbRegisterRouter` is now exported from the package root. The custom-router registration point was implemented, tested, and referenced by the `layout` skill docs, but was unreachable because it was never re-exported from `index.ts`.
  - Tightened module boundaries: ~60 symbols that were only used inside their own module are no longer exported, including a dead type re-export block in `pcb.ts` and a redundant `LibraryInfo`/`SymbolInfo`/`KiCadCacheMetadata` re-export in `kicad-symbols/types`.
  - Removed unused devDependencies: `tsx`, `typedoc`, `typedoc-plugin-markdown`.
- Relative-placement fixes from a full end-to-end API exercise: footprint-string
  targets now resolve, and outline-less board reads explain themselves in the
  console instead of silently returning zeros.
  
  - `below()/above()/rightOf()/leftOf()` — `.by(gap, "Lib:Footprint")` now
    measures the gap against the named footprint's bounds at rotation 0.
    Previously the string was silently ignored and the new component's own
    footprint was used, contradicting the documented signature (verified
    end-to-end: `.by(2, 'Capacitor_SMD:C_0805_1608Metric' ...)` on a resistor
    now lands at the capacitor-derived coordinate).
  - Plain-number board geometry reads (`pcb.board.center.x`, `left/right/top/
    bottom`, `width/height`, corners) before `pcb.outline()` now log a console
    warning — they snapshot zeros and never re-resolve, unlike `from*()` /
    `centered()` placement values which safely follow the final outline at
    `create()`. Several reads on one `pcb.board` object dedupe to a single
    warning. Unknown footprint strings passed to `.by()` already warned via
    `getFootprintBounds`; that is unchanged.
  - JSDoc corrected: `.by(gap, target)` never returned "a plain number
    immediately" — it always returns a deferred placement value; the docs now
    describe actual Component/string target semantics.
  - Docs (`board_layout` page, llms mirror, llms-full bundle): removed the
    stale `import { board } from '@typecad/pcb'` — placement lives on
    `pcb.board`, which is the only supported entry point.
- `typecad-pcb create` now scaffolds the project `tsconfig.json` with `module: "ESNext"` / `moduleResolution: "Bundler"` instead of `NodeNext`. The extensionless relative import that `add component` prints for its generated class (`import { LD3985G25R_TSOT23 } from './LD3985G25R_TSOT23';`) is now valid as-is in editors and in `typecad validate` — under NodeNext it was flagged with "Relative import paths need explicit file extensions", forcing a manual `.js` suffix even though the build (tsx) never needed one. Bundler resolution matches the actual runtime: projects are always executed through tsx's esbuild resolver and tsc only ever type-checks (`noEmit`), so nothing is ever loaded as raw Node ESM.
- Fixed `pcb.stitch()` placing body keep-out boxes at the footprint bounds center instead of the footprint origin.
  
  - Many footprints' origin is pin 1 or a corner (DIPs, pin headers, most THT connectors), not the body center. The stitch grid treated the origin-relative bounds box as centered on the component position, so it shadowed open board up-and-left of the part — refusing vias that would fit, e.g. the row above and the column left of a `DIP-8_W7.62mm` — while leaving the real body open down-and-right, where stitch vias could punch straight through the part.
  - Blockers are now built from the box's rotated corners anchored at the component position (mirrored about the X axis for back-side parts), matching the placement code's `rotatedBox` semantics.
- Reference-designator prefixes are now read from the symbol's `(property "Reference" ...)` — the same property KiCad editors use — instead of being guessed from the first letter of the footprint name. An ATtiny3227 in a QFN footprint now correctly becomes `U1` instead of `Q1`, with no code changes needed in existing projects.
  
  Precedence, highest first:
  1. an explicit `reference` (`new ATtiny3227_M('U1')` or `init.reference`)
  2. an explicit `prefix` (`u1.prefix = 'U'` or `init.prefix`)
  3. the symbol's Reference property, resolved through the global KiCad libraries or `<buildDir>/lib` (extends chains inherit the base symbol's prefix; results are cached per symbol)
  4. the previous footprint-name heuristic, now only a fallback for components without a resolvable symbol
  
  `typecad-pcb add component` / `add package` also pass the resolved symbol and prefix into the generated class through the `Component` init object (`super({ footprint, symbol, prefix })`), so correct designators survive even when the symbol library isn't installed at build time (e.g. CI).
  
  Also fixes the designator being resolved too early: pin declarations as class fields (`PA0 = this.pin(1)`) used to read the reference before the constructor body could set the symbol, which forced the footprint-name fallback and produced wrong prefixes (Q1 for a QFN-packed MCU). `Pin.reference` and `Pin.uuid` are now resolved lazily through the owning component, so inference always happens after construction completes.
  
  `resolveExtends` now returns a genuinely flattened symbol: graphics and pins from the extends-chain base, properties overridden by each derived level, and the node named after the requested `library:symbol` (with unit sub-symbols renamed to match). Previously the embedded `lib_symbols` entry carried the BASE symbol's name (an ATtiny3227 embedded as `ATtiny807-M`), so the placed symbol's `lib_id` had no matching definition and KiCad silently dropped the component from netlist export and ERC.

## 1.0.0-alpha.4

### Major Changes

- **`@typecad/typecad` is renamed to `@typecad/pcb`, and `@typecad/passives` is merged into it.** One package, one version line: the passives/typecad peer-pairing (and the ERESOLVE failures from mixing their stable and alpha lines) is structurally gone. Fresh projects install `tsx` + `@typecad/pcb` — nothing else.

  Migration:

  - `import ... from '@typecad/typecad'` → `from '@typecad/pcb'` (deep imports `/routing`, `/search`, `/diff`, `/docgen`, `/sexpr`, `/gerber-viewer` keep their paths under the new name)
  - `npm install @typecad/pcb` replaces both `@typecad/typecad` and `@typecad/passives`

  Passives are now built-in with a single-API redesign — sizes are constructor options, not import paths:

  ```ts
  import { PCB, Resistor, LED } from '@typecad/pcb';

  let r1 = new Resistor({ value: '10k' }); // 0603 (default)
  let r2 = new Resistor({ value: '10k', size: '0805' }); // explicit size
  ```

  - One import for everything; `size` is a typed union (`'0201' | '0402' | '0603' | '0805' | '1206' | '1210'`, Fuse excludes the two smallest) and an explicit `footprint` still always wins
  - `Testpoint` → `TestPoint`, `Tie` → `NetTie` (now on standard `ComponentInit` — `pcb`/`sch` placement instead of `xy`)
  - `Connector` gains a `series` preset (`'pin-header'` default, `'JST-SH'`) that templates symbol and footprint from `number`, so the pin count lives in one place only
  - `Package` provides `this.passives` (0603) out of the box — the `{ passives: await import("@typecad/passives/0603") }` wiring is gone; shift a whole package with `{ passiveSize: '0805' }`, or override with `passiveFactory(size)`
  - `typecad-pcb doctor` now flags legacy `@typecad/typecad`/`@typecad/passives` dependencies and points them at `@typecad/pcb`

### Minor Changes

- `route()` now errors loudly when it is called before the net's components are placed: routing captures the pads' current positions and never re-anchors when a late placement resolves at `create()`, so a `route()` above the placement code silently draws the trace at the default (0, 0) position — and the stray segments pollute the board bounds that zones and `typecad.board` placements derive from. The error names the unplaced components and states the required order: `outline() → place components (.pcb = {...}) → route() → zone()/stitch() → create()`.

## 1.0.0-alpha.3

### Patch Changes

- 9d90f35: `typecad create` now installs the alpha dependency line its scaffold requires: `@typecad/typecad@~1.0.0-alpha.2` and `@typecad/passives@~0.2.3-alpha.0`, instead of both packages' `latest` tags. The scaffolded `gerber_viewer` npm script references the `gerber-viewer` bin, which only exists in the typeCAD 1.0 line — and passives `latest` (0.2.2) declares a typecad peer of `^0.3.0`, so mixing the lines fails with an ERESOLVE error on fresh installs. Ranges use `~` rather than `^` because the Windows npm spawn goes through cmd.exe, which treats `^` as an escape character.
- doctor: new "CLI line" check — compares the RUNNING CLI's major line against the project's declared `@typecad/typecad` spec. The registry's `latest` tag is the 0.x line while alpha-line projects depend on 1.0.0-alpha.x, and the two lines register different commands (check/query/edit exist only on 1.x) — so a stale global `typecad` (installed bare from `latest`) silently hides subcommands even though the project's own node_modules copy has them. The mismatch now fails doctor with the explanation and a caret-free fix (`npm install -g @typecad/typecad@~<declared version>`, safe to paste into cmd.exe); `--fix` deliberately does not touch global installs. `npx typecad <command>` always runs the project's copy.
- doc: fix `md.utils.assign is not a function`. markdown-it-multimd-table-ext (4.2.35, the newest release) initializes against the `md.utils.assign` polyfill that markdown-it 14 removed — and we pin markdown-it ^15 — so every `typecad doc` run died at plugin load. A per-instance shim now restores the removed helper (cloned `md.utils`, no global mutation) before the plugin loads; a canary test documents that the shim can be deleted once the plugin ships a markdown-it 14+ compatible release. Verified end-to-end: `typecad doc` on a table-bearing document renders `<table>` output again.
- doctor + create: respect the two dependency lines. The registry carries a stable line (typecad 0.x `latest` + passives 0.2.2, peers ^0.3.0) and an alpha line (typecad 1.0.0-alpha.x + passives 0.2.3-alpha) that must never be mixed — a mixed package.json ERESOLVEs on `npm install`, which aborts wholesale and leaves node_modules hollow (the "Core dependencies: missing @typecad/typecad, @typecad/passives, tsx" doctor report). `typecad doctor` now computes its fix from the project's package.json: an alpha-line project gets the alpha pair installed (never bare names, which would either silently flip the project to the 0.x line — no gerber-viewer bin — or ERESOLVE), `doctor --fix` actually performs the install, and the mixed-lines state is called out in the failure output as the reason plain `npm install` fails. The dependency list is shared with `typecad create` (core-deps.ts, one source), and create's install failure now surfaces npm's actual stderr instead of "Is npm installed and on your PATH?".
- 422b2c9: Fixed ballooned TrueType text on the gerber viewer's dark canvas. The dark-theme recoloring for silkscreen/paste/drill matched every element carrying a `stroke` attribute — including region paths that carry `stroke="none"` (TrueType text glyphs, pour outlines) — which painted a ~1mm outline around each glyph. The stroke override now excludes `stroke="none"`, so filled polygon text like a board's title renders crisp while stroke-font designators keep their recolored strokes.
- 1307bb2: The gerber viewer gained a measurement tool. A ruler button in the toolbar arms it: click a start point, move the mouse to see the live distance (total plus dx/dy in board units), click again to stick the ruler; measurements accumulate so several can be compared, and `Escape` cancels the in-progress one, clears all rulers and disarms the tool. Rulers live in the pan/zoom layer, keep a constant on-screen size while zooming, and their colors follow the dark/light theme. Clicks are distinguished from pan-drags by a movement threshold, so panning still works with the tool armed.
- 53b6c2e: The gerber viewer now remembers layer settings across rebuilds. Visibility toggles and opacity sliders are stored in the browser's localStorage (keyed per board title) and re-applied when the serve-mode page reloads after a build, so a hand-tuned layer view survives the live-reload instead of snapping back to defaults. New layers added by a rebuild fall back to their defaults; All/None buttons persist too.
- 6930ebf: `gerber-viewer serve` no longer exits when its port is taken — it walks up to the next free port (up to 50 attempts from the requested one) and logs where it landed, so a dev website or a second viewer instance no longer blocks startup. The startup log and `--open` use the actual bound port. Its default port also changed from 4173 to **4273**: 4173 is `vite preview`'s default and collided with the typeCAD website dev server.
- f07505d: The gerber viewer's ruler tool gained angle snapping: holding `Shift` while measuring constrains the endpoint to 45-degree increments (0/45/90/...) from the start point, at the same radial distance. The snap applies to the live ruler while moving and to the ruler that sticks on the second click; releasing Shift restores free placement.
- 7f0ab3b: The gerber viewer gained a dark/light theme toggle in the sidebar header, and the theme now covers the board canvas too. The choice is saved in localStorage (per browser, shared across boards) and re-applied on every page load, including the serve-mode live-reload after builds; on first visit the theme follows the OS `prefers-color-scheme`. On the dark canvas, near-black layer colors (silkscreen, paste, drill) are automatically recolored — with matching sidebar chips — so they stay visible, and clear-polarity cutouts follow the canvas color instead of showing as light boxes.

## 1.0.0-alpha.2

### Major Changes

- a8c8751: Placement moved onto `pcb.board`; free functions removed.

  - `pcb.board` is the complete placement namespace: live outline bounds (`center`, edges, corners, `fromLeft()`/`fromRight()`/`fromTop()`/`fromBottom()`) plus the component-relative verbs `below(c)`, `above(c)`, `rightOf(c)`, `leftOf(c)`, `sameAs(c)`. Readable before or after `pcb.outline()`; values follow the final outline.
  - **Breaking**: the free functions (`below`, `above`, `rightOf`, `leftOf`, `sameAs`, `board`, `PlacementValue`, `isPlacementValue`) are no longer exported from the package root, and the verbs are not PCB-class methods. Replace `board(pcb).fromLeft(5)` with `pcb.board.fromLeft(5)`, `below(r1).by(3)` with `pcb.board.below(r1).by(3)`, `sameAs(r1).x` with `pcb.board.sameAs(r1)` (assignable directly). Placement _types_ (`PlacementBuilder`, `BoardBounds`, `SameAsResult`, `PlacementNumber`, `PlacementInput`) remain exported.

### Minor Changes

- 8c41df1: Deterministic builds and the agent loop. Build output is now byte-identical across runs: every UUID in the schematic and board is derived (UUIDv5) from design content — component references, net names, geometry — instead of `randomUUID()`, and auto-placed components land on stable grid cells via a seeded hash. This makes git diffs of `build/` meaningful and enables golden tests.

  Three new CLI commands form a verify-then-edit loop for agents:

  - `typecad check` — build + unconnected-pad analysis + ERC + DRC in one pass, one JSON report (`--skip-erc` / `--skip-drc` to scope). Exits non-zero on failure; in `--json` mode build output is captured so stdout stays parseable.
  - `typecad query <subject>` — inspect the compiled board as data: `summary`, `nets`, `net <name>`, `components`, `component <ref>`, `unconnected`, `power`. Component entries carry their source variable name (from the Code property); `unconnected` lists floating pads (mounting holes excluded) and single-pin nets.
  - `typecad edit <op>` — checked semantic source edits validated against the built board before anything is written: `connect R1.1 U1.3`, `connect GND C1.2 C2.2`, `move U1 --right-of=C3 --gap=2.54`, `route U1.3 R1.1 --width 0.25`, with `--dry-run`, did-you-mean suggestions, and generated code that references your variable names. Route calls are inserted before the first `create()`.

  Routing order is now a guarded contract: `route()` (and batch autorouting) after `create()` throws a `TypeCadError` with reordering guidance instead of silently returning a failed result — the board is already written at that point, so routes staged afterwards could never reach it. `typecad query routes` reports per-net copper connectivity (pads, vias, segments, pours — including pour-assisted planes and unrouted pin groups), and `typecad query zones` lists pours and keepouts.

  Skills upgrades: `typecad skills search <query>` fuzzy-finds skills; `typecad skills export --out <dir>` emits every skill as a SKILL.md for `.claude/skills`-style tooling; `typecad create` scaffolds AGENTS.md from the live skill registry (can no longer drift) and gains `--yes` for fully non-interactive project creation with defaults.

  **Zone fills are now materialized.** `pcb.zone({ fill: true })` (the default) declares a pour, and at `create()` the written board is round-tripped through `kicad-cli pcb drc --refill-zones --save-board` so the fill geometry exists in the file — fabrication exports include pour copper and DRC judges real connectivity (a stitching-via board previously reported dozens of phantom "unconnected" items; with fills materialized it reports zero). Opt out per zone with `fill: false` or globally with `new PCB(name, { fill_zones: false })`; without kicad-cli the fill is skipped with a warning. Because KiCad's resave used to invent random UUIDs for pads, base properties, and footprint graphics, typeCAD now emits deterministic UUIDs for all of them — build + refill is byte-identical across runs. `typecad check` runs its DRC with `--refill-zones --save-board` as well, and `typecad query zones` distinguishes declared pours from materialized ones (resaved `(net "NAME")` zone and pad forms are parsed).

- ada1e65: N-layer boards: the copper layer set is now a first-class, always-resolved property of the PCB.

  - `new PCB(name, { layers: N })` sets the copper-layer count at construction (2–32); `pcb.copperLayers` exposes the resolved layer names and `pcb.layerCount` the count. `pcb.stackup()` still configures stackup materials and overrides the count.
  - Routing defaults now derive from the board's layer set: `pcb.route()` uses every declared copper layer when no `layers` are passed, through-hole pads are expanded to the board's layers for obstacle avoidance, and through vias block every copper layer they span.
  - Layer references are validated when the board is written — a zone, keepout, via, or route referencing an undeclared layer (e.g. `"In1.Cu"` on a 2-layer board, or a typo like `"f.cu"`) fails with an actionable error instead of producing a `.kicad_pcb` KiCad cannot load. `pcb.route()` rejects undeclared routing layers up front.
  - `track.via()` without an explicit span now always defaults to a through via (F.Cu→B.Cu) instead of guessing a blind span from the current layer.
  - `copperLayerNames`, `validateLayerCount`, `MAX_COPPER_LAYERS`, and `MIN_COPPER_LAYERS` are exported from the package root.

- ada1e65: Honest API surface, real impedance tolerance, and complete zone round-tripping in `typecad import`.

  - Differential pair routing is non-functional, so its phantom surface is gone: user net classes no longer get hard-coded `diff_pair_gap`/`diff_pair_via_gap`/`diff_pair_width` written into the `.kicad_pro` (KiCad's DRC had been enforcing geometry nobody chose — KiCad now fills its own defaults), and the dormant differential-pairs demo test is unwired while its code is kept for when coupled routing lands.
  - `impedance.tolerance` is now a real, optional option. With a tolerance, the solved trace width snaps to a 0.01mm fabrication grid whose achieved impedance stays within `target ± tolerance` (`widthForImpedanceWithinTolerance`, also exposed as `pcb.impedanceWidth(layer, target, tolerance)`); when the design-rule floor or an explicit width forces the trace outside the band, routing warns with the achieved impedance. `tolerance` was previously accepted and never used.
  - `typecad import` now round-trips zones and rule areas instead of silently dropping them: filled pours emit `pcb.zone({...})` with polygon `points`, the grouped `fill` object, thermal/pad-connection and island settings; rule areas emit `pcb.keepout({...})` with their per-category restrictions and `placement`. Unconnected pours (KiCad net 0) import without a net — `pcb.zone()` accordingly accepts an unconnected pour (neither `pin` nor `net`), while providing both is still an error.
  - Import review fixes: legitimate zero values survive parsing (`island_removal_mode 0` — "never remove islands" — was dropped by a truthiness check); `locked` zones detect KiCad's bare-atom form; `locked`, `filledAreasThickness`, and hatch outline settings are now emitted; and rule-area codegen emits only options `pcb.keepout()` actually accepts (KiCad-authored rule areas carry `min_thickness`/`fill` blocks that previously produced non-compiling code).
  - Removed the keepout `smoothing`/`smoothingRadius` options: they were serialized as zone-level `(smoothing ...)`, a token KiCad's parser rejects (verified against KiCad 10) — setting them produced unloadable boards.

- ada1e65: Late `component.pcb = { x, y }` assignment now accepts deferred placement values.

  - The `pcb` field is a resolving accessor: assignment takes `PlacementNumber` (e.g. `board(pcb).fromLeft(5)`), resolves against the component's footprint immediately, and validates finiteness — reads always return plain numbers, so every downstream consumer (serializer, autorouter, placement) stays type-clean. Previously only the constructor accepted placement values; assigning after construction was both a type error and silently stored the unresolved value.

- ada1e65: Relative placement is order-independent — no more call-order fore-knowledge.

  - `below()`, `above()`, `rightOf()`, `leftOf()` no longer bake the source component's position into a number at `.by()` time: every placement value re-reads the source's live position and bounds when resolved. Position a component relative to another _before_ either has its final position, and the relationship holds.
  - `board(pcb)` no longer snapshots the outline at call time — all properties (`center`, `left`, `fromTop()`, ...) are re-read on every access. `board()` can be called before `pcb.outline()`; values follow the final outline.
  - `sameAs(c).x/.y` return placement values (still assignable wherever a number was) that re-read the component's position at resolve time.
  - Components re-resolve their deferred placement expressions at `create()` (fixpoint over chains: `r3` below `r2` below `r1` settles regardless of assignment order). Manually moving a component after assigning an expression freezes that axis — the manual value wins.
  - `.by(gap, target)` now returns a deferred `PlacementValue` instead of an immediately-resolved number (assignable anywhere a `PlacementNumber` is expected; `resolvePlacement(value, footprint)` is exported for manual resolution).
  - `pcb` coordinates now accept the placement helpers directly: `j1.pcb = { x: sameAs(mh1), y: below(mh1) }` works without `.x` / `.by()` — a builder resolves with its default gap, and a `sameAs` result picks the axis being assigned. `PlacementInput` is the accepted union.
  - Edge-to-edge math is now origin-relative and rotation-faithful: footprint bounds carry the occupied box relative to the footprint origin (`minX/minY/maxX/maxY` — many origins are pin 1 or a corner, not the body center), and placement rotates the full box with the same transform KiCad uses for pads before computing edges. `below(mh1).by(0.1)` now yields exactly a 0.1mm physical gap for a rotated, off-center part like a terminal block — previously the gap was silently off by several mm. Create()-time re-resolution passes the component's rotation (fixed a bug where it re-resolved unrotated).

- ada1e65: Font selection for board text.

  - Component text layouts (`referenceLayout`, `valueLayout`, `fabLayout`, and `text` entries) accept `font` — a TrueType face name written as KiCad's `(face "Name")` inside the text effects. Omit it for KiCad's default stroke font. Example: `r1.referenceLayout = { x: 0, y: -1.5, font: 'Arial', bold: true }`.
  - Fixed `bold` and `italic` on component text being dead options: they are now emitted as the font-block symbols (previously accepted and silently dropped).
  - `pcb.text({ font })` already emitted `(face ...)` and is unchanged; both paths verified against the KiCad 10 parser.

- ada1e65: N-layer boards, phase 2: layer roles, net-class layer affinity, and a via manufacturing policy.

  - `pcb.plane(net, layer)` dedicates a copper layer to a net. At `create()` the plane is materialized as a board-covering filled zone on that layer (through-hole-only pad connections), and the layer is excluded from the autorouter's default routing layers. The plane extent comes from the board outline, so `pcb.outline()` must be called before `create()`; a layer can carry only one plane.
  - Net classes accept `layers: string[]` — preferred routing layers for the class's nets. The autorouter anchors the net's through-hole endpoints on the class's layer and favors it while routing. Layers must be declared copper layers; plane layers are ignored.
  - `pcb.viaPolicy({ type: 'through' | 'blind-buried', maxSpan? })` controls the spans of vias placed by the autorouter. The default is `through` (every router via spans F.Cu→B.Cu — the budget-fab-friendly choice); `blind-buried` lets the router use the exact layer pair a route transitions between, within `maxSpan` layer boundaries (default 2), falling back to through vias for deeper transitions. Previously inner-layer transitions always emitted blind/buried spans.
  - `IViaPolicy` is exported from the package root.

- ada1e65: Via stitching, teardrops, and arc graphics.

  - `pcb.stitch(net, options?)` ties a net across layers with a clearance-aware grid of vias — the standard way to connect outer-layer pours to inner planes. Candidates on a pitch grid over the board outline (inset by `margin`) or an explicit `area` are skipped when they would violate clearance against existing copper (pads, tracks, vias, zones, keepouts) on any layer the stitch spans; same-net pours and tracks never block (connecting through them is the point), while same-net pads/vias still enforce hole-to-hole spacing. Components block stitches regardless of net — including components that are only net-registered and not yet placed (discovered from the schematic) — so stitches never land on footprints. A partial `layers` span emits blind vias over exactly that span, and a pitch below via size + clearance is rejected. Options: `layers` (span, default all copper), `pitch` (default 1.5mm), `size`/`drill`, `area`, `margin`. Returns the number of vias placed.
  - `pcb.teardrops(options?)` reinforces track-to-via junctions. It writes KiCad's teardrop tool configuration (`teardrop_options`/`teardrop_parameters`, fixture-verified shape) to the `.kicad_pro`, and — for vias placed by the autorouter — generates the teardrop geometry itself as tapered side segments on each layer the via's tracks arrive and leave, part of the routed net. Options: `vias`/`throughHolePads`/`smdPads`/`trackEnds` targets, `shape: 'round' | 'rect'`, `maxLength` (default 1mm), `maxHeight` (default 2mm).
  - `pcb.arc({ start, mid, end, layer, width })` draws arcs on any board layer — KiCad's three-point arc definition — completing the graphics set alongside line/circle/rect/poly.
  - The `Default` net class seed in `.kicad_pro` output no longer carries hard-coded `diff_pair_*` values (matching the earlier fix for user classes).
  - Text blocks stitches: `pcb.text()` elements, component reference/value/fab text (explicit layouts, text entries, and the footprint's default positions — transformed for rotation and back-side placement), and reference designators all keep stitch vias off their bounding boxes on the side of the board they occupy.

- 8efc912: Rectangle-geometry APIs accept a `bounds` object — `pcb.board` passes straight through.

  - `pcb.zone()`, `pcb.keepout()`, `pcb.rect()`, and `pcb.stitch({ area })` accept `bounds`/`area` as a bounds-style rectangle: `{ left, top, width, height }` (e.g. `pcb.board`) or `{ x, y, width, height }`. `pcb.zone({ net: 'GND', bounds: pcb.board, layers: [...] })` replaces the field-by-field `x: board.left, y: board.top, width: board.width, height: board.height` mapping. Bounds shift with group offsets like the other geometry forms, and combining `bounds` with `points` or `x/y/width/height` is rejected. `IBoundsLike` is exported.

- ada1e65: N-layer boards, phase 3: stackup physics — material overrides, controlled-impedance routing, span-weighted via costs.

  - `pcb.stackup(n, { layers: { ... } })` accepts per-layer overrides (thickness, material, epsilon_r, loss_tangent, color) keyed by layer name — coppers (`"In1.Cu"`), dielectrics (`"dielectric 2"`), and masks. Overridden dielectric thickness is compensated by the remaining dielectrics so the board still totals `pcb.thickness`; unknown names and over-budget overrides throw with actionable messages.
  - Controlled impedance is now real: `pcb.impedanceWidth(layer, targetOhms)` computes the trace width for a target characteristic impedance from the board's resolved stackup geometry (microstrip on outer layers, symmetric stripline on inner). `pcb.route({ impedance: { target, tolerance } })` applies it automatically — the trace widens to hit the target, never below the design-rule floor. `impedanceOfWidth`, `widthForImpedance`, and `stackupImpedanceGeometry` are exported for custom calculations. Engineering-grade accuracy (typically within fab tolerance).
  - Under the `blind-buried` via policy the router's via cost now scales with the number of layer boundaries a transition crosses, so it prefers shallow blind/buried vias over deep ones.
  - Fixed a pre-existing docgen bug where stackup extraction (`extractStackup`) could not parse any board file — symbol-headed S-expression nodes were never matched, so the rendered stackup was always empty. Inner copper layers now parse correctly, and the gitdiff inner-layer detection (`detectInnerCopperLayers`) is covered by tests.

- ada1e65: `pcb.stitch()` is now declarative — no `pcb.add()` or ordering knowledge needed.

  - `pcb.stitch(net, options)` records a request (validating net, pitch, and layers at the call) and the vias are placed at `create()` time against the complete board contents. Every component passed to `create()` is visible to the stitcher — netted or not — so mounting holes and other mechanical parts no longer need `pcb.add()` beforehand, matching how `pcb.plane()` already works. Repeated `create()` calls replace previously placed stitch vias instead of duplicating them.
  - **Breaking**: `stitch()` no longer returns the via count (placement is deferred); count vias in the generated board if needed. Region errors (no outline and no `area`) surface at `create()` instead of at the call.

- 92bfaa1: Placement DX: targeted errors, live arithmetic, body-centering, bounds warnings.

  - Bad coordinate assignments now fail with actionable messages instead of cryptic ones — passing an un-called helper (`y: pcb.board.fromLeft` instead of `fromLeft(5)`) reports `pcb.y received the function "fromLeft" — did you mean to call it?`; strings, null, and keyless objects report the axis and what was received.
  - `PlacementValue.plus(n)` / `.minus(n)` return new deferred values — `x: pcb.board.sameAs(r1).x.plus(2)` nudges while staying live (re-resolves at `create()` if r1 moves). `sameAs(c).x/.y` are typed `PlacementValue` so the chain type-checks.
  - `pcb.board.centered()` returns `{ x, y }` placement values that center the component's occupied box (rotation- and origin-aware), unlike `board.center` which centers the origin point: `u1.pcb = { ...pcb.board.centered() }`.
  - A footprint whose bounds cannot be resolved (bad name/library path) warns once per name the first time any placement math uses it, instead of silently collapsing to zero-size.

- 327f04e: Footprint text overrides become fully optional and autocompletable. `TextEntry.property` now suggests the conventional KiCad property names (`Reference`, `Value`, `Footprint`, `Datasheet`, `Description`, `MPN`) while still accepting any custom name. All other entry fields (`text`, `x`, `y`, rotation, layer, font, visibility) are optional: omitted fields keep the footprint's own layout instead of being reset, and `show: false` on `referenceLayout`/`valueLayout` now actually hides the designator (three-state — omitting `show` leaves footprint visibility untouched). Via stitching no longer reserves avoidance boxes for hidden text, and text entries without a position no longer produce degenerate boxes.
- ada1e65: Zone property coverage: polygon geometry and previously dead or missing options.

  - `pcb.zone()` accepts its fill settings grouped in an optional `fill` object (mirroring KiCad's `(fill ...)` block): `mode`, `arcSegments`, `thermalGap`, `thermalBridgeWidth`, `smoothing`/`smoothingRadius`, `islandRemovalMode`/`islandAreaMin`, and the seven `hatch*` options. `fill: false` creates an unfilled zone outline. The existing flat fill options remain supported; when both are given, the `fill` object wins per field. `IZoneFillOptions` is exported from the package root.
  - `pcb.zone()` and `pcb.keepout()` accept an explicit polygon via `points` (≥ 3 vertices) as an alternative to the `x`/`y`/`width`/`height` rectangle — L-shaped and irregular pours/keepouts are now expressible. Providing both forms (or neither) is rejected with an error. The zone's bounding box fields stay consistent, so obstacle building and board math work identically.
  - `filledAreasThickness` is now serialized as `(filled_areas_thickness yes|no)` — it was accepted but silently dropped before.
  - `islandRemovalMode` now actually defaults to 2 (remove islands below `islandAreaMin`), matching the documented behavior; the value is emitted to the board.
  - Fixed hatched zones producing boards KiCad cannot load: the fill mode was serialized as `(mode hatched)`, but KiCad's parser only accepts `hatch` (or `polygon`/`segment`). Hatched zones now emit `(mode hatch)` — verified against the KiCad 10 parser.
  - Keepouts (rule areas) accept `placement` (also applies to footprints placed from a schematic sheet), serialized as `(placement (enabled ...) (sheetname ""))` — verified against the KiCad 10 parser.
  - `hatchWidth` is accepted as an alias of `hatchThickness` (flat and in the `fill` object) — KiCad's zone dialog labels the setting "Hatch width" while the file token is `hatch_thickness`; the file-token name wins when both are given at the same level.

### Patch Changes

- ada1e65: Via stitching keeps clear of mechanical footprints' full keep-clear zones.

  - `pcb.stitch()` body blockers now use the footprint's **full graphical extent** (pads + silkscreen/courtyard geometry, rotation-aware via `getFootprintBounds`) instead of the pad bounding box — a mounting hole's pad is drill-sized while its screw-head keep-clear zone is the footprint outline. Falls back to pad bounds when the footprint file can't resolve.
  - Netless components (`pcb.add()`ed mechanical parts like mounting holes) are now discovered for stitching via `schematic.components` — previously only net-referenced components were found, so parts with no net were invisible to the stitcher.

- Board viewer, built in: a zero-dependency Gerber (RS-274X) + Excellon parser now lives in this package (`@typecad/typecad/gerber-viewer` for programmatic use; `parseGerber`, `parseExcellon`, `detectLayer`, `renderSvg`, `buildViewerFromFiles`, `startGerberViewerServer`). The `gerber-viewer` CLI ships with the package: `gerber-viewer <dir> -o view.html` renders a self-contained interactive viewer, and `gerber-viewer serve` watches a project's `build/*.kicad_pcb`, re-exports gerbers via `typecad export`, and live-reloads the page on every `npm run build`. `typecad create` scaffolds every new project with a `gerber_viewer` npm script wired to it (http://localhost:4173); the generated `.gitignore` excludes `build/serve/` and the generated AGENTS.md documents the script.

## 1.0.0-alpha.1

### Major Changes

- #### No-postinstall package file sync

  Component packages no longer need an npm `postinstall` script to install their KiCad files. When a `Package` subclass is constructed during a build, typeCAD automatically syncs the package's bundled `build/lib/` (symbols, footprints, 3D models) into the project's `./build/lib/` — mtime-guarded so repeat builds skip unchanged files. Works with any package name, registry layout, `file:` dependencies, and monorepo links.

  - `Package` subclasses get the sync automatically in the constructor
  - Hand-rolled classes can call the new exported `syncThisPackageBuildLib()` helper
  - `typecad add package` no longer generates a `postinstall.js`

  #### Irregular board outlines

  New Edge.Cuts shape builders beyond the filleted rectangle:

  - `outlinePolygon(points)` — arbitrary polygon boards
  - `outlineCircle(cx, cy, r)` — circular boards
  - `cutout(points)` / `cutoutCircle(cx, cy, r)` — internal cutouts (milled slots, mounting holes)
  - `outlinePath(x, y)` builder with `.lineTo()`, `.arcTo()`, `.close()` for free-form mixed line/arc contours

  #### Fixes
  - Re-exported `Schematic` (restores the public API expected by `@typecad/passives/tie`)
  - `registerReference` is now idempotent — components constructed by a `Package` keep their references when `create()` registers them again, instead of being renamed
  - Schematic rendering: via components (which have no symbol by design) are skipped instead of erroring; net-label pin owners are backfilled for standalone `new Pin(...)` declarations; power-symbol lookups no longer warn for auto-generated net names
  - Updated dependencies: chalk 6, markdown-it 15 (types now bundled; `@types/markdown-it` removed), vitest 4, ESLint 10, changesets 3
