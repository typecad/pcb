import { PCB } from '@typecad/typecad'
import { Resistor } from '@typecad/passives/0603';
import { MountingHole } from '@typecad/passives/mounting_hole';
import { Connector } from '@typecad/passives/connector'

let typecad = new PCB('rd_skeleton');
// let r1 = new Resistor({ value: '1kohm' });
let mh1 = new MountingHole({ size: 'M2.5' });
let mh2 = new MountingHole({ size: 'M2.5' });
let mh3 = new MountingHole({ size: 'M2.5' });
let mh4 = new MountingHole({ size: 'M2.5' });
let j1 = new Connector({ number: 4, footprint: 'TerminalBlock_TE-Connectivity:TerminalBlock_TE_282834-4_1x04_P2.54mm_Horizontal' });
let j2 = new Connector({ number: 4, footprint: 'TerminalBlock_TE-Connectivity:TerminalBlock_TE_282834-4_1x04_P2.54mm_Horizontal' });

// r1.pcb = {x: 137.4, y: 90.9};
// r1.referenceLayout = { x: 0, y: -2.5, font: 'OCR A Std', height: 1.2, width: 1.2 };
typecad.named('GND').net(j1.pin(1), j2.pin(1));
// typecad.named('GND').net(r1.pin(1))
typecad.outline(127.38, 85.9, 45, 30, 0.1)


mh1.pcb = { x: typecad.board.fromLeft(2.5), y: typecad.board.fromTop(2.5) };
mh2.pcb = { x: typecad.board.fromRight(2.5), y: typecad.board.fromTop(2.5) };
mh3.pcb = { x: typecad.board.fromLeft(2.5), y: typecad.board.fromBottom(2.5) };
mh4.pcb = { x: typecad.board.fromRight(2.5), y: typecad.board.fromBottom(2.5) };

j1.pcb = {x: typecad.board.sameAs(mh1), y: typecad.board.below(mh1).by(1), rotation: -90};
j2.pcb = {x: typecad.board.sameAs(mh2), y: typecad.board.below(mh2).by(1), rotation: -90};

// typecad.plane('GND', 'F.Cu');
typecad.zone({net: 'GND', x: typecad.board.left, y: typecad.board.top, width: typecad.board.width, height: typecad.board.height, layers: ['F.Cu', 'B.Cu'], fillMode: 'hatched', hatchGap: 0.5, hatchThickness: 0.25, })
typecad.text({ text: 'OCR A Std 0123', x: 150, y: 112, layer: 'F.SilkS', font: 'OCR A Std', width: 1.5, height: 1.5 });
typecad.stitch('GND', { pitch: 2.5, margin: 5,  });
typecad.create(mh1, mh2, mh3, mh4, j1, j2);
