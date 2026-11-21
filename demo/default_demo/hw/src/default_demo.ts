import { PCB, Component, Power, Resistor, LED } from '@typecad/pcb'
import { syncBoard, syncTracks } from './_sync.js';

let typecad = new PCB('default_demo');

// a 3 V coin cell lights an LED through a current-limiting resistor — a
// complete circuit: nets to route in the layout view, and a power source
// for the ngspice view
let battery = new Component({
  footprint: 'Battery:BatteryHolder_Keystone_3008_1x2450',
  symbol: 'Device:Battery_Cell',
  prefix: 'BT',
  value: 'CR2450',
});
let r1 = new Resistor({ value: '150' });
let led = new LED({
  value: 'red',
  simulation: { model: 'Dled D (IS=1a RS=3.3 N=1.8)' },
});

typecad.named('+BATT').net(battery.pin(1), r1.pin(1));
// KiCad diode symbols number the cathode 1 / anode 2
typecad.named('led_a').net(r1.pin(2), led.pin(2));
typecad.named('GND').net(led.pin(1), battery.pin(2));

// the rail ngspice drives: solve it with `npm run simulate`
new Power({ power: battery.pin(1), gnd: battery.pin(2), voltage: 3, direction: 'output' });

syncBoard(typecad, { battery, led, r1 });
typecad.create(battery, r1, led, ...syncTracks);
// 1. run the npm script 'build'
// 2. run the npm script 'simulate' for the board viewer's ngspice view
// 3. run the npm script 'open_board' to edit the board in KiCAD
 