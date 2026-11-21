# PCBWorld bench for the typecad autorouter

Routes [PCBWorld](https://github.com/LGAI-Research/PCBWorld) benchmark boards
(arXiv:2607.05915) with the typecad autorouter and scores them the way PCBWorld
does: KiCad's own DRC on the routed `.kicad_pcb`, so the router never grades
itself.

## Tiers

| Tier | Boards | Runs | Checker |
|---|---|---|---|
| **smoke** | 9 bundled PCBWorld fixtures | `npm test` (`smoke.test.ts`, ~45 s) | native DRC, plus kicad-cli when installed |
| **fixtures** | all 24 bundled fixtures, including known router gaps | `PCBWORLD_SET=fixtures npm run bench:pcbworld` | both |
| **d2a** | D2-A test split, 128 synthetic 2-layer boards | after `fetch.sh` | both |
| **d1-g\<N\>** | D1-shaped 1-layer grid boards, 128 per grid | after `fetch.sh --d1 "…"` | both |
| **d3a/b/c** | real PCBench boards, 99 / 10 / 10 test | after PCBWorld's own D3 prep | both |

All commands run from `@typecad/pcb/` (or add `-w @typecad/pcb` at the repo root).

```bash
# 1. generate the synthetic sets (clones PCBWorld at a pinned commit, runs its generator)
bash bench/pcbworld/fetch.sh --d1 "10 100 500"

# 2. route + score
PCBWORLD_SET=d2a npm run bench:pcbworld
PCBWORLD_SET=d1-g100 PCBWORLD_LIMIT=20 npm run bench:pcbworld
```

On PowerShell, set variables first: `$env:PCBWORLD_SET='d2a'; npm run bench:pcbworld`.

Each run writes `results/<set>/<timestamp>/`:
- `boards/*.kicad_pcb` + `.kicad_pro`: the routed boards. Open them in KiCad.
- `rows.jsonl`: one row per board (router view, native score, kicad-cli score).
- `summary.json` and `summary.md`: the aggregate, plus a per-board table.

### Settings (environment variables)

| Variable | Meaning | Default |
|---|---|---|
| `PCBWORLD_SET` | `smoke`, `fixtures`, `d2a`, `d1-g<N>`, `d3a`/`d3b`/`d3c`, or a dir/file path | `smoke` |
| `PCBWORLD_LIMIT` / `PCBWORLD_FILTER` | first N boards / path substring | all |
| `PCBWORLD_CHECKER` | `kicad`, `native`, `both` | `both` |
| `PCBWORLD_GRID` | router grid, mm | typecad's 0.1 |
| `PCBWORLD_TIME_MS` / `PCBWORLD_NET_MS` | per-search / per-net budgets | 15000 / 60000 |
| `PCBWORLD_BASELINE` | a previous `summary.json`; the run fails on a regression | none |
| `PCBWORLD_KEEP_WORK` | `1` keeps typecad's per-board build dirs and DRC reports | off |
| `KICAD_CLI` | path to kicad-cli, if it isn't found automatically | |
| `PCBWORLD_DATA_ROOT` | D3 only: root that holds `pcbench/exacad_sorted` | |

### Regression gating

```bash
PCBWORLD_SET=d2a npm run bench:pcbworld        # once, on main
cp bench/pcbworld/results/d2a/<stamp>/summary.json bench/pcbworld/baselines/d2a.json
PCBWORLD_SET=d2a PCBWORLD_BASELINE=bench/pcbworld/baselines/d2a.json npm run bench:pcbworld
```

The run fails if the clean-pass rate drops, routability drops by more than
0.5 points, or more boards crash. Wirelength and via count are reported but
don't gate, because a router can shorten copper just by leaving nets
unrouted.

## How a board is benched

1. **Read** (`lib/board.ts`) the input board:
   - footprints, pads (absolute position, copper layers, net) and the net table;
   - the Edge.Cuts contours: the outer one plus cutouts, with arcs flattened;
   - zones and keepouts;
   - the rules. These are the larger of the Default class and the board minimum, from the
     `.kicad_pro`. For raw generator output, they come from the legacy `net_class` block.
2. **Route** (`lib/route.ts`) through typecad's public API only:
   - Each footprint becomes a `Component`. Its pads are served from a generated library
     footprint in the build dir's `lib/footprints/`.
   - Nets are declared under their original names, and routed shortest span first with
     `pcb.route()`.
   - `pcb.create()` writes typecad's board, and the bench reads the copper back out of it.
3. **Check import fidelity.** Every input pad must appear in typecad's board at the same
   position, on the same copper and on the same net. If not, the row is `invalid` and excluded
   from scores, because the bench failed rather than the router.
4. **Splice** (`lib/splice.ts`):
   - Strip all tracks and vias from the *input* board and insert the router's copper.
   - Rewrite net references into the input's numbering.
   - Score this board, not typecad's own output. The outline, footprints and rules then stay
     exactly PCBWorld's.
5. **Score** (`lib/score.ts`):
   - `kicad-cli pcb drc --format json` runs against the board's own `.kicad_pro`. A project
     file is written from the board's rules when the input has none.
   - typecad's native DRC engine runs as well. Rows flag `checkerDisagree` when the two differ
     on clean pass.

## Metrics (PCBWorld `docs/METRICS.md`)

| Metric | Meaning |
|---|---|
| **CP** (clean pass) | fully connected **and** zero error-level DRC violations. The headline number. |
| **Rout.** | (R₀ − R) / R₀. R₀ = Σ(pads − 1) over nets; R = KiCad's remaining unconnected items. |
| **DRV** | error-level violations. Unconnected items are counted in Rout., not here. |
| **WL**, **Via** | routed copper length (mm), via count |

The typecad router is deterministic, so PCBWorld's @5 protocol (best of 5
rollouts) equals @1 and one rollout per board is enough. **Pot.** (potential
gain) is not computed: it needs PCBWorld's per-net violation weighting, which
isn't reproduced here. PCBWorld scores with KiCad 9.0.8. This bench uses
whatever kicad-cli is installed (10.x here), so absolute DRV counts can differ
slightly from the paper.

## Known gaps

**In the bench**
- Per-net net classes are not mapped yet. Every net routes with the Default class, and rows
  set `perNetClasses: true` when the board defines more classes. Most D3 boards do, so treat
  D3 numbers as provisional until this is done.
- Outlines drawn inside footprints are not read (`outline_in_footprint_board` →
  `invalid`).
- Single-pad nets are not declared to typecad because there is nothing to route.
- Copper graphics and zones that carry a net are not routing targets. The router only joins
  pads, so `zero_anchor_board` (a pad plus a net-tied `gr_circle`) stays unconnected.
- D1 here is the *D1-shaped* set from PCBWorld's `make_grid_dataset` recipe. The paper's own
  Jumanji instance arrays are not distributed.
- Native DRC limits:
- Native DRC: kicad-cli remains authoritative. The native engine now agrees with it on the
  fixture outlines (rect/poly/circle and line+arc chains) and cutouts; disagreements still
  show up per board as `checkerDisagree`.

**Router findings (fixtures set)**
- Fixed in this round, each with a regression test:
  - The router did not know the board edge: outlines were only staged at route time, so
    copper ignored the copper-to-edge rule and milled cutouts (14/22 clean before; all 11
    DRC errors were edge clearance).
  - Pads sharing a number in one footprint (connector shields) were one pin; only the first
    was routed. Every repeat is now a terminal.
  - An SMD pad on B.Cu inside a front-side footprint was written to F.Cu
    (`layer_sentinels_board`). Placement now flips layers like KiCad: front as authored,
    back swaps F/B.
  - `PadResolver` cached footprints by name, so same-named footprints shared pad geometry.
  - A placed part from one `PCB` acted as an obstacle in another board's routes in the same
    process.
- Open:
  - `diagonal_cross_board`'s 4 errors are its *own* pads touching the edge. The bench doesn't
    yet subtract violations already present on the bare board.
  - Long searches on coarse grids: `jumanji_grid10_*` (5 mm traces) routes 1-2 of 5 nets in
    3-5 min, and `corner_obstacle_board` (3 pads) fails after ~20 s, both on time budget.
## Data and licensing

- `fixtures/` holds PCBWorld test fixtures, redistributed under PCBWorld's BSD-3-Clause license
  (`fixtures/LICENSE`).
- `jumanji_grid*` are renamed copies of `tests/fixtures/jumanji/synth_1L_grid*_5net_v15/test/`.
- Generated data goes to `data/` and results to `results/`. Both are gitignored.
- D3 boards keep their upstream PCBench licenses and are never copied into this repo.
- PCBWorld commit pinned in `fetch.sh`: `57738250415db0d409f44aca36dd43af25432971`.
