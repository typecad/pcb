"""Convert the public-domain Hershey 'futural' stroke font (single-stroke
engineering lettering, created at the US National Bureau of Standards;
public domain per https://lwn.net/Articles/6566641/) into the typeCAD
gerber exporter's glyph format.

Source: techninja/hersheytextjs hersheytext.json (MIT packaging; font data
itself is public domain). SVG-style y-down paths; normalized here into the
exporter's glyph frame: cap box y in [-0.95 .. +0.05] (baseline -0.95),
x from 0, advance widths in cap-height units (Hershey 21-unit grid / 21).
"""

import json
import re
import sys

SRC = r"C:\Users\justi\AppData\Local\Temp\hershey.json"
OUT = (
    r"C:\typecad\pcb\@typecad\pcb\src\gerber_export\stroke_font_data.json"
    if len(sys.argv) < 2
    else sys.argv[1]
)

CAP = 21.0  # hershey cap-height grid units
Y_BASE = 22.0  # y_svg of the baseline (y-down frame)


def parse_path(d):
    """SVG path shorthand: M x,y L x,y x,y ... M ... — returns contours."""
    contours = []
    cur = []
    pos = 0
    for m in re.finditer(r"([ML])\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)", d):
        x, y = float(m.group(2)), float(m.group(3))
        if m.group(1) == "M":
            if cur:
                contours.append(cur)
            cur = []
        cur.extend((x, y))
        pos = m.end()
        # implicit continued line-tos: bare "x,y" pairs after this L
        while True:
            n = re.match(r"\s+(-?[\d.]+)\s*,\s*(-?[\d.]+)", d[pos:])
            if not n:
                break
            cur.extend((float(n.group(1)), float(n.group(2))))
            pos += n.end()
    if cur:
        contours.append(cur)
    return contours


data = json.load(open(SRC))
chars = data["futural"]["chars"]

glyphs = [None] * 95  # index = ascii - 32 (U+0020..U+007E)
glyphs[0] = [round(16 / CAP, 4), []]  # space advance ≈ newstroke's 0.76

for i, ch in enumerate(chars):
    code = 33 + i
    if code > 126:
        break
    left = float(ch["o"])
    contours = parse_path(ch["d"])
    if not contours:
        continue
    xs = [p for c in contours for p in c[0::2]]
    right = max(xs)
    # advance: glyph extent + a 4-unit (≈0.19 em) inter-letter gap
    width = round((max(right - left, 3.0) + 4.0) / CAP, 4)
    norm = []
    for c in contours:
        pts = []
        for j in range(0, len(c), 2):
            x = round((c[j] - left) / CAP, 4)
            y = round(-0.95 + (Y_BASE - c[j + 1]) / CAP, 4)
            pts.extend((x, y))
        norm.append(pts)
    glyphs[code - 32] = [width, norm]

missing = [chr(32 + i) for i, g in enumerate(glyphs) if g is None]
assert not missing, f"missing glyphs: {missing}"

out = json.dumps(glyphs, separators=(",", ":"))
open(OUT, "w").write(out)
print(f"wrote {OUT}: {len(out)} bytes, {len(glyphs)} glyphs (U+0020–U+007E)")

# sanity: 'H' should span the full cap box
H = glyphs[ord("H") - 32]
ys = [p for c in H[1] for p in c[1::2]]
print(f"H: width={H[0]} y-range [{min(ys)}, {max(ys)}]")
