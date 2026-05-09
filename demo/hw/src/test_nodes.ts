import { PCB, Component } from '@typecad/typecad'

const typecad = new PCB('one_hz');

const U2 = new Component({ symbol: "Timer", reference: 'U2' });
const U3 = new Component({ symbol: "Timer", reference: 'U3' });
const U4 = new Component({ symbol: "Logic", reference: 'U4' });
const J1 = new Component({ symbol: "Conn", reference: 'J1' });
const C2 = new Component({ symbol: "Cap", reference: 'C2' });

const net_5v = typecad.named('+5V').net(
  U2.pin(16), 
  U3.pin(16), 
  U4.pin(20), 
  J1.pin(2),  
);

typecad.net(C2.pin(1), U2.pin(16)); 

console.log("All nodes:");
typecad.Schematic.Nodes.forEach(n => console.log(n.name, n.nodes.map(p => p.reference + '.' + p.number)));
