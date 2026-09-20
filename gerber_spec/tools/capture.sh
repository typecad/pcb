#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Phase 0 golden capture — replot the fixture boards with kicad-cli defaults
# and verify the output is deterministic modulo embedded timestamps.
#
# Reproduces golden/<board>/default exactly as documented in SPEC.md:
#   kicad-cli pcb export gerbers --output <dir> --check-zones <board>
#   kicad-cli pcb export drill   --output <dir>           <board>
#
# Usage: tools/capture.sh [path-to-kicad-cli]
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KC="${1:-C:/Program Files/KiCad/10.0/bin/kicad-cli.exe}"

if ! "$KC" --version >/dev/null 2>&1; then
  echo "kicad-cli not found at: $KC" >&2
  echo "pass the path explicitly: tools/capture.sh /path/to/kicad-cli" >&2
  exit 1
fi

echo "using $("$KC" --version 2>&1)"

# board-name -> path to .kicad_pcb (relative to gerber_spec root)
declare -A BOARDS=(
  [rd_skeleton]="boards/rd_skeleton/hw/build/rd_skeleton.kicad_pcb"
  [demo]="boards/demo/autoroute_test.kicad_pcb"
  [features]="boards/features/features.kicad_pcb"
)

# Strip embedded timestamps so back-to-back plots compare byte-for-byte.
strip_ts() {
  grep -v -e "CreationDate" \
          -e "G04 Created by" \
          -e "DRILL file KiCad" \
          -e "Created by KiCad" \
          "$1"
}

for name in "${!BOARDS[@]}"; do
  board="$ROOT/${BOARDS[$name]}"
  out="$ROOT/golden/$name/default"
  [ -f "$board" ] || { echo "missing board: $board" >&2; exit 1; }

  echo "== $name =="
  rm -rf "$out"
  mkdir -p "$out"
  "$KC" pcb export gerbers --output "$out" --check-zones "$board" >/dev/null
  "$KC" pcb export drill --output "$out" "$board" >/dev/null
  echo "plotted $(ls "$out" | wc -l) files -> golden/$name/default"

  # Determinism check: immediate replot must match with timestamps stripped.
  tmp="$ROOT/golden/$name/.verify"
  # keep $tmp for inspection on failure
  mkdir -p "$tmp"
  "$KC" pcb export gerbers --output "$tmp" --check-zones "$board" >/dev/null
  "$KC" pcb export drill --output "$tmp" "$board" >/dev/null
  bad=0
  for f in "$out"/*; do
    b="$(basename "$f")"
    if ! diff <(strip_ts "$f") <(strip_ts "$tmp/$b") >/dev/null 2>&1; then
      echo "  NON-DETERMINISTIC: $b" >&2
      bad=1
    fi
  done
  # keep $tmp for inspection on failure
  if [ "$bad" -eq 0 ]; then
    echo "  determinism: OK (timestamps-only delta)"
  else
    echo "  determinism: FAILED" >&2
    exit 1
  fi
done
