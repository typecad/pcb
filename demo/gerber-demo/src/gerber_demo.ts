import { PCB, Component, TrackBuilder } from '@typecad/pcb';

// A small board that exercises everything the native export path renders:
// SMD + THT parts, autorouted nets, a hand-dropped via pair, silk text, and
// a HATCHED GND pour on both copper layers (the zone-fill engine's hatch
// output — flip fillMode to 'solid' to compare).
const typecad = new PCB('gerber_demo', {
  rules: { min_through_hole_diameter: 0.3, min_via_diameter: 0.6 },
});

// ---- parts ------------------------------------------------------------
// power/signal header (THT — gives the drill file plated holes)
const j1 = new Component({
  symbol: 'Connector_Generic:Conn_01x04',
  footprint: 'Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical',
  reference: 'J1',
  value: 'ctrl',
});
j1.pcb = { x: 12, y: 12 };

// the "mcu": SOIC-8 (symbol rides as a connector per typeCAD convention)
const u1 = new Component({
  symbol: 'Connector_Generic:Conn_01x08',
  footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
  reference: 'U1',
  value: 'demo-mcu',
});
u1.pcb = { x: 32, y: 16 };

// decoupling cap near the mcu's VCC pin
const c1 = new Component({
  symbol: 'Device:C_Small',
  footprint: 'Capacitor_SMD:C_0603_1608Metric',
  reference: 'C1',
  value: '100nF',
});
c1.pcb = { x: 25, y: 9, rotation: 180 };

// LED + its series resistor
const r1 = new Component({
  symbol: 'Device:R_Small',
  footprint: 'Resistor_SMD:R_0603_1608Metric',
  reference: 'R1',
  value: '330R',
});
r1.pcb = { x: 44, y: 10, rotation: 90 };
const d1 = new Component({
  symbol: 'Device:LED',
  footprint: 'LED_SMD:LED_0805_2012Metric',
  reference: 'D1',
  value: 'red',
});
d1.pcb = { x: 44, y: 19, rotation: 90 };

// ---- nets ---------------------------------------------------------------
const vcc = typecad.named('VCC').net(j1.pin(1), u1.pin(8), c1.pin(1));
typecad.assign(vcc, 'power');
typecad.netClass('power', { track_width: 0.5 });

const sig1 = typecad.net(j1.pin(2), u1.pin(2));
const sig2 = typecad.net(j1.pin(3), u1.pin(3));
const ledDrive = typecad.net(u1.pin(5), r1.pin(1));
const ledA = typecad.net(r1.pin(2), d1.pin(2)); // KiCad LED: pin 1 = cathode
const gnd = typecad
  .named('GND')
  .net(j1.pin(4), u1.pin(4), c1.pin(2), d1.pin(1));
typecad.assign(gnd, 'power');

typecad.route(vcc);
typecad.route(sig1);
typecad.route(sig2);
typecad.route(ledDrive);
typecad.route(ledA);
typecad.route(gnd);

// two GND stitching vias tying the front/back pours together
const viaTie = (x: number, y: number) =>
  new TrackBuilder(typecad, { net: 'GND' })
    .from({ x, y }, 'F.Cu')
    .via({ size: 0.6, drill: 0.3 })
    .to({ x: x + 0.4, y }, 'B.Cu');

// ---- board ---------------------------------------------------------------
typecad.outline(5, 5, 50, 35, 0.5);

typecad.text({
  text: 'gerber-demo',
  x: 20,
  y: 36,
  layer: 'F.SilkS',
  font: 'OCR A Std',
  width: 1.2,
  height: 1.2,
});

// the point of the demo: a hatched pour. Hatch lines run 45° (orientation 0)
// at 0.25 mm thickness with 0.5 mm gaps, bordered by a 0.25 mm ring.
typecad.zone({
  net: 'GND',
  bounds: typecad.board,
  layers: ['F.Cu', 'B.Cu'],
  fillMode: 'hatched',
  hatchThickness: 0.25,
  hatchGap: 0.5,
  hatchOrientation: 0,
});

typecad.create(j1, u1, c1, r1, d1, viaTie(20, 28), viaTie(42, 28));
