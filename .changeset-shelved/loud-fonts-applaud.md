---
'@typecad/pcb': minor
---

Font selection for board text.

- Component text layouts (`referenceLayout`, `valueLayout`, `fabLayout`, and `text` entries) accept `font` — a TrueType face name written as KiCad's `(face "Name")` inside the text effects. Omit it for KiCad's default stroke font. Example: `r1.referenceLayout = { x: 0, y: -1.5, font: 'Arial', bold: true }`.
- Fixed `bold` and `italic` on component text being dead options: they are now emitted as the font-block symbols (previously accepted and silently dropped).
- `pcb.text({ font })` already emitted `(face ...)` and is unchanged; both paths verified against the KiCad 10 parser.
