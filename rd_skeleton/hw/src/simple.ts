import { PCB, Component, Resistor, LED, TrackBuilder } from '@typecad/pcb';

// minimal board for diff testing: one resistor, one LED, two short tracks,
// no zone pours — every geometry change in a diff should be author-visible
const typecad = new PCB('simple_board', { layers: 2 });

const r1 = new Resistor({ value: '150' });
r1.pcb = { x: 0, y: 0 };
const led = new LED({ value: 'red' });
led.pcb = { x: 15, y: 0 };

typecad.named('led_a').net(r1.pin(2), led.pin(2));
typecad.named('GND').net(led.pin(1), r1.pin(1));

new TrackBuilder(typecad, { net: 'led_a' })
  .from({ x: 0.825, y: 0 }, 'F.Cu', 0.55)
  .to({ x: 14.17, y: 0, layer: 'F.Cu', width: 0.55 });

new TrackBuilder(typecad, { net: 'GND' })
  .from({ x: -0.825, y: 0 }, 'B.Cu', 0.55)
  .to({ x: -0.825, y: -8, layer: 'B.Cu', width: 0.55 })
  .to({ x: 14.17, y: -8, layer: 'B.Cu', width: 0.55 })
  .to({ x: 14.17, y: 0, layer: 'B.Cu', width: 0.55 });

typecad.create(r1, led);
