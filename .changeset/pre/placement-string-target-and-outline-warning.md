---
'@typecad/pcb': patch
---

Relative-placement fixes from a full end-to-end API exercise: footprint-string
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
