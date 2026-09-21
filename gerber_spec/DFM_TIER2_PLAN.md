# DFM Tier 2 — implementation plan (SHIPPED)

> Status: steps 0–4 complete (paste_sliver deferred as planned). Key
> deviations from this plan, found during implementation: mask_web is a
> pairwise aperture GAP (the web is outside the aperture union — a width
> scan of the union finds nothing); narrowRegions is opening-based
> (X − erode includes boundary shells); spoke sampling must sit past the
> thermal void edge, not past the pad edge.

Tier 1 (shipped): track_dangling, hole_edge_clearance, drill_aspect_ratio,
acid_trap, edge_not_closed / edge_self_intersection, text_height /
text_thickness, silk_over_mask, via_in_pad. All advisory warnings,
conf-overridable, synthetic-fixture tested.

Tier 2 items share one new geometric primitive and two collector
extensions. Build order below is dependency-ordered; each step lands
with tests and a rd/demo regression run.

## Step 0 — the width primitive (unlocks copper_sliver + mask_web)

**Goal**: `narrowRegions(paths: Path[], widthNm: number): Array<{ path: Path; areaNm2: number }>`
— regions of `paths` whose local width is below `widthNm`.

Algorithm (erode-and-survive, clipper-only):
1. Deflate the region by `widthNm / 2` (`ClipperOffset` negative delta,
   jtRound — same tolerance class as the fill engine, 2 µm arcs).
2. Intersect the deflated region with the original: what survives has
   width ≥ `widthNm`; the ORIGINAL minus the survivor is the too-narrow
   part.
3. `narrow = original − survivor`, fragment into contours (PolyTree for
   hole-aware output), report each contour with area.

Accuracy note: deflation measures width *around* the medial axis, which
is exactly the fab-relevant quantity. Two params to tune: minimum
reportable sliver area (drop < 0.005 mm² noise) and the deflate step
(closed-form `widthNm/2` is enough — no iteration needed).

**Tests**: rect of width 0.08 (sliver at 0.1 threshold), width 0.15
(clean), dumbbell (wide pad + narrow neck reports only the neck),
region-with-hole (hole preserved).

## Step 1 — copper_sliver

- Input: per-layer items, same union-per-net as acid_trap (Step 0 in the
  tier-1 commit already builds `byNet` unioned paths — extract that into
  a helper `unionedCopperByNet(items)` reused by both checks).
- Check: `narrowRegions(unioned, min_copper_sliver_width)` (default
  0.1 mm, JLC no-surcharge class). Zone fills INCLUDED — a hatch line
  pinch is a real sliver — but only outer contours.
- Report: one violation per surviving fragment; items[0] = a net-named
  description + fragment centroid.
- KiCad parity: KiCad defines `copper_sliver` severity but its CLI does
  not emit it → advisory bucket in drc_native (already plumbed).

**Watch-outs**: thermal-relief spoke necks are intentionally narrow —
expect rd/demo noise on spoke roots; mitigate by exempting contours
whose centroid lies within `thermal_gap + spoke_width` of a same-net
pad center (we have `sameNet` positions in the collector).

## Step 2 — mask_web (solder mask sliver)

- Input: the per-side `apertures` array (built for solder_mask_bridge) —
  union all apertures per side into one region, then
  `narrowRegions(unioned, min_mask_web)`.
- Default `min_mask_web = 0.1` mm (typical fab web). Report fragments
  between adjacent pads; description names the two nearest apertures
  (find the two closest aperture centroids to the fragment).
- Paste variant (`paste_sliver`) is the identical code over the
  `F.Paste`/`B.Paste` aperture set — deferred until Step 5, reusing this
  exact function with a different layer token and default (0.2 mm for
  fine-pitch).

**Watch-outs**: NPTH pads with oversized mask openings are the usual
web offenders; apertures already include them.

## Step 3 — courtyard_overlap

- Collector extension: `collectCourtyard(root, side)` — reuse
  `collectSilkItems` machinery with layer token `F.Courtyard`/
  `B.Courtyard`, grouped by footprint ref (the `ref` field exists).
- Build per-footprint courtyard polygon: union that footprint's
  collected graphics into one region (footprints may draw courtyards as
  multiple rects/lines).
- Check: pairwise region intersection between different refs on the
  same side → `courtyard_overlap` (KiCad type id), items = both refs.
- Missing courtyard: `missing_courtyard` when a footprint contributes no
  courtyard graphics (KiCad severity exists; advisory here).
- O(n²) footprints is fine at typeCAD scales (≤ 100/boards we've seen);
  bbox prefilter first.

**Watch-outs**: `*.Courtyard` layer token; hidden `hide yes` courtyard
items still count (they're geometric, not visible silk).

## Step 4 — min_resolved_spokes (thermal integrity)

- The fill engine computes thermal voids analytically; add a return
  channel: `fillZone` already knows `sameNet` pad positions. New export
  `thermalSpokeStatus(root, zone, layer)` → per pad:
  which of the 4 spokes survive intersection with the cleared region.
- Simpler DRC-side alternative (preferred, keeps fill engine read-only):
  for each same-net pad, count connected copper directions by sampling
  the FILL REGION (already available as zone items' outer contours) at
  the 4 spoke angles — ray-sample 3 points per spoke; a spoke counts
  resolved when its samples are ≥ 2/3 inside fill copper.
- `min_resolved_spokes` default 2 (KiCad's own default). Below → the
  pad is effectively unconnected to the pour → warning, items = pad +
  zone.
- Solid boards only (hatched pours defer, same as connectivity).

## Step 5 — paste_sliver (optional, cheapest last)

Reuses Step 2's function on paste apertures; include only if a
fine-pitch fixture (0.4 mm QFP) is added to the demo. Otherwise defer.

## Sequencing & estimates

| Step | New code | Est. |
|------|----------|------|
| 0 width primitive + tests | `narrowRegions` in pcb_drc_engine (or a new geom module) | 0.5 day |
| 1 copper_sliver | check + union helper extraction + spoke-root exemption | 0.5 day |
| 2 mask_web | check over existing apertures | 0.5 day |
| 3 courtyard | collector reuse + pairwise check + missing_courtyard | 1 day |
| 4 spokes | ray-sampling against fill contours | 0.5–1 day |
| 5 paste_sliver | parameter reuse | 0.25 day |

Total ≈ 3–4 days of focused work. Steps 0–2 form a natural single PR
(one primitive, two checks); 3 and 4 are independent follow-ups.

## Validation strategy (no kicad-cli goldens exist for these)

1. Synthetic fixtures per check with hand-computed geometry (the tier-1
   pattern) — committed as vitest.
2. rd/demo regression: findings must be plausible on inspection (rd's
   deliberately-imperfect gallery should light up; demo lightly).
3. A/B pixel compare unaffected (these checks don't plot anything).
4. Advisory bucket in drc_native keeps kicad parity green by
   construction.

## Defaults (all conf-overridable via typecad.rules.json severities/keys)

- min_copper_sliver_width: 0.10 mm
- min_mask_web: 0.10 mm
- min_resolved_spokes: 2
- courtyard checks: on, `missing_courtyard` ignore-by-default (typeCAD
  footprints mostly ship without courtyards — avoid a warning wall;
  promote when the layout view starts writing them)
