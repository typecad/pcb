import { PCB } from '@typecad/typecad'
import { Resistor } from '@typecad/passives/0603';
import { ngspiceSimulator } from '@typecad/ngspice';
import { graphviz } from '@typecad/graphviz';
import { jlcpcb_export } from '@typecad/jlcpcb-export';
const typecad = new PCB('all_packages');
const ngspice = new ngspiceSimulator(typecad.Schematic);
const r1 = new Resistor({ value: '1kohm', simulation: { include: true } });

typecad.create(r1);
// ngspice.op();
// graphviz(typecad.Schematic);
jlcpcb_export(typecad.Schematic, typecad, true);
// 1. run the npm script '🤖 Build'
// 2. run the npm script 'Open Board ✳️' to edit the board in KiCAD
// * read more about ngspice simulation: https://www.npmjs.com/package/@typecad/ngspice
// * read more about the graphviz package: https://www.npmjs.com/package/@typecad/graphviz
// * read more about the jlcpcb-export package: https://www.npmjs.com/package/@typecad/jlcpcb-export
 