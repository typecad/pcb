import { PCB } from '@typecad/typecad';
import { rd_isl9120ir } from '@typecad/rd_isl9120ir';

const typecad = new PCB('isl9120_demo');

// Irregular board outline: straight edges, two rounded corners (arcs), an
// angled chamfer at the bottom-left, and an auto-closing edge back to the
// start. Built with the free-form outlinePath() builder.
typecad
  .outlinePath(140, 88)
  .lineTo(156, 88) // top edge
  .arcTo(166, 98, { x: 164, y: 90 }) // rounded top-right corner
  .lineTo(166, 104) // right edge
  .arcTo(158, 110, { x: 165, y: 108 }) // rounded bottom-right corner
  .lineTo(146, 110) // bottom edge
  .lineTo(140, 102) // angled chamfer
  .lineTo(138, 94) // irregular left side
  .close(); // auto-closes back to (140, 88)

// Internal cutout: a trapezoidal milled slot below the regulator circuit
typecad.cutout([
  { x: 145, y: 103.5 },
  { x: 152, y: 103.5 },
  { x: 150.5, y: 106.5 },
  { x: 145, y: 106.5 },
]);

// Circular cutout: a mounting hole in the top-right corner
typecad.cutoutCircle(161, 93, 1.6);

// Constructing the regulator module automatically syncs the package's bundled
// KiCad symbol/footprint files from node_modules into ./build/lib/ — no
// postinstall script was run when this package was installed.
const isl9120 = new rd_isl9120ir({ pcb: typecad });

typecad.create(isl9120.components);
