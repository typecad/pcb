import type { Skill } from './types.js';

export const graphicsSkills: Skill[] = [
  {
    name: 'text',
    category: 'graphics',
    description: 'Add silkscreen text, labels, and annotations to the PCB',
    package: '@typecad/pcb',
    import: "import { PCB } from '@typecad/pcb';",
    examples: [
      {
        title: 'Board label',
        code: `pcb.text({
  text: 'typeCAD v1.0',
  x: 25,
  y: 2,
  layer: 'F.SilkS',
  width: 1,
  height: 1,
  thickness: 0.15,
});`,
      },
    ],
    notes: [
      'Common layers: F.SilkS (front silkscreen), B.SilkS (back silkscreen), F.Fab (fabrication)',
      'Supports justify, bold, italic, and show options',
    ],
    related: ['graphics', 'pcb-structure'],
  },
  {
    name: 'graphics',
    category: 'graphics',
    description: 'Add graphical elements (lines, circles, rectangles, polygons) to PCB layers',
    package: '@typecad/pcb',
    import: "import { PCB } from '@typecad/pcb';",
    examples: [
      {
        title: 'Graphical elements',
        code: `// Line
pcb.line({ start: { x: 0, y: 0 }, end: { x: 10, y: 10 }, layer: 'F.SilkS', width: 0.2 });

// Circle
pcb.circle({ center: { x: 25, y: 20 }, radius: 5, layer: 'Dwgs.User', width: 0.15 });

// Rectangle
pcb.rect({ x: 0, y: 0, width: 10, height: 5, layer: 'F.SilkS', strokeWidth: 0.2 });

// Polygon
pcb.poly({
  points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }],
  layer: 'F.SilkS',
  width: 0.2,
});`,
      },
    ],
    notes: [
      'All coordinates are in mm',
      'Common layers: F.SilkS, B.SilkS, F.Fab, Dwgs.User, Eco1.User',
      'fill: true fills the shape (supported by circle, rect, poly)',
    ],
    related: ['text', 'pcb-structure'],
  },
];
