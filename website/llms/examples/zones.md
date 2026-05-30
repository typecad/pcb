# Zones and Keepout Areas

**type**CAD supports creating filled copper zones and keepout areas on your PCB. Zones are commonly used for ground pours and power planes.

## Filled Copper Zones

Create a filled copper zone (e.g., ground pour):

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('zone_example');

// Create a ground zone on the bottom copper layer
pcb.zone({
  net: 'GND',
  layer: 'B.Cu',
  outline: [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 30 },
    { x: 0, y: 30 },
  ],
});

pcb.create();
```

### Zone Options

- **net**: The net name for the zone (e.g., `GND`, `VCC`)
- **layer**: Copper layer (`F.Cu`, `B.Cu`, or inner layers)
- **outline**: Array of `{x, y}` points defining the zone boundary

## Keepout Zones

Restrict routing and placement in specific areas:

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('keepout_example');

// Create a keepout zone (e.g., around a sensitive analog section)
pcb.keepout({
  outline: [
    { x: 20, y: 10 },
    { x: 40, y: 10 },
    { x: 40, y: 25 },
    { x: 20, y: 25 },
  ],
  tracks: true,
  vias: true,
  copper: true,
});

pcb.create();
```

### Keepout Options

- **outline**: Array of `{x, y}` points defining the keepout boundary
- **tracks**: Keep tracks out of this area
- **vias**: Keep vias out of this area
- **copper**: Keep copper fills out of this area

## Graphics

**type**CAD also supports drawing graphical elements on the PCB:

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('graphics_example');

// Draw a line
pcb.line({ start: { x: 0, y: 0 }, end: { x: 10, y: 10 }, layer: 'F.SilkS', width: 0.15 });

// Draw a circle
pcb.circle({ center: { x: 25, y: 25 }, radius: 5, layer: 'F.SilkS', width: 0.15 });

// Draw a rectangle
pcb.rect({ start: { x: 0, y: 0 }, end: { x: 20, y: 15 }, layer: 'Edge.Cuts', width: 0.15 });

// Draw text
pcb.text({ text: 'REV 1.0', at: { x: 5, y: 5 }, layer: 'F.SilkS', size: 1 });

pcb.create();
```