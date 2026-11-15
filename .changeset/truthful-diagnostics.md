---
'@typecad/pcb': patch
---

Diagnostics tell the truth: `query net`'s copper analysis is now geometric
(a track endpoint anywhere on a pad, a mid-span tee, and a via inside a
pad annulus all connect — the previous exact-coordinate unions read almost
every routed net as "1/N pins connected"), which also fixes `query
summary`'s bogus "unrouted nets" count on fully routed boards. `check`
lists each intentionally-open pin once (ERC owns no-net pins when it ran)
and gains a typecheck step (`tsc --noEmit`; `--skip-typecheck` to skip)
plus a `pcb.dnc(...)` hint on `pin_not_connected` — catching type errors
the tsx build would have run anyway. `drc --kicad` / `erc --kicad` now
print the engine that actually ran. MountingHole pads are auto-marked
do-not-connect so they stop failing ERC on every board.
