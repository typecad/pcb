<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
</script>

# Irregular board outlines

`pcb.outline()` gives you a filleted rectangle. Real boards are rarely rectangles: they have rounded corners, chamfers, mounting holes, and milled slots for enclosures. typeCAD now ships a full set of Edge.Cuts shape builders for exactly those cases.

## Polygons and circles

<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('board');

// arbitrary polygon board (e.g. a notched shield shape)
pcb.outlinePolygon([
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 50, y: 100 }, { x: 0, y: 80 },
]);

// circular board
pcb.outlineCircle(50, 50, 50);
```

</ScrollArea>

## Cutouts

Internal contours on Edge.Cuts are holes in KiCad, so cutouts are just nested closed shapes:

<ScrollArea orientation="both">

```ts
// milled slot / non-circular cutout
pcb.cutout([
  { x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 }, { x: 20, y: 40 },
]);

// mounting hole
pcb.cutoutCircle(25, 25, 3);
```

</ScrollArea>

## Free-form paths

For shapes made of mixed line and arc segments — think DXF-imported enclosures — use the `outlinePath()` builder:

<ScrollArea orientation="both">

```ts
pcb.outlinePath(140, 88)
  .lineTo(156, 88)                        // straight edge
  .arcTo(166, 98, { x: 164, y: 90 })      // rounded corner (three-point arc)
  .lineTo(166, 104)
  .arcTo(158, 110, { x: 165, y: 108 })
  .lineTo(146, 110)
  .lineTo(140, 102)                       // chamfer
  .lineTo(138, 94)
  .close();                               // auto-closes back to the start
```

</ScrollArea>

`close()` seals the builder and, if the path doesn't already end at its start point, adds the closing edge for you.

## Everything still works off the shape

The board bounds and the edge-relative placement helpers (`fromLeft`, `fromRight`, `fromTop`, `fromBottom`, and friends) are computed from the outline's bounding box, so component placement keeps working unchanged for any board shape.

See the [board layout docs](/docs/board_layout) for the full API.
