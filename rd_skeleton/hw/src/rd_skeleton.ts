import { PCB, Component, Power, Resistor, LED, TrackBuilder } from '@typecad/pcb';

const typecad = new PCB('typecad_project', { layers: 4 });

// a 3 V coin cell lights an LED through a current-limiting resistor — a
// complete circuit: nets to route in the layout view, and a power source
// for the ngspice view
const battery = new Component({
  footprint: 'Battery:BatteryHolder_Keystone_3008_1x2450',
  symbol: 'Device:Battery_Cell',
  prefix: 'BT',
  value: 'CR2450',
});
battery.pcb = { x: 7.5, y: -20 };
const r1 = new Resistor({ value: '150' });
r1.pcb = { x: 0, y: 0 };
const led = new LED({
  value: 'red',
  simulation: { model: 'Dled D (IS=1a RS=3.3 N=1.8)' },
});
led.referenceLayout = { justify: { horizontal: 'left', vertical: 'middle', mirror: false }, thickness: 0.15, italic: true, bold: true, x: 0, y: -1.5, rotation: 0, width: 0.5, height: 0.5 };
led.pcb = { x: 17.5, y: -5.5 };

typecad.named('+BATT').net(battery.pin(1), r1.pin(1));
// KiCad diode symbols number the cathode 1 / anode 2
typecad.named('led_a').net(r1.pin(2), led.pin(2));
typecad.named('GND').net(led.pin(1), battery.pin(2));

// the rail ngspice drives: solve it with `npm run simulate`
new Power({ power: battery.pin(1), gnd: battery.pin(2), voltage: 3, direction: 'output' });


const route2 = new TrackBuilder(typecad, { net: '+BATT',  })
  .from({ x: -7.8, y: -20 }, 'F.Cu', 0.3)
  .to({ x: -7.8, y: -26.935, layer: 'F.Cu', width: 0.3 })
  .to({ x: -2.193, y: -32.542, layer: 'F.Cu', width: 0.3 })
  .to({ x: 16.523, y: -32.542, layer: 'F.Cu', width: 0.3 })
  .to({ x: 20.083, y: -28.981, layer: 'F.Cu', width: 0.3 })
  .to({ x: 20.083, y: -22.717, layer: 'F.Cu', width: 0.3 })
  .to({ x: 22.8, y: -20, layer: 'F.Cu', width: 0.3 });

const route3 = new TrackBuilder(typecad, { net: 'GND',  })
  .from({ x: 7.5, y: -20 }, 'F.Cu', 0.55)
  .to({ x: 16.712, y: -10.788, layer: 'F.Cu', width: 0.55 })
  .to({ x: 16.712, y: -5.5, layer: 'F.Cu', width: 0.55 });


const route9 = new TrackBuilder(typecad, { net: '+BATT', })
.from({ x: -7.8, y: -20 }, 'F.Cu', 0.3)
.to({ x: -7.8, y: -6.975, layer: 'F.Cu', width: 0.3 });


const route13 = new TrackBuilder(typecad, { net: '+BATT',  })
  .from({ x: -7.8, y: -6.975 }, 'F.Cu', 0.3)
  .to({ x: -0.825, y: 0, layer: 'F.Cu', width: 0.3 });


const route14a = new TrackBuilder(typecad, { net: 'led_a', })
.from({ x: 0.9, y: 0.075 }, 'F.Cu', 0.3)
.to({ x: 0.825, y: 0, layer: 'F.Cu', width: 0.3 });

const route15 = new TrackBuilder(typecad, { net: 'led_a', })
.from({ x: 0.964, y: 0.011 }, 'F.Cu', 0.3)
.to({ x: 0.9, y: 0.075, layer: 'F.Cu', width: 0.3 });

const route19 = new TrackBuilder(typecad, { net: 'led_a',  })
  .from({ x: 18.288, y: -5.5 }, 'F.Cu', 0.3)
  .to({ x: 18.288, y: -3.21, layer: 'F.Cu', width: 0.3 })
  .to({ x: 14.799, y: 0.278, layer: 'F.Cu', width: 0.3 })
  .via({ size: 0.6, drill: 0.3 })
  .to({ x: 8.787, y: 0.278, layer: 'B.Cu', width: 0.3 })
  .via({ size: 0.6, drill: 0.3 })
  .to({ x: 1.231, y: 0.278, layer: 'F.Cu', width: 0.3 })
  .to({ x: 0.964, y: 0.011, layer: 'F.Cu', width: 0.3 });

typecad.create(battery, r1, led, route2, route3, route9, route13, route14a, route15, route19);
// 1. run the npm script 'build'
// 2. run the npm script 'open_board' to edit the board in KiCAD
