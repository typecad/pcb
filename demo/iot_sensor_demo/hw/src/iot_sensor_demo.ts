// temp-node — a USB-powered 1-Wire temperature node.
//
// ATtiny85 talks 1-Wire to an onboard DS18B20 (and optionally an external
// probe on J2), blinks a status LED. Power comes straight off USB 5V.
import { PCB, Power, Resistor, Capacitor, LED, Connector, MountingHole } from '@typecad/pcb';
import { ATtiny85_20S } from './ATtiny85_20S';
import { DS18B20 } from './DS18B20';
import { USB_B_Micro } from './USB_B_Micro';

let pcb = new PCB('iot_sensor_demo');

// ---------------------------------------------------------------------------
// board: 50 x 30 mm, 2-layer
// ---------------------------------------------------------------------------
pcb.outline(0, 0, 50, 30);
const b = pcb.board;

// ---------------------------------------------------------------------------
// parts
// ---------------------------------------------------------------------------
let j1 = new USB_B_Micro();                  // USB micro-B, power only
let u1 = new ATtiny85_20S();                 // the brain
let u2 = new DS18B20();                      // 1-Wire temp sensor (TO-92)
let j2 = new Connector({ number: 3, series: 'JST-SH' }); // external probe

let c1 = new Capacitor({ value: '100nF' });  // U1 decoupling
let c2 = new Capacitor({ value: '10uF', size: '0805' }); // bulk, USB input
let r1 = new Resistor({ value: '4.7k' });    // 1-Wire pull-up
let r2 = new Resistor({ value: '330' });     // LED series
let d1 = new LED({ value: 'green' });

let mh1 = new MountingHole({ size: 'M2.5' });
let mh2 = new MountingHole({ size: 'M2.5' });

// ---------------------------------------------------------------------------
// nets
// ---------------------------------------------------------------------------
const vbus = pcb.named('VBUS').net(j1.VBUS, u1.VCC, u2.V__DD, c1.pin(1), c2.pin(1), r1.pin(1), j2.pin(1));
// shield left floating (power-only USB); the F.Cu shell tabs have no route path
const gnd  = pcb.named('GND').net(j1.GND, u1.GND, u2.GND, c1.pin(2), c2.pin(2), d1.pin(1), j2.pin(2));
const dq   = pcb.named('DQ').net(u1.AREF_PB0, u2.DQ, r1.pin(2), j2.pin(3));   // 1-Wire bus on PB0
const ledn = pcb.named('LED_N').net(u1.PB1, r2.pin(2));                       // LED drive on PB1
const ledk = pcb.named('LED_K').net(r2.pin(1), d1.pin(2));

// power source for ERC
new Power({ power: j1.VBUS, gnd: j1.GND, voltage: 5 });

// ---------------------------------------------------------------------------
// placement
// ---------------------------------------------------------------------------
j1.pcb = { x: b.fromLeft(2), y: b.center.y + 0.3 }; // +0.3: aligns the VBUS escape corridor with the router grid past the shell tabs

u1.pcb = { x: 22, y: b.center.y };

c1.pcb = { x: pcb.board.sameAs(u1).x.plus(1.5), y: pcb.board.below(u1).by(3) };
c2.pcb = { x: pcb.board.leftOf(c1).by(4),     y: pcb.board.sameAs(c1) };

r1.pcb = { x: 27, y: pcb.board.above(u1).by(5) };

u2.pcb = { x: 33.5, y: b.center.y, rotation: 90 };  // pins in a vertical row so the end pads escape sideways
j2.pcb = { x: b.fromRight(2), y: b.center.y };

r2.pcb = { x: 30, y: pcb.board.below(u1).by(8) };
d1.pcb = { x: pcb.board.rightOf(r2).by(4), y: pcb.board.sameAs(r2) };

mh1.pcb = { x: b.fromLeft(2.5),    y: b.fromTop(2.5) };
mh2.pcb = { x: b.fromRight(2.5),   y: b.fromBottom(2.5) };

// ---------------------------------------------------------------------------
// routing: power class for VBUS, autoroute the signal nets,
// back side becomes a ground pour
// ---------------------------------------------------------------------------
// USB micro-B escape corridor is ~0.9mm, so keep width+2*clearance under that
pcb.netClass('power', { track_width: 0.3, clearance: 0.2, via_diameter: 0.8, via_drill: 0.4 });
pcb.assign(vbus, 'power');

// the VBUS escape from J1's pad row is boxed in by the shell tabs (the build
// log names the exact segment); guide it up and over the connector
pcb.route(vbus, {
  gridResolution: 0.1,
  width: 0.2,
  clearance: 0.2,
  waypoints: [
    { x: 5.1, y: 11.4 },
    { x: 12, y: 11.4 },
  ],
});
pcb.route(dq);
pcb.route(ledn);
pcb.route(gnd);
pcb.route(ledk);

pcb.zone({ net: 'GND', layers: ['B.Cu'], bounds: pcb.board });

pcb.create(j1, u1, u2, j2, c1, c2, r1, r2, d1, mh1, mh2);
