"""Strip filled_polygon blocks (balanced parens) for the zone-warning test."""
src = open("boards/features/features.kicad_pcb").read()

out = []
i = 0
removed = 0
while True:
    j = src.find("(filled_polygon", i)
    if j < 0:
        out.append(src[i:])
        break
    out.append(src[i:j])
    depth = 0
    k = j
    while k < len(src):
        c = src[k]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                break
        k += 1
    i = k + 1
    removed += 1
open("analysis/unfilled_test.kicad_pcb", "w").write("".join(out))
print(f"removed {removed} filled_polygon blocks; parens balanced:", "".join(out).count("(") == "".join(out).count(")"))
