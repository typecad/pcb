import re, json

# golden sequence: strokes of the first glyph (before first G36), board frame
src = open("golden/features/default/features-F_Silkscreen.gto").read().replace("\r\n", "\n")
pts = []
for m in re.finditer(r"X(-?\d+)Y(-?\d+)D0[12]", src):
    x, y = int(m.group(1)) / 1e6, -int(m.group(2)) / 1e6
    if 45 < y < 51 and 48 < x < 58:
        pts.append((x, y))
# dedupe consecutive repeats -> contour point list
gold = []
for p in pts:
    if not gold or gold[-1] != p:
        gold.append(p)
print("golden pts:", len(gold))
print("golden first 6:", gold[:6])

# my decoded S contour
data = json.load(open(r"C:\typecad\pcb\@typecad\pcb\src\gerber_export\stroke_font_data.json"))
s = data[0x53 - 0x20]
startX = (ord(s[0]) - 82) / 21
endX = (ord(s[1]) - 82) / 21
width = endX - startX
mine = []
i = 2
while i + 1 < len(s):
    c0, c1 = s[i], s[i + 1]
    if c0 == " " and c1 == "R":
        i += 2
        continue
    mine.append(((ord(c0) - 82) / 21 - startX, (ord(c1) - 82 - 8) / 21))
    i += 2
print("my pts:", len(mine), "width", width)
print("my first 6:", [(round(a, 4), round(b, 4)) for a, b in mine[:6]])

# golden rel to (cursorX, cursorY): try candidate scales and directions
for sx, sy, yneg, rev in [(0.8, 1.5, 1, False), (0.8, 1.5, -1, False), (0.8, 1.5, 1, True), (0.8, 1.5, -1, True)]:
    m = mine[::-1] if rev else mine
    # align on first point to derive cursor
    gx, gy = m[0]
    cx = gold[0][0] - gx * sx
    cy = gold[0][1] - gy * sy * yneg
    ok = 0
    for (a, b), (X, Y) in zip(m, gold):
        if abs(X - (cx + a * sx)) < 3e-6 and abs(Y - (cy + b * sy * yneg)) < 3e-6:
            ok += 1
    print(f"sx={sx} sy={sy} yneg={yneg} rev={rev}: match {ok}/{min(len(m), len(gold))} cursor=({cx:.4f},{cy:.4f})")
