# Zones and Keepout Areas

**type**CAD supports creating filled copper zones and keepout areas on your PCB. Zones are commonly used for ground pours and power planes.

## Filled Copper Zones

Create a filled copper zone (e.g., ground pour):

```ts
import { PCB } from '@typecad/pcb';

let pcb = new PCB('zone_example');

// Create a ground zone on the bottom copper layer
pcb.zone({
  net: 'GND',
  layers: ['B.Cu'],
  x: 0,
  y: 0,
  width: 50,
  height: 30,
});

pcb.create();
```

### Zone Options

- **net**: The net name for the zone (e.g., `GND`, `VCC`)
- **layers**: Array of copper layers (`['F.Cu']`, `['B.Cu']`, or inner layers)
- **x**, **y**: Position of the zone
- **width**, **height**: Dimensions of the zone

## Keepout Zones

Restrict routing and placement in specific areas:

```ts
import { PCB } from '@typecad/pcb';

let pcb = new PCB('keepout_example');

// Create a keepout zone (e.g., around a sensitive analog section)
pcb.keepout({
  layers: ['F.Cu', 'B.Cu'],
  x: 20,
  y: 10,
  width: 20,
  height: 15,
  restrictions: { tracks: true, vias: true, copperpour: true },
});

pcb.create();
```

### Keepout Options

- **layers**: Array of layers to apply the keepout to
- **x**, **y**: Position of the keepout zone
- **width**, **height**: Dimensions of the keepout zone
- **restrictions**: Object with boolean flags: `tracks`, `vias`, `copperpour`, `pads`, `footprints`

## Graphics

**type**CAD also supports drawing graphical elements on the PCB:

```ts
import { PCB } from '@typecad/pcb';

let pcb = new PCB('graphics_example');

// Draw a line
pcb.line({ start: { x: 0, y: 0 }, end: { x: 10, y: 10 }, layer: 'F.SilkS', width: 0.15 });

// Draw a circle
pcb.circle({ center: { x: 25, y: 25 }, radius: 5, layer: 'F.SilkS', width: 0.15 });

// Draw a rectangle
pcb.rect({ x: 0, y: 0, width: 20, height: 15, layer: 'Edge.Cuts', strokeWidth: 0.15 });

// Draw text
pcb.text({ text: 'REV 1.0', x: 5, y: 5, layer: 'F.SilkS', width: 1, height: 1 });

pcb.create();
```