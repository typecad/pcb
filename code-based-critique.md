# typeCAD package source code critique

**Session ID:** ses_1af8763b8ffe2fshZmX9RfEqxZ
**Created:** 5/22/2026, 9:15:42 AM
**Updated:** 5/22/2026, 9:20:24 AM

---

## User

critique @@typecad\typecad/ package. don't use readmes, documentation, or other explainer-type files. use the sourcecode as a basis. 

---

## Assistant

**Tool: read**

**Tool: read**

**Tool: read**

**Tool: read**

**Tool: read**

---

## Assistant

**Tool: task**

---

## Assistant

# Code Critique: `@typecad/typecad`

## Critical Issues

### 1. God Function: `createBoard()` (~1057 lines)
`pcb_board_creation.ts` contains a single function handling net merging, footprint creation, via generation, zone rendering, and serialization. This is the most critical code path for board output and has **zero dedicated tests**. Break it into focused sub-functions and add integration tests validating actual `.kicad_pcb` output.

### 2. CLI Tools Have `@ts-nocheck`
`create_project.ts`, `add-component/index.ts`, and `add-package/index.ts` all suppress TypeScript entirely. These are user-facing CLI tools operating with `any` types and zero type safety. Remove `@ts-nocheck` and type them properly.

### 3. Global Mutable State Everywhere
- `component.ts:28` — module-level `ReferenceCounter` singleton
- `component.ts:66-68` — `Component._activeCounter` is a static mutable field mutated by `Schematic.add()` and `Package`
- `kicad.ts:12` — eager `new Config()` at module load time
- `kicad.ts:235` — `kicad_cli_path` as module-level mutable export
- `pending_summary.ts:95` — process-global `PendingSummaryManager`
- `sexpr/sym.ts:1` — global intern cache

This creates hidden coupling and makes testing unreliable. Use dependency injection or context objects.

### 4. Pervasive Swallowed Errors
Empty `catch {}` blocks throughout `pcb_board_creation.ts` (lines 236, 266, 420, 445, 997-1024), `kicad.ts:209`, and `source_inspector.ts:144,213`. Silent failures make debugging nearly impossible.

## Architecture Problems

### 5. PCB/Schematic Ownership Confusion
`PCB` wraps `Schematic` and delegates `net()`, `named()`, `add()`, `erc()`, `bom()` to it, but the boundary is unclear. `Schematic.add()` mutates `Component._activeCounter` globally via try/finally, which is fragile.

### 6. Duplicated Types
- `PendingTypecadSummary` defined identically in `schematic.ts:56-64` and `pending_summary.ts:4-12`
- `SchematicNode` vs `ISchematicNode` in `schematic_visualizer_types.ts` and `types/schematic_types.ts`
- `SexprNode` in both `schematic_visualizer_types.ts` and `types/sexpr_types.ts`

### 7. `existingBoardElements: unknown[]`
`pcb_state.ts:25` and `pcb_board_context.ts:25` — the parsed board representation is `unknown[]`, forcing consumers throughout `pcb_board_creation.ts` to repeatedly cast to `SexprNode`. Define a proper type.

## Code Quality Issues

### 8. Massive CLI Duplication
`parseArguments()` is reimplemented nearly identically in all three CLI tools. Footprint/symbol source handling in `add-component` has 6 functions (`handleKicadSymbol`, `handleLocalSymbol`, etc.) with heavy structural duplication. Extract shared utilities.

### 9. Net Name Normalization Duplication
The same normalization pattern (lowercase, strip `/`, strip quotes) appears at least 4 times across `pcb_board_creation.ts` and `pcb_utils.ts`. Single utility function needed.

### 10. Unsafe Type Assertions
- `kicad_schematic_renderer.ts:85` — `as keyof Component` on a runtime-lowered string
- `kicad_schematic_renderer.ts:107` — forcing types through `as` for serialization
- `pcb_autoroute.ts:520` — double assertion `as unknown as ...`

### 11. Non-Deterministic Placement
`schematic_visualizer.ts:58` uses `Math.random()` for component placement, making output non-reproducible and testing unreliable. Use a seeded RNG.

### 12. Synchronous Blocking at Import Time
`kicad.ts:124-151` runs `execSync('flatpak info ...')` during module construction, which happens at import time. This blocks the event loop with a hidden filesystem/exec cost.

### 13. Deprecated but Not Removed
`schematic.ts:68-71` (`Components` getter/setter), `schematic.ts:45-48` (deprecated re-exports), `kicad.ts:234-235` (`kicad_cli_path`). Either remove or commit to keeping.

## Build & Packaging

### 14. Obfuscation as Publish Step
`package.json:36-37` — published npm package runs through `javascript-obfuscator`, meaning what's published differs from source. This blocks consumer debugging and is unusual for a package with `"license": "EULA"`.

### 15. Cross-Package Relative Import
`add-component/index.ts:18` imports from `../../../kipm/` — a cross-package dependency via relative path not reflected in `package.json`.

### 16. Hardcoded KiCAD Version Paths
`kicad.ts:67-75` lists versions 10.0, 9.0, 7.0, 8.0 — note 8.0 after 7.0 means it's unreachable if 7.0 exists. Ordering is fragile and requires code changes for every new KiCAD release.

## Test Gaps

| Untested Module | Lines |
|---|---|
| `pcb_board_creation.ts` | ~1057 |
| `contract.ts` | 341 |
| `symbol_library_manager.ts` | 337 |
| `kicad_schematic_renderer.ts` | 240 |

Tests that do exist for ERC rely on capturing `console.error` string output rather than structured results — brittle and hard to maintain.

## Priority Order
1. Break up `createBoard()`, add integration tests
2. Remove `@ts-nocheck` from CLI tools
3. Eliminate global mutable state
4. Audit and handle all empty `catch` blocks
5. Consolidate duplicated types and utilities
6. Add proper types for board elements

---

