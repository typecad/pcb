import { PCB } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0805';

let typecad = new PCB('autoroute_example');

// Define components
let r1 = new Resistor({ value: '1kohm', reference: 'R1' });
let r2 = new Resistor({ value: '1kohm', reference: 'R2' });

// Place components on the board
r1.pcb = { x: 10, y: 10, rotation: 0 };
r2.pcb = { x: 20, y: 10, rotation: 0 };

// Create a net connecting the two resistors
const signal_net = typecad.named('signal').net(r1.pin(1), r2.pin(1));

// Instruct the router to connect the net
typecad.route(signal_net);

// Generate the board file
typecad.create(r1, r2);