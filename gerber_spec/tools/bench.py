"""Speed benchmark: native typeCAD gerber exporter vs kicad-cli 10.0.0.

Measures the full fabrication set (gerbers + drill [+ job]):
  kicad-full : kicad-cli gerbers --check-zones + drill (pipeline parity)
  kicad-plain: kicad-cli gerbers (no refill) + drill
  native-cold: tsx process spawn, one export (what the CLI pays today)
  native-warm: in-process median of 7 (library steady state)
"""
import statistics
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KC = r"C:/Program Files/KiCad/10.0/bin/kicad-cli.exe"

BOARDS = [
    ("features (4L, small)", ROOT / "boards/features/features.kicad_pcb"),
    ("rd_skeleton (2L, pours)", ROOT / "boards/rd_skeleton/hw/build/rd_skeleton.kicad_pcb"),
    ("demo (4L)", ROOT / "boards/demo/autoroute_test.kicad_pcb"),
    ("synthetic (4L, 800fp)", ROOT / "analysis/bench_big.kicad_pcb"),
]


def run_median(cmd, n, cwd):
    times = []
    for _ in range(n):
        t0 = time.perf_counter()
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, shell=True)
        if r.returncode != 0 and "Plotted" not in r.stdout and "Created" not in r.stdout:
            raise RuntimeError(f"{cmd}: {r.stderr[:200]}")
        times.append(time.perf_counter() - t0)
    return statistics.median(times)


for label, board in BOARDS:
    d = board.parent
    print(f"== {label} ==")
    kicad_full = run_median(
        f'"{KC}" pcb export gerbers --output _b1 --check-zones "{board.name}" && "{KC}" pcb export drill --output _b1 "{board.name}"',
        3,
        d,
    )
    kicad_plain = run_median(
        f'"{KC}" pcb export gerbers --output _b2 "{board.name}" && "{KC}" pcb export drill --output _b2 "{board.name}"',
        3,
        d,
    )
    native_cold = run_median(
        f'npx tsx "{ROOT / "tools/bench_native.ts"}" "{board}" once', 3, ROOT.parent
    )
    native_warm = float(
        subprocess.run(
            f'npx tsx "{ROOT / "tools/bench_native.ts"}" "{board}" warm 7',
            cwd=ROOT.parent,
            capture_output=True,
            text=True,
            shell=True,
        ).stdout.strip()
    )
    print(f"  kicad-cli (refill+drill) : {kicad_full:7.3f} s")
    print(f"  kicad-cli (plain+drill)  : {kicad_plain:7.3f} s")
    print(f"  native cold (tsx spawn)  : {native_cold:7.3f} s   ({kicad_full / native_cold:.1f}x vs refill)")
    print(f"  native warm (in-process) : {native_warm:7.3f} s   ({kicad_full / native_warm:.1f}x vs refill)")
