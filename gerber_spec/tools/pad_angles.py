import re, sys

src = open(sys.argv[1]).read()
starts = [m.start() for m in re.finditer(r'\(\s*footprint\s+"', src)] + [len(src)]
for i in range(len(starts) - 1):
    chunk = src[starts[i]:starts[i + 1]]
    at = re.search(r'\)\s*\(\s*at\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\)', chunk)
    if not at:
        continue
    rot = at.group(3)
    pads = re.findall(r'\(\s*pad\s+"[^"]*"\s+\w+\s+\w+\s+\(at\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\)', chunk)
    if rot != '0':
        print(f"fp_rot={rot:>6}  pads={len(pads):>3}  pad_angles={[p[2] for p in pads[:4]]}")
