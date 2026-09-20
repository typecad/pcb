"""Generate a large synthetic board for exporter benchmarking.

Structure mirrors the (kicad-cli-validated) rot_probe layout: 4 copper
layers, footprints with mixed pad shapes, tracks on several layers, vias,
zone, stroke texts. Everything kicad-cli 10 accepts.
"""
import random
import sys

random.seed(42)

N_FP = int(sys.argv[1]) if len(sys.argv) > 1 else 800
N_TRK = int(sys.argv[2]) if len(sys.argv) > 2 else 4000
N_VIA = int(sys.argv[3]) if len(sys.argv) > 3 else 400
out = sys.argv[4] if len(sys.argv) > 4 else "analysis/bench_big.kicad_pcb"

W, H = 300, 220
COLS = 25
fps = []
for i in range(N_FP):
    cx = 10 + (i % COLS) * (W - 20) / COLS
    cy = 12 + (i // COLS) * 12
    rot = (i * 37) % 360
    shape = ["rect", "roundrect", "oval", "circle"][i % 4]
    extra = ""
    if shape == "roundrect":
        extra = " (roundrect_rratio 0.25)"
    fps.append(
        f'''  (footprint "BENCH:FP{i}" (layer "F.Cu") (property "Reference" "U{i}" (at 0 0 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15)))) (at {cx:.3f} {cy:.3f} {rot})
    (pad "1" smd {shape} (at -1 0 {rot}) (size 0.8 1.2) (layers "F.Cu" "F.Mask" "F.Paste"){extra} (net {1 + i % 20} "n{i % 20}"))
    (pad "2" smd {shape} (at 1 0 {rot}) (size 0.8 1.2) (layers "F.Cu" "F.Mask" "F.Paste"){extra} (net {1 + (i + 1) % 20} "n{(i + 1) % 20}"))
    (fp_line (start -2 -1.5) (end 2 -1.5) (stroke (width 0.12) (type solid)) (layer "F.SilkS"))
    (fp_line (start 2 -1.5) (end 2 1.5) (stroke (width 0.12) (type solid)) (layer "F.SilkS"))
    (fp_line (start 2 1.5) (end -2 1.5) (stroke (width 0.12) (type solid)) (layer "F.SilkS"))
    (fp_line (start -2 1.5) (end -2 -1.5) (stroke (width 0.12) (type solid)) (layer "F.SilkS"))
    (fp_rect (start -2.2 -1.7) (end 2.2 1.7) (stroke (width 0.05) (type solid)) (layer "F.CrtYd"))
  )'''
    )

tracks = []
layers = ["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"]
for i in range(N_TRK):
    x = random.uniform(8, W - 8)
    y = random.uniform(8, H - 8)
    dx = random.uniform(-4, 4)
    dy = random.uniform(-1.5, 1.5)
    tracks.append(
        f"  (segment (start {x:.3f} {y:.3f}) (end {x + dx:.3f} {y + dy:.3f}) (width 0.25) (layer \"{layers[i % 4]}\") (net {1 + i % 20}))"
    )

vias = []
for i in range(N_VIA):
    x = random.uniform(8, W - 8)
    y = random.uniform(8, H - 8)
    vias.append(
        f'  (via (at {x:.3f} {y:.3f}) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net {1 + i % 20}))'
    )

texts = []
for i in range(150):
    x = random.uniform(10, W - 10)
    y = random.uniform(5, H - 5)
    texts.append(
        f'  (gr_text "BENCH{i}" (at {x:.3f} {y:.3f} 0) (layer "F.SilkS") (effects (font (size 1.2 0.9) (thickness 0.2))))'
    )

nets = "\n".join(f'  (net {n} "n{n - 1}")' for n in range(1, 21))

board = f"""(kicad_pcb (version 20241229) (generator "bench")
  (general (thickness 1.6) (legacy_teardrops no))
  (paper "A4")
  (layers (0 "F.Cu" signal) (4 "In1.Cu" signal) (6 "In2.Cu" signal) (31 "B.Cu" signal)
    (9 "F.Adhes" user "F.Adhesive") (11 "B.Adhes" user "B.Adhesive") (13 "F.Paste" user)
    (15 "B.Paste" user) (5 "F.SilkS" user "F.Silkscreen") (7 "B.SilkS" user "B.Silkscreen")
    (1 "F.Mask" user) (3 "B.Mask" user) (17 "Dwgs.User" user "User.Drawings")
    (19 "Cmts.User" user "User.Comments") (21 "Eco1.User" user "User.Eco1")
    (23 "Eco2.User" user "User.Eco2") (25 "Edge.Cuts" user) (27 "Margin" user)
    (31 "F.CrtYd" user "F.Courtyard") (29 "B.CrtYd" user "B.Courtyard") (35 "F.Fab" user)
    (33 "B.Fab" user) (39 "User.1" user) (41 "User.2" user) (43 "User.3" user) (45 "User.4" user))
  (setup (stackup (layer "F.SilkS" (type "Top Silk Screen") (color "White") (material "Liquid Photo")) (layer "F.Paste" (type "Top Solder Paste")) (layer "F.Mask" (type "Top Solder Mask") (color "Green") (thickness 0.01) (material "Dry Film") (epsilon_r 3.3) (loss_tangent 0)) (layer "F.Cu" (type "copper") (thickness 0.035)) (layer "dielectric 1" (type "prepreg") (color "FR4 natural") (thickness 0.22) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02)) (layer "In1.Cu" (type "copper") (thickness 0.035)) (layer "dielectric 2" (type "core") (color "FR4 natural") (thickness 1) (material "FR4") (epsilon_r 4.3) (loss_tangent 0.02)) (layer "In2.Cu" (type "copper") (thickness 0.035)) (layer "dielectric 3" (type "prepreg") (color "FR4 natural") (thickness 0.22) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02)) (layer "B.Cu" (type "copper") (thickness 0.035)) (layer "B.Mask" (type "Bottom Solder Mask") (color "Green") (thickness 0.01) (material "Dry Film") (epsilon_r 3.3) (loss_tangent 0)) (layer "B.Paste" (type "Bottom Solder Paste")) (layer "B.SilkS" (type "Bottom Silk Screen") (color "White") (material "Liquid Photo")) (copper_finish "None") (dielectric_constraints no)))
  (net 0 "")
{nets}
{chr(10).join(fps)}
{chr(10).join(tracks)}
{chr(10).join(vias)}
  (zone (net 1) (net_name "n0") (layers "In1.Cu") (hatch edge 0.508) (polygon (pts (xy 5 5) (xy {W - 5} 5) (xy {W - 5} {H - 5}) (xy 5 {H - 5}))))
{chr(10).join(texts)}
  (gr_line (start 0 0) (end {W} 0) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start {W} 0) (end {W} {H}) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start {W} {H}) (end 0 {H}) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 0 {H}) (end 0 0) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
)
"""

with open(out, "w", newline="\n") as f:
    f.write(board)
print(f"wrote {out}: {len(board) / 1e6:.1f} MB, {N_FP} fps, {N_TRK} tracks, {N_VIA} vias")
