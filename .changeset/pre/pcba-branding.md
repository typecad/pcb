---
'@typecad/pcb': minor
---

The PCBA render gains a brand identity:

- A signature **typecad** theme — deep teal soldermask, champagne-gold pad finish, warm-white silk — available as `--theme typecad`; the classic green stays the default.
- Every render carries an **engineering title block** below the board: board name, date, dimensions, and a "made with typeCAD" wordmark in the theme's accent color. `--no-title-block` renders a clean image.
- `--style blueprint` draws the board as an **engineering drawing** instead of an assembled render: plain blueprint paper, the board and component outlines in ink strokes, thin outlined pads, drill marks, and the title block in drawing ink — designators come from the fab layer (KiCad places them out of the way), with synthetic labels only when the layer set has no fab layer. Element classes stay distinct: traces keep their real widths and zone pours render as explicit diagonal hatch lines clipped to the pour outline (plain geometry — SVG pattern fills rendered as a solid wash in exported files and as arbitrary colors in third-party viewers), with a faint boundary and a faint solid underlay so copper under a pour stays legible.
- The board viewer's switcher gains a third entry — **Blueprint view** — riding the same coordinate frame: pan/zoom, ruler, DRC markers, and cross-probing work there too.
- The blueprint draws like a fab drawing: **dimension lines** with extension lines and arrowheads measure the board's overall width (top) and height (left) against the stitched outline, and **crop-style corner extents ticks** mark the board's four corners.- The blueprint paper now extends to fully contain every drawing annotation on all four sides — dimension lines and their text above/left, corner extents ticks on every edge (previously the annotations ran past the paper edge onto the canvas), and an **info block** in the bottom-left corner lists the layers the drawing was built from, units and side, the generating version, and up to two parse warnings.
