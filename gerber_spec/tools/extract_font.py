import json
import re

src = open(r"C:\Users\justi\AppData\Local\Temp\newstroke.cpp", encoding="utf8", errors="replace").read()
lines = re.findall(r'^\s*"((?:[^"\\]|\\.)*)",?\s*(?:/\*.*?\*/)?\s*$', src, re.M)
print("total", len(lines))
# unescape C++ escapes: font data only uses backslash itself
BS = chr(92)
sel = [s.replace(BS * 2, BS) for s in lines[:224]]
print("S now:", repr(sel[0x53 - 0x20]))
out = json.dumps(sel, separators=(",", ":"))
open(r"C:\typecad\pcb\@typecad\pcb\src\gerber_export\stroke_font_data.json", "w").write(out)
print("size", len(out))
