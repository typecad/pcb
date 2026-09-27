import {
  PCB,
  Power,
  Component,
  Resistor,
  Capacitor,
  LED,
  Connector,
  TestPoint,
  MountingHole,
  TrackBuilder,
} from '@typecad/pcb';
import { ATmega328P_A } from './ATmega328P_A';
import { TMP100 } from './TMP100';
import { PowerLdo3V3 } from './power_ldo';

/**
 * env_node — an ATmega328P temperature-sensor node.
 *
 * Blocks: 5 V input -> 3.3 V LDO (a Package), MCU with crystal + reset +
 * ISP + UART, TMP100 I2C sensor with pull-ups, status LED, test points,
 * mounting holes. Two layers, GND pours both sides, via stitching.
 */
const typecad = new PCB('env_node');

// ---- board ---------------------------------------------------------------
typecad.outline(0, 0, 55, 38, 2);
typecad.text({
  text: 'env_node rev A',
  x: 9,
  y: 35.6,
  layer: 'F.SilkS',
  font: 'OCR A Std',
  width: 1,
  height: 1,
});

// mechanical
const mh1 = new MountingHole({ size: 'M2', pcb: { x: typecad.board.fromLeft(4), y: typecad.board.fromBottom(4) } });
const mh2 = new MountingHole({ size: 'M2', pcb: { x: typecad.board.fromRight(4), y: typecad.board.fromBottom(4) } });
const mh3 = new MountingHole({ size: 'M2', pcb: { x: typecad.board.fromLeft(4), y: typecad.board.fromTop(4) } });
const mh4 = new MountingHole({ size: 'M2', pcb: { x: typecad.board.fromRight(4), y: typecad.board.fromTop(4) } });

// ---- power ----------------------------------------------------------------
// 5 V in. Note: net names map 1:1 onto KiCad power symbols for the
// schematic, and the power library has +5V/+3V3/GND (a net named 'VIN'
// renders no symbol) — and pin-header footprints are anchored at pin 1
// extending +Y, so place headers by their first pad.
const j1 = new Connector({ number: 2, reference: 'J1', value: '5V in', pcb: { x: 5, y: 11 } });

// the LDO sub-circuit lives in a Package (regulator + caps), placed as a unit
const ldo = new PowerLdo3V3({ pcb: typecad, x: 5, y: 20, reference: 'U2', name: 'ldo_3v3' });

// ---- mcu ------------------------------------------------------------------
const u1 = new ATmega328P_A('U1');
u1.pcb = { x: 27, y: 17 };

// decoupling
const cVcc = new Capacitor({ value: '100 nF', pcb: { x: 24.5, y: 24.8, rotation: 90 } });
const cAvcc = new Capacitor({ value: '100 nF', pcb: { x: 34, y: 14, rotation: 90 } });
const cAref = new Capacitor({ value: '100 nF', pcb: { x: 34, y: 17, rotation: 90 } });

// 16 MHz crystal + load caps
const y1 = new Component({
  symbol: 'Device:Crystal',
  footprint: 'Crystal:Crystal_SMD_5032-2Pin_5.0x3.2mm',
  reference: 'Y1',
  value: '16 MHz',
  pcb: { x: 20, y: 10.5 },
});
const cXt1 = new Capacitor({ value: '22 pF', pcb: { x: 16.5, y: 8, rotation: 90 } });
const cXt2 = new Capacitor({ value: '22 pF', pcb: { x: 23.5, y: 8, rotation: 90 } });

// reset: pull-up + push button
const rReset = new Resistor({ value: '10k', pcb: { x: 20, y: 27, rotation: 90 } });
const sw1 = new Component({
  symbol: 'Switch:SW_Push',
  footprint: 'Button_Switch_SMD:SW_SPST_PTS645Sx43SMTR92',
  reference: 'SW1',
  value: 'reset',
  pcb: { x: 15, y: 30 },
});

// programming + uart headers
const j4 = new Component({
  symbol: 'Connector_Generic:Conn_02x03_Odd_Even',
  footprint: 'Connector_PinHeader_2.54mm:PinHeader_2x03_P2.54mm_Vertical',
  reference: 'J4',
  value: 'ISP',
  pcb: { x: 11, y: 15 },
});
const j2 = new Connector({ number: 3, reference: 'J2', value: 'uart', pcb: { x: 30, y: 30 } });

// status LED on PB0
const rLed = new Resistor({ value: '330R', pcb: { x: 42, y: 15, rotation: 90 } });
const d1 = new LED({ value: 'grn', size: '0805', pcb: { x: 42, y: 10, rotation: 90 } });

// ---- sensor ---------------------------------------------------------------
const u3 = new TMP100('U3');
u3.pcb = { x: 43, y: 20, rotation: 270 };
const rSda = new Resistor({ value: '4.7k', pcb: { x: 35, y: 24 } });
const rScl = new Resistor({ value: '4.7k', pcb: { x: 31, y: 24 } });
const j3 = new Connector({
  number: 4,
  series: 'JST-SH',
  reference: 'J3',
  value: 'i2c',
  pcb: { x: 49, y: 28, rotation: 90 },
});

// test points + a manual GND via pair under the mcu (exercises TrackBuilder).
// Built BEFORE route() runs: a via staged after routing is invisible to the
// autorouter, which will happily drop a via right on top of it.
const tp1 = new TestPoint({ reference: 'TP1', value: '3V3', pcb: { x: 50, y: 4 } });
const tp2 = new TestPoint({ reference: 'TP2', value: 'GND', pcb: { x: 50, y: 34 } });
const viaTie = (x: number, y: number) =>
  new TrackBuilder(typecad, { net: 'GND' })
    .from({ x, y }, 'F.Cu')
    .via({ size: 0.6, drill: 0.3 })
    .to({ x: x + 0.4, y }, 'B.Cu');
const gndTie = viaTie(27, 17);

// ---- nets -----------------------------------------------------------------
const vin = typecad.named('+5V').net(j1.pin(1), ldo.regulator.VIN, ldo.regulator.EN);
const v3v3 = typecad
  .named('+3V3')
  .net(
    ldo.regulator.VOUT,
    u1.VCC,
    u1.VCC_6,
    u1.AVCC,
    u3.V,
    rSda.pin(1),
    rScl.pin(1),
    rReset.pin(1),
    j3.pin(4),
    j4.pin(2),
    tp1.pin(1),
    cVcc.pin(1),
    cAvcc.pin(1),
  );
const gnd = typecad
  .named('GND')
  .net(
    j1.pin(2),
    ldo.regulator.GND,
    u1.GND,
    u1.GND_5,
    u1.GND_21,
    u3.GND,
    u3.ADD0,
    u3.ADD1,
    cVcc.pin(2),
    cAvcc.pin(2),
    cAref.pin(2),
    cXt1.pin(2),
    cXt2.pin(2),
    rReset.pin(2),
    sw1.pin(2),
    d1.pin(1),
    j2.pin(1),
    j3.pin(3),
    j4.pin(6),
    tp2.pin(1),
  );

// power rail declarations (pin types + PWR_FLAG for ERC)
new Power({ power: j1.pin(1), gnd: j1.pin(2), voltage: 5, direction: 'output' });
new Power({ power: ldo.regulator.VOUT, gnd: ldo.regulator.GND, voltage: 3.3, direction: 'output' });

const sda = typecad.named('SDA').net(u1.PC4, u3.SDA, rSda.pin(2), j3.pin(1));
const scl = typecad.named('SCL').net(u1.PC5, u3.SCL, rScl.pin(2), j3.pin(2));
const uartRx = typecad.net(u1.PD0, j2.pin(2));
const uartTx = typecad.net(u1.PD1, j2.pin(3));
const ledDrv = typecad.net(u1.PB0, rLed.pin(1));
const ledA = typecad.net(rLed.pin(2), d1.pin(2)); // LED pin 1 = cathode
const reset = typecad.named('RESET').net(u1.RESET_PC6, rReset.pin(2), sw1.pin(1), j4.pin(5));
const xtal1 = typecad.net(u1.XTAL1_PB6, y1.pin(1), cXt1.pin(1));
const xtal2 = typecad.net(u1.XTAL2_PB7, y1.pin(2), cXt2.pin(1));
const aref = typecad.net(u1.AREF, cAref.pin(1));
const miso = typecad.net(u1.PB4, j4.pin(1));
const mosi = typecad.net(u1.PB3, j4.pin(4));
const sck = typecad.net(u1.PB5, j4.pin(3));

// unused MCU pins: ATmega328P TQFP analog inputs + spare GPIO
typecad.dnc(
  u1.PD2, u1.PD3, u1.PD4, u1.PD5, u1.PD6, u1.PD7,
  u1.PB1, u1.PB2,
  u1.PC0, u1.PC1, u1.PC2, u1.PC3,
  u1.ADC6, u1.ADC7,
  ldo.regulator.NC,
);

// ---- physical constraints -------------------------------------------------
// VIN carries the full board current between coarse-pitch parts — 0.5 mm is
// comfortable. The +3V3 rail must escape the MCU's 0.8 mm-pitch TQFP pads,
// so it gets a class of its own at 0.3 mm (a 0.5 mm trace physically cannot
// fit between those pads; the autorouter will say so if you try). GND is
// left at the default width — both-layer pours plus stitching carry it.
typecad.netClass('power', { track_width: 0.5, via_diameter: 0.6, via_drill: 0.3 });
typecad.assign(vin, 'power');
typecad.netClass('logic-power', { track_width: 0.3, via_diameter: 0.6, via_drill: 0.3 });
typecad.assign(v3v3, 'logic-power');

// ---- routing ----------------------------------------------------------------
// GND is deliberately NOT routed: both-layer pours + stitching carry it
// (thermal reliefs connect the pads), which keeps the signal layers clear.
// Routing it as a star as well works, but adds traffic the router has to
// dodge — on this board it measurably degrades the signal routes.
for (const n of [vin, v3v3, sda, scl, uartRx, uartTx, ledDrv, ledA, reset, xtal1, xtal2, aref, miso, mosi, sck]) {
  typecad.route(n);
}

typecad.teardrops();
typecad.zone({ net: 'GND', bounds: typecad.board, layers: ['F.Cu', 'B.Cu'], fillMode: 'solid' });
typecad.stitch('GND', { pitch: 2.5 });

// ---- build ------------------------------------------------------------------
typecad.create(
  j1, ldo.components, u1, u3, y1, sw1, j2, j3, j4, d1,
  cVcc, cAvcc, cAref, cXt1, cXt2, rReset, rLed, rSda, rScl,
  tp1, tp2, mh1, mh2, mh3, mh4, gndTie,
);
