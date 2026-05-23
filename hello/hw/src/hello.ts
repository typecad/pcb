import { PCB } from '@typecad/typecad'
import { Resistor } from '@typecad/passives/0603';

let typecad = new PCB('hello');

let r1 = new Resistor({ value: '1kohm' });

typecad.create(r1);

// 1. run the npm script '🤖 Build'
// 2. run the npm script 'Open Board ✳️' to edit the board in KiCAD

 