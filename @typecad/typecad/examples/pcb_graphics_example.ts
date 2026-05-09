import { PCB, Schematic, Component } from '../index.js'

// Create a simple schematic
const schematic = new Schematic('graphics_example')

// Create a minimal component
const U1 = new Component({ reference: 'U1', value: 'Connector', footprint: 'Pin_Header_1x02' })

schematic.add(U1)
schematic.named('GND').net(U1.pin(1))

// Create the PCB
const pcb = new PCB('graphics_example', {
  Schematic: schematic
})

// ============================================
// GRAPHICAL LINES
// ============================================

// Basic line on front silkscreen
pcb.line({
  start: { x: 0, y: 0 },
  end: { x: 20, y: 0 }
})

// Diagonal line with custom width
pcb.line({
  start: { x: 0, y: 5 },
  end: { x: 20, y: 15 },
  width: 0.25,
  layer: 'F.SilkS'
})

// Locked line on edge cuts (board outline)
pcb.line({
  start: { x: 0, y: 100 },
  end: { x: 100, y: 100 },
  layer: 'Edge.Cuts',
  width: 0.1,
  locked: true
})

// Line on back silkscreen
pcb.line({
  start: { x: 25, y: 0 },
  end: { x: 45, y: 0 },
  layer: 'B.SilkS',
  width: 0.15
})

// Line on user drawings layer
pcb.line({
  start: { x: 25, y: 5 },
  end: { x: 45, y: 15 },
  layer: 'Dwgs.User',
  width: 0.2
})

// ============================================
// GRAPHICAL CIRCLES
// ============================================

// Basic circle with radius
pcb.circle({
  center: { x: 10, y: 30 },
  radius: 5
})

// Filled circle
pcb.circle({
  center: { x: 25, y: 30 },
  radius: 5,
  fill: true,
  width: 0.2
})

// Circle on copper layer (filled)
pcb.circle({
  center: { x: 40, y: 30 },
  radius: 3,
  layer: 'F.Cu',
  fill: true,
  width: 0.15
})

// Large circle using endpoint
pcb.circle({
  center: { x: 60, y: 30 },
  end: { x: 70, y: 30 },  // radius = 10
  layer: 'Dwgs.User'
})

// Locked circle
pcb.circle({
  center: { x: 85, y: 30 },
  radius: 4,
  locked: true,
  width: 0.25
})

// Small filled circle (mounting hole marker)
pcb.circle({
  center: { x: 95, y: 30 },
  radius: 1.5,
  fill: true,
  layer: 'F.Fab'
})

// ============================================
// GRAPHICAL RECTANGLES
// ============================================

// Basic rectangle using x, y, width, height
pcb.rect({
  x: 5, y: 50,
  width: 15, height: 10
})

// Filled rectangle
pcb.rect({
  x: 25, y: 50,
  width: 15, height: 10,
  fill: true,
  strokeWidth: 0.2
})

// Rectangle using start and end points
pcb.rect({
  start: { x: 45, y: 50 },
  end: { x: 60, y: 60 },
  layer: 'Dwgs.User'
})

// Copper pour rectangle (filled)
pcb.rect({
  x: 65, y: 50,
  width: 15, height: 10,
  layer: 'F.Cu',
  fill: true,
  strokeWidth: 0.15
})

// Locked rectangle on edge cuts
pcb.rect({
  x: 85, y: 50,
  width: 10, height: 10,
  layer: 'Edge.Cuts',
  strokeWidth: 0.1,
  locked: true
})

// ============================================
// GRAPHICAL POLYGONS
// ============================================

// Triangle
pcb.poly({
  points: [
    { x: 10, y: 70 },
    { x: 20, y: 70 },
    { x: 15, y: 80 }
  ]
})

// Filled triangle
pcb.poly({
  points: [
    { x: 25, y: 70 },
    { x: 35, y: 70 },
    { x: 30, y: 80 }
  ],
  fill: true,
  width: 0.2
})

// Pentagon
pcb.poly({
  points: [
    { x: 50, y: 72 },
    { x: 55, y: 70 },
    { x: 58, y: 75 },
    { x: 55, y: 80 },
    { x: 50, y: 78 }
  ],
  layer: 'Dwgs.User'
})

// Hexagon (filled)
pcb.poly({
  points: [
    { x: 70, y: 73 },
    { x: 75, y: 70 },
    { x: 80, y: 73 },
    { x: 80, y: 77 },
    { x: 75, y: 80 },
    { x: 70, y: 77 }
  ],
  layer: 'F.Cu',
  fill: true,
  width: 0.15
})

// Arrow (locked polygon)
pcb.poly({
  points: [
    { x: 85, y: 75 },
    { x: 90, y: 70 },
    { x: 95, y: 75 },
    { x: 92, y: 75 },
    { x: 92, y: 80 },
    { x: 88, y: 80 },
    { x: 88, y: 75 }
  ],
  layer: 'Dwgs.User',
  locked: true,
  width: 0.2
})

// ============================================
// COMPLEX SHAPES USING MULTIPLE PRIMITIVES
// ============================================

// Cross pattern
const crossCenter = { x: 10, y: 90 };
const crossSize = 5;
pcb.line({ start: { x: crossCenter.x - crossSize, y: crossCenter.y }, end: { x: crossCenter.x + crossSize, y: crossCenter.y }, width: 0.3 });
pcb.line({ start: { x: crossCenter.x, y: crossCenter.y - crossSize }, end: { x: crossCenter.x, y: crossCenter.y + crossSize }, width: 0.3 });

// Circle with crosshair (target/fiducial marker)
pcb.circle({ center: { x: 30, y: 90 }, radius: 3, width: 0.2 });
pcb.line({ start: { x: 27, y: 90 }, end: { x: 33, y: 90 }, width: 0.1 });
pcb.line({ start: { x: 30, y: 87 }, end: { x: 30, y: 93 }, width: 0.1 });

// Square with diagonal lines (corner marker)
pcb.rect({ x: 45, y: 85, width: 10, height: 10, strokeWidth: 0.2 });
pcb.line({ start: { x: 45, y: 85 }, end: { x: 55, y: 95 }, width: 0.15 });
pcb.line({ start: { x: 55, y: 85 }, end: { x: 45, y: 95 }, width: 0.15 });

// Concentric circles
pcb.circle({ center: { x: 70, y: 90 }, radius: 6, width: 0.15 });
pcb.circle({ center: { x: 70, y: 90 }, radius: 4, width: 0.15 });
pcb.circle({ center: { x: 70, y: 90 }, radius: 2, width: 0.15 });

// Star shape using polygon
pcb.poly({
  points: [
    { x: 90, y: 85 },
    { x: 91, y: 88 },
    { x: 94, y: 88 },
    { x: 92, y: 90 },
    { x: 93, y: 93 },
    { x: 90, y: 91 },
    { x: 87, y: 93 },
    { x: 88, y: 90 },
    { x: 86, y: 88 },
    { x: 89, y: 88 }
  ],
  fill: true,
  width: 0.1
})

// ============================================
// BOARD OUTLINE USING LINES
// ============================================

// Complete rectangular board outline on Edge.Cuts
pcb.line({ start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, layer: 'Edge.Cuts', width: 0.1 });
pcb.line({ start: { x: 100, y: 0 }, end: { x: 100, y: 100 }, layer: 'Edge.Cuts', width: 0.1 });
// Bottom line was already added above
pcb.line({ start: { x: 0, y: 0 }, end: { x: 0, y: 100 }, layer: 'Edge.Cuts', width: 0.1 });

// ============================================
// LAYER EXAMPLES
// ============================================

// Front silkscreen text box (using rectangle)
pcb.rect({ x: 2, y: 2, width: 20, height: 8, layer: 'F.SilkS', strokeWidth: 0.15 });

// Back silkscreen marker
pcb.circle({ center: { x: 95, y: 95 }, radius: 2, layer: 'B.SilkS', width: 0.15 });

// User drawings layer annotation
pcb.line({ start: { x: 2, y: 95 }, end: { x: 15, y: 95 }, layer: 'Dwgs.User', width: 0.2 });

// Comments layer note
pcb.rect({ x: 80, y: 2, width: 18, height: 6, layer: 'Cmts.User', strokeWidth: 0.1 });

// Fabrication layer markers
pcb.circle({ center: { x: 10, y: 10 }, radius: 1, layer: 'F.Fab', fill: true });
pcb.circle({ center: { x: 90, y: 10 }, radius: 1, layer: 'F.Fab', fill: true });
pcb.circle({ center: { x: 10, y: 90 }, radius: 1, layer: 'B.Fab', fill: true });

// Create the PCB file
pcb.create(U1)

console.log('PCB with comprehensive graphics examples created successfully!')
console.log('Check build/graphics_example.kicad_pcb')
console.log('')
console.log('This example demonstrates:')
console.log('  ✓ Graphical lines (basic, diagonal, locked, various layers)')
console.log('  ✓ Graphical circles (filled, outline, various radii)')
console.log('  ✓ Graphical rectangles (x/y or start/end, filled, various layers)')
console.log('  ✓ Graphical polygons (triangles, pentagons, hexagons, stars)')
console.log('  ✓ Complex shapes (crosses, targets, concentric circles)')
console.log('  ✓ Board outlines using lines')
console.log('  ✓ Usage on multiple layers (SilkS, Dwgs.User, Fab, Edge.Cuts, Cu)')
console.log('  ✓ Fill and stroke options')
console.log('  ✓ Locked elements')
