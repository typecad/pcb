#!/usr/bin/env bash
# Build the PCBWorld benchmark sets the bench routes, under bench/pcbworld/data/.
#
# PCBWorld does not distribute its synthetic boards — it ships the generator,
# and the boards are regenerated bit-for-bit from fixed seeds. This script
# clones PCBWorld (sparse, pinned commit) and runs that generator:
#
#   d2a        D2-A test split: 128 two-layer boards (4–6 nets, 2–5 pads/net),
#              exactly the paper's synth_2L_v2 test set (seed 9999, legacy seeding)
#   d1-g<N>    D1-shaped test split at grid N: 128 one-layer boards, 5 nets × 2 pads
#              (PCBWorld's make_grid_dataset recipe; the paper's own D1 arrays are
#              not distributed)
#
# D3 (the 677 real PCBench boards) needs PCBWorld's KiCad-9 pcbnew build and is
# prepared with their tools/quickstart/prepare_pcbench.sh (Linux); this script
# only fetches configs/datasets/d3.json so the bench can read that split.
#
# Usage:
#   bash bench/pcbworld/fetch.sh                    # d2a only
#   bash bench/pcbworld/fetch.sh --d1 "10 100 500"  # d2a + three D1 grids
#   PYTHON=python3.12 bash bench/pcbworld/fetch.sh
#
# Needs git and Python 3 (generator is stdlib-only). Re-running regenerates.
set -euo pipefail

PCBWORLD_SHA=57738250415db0d409f44aca36dd43af25432971
HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="${PCBWORLD_BENCH_DATA:-$HERE/data}"
SRC="$DATA/PCBWorld"
D2A_N=128
D1_GRIDS=""
D1_NETS=5

while [ $# -gt 0 ]; do
  case "$1" in
    --d1) D1_GRIDS="$2"; shift 2 ;;
    --d1-nets) D1_NETS="$2"; shift 2 ;;
    --d2a-n) D2A_N="$2"; shift 2 ;;
    -h|--help) sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
done

PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  for c in python3 python py; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(sys.version_info < (3, 9))' 2>/dev/null; then PY="$c"; break; fi
  done
fi
[ -n "$PY" ] || { echo "Python 3.9+ not found; set PYTHON=..." >&2; exit 1; }

run() { echo "+ $*" >&2; "$@"; }

# ── 1. PCBWorld at the pinned commit (generator + split files only) ─────────
if [ ! -d "$SRC/.git" ]; then
  mkdir -p "$DATA"
  run git clone --quiet --filter=blob:none --no-checkout https://github.com/LGAI-Research/PCBWorld.git "$SRC"
fi
run git -C "$SRC" sparse-checkout set --no-cone \
  /LICENSE /docs/METRICS.md /tools/datagen/synthetic_generator/ /configs/datasets/ /configs/drc/ \
  /experiments/kdd/configs/datasets/ /experiments/kdd/configs/drc/
run git -C "$SRC" fetch --quiet origin "$PCBWORLD_SHA" || true
run git -C "$SRC" checkout --quiet "$PCBWORLD_SHA"
GEN="$SRC/tools/datagen/synthetic_generator"

# ── 2. D2-A test split (generate_2layer_v2.sh's arguments, test side) ───────
OUT="$DATA/d2a/test"
rm -rf "$OUT"; mkdir -p "$OUT"
run "$PY" "$GEN/generate_synthetic_boards.py" \
  --n "$D2A_N" --seed 9999 --seed-mode legacy --out-dir "$OUT" \
  --mode grid --pitch-formula c+w --board-size-min 80.0 --board-size-max 120.0 \
  --clearance 0.3 --trace-width 0.3 --pad-size 2.4 --via-dia 1.2 --via-drill 0.6 \
  --num-layers 2 --thru-hole-prob 0.3 --central-frac 0.9 --nets-min 4 --nets-max 6 \
  --pads-per-net-min 2 --pads-per-net-max 5 --pads-per-net-weights 0.6,0.2,0.1,0.1 \
  --min-sep-formula four-pitch
echo "[fetch] d2a: $(ls "$OUT"/*.kicad_pcb | wc -l) boards in $OUT"

# ── 3. D1-shaped grids ───────────────────────────────────────────────────────
for G in $D1_GRIDS; do
  PREFIX="$DATA/d1/grid$G/gen"
  rm -rf "$DATA/d1/grid$G"; mkdir -p "$DATA/d1/grid$G"
  # generate_grid_boards.py resolves relative paths against the PCBWorld root;
  # an absolute prefix is used as-is
  run "$PY" "$GEN/generate_grid_boards.py" --grid "$G" --test-only --n-test 128 --seed-test 1 \
    --nets "$D1_NETS" --pins-per-net 2 --num-layers 1 --out-prefix "$PREFIX"
  mv "${PREFIX}_test" "$DATA/d1/grid$G/test"
  echo "[fetch] d1-g$G: $(ls "$DATA/d1/grid$G/test"/*.kicad_pcb | wc -l) boards"
done

echo "[fetch] done. Route them with:"
echo "  PCBWORLD_SET=d2a npm run bench:pcbworld -w @typecad/pcb"
