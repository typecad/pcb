---
'@typecad/pcb': major
---

**`@typecad/typecad` is renamed to `@typecad/pcb`, and `@typecad/passives` is merged into it.** One package, one version line: the passives/typecad peer-pairing (and the ERESOLVE failures from mixing their stable and alpha lines) is structurally gone. Fresh projects install `tsx` + `@typecad/pcb` — nothing else.

Migration:

- `import ... from '@typecad/typecad'` → `from '@typecad/pcb'` (deep imports `/routing`, `/search`, `/diff`, `/docgen`, `/sexpr`, `/gerber-viewer` keep their paths under the new name)
- `npm install @typecad/pcb` replaces both `@typecad/typecad` and `@typecad/passives`

Passives are now built-in with a single-API redesign — sizes are constructor options, not import paths:

```ts
import { PCB, Resistor, LED } from '@typecad/pcb';

let r1 = new Resistor({ value: '10k' });                // 0603 (default)
let r2 = new Resistor({ value: '10k', size: '0805' });  // explicit size
```

- One import for everything; `size` is a typed union (`'0201' | '0402' | '0603' | '0805' | '1206' | '1210'`, Fuse excludes the two smallest) and an explicit `footprint` still always wins
- `Testpoint` → `TestPoint`, `Tie` → `NetTie` (now on standard `ComponentInit` — `pcb`/`sch` placement instead of `xy`)
- `Connector` gains a `series` preset (`'pin-header'` default, `'JST-SH'`) that templates symbol and footprint from `number`, so the pin count lives in one place only
- `Package` provides `this.passives` (0603) out of the box — the `{ passives: await import("@typecad/passives/0603") }` wiring is gone; shift a whole package with `{ passiveSize: '0805' }`, or override with `passiveFactory(size)`
- `typecad-pcb doctor` now flags legacy `@typecad/typecad`/`@typecad/passives` dependencies and points them at `@typecad/pcb`
