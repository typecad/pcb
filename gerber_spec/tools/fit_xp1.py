import re, json, math

g = open("golden/features/default/features-F_Silkscreen.gto").read()
pts = []
for m in re.finditer(r"X(-?\d+)Y(-?\d+)D0[12]", g):
    x, y = int(m.group(1)) / 1e6, -int(m.group(2)) / 1e6
    if 59.5 < x < 63.5 and 61.5 < y < 64.8:
        pts.append((x, y))
gold = []
for p in pts:
    if not gold or gold[-1] != p:
        gold.append(p)
print("golden XP1 pts:", len(gold), gold[:3])

data = json.load(open(r"C:\typecad\pcb\@typecad\pcb\src\gerber_export\stroke_font_data.json"))
def glyph(cp):
    s = data[cp - 0x20]
    startX = (ord(s[0]) - 82) / 21
    out = []
    i = 2
    while i + 1 < len(s):
        c0, c1 = s[i], s[i + 1]
        if c0 == " " and c1 == "R":
            i += 2
            continue
        out.append(((ord(c0) - 82) / 21 - startX, (ord(c1) - 82 - 8) / 21))
        i += 2
    width = (ord(s[1]) - ord(s[0])) / 21
    return out, width

# build my sequence for "XP1" at size 1x1 (sx=sy=1), advance = round(width*1e6)
seq = []
cursorX = 0.0
for ch in "XP1":
    pts_g, w = glyph(ord(ch))
    for (a, b) in pts_g:
        seq.append((cursorX + a, b))
    cursorX += round(w * 1e6) / 1e6
print("my seq pts:", len(seq), seq[:3])

# golden = rotate(mine + cursor) by 37 deg; solve cursor from first point
ang = math.radians(37)
ca, sa = math.cos(ang), math.sin(ang)
gx, gy = seq[0]
cx = gold[0][0] - (gx * ca - gy * sa)
cy = gold[0][1] - (gx * sa + gy * ca)
ok = 0
for (a, b), (X, Y) in zip(seq, gold):
    if abs(X - (cx + a * ca - b * sa)) < 3e-6 and abs(Y - (cy + a * sa + b * ca)) < 3e-6:
        ok += 1
print(f"angle=37: match {ok}/{min(len(seq), len(gold))} cursor=({cx:.4f},{cy:.4f}) anchor=(62,63) offset=({cx-62:.4f},{cy-63:.4f})")
