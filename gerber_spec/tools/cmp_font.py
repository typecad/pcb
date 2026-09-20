BS = chr(92)

def extract(path):
    out = []
    for line in open(path, encoding="utf8", errors="replace"):
        s = line.strip()
        if not s.startswith('"'):
            continue
        end = s.find('"', 1)
        while end > 0 and s[end - 1] == BS and s[end - 2:end] != BS + BS:
            # count preceding backslashes for true escape boundary
            n = 0
            i = end - 1
            while i >= 0 and s[i] == BS:
                n += 1
                i -= 1
            if n % 2 == 1:
                end = s.find('"', end + 1)
            else:
                break
        if end < 0:
            continue
        # unescape: double backslash -> single
        raw = s[1:end]
        out.append(raw.replace(BS + BS, BS))
    return out

for name, p in [("10.0", r"C:\Users\justi\AppData\Local\Temp\ns10.cpp"), ("master", r"C:\Users\justi\AppData\Local\Temp\newstroke.cpp")]:
    strs = extract(p)
    print(name, "count:", len(strs))
    print(name, "S:", repr(strs[0x33]))  # 0x53 - 0x20
    print(name, "T:", repr(strs[0x34]))
