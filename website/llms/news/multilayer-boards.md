---
title: Multilayer boards, planes, and everything copper
description: N-layer stackups, planes, impedance control, polygon zones, via stitching, teardrops, and fonts
date: '2026-9-4'
categories:
  - tools
  - pcb
  - board
  - layers
  - routing
  - zones
published: true
---

# Boards grew a third dimension

This release makes the copper layer count a first-class citizen of a typeCAD board, and fills in the copper features around it: planes, controlled impedance, polygon zones, via stitching, teardrops, per-text fonts, and a zone-aware `typecad-pcb import`.

## The layer set is the source of truth

```ts
let pcb = new PCB('board', { layers: 4 });
pcb.copperLayers; // ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']
```

One number drives everything: routing defaults (the autorouter uses every declared copper layer), through-hole pad clearance (pads exist on every layer they should), via spans, and write-time validation — referencing a layer that isn't declared fails with an actionable error instead of producing a board KiCad can't open. Physical construction comes from `pcb.stackup()`, now with per-layer material overrides (`thickness`, `material`, `epsilon_r`, `loss_tangent`) that redistribute the remaining dielectric budget to keep the board at its total thickness.

## Planes

```ts
pcb.outline(0, 0, 60, 45);
pcb.plane('GND', 'In1.Cu');
pcb.plane('+3V3', 'In2.Cu');
```

A plane dedicates a whole layer to a net: at `create()` it becomes a board-covering filled zone (through-hole pads connect solid, SMDs reach it through vias), and the autorouter keeps signals off the layer. Net classes can claim preferred layers (`pcb.netClass('mem', { layers: ['In2.Cu'] })`) — through-hole nets anchor directly on the class's layer.

## Controlled impedance, now with tolerance

```ts
pcb.impedanceWidth('In1.Cu', 50);       // exact solved width
pcb.impedanceWidth('F.Cu', 50, 5);      // snapped to a 0.01mm fab grid within 50±5Ω
pcb.route(clk, { impedance: { target: 100, tolerance: 10 } });
```

Microstrip on outer layers, symmetric stripline on inner ones, computed from the board's resolved stackup. With a tolerance, the width snaps to a fabrication grid inside the band; if the design-rule floor forces the trace outside it, routing warns with the achieved impedance.

## Via policy

```ts
pcb.viaPolicy({ type: 'through' });                 // default: budget-fab-friendly
pcb.viaPolicy({ type: 'blind-buried', maxSpan: 2 }); // exact layer pairs, span-limited
```

Router vias follow a manufacturing policy instead of silently emitting buried vias for inner-layer transitions.

## Zones grew up

```ts
pcb.zone({
  net: 'GND', layers: ['F.Cu'],
  points: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 14 }, { x: 14, y: 14 }, { x: 14, y: 20 }, { x: 10, y: 20 }],
  fill: { mode: 'hatched', hatchWidth: 0.2, islandRemovalMode: 2 },
});
```

Arbitrary polygons (`points`), grouped fill settings mirroring KiCad's `(fill ...)` block, `filledAreasThickness` finally serialized, `islandRemovalMode` actually defaulting to 2, and rule areas with `placement`. Unconnected pours (no net) are legal. Keepouts take the same geometry.

## Via stitching

```ts
pcb.stitch('GND', { pitch: 1.5 }); // → number of vias placed
```

A clearance-aware grid of vias tying pours to planes. Candidates are skipped against pads, tracks, vias, zones, and keepouts on every layer the stitch spans — component footprints block regardless of net (even components that aren't placed yet), same-net pours never block, and a partial `layers` span emits blind vias over exactly that span.

## Teardrops

```ts
pcb.teardrops(); // writes KiCad's tool settings AND generates wedge geometry at router vias
```

Reinforced track-to-via junctions: the `.kicad_pro` opens preconfigured, and vias placed by the autorouter get real tapered wedge segments on each layer they connect.

## Fonts and arcs

```ts
r1.referenceLayout = { x: 0, y: -1.5, font: 'OCR A Std', bold: true };
pcb.arc({ start: { x: 10, y: 10 }, mid: { x: 13.5, y: 13.5 }, end: { x: 15, y: 10 }, layer: 'F.SilkS' });
```

TrueType faces on component text and `pcb.text()` (via KiCad's `(face ...)`), with `bold`/`italic` now actually emitted, plus three-point arcs completing the graphics set.

## `typecad-pcb import` keeps zones

Imported boards no longer silently lose their copper: pours emit as `pcb.zone()` with polygon geometry and fill settings, rule areas as `pcb.keepout()` with their restrictions, and stackups as `pcb.stackup(N)`.

## Verified against the parser

Every serializer token introduced here — `(face ...)`, `(mode hatch)`, `(filled_areas_thickness ...)`, `(placement ...)`, the `.kicad_pro` teardrop arrays — was probed against KiCad 10's parser before shipping, and the full demo board (planes, stitching, teardrops, hatched pours) loads cleanly. A few tokens that didn't survive verification (`custom_rule`, zone-level `smoothing`, `(mode hatched)`) were removed or fixed along the way.