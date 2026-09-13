---
'@typecad/pcb': patch
---

Reference-designator prefixes are now read from the symbol's `(property "Reference" ...)` — the same property KiCad editors use — instead of being guessed from the first letter of the footprint name. An ATtiny3227 in a QFN footprint now correctly becomes `U1` instead of `Q1`, with no code changes needed in existing projects.

Precedence, highest first:
1. an explicit `reference` (`new ATtiny3227_M('U1')` or `init.reference`)
2. an explicit `prefix` (`u1.prefix = 'U'` or `init.prefix`)
3. the symbol's Reference property, resolved through the global KiCad libraries or `<buildDir>/lib` (extends chains inherit the base symbol's prefix; results are cached per symbol)
4. the previous footprint-name heuristic, now only a fallback for components without a resolvable symbol

`typecad-pcb add component` / `add package` also pass the resolved symbol and prefix into the generated class through the `Component` init object (`super({ footprint, symbol, prefix })`), so correct designators survive even when the symbol library isn't installed at build time (e.g. CI).

Also fixes the designator being resolved too early: pin declarations as class fields (`PA0 = this.pin(1)`) used to read the reference before the constructor body could set the symbol, which forced the footprint-name fallback and produced wrong prefixes (Q1 for a QFN-packed MCU). `Pin.reference` and `Pin.uuid` are now resolved lazily through the owning component, so inference always happens after construction completes.

`resolveExtends` now returns a genuinely flattened symbol: graphics and pins from the extends-chain base, properties overridden by each derived level, and the node named after the requested `library:symbol` (with unit sub-symbols renamed to match). Previously the embedded `lib_symbols` entry carried the BASE symbol's name (an ATtiny3227 embedded as `ATtiny807-M`), so the placed symbol's `lib_id` had no matching definition and KiCad silently dropped the component from netlist export and ERC.
