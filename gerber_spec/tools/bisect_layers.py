import re

feat = open("boards/features/features.kicad_pcb").read()
rp = open("boards/rot_probe/rot_probe.kicad_pcb").read()
pat = re.compile(r"\(\s*layers[\s\S]*?User\.4\" user\s*\)\s*\)")
fl = pat.search(feat).group(0)
out = pat.sub(lambda m: fl, rp, count=1)
open("analysis/bisect3.kicad_pcb", "w").write(out)
print("swapped, head:", out[:120].replace("\n", " ")[:100])
