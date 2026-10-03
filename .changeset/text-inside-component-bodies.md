---
'@typecad/pcb': patch
---

Layout view: silk/fab text inside a component body is clickable, selectable, and draggable again. Three things stacked to swallow those presses, each fixed:

- The layout overlay's invisible part handles sit above every layer, and courtyard/mask ink renders above silk — a part drag now first walks the hit-test stack beneath the overlay and hands the press to a claimed text stroke (`data-text`) when one is under the pointer. Shift still forces the part grab, and double-clicks delegate the same way (text edits the text, not the part value).
- Drill holes render above silk/fab with no handler of their own — they are the absence of material, so they now carry `pointer-events="none"` and presses pass through to the ink beneath.
- Unattributed ink with no handler (the last fallthrough before box-select) also delegates to a claimed text beneath it, as a safety net.

`elementsFromPoint` is guarded for non-browser harnesses (jsdom), where it does not exist.
