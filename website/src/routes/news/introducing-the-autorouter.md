---
title: Introducing the Auto Router
description: Let TypeCAD handle the tracks while you focus on the architecture
date: '2026-05-10'
categories:
  - features
  - routing
  - automation
published: true
cover: https://images.unsplash.com/photo-1518770660439-4636190af475?w=640
---
<br />

# Introducing the Auto Router

We are excited to announce the release of the TypeCAD Auto Router. We are referring to it as MAST, a combination of the algorithms it uses under the hood: Minimum Spanning Tree and A* Star.

 This new feature takes the manual labor out of PCB layout by automatically generating tracks between your connected pins. Now you can focus on your system architecture and let code handle the physical routing. It is still in early stages, but should be useful for simple boards.

### Smart Pathfinding

The auto router uses a grid-based A* search algorithm to find valid paths on your board. It automatically detects obstacles like component pads and existing tracks, navigating around them to make successful connections.

For complex nets with multiple points, the router constructs a Minimum Spanning Tree to ensure efficient routing without creating unnecessary loops.

### How to Use It

Using the auto router is straightforward. Once you have defined your components and created a net, simply call `route()` on your PCB instance.

```ts
import { PCB } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0805';

let typecad = new PCB('autoroute_example');

// Define and place components
let r1 = new Resistor({ value: '1kohm', reference: 'R1' });
let r2 = new Resistor({ value: '1kohm', reference: 'R2' });
r1.pcb = { x: 10, y: 10, rotation: 0 };
r2.pcb = { x: 20, y: 10, rotation: 0 };

// Create a net
const signal_net = typecad.named('signal').net(r1.pin(1), r2.pin(1));

// Route it!
typecad.route(signal_net);

typecad.create(r1, r2);
```

### Under the Hood

The router operates by dividing the board into a fine grid and searching for paths cell by cell. If a net fails to route due to congestion, you can increase the grid resolution to give the router more freedom to find complex paths.

We are looking forward to seeing the designs you build with this new capability!
