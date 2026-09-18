import { PCB, Component, Power, TrackBuilder } from '@typecad/pcb';

const typecad = new PCB('rd_skeleton');

// ---- component family gallery: every supported glyph archetype, one per
// grid cell (7 columns x 4 rows on a 104 x 74 mm board) ----
// row 1: two-terminal SMD chips
const r1 = new Component({ symbol: 'Device:R_Small', footprint: 'Resistor_SMD:R_0603_1608Metric', reference: 'R1', value: '1k' });
r1.pcb = { x: 17, y: 18 };
const c1 = new Component({ symbol: 'Device:C_Small', footprint: 'Capacitor_SMD:C_0805_2012Metric', reference: 'C1', value: '1uF' });
c1.pcb = { x: 31, y: 18 };
const l1 = new Component({ symbol: 'Device:L_Small', footprint: 'Inductor_SMD:L_0805_2012Metric', reference: 'L1', value: '10uH' });
l1.pcb = { x: 45, y: 18 };
const d1 = new Component({ symbol: 'Device:D_Small', footprint: 'Diode_SMD:D_0805_2012Metric', reference: 'D1', value: '1N4148W', simulation: { model: 'D1N4148W D (IS=4.35n RS=0.6456 N=1.9061 BV=110 CJO=4p M=0.33 VJ=0.75 TT=4n)' } });
d1.pcb = { x: 59, y: 18 };
// "LED1"/"F1" can't be the SPICE designators — ngspice reads the card type
// from the first letter of the reference (L = inductor, F = current-controlled
// source), so the LED rides the netlist as D3 with a generic red diode model
// (~1.8 V forward at 1 mA) and the fuse as RF1, whose "500mA" rating ngspice
// reads as 0.5 Ω — a plausible fuse resistance that keeps the BOM honest
const d3 = new Component({ symbol: 'Device:LED', footprint: 'LED_SMD:LED_0805_2012Metric', reference: 'D3', value: 'red', simulation: { model: 'DRED D (IS=1f N=2.5 RS=0.3)' } });
d3.pcb = { x: 73, y: 18 };
const rf1 = new Component({ symbol: 'Device:Fuse_Small', footprint: 'Fuse:Fuse_0603_1608Metric', reference: 'RF1', value: '500mA' });
rf1.pcb = { x: 87, y: 18 };
// a crystal is DC-open by physics and "8MHz" has no honest spice card —
// it stays out of the solve but still carries the trace
const y1 = new Component({ symbol: 'Device:Crystal', footprint: 'Crystal:Crystal_SMD_3215-2Pin_3.2x1.5mm', reference: 'Y1', value: '8MHz', simulation: { exclude: true } });
y1.pcb = { x: 101, y: 18 };

// a 1.5 A load across the rail (2.2R from 3.3V) so the copper ΔT view has
// real current to work with — powerInfo sizes its traces per IPC, and the
// thermal view checks the solved current against that geometry
const r3 = new Component({ symbol: 'Device:R_Small', footprint: 'Resistor_SMD:R_1206_3216Metric', reference: 'R3', value: '2.2' });
r3.pcb = { x: 59, y: 26 };

// row 2: through-hole passives + transistors
const r2 = new Component({ symbol: 'Device:R_Small', footprint: 'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal', reference: 'R2', value: '10k' });
r2.pcb = { x: 17, y: 34 };
const d2 = new Component({ symbol: 'Device:D_Small', footprint: 'Diode_THT:D_DO-41_SOD81_P7.62mm_Horizontal', reference: 'D2', value: '1N4007' });
d2.pcb = { x: 31, y: 34 };
const c2 = new Component({ symbol: 'Device:C_Polarized', footprint: 'Capacitor_THT:CP_Radial_D5.0mm_P2.50mm', reference: 'C2', value: '10uF' });
c2.pcb = { x: 45, y: 34 };
const led2 = new Component({ symbol: 'Device:LED', footprint: 'LED_THT:LED_D3.0mm', reference: 'LED2', value: 'green' });
led2.pcb = { x: 59, y: 34 };
const q1 = new Component({ symbol: 'Device:Q_NPN_BEC', footprint: 'Package_TO_SOT_SMD:SOT-23', reference: 'Q1', value: 'BC847' });
q1.pcb = { x: 73, y: 34 };
const q2 = new Component({ symbol: 'Regulator_Linear:LM1117-3.3', footprint: 'Package_TO_SOT_SMD:SOT-223-3_TabPin2', reference: 'Q2', value: 'regulator' });
q2.pcb = { x: 87, y: 34 };
const sw1 = new Component({ symbol: 'Device:SW_Push', footprint: 'Button_Switch_THT:SW_PUSH_6mm', reference: 'SW1', value: 'reset' });
sw1.pcb = { x: 101, y: 34 };

// row 3: ICs
const u3 = new Component({ symbol: 'Amplifier_Operational:LM358', footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm', reference: 'U3', value: 'opamp' });
u3.pcb = { x: 17, y: 50 };
const u4 = new Component({ symbol: 'Timer:LM555CN', footprint: 'Package_DIP:DIP-8_W7.62mm', reference: 'U4', value: '555' });
u4.pcb = { x: 31, y: 50 };
const u7 = new Component({ symbol: 'Connector_Generic:Conn_01x33', footprint: 'Package_DFN_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.1x3.1mm', reference: 'U7', value: 'qfn' });
u7.pcb = { x: 45, y: 50 };
const u5 = new Component({ symbol: 'Connector_Generic:Conn_02x16_Odd_Even', footprint: 'Package_QFP:LQFP-32_7x7mm_P0.8mm', reference: 'U5', value: 'mcu' });
u5.pcb = { x: 59, y: 50 };
const u6 = new Component({ symbol: 'Connector_Generic:Conn_02x24_Odd_Even', footprint: 'Package_BGA:BGA-144_7.0x7.0mm_Layout13x13_P0.5mm_Ball0.3mm_Pad0.25mm_NSMD', reference: 'U6', value: 'mcu' });
u6.pcb = { x: 73, y: 50 };
const x1 = new Component({ symbol: 'Device:Oscillator', footprint: 'Oscillator:Oscillator_SMD_EuroQuartz_XO91-4Pin_7.0x5.0mm', reference: 'X1', value: '16MHz' });
x1.pcb = { x: 87, y: 50 };
const rv1 = new Component({ symbol: 'Device:R_Potentiometer', footprint: 'Potentiometer_THT:Potentiometer_Bourns_3296W_Vertical', reference: 'RV1', value: '10k' });
rv1.pcb = { x: 101, y: 50 };

// row 4: connectors + controls
const j6 = new Component({ symbol: 'Connector_Generic:Conn_01x02', footprint: 'Connector_JST:JST_PH_B2B-PH-K_1x02_P2.00mm_Vertical', reference: 'J6', value: 'battery' });
j6.pcb = { x: 17, y: 66 };
const j7 = new Component({ symbol: 'Connector_Generic:Conn_01x02', footprint: 'TerminalBlock_TE-Connectivity:TerminalBlock_TE_282834-2_1x02_P2.54mm_Horizontal', reference: 'J7', value: 'power' });
j7.pcb = { x: 31, y: 66 };
const j3 = new Component({ symbol: 'Connector_Generic:Conn_01x04', footprint: 'Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical', reference: 'J3', value: 'header' });
j3.pcb = { x: 45, y: 66 };
const j4 = new Component({ symbol: 'Connector:USB_B_Micro', footprint: 'Connector_USB:USB_Micro-B_Amphenol_10118193-0001LF_Horizontal', reference: 'J4', value: 'usb' });
j4.pcb = { x: 59, y: 66 };
const j5 = new Component({ symbol: 'Connector:Barrel_Jack', footprint: 'Connector_BarrelJack:BarrelJack_CUI_PJ-063AH_Horizontal', reference: 'J5', value: '9V' });
j5.pcb = { x: 73, y: 66 };
const sw3 = new Component({ symbol: 'Device:SW_SPDT', footprint: 'Button_Switch_THT:SW_DIP_SPSTx01_Slide_6.7x4.1mm_W7.62mm_P2.54mm_LowProfile', reference: 'SW3', value: 'power' });
sw3.pcb = { x: 87, y: 66 };
const sw2 = new Component({ symbol: 'Device:RotaryEncoder_Switch', footprint: 'Rotary_Encoder:RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm', reference: 'SW2', value: 'encoder' });
sw2.pcb = { x: 101, y: 66 };

// a 3.3 V rail feeding the gallery parts so the schematic view's trace
// hover shows real operating-point numbers (VCC at 3.3 V, R2's 10k divider
// current, C2 the rail's bulk cap). The nets are routed too — the OP solve
// reads the netlist, but the copper is what the board actually ships
const vcc = typecad.named('VCC').net(r1.pin(1), r2.pin(1), c2.pin(1), r3.pin(1));
// rated for the 1.5 A load below — powerInfo sizes the whole rail per
// IPC-2221 (re-routing an already-routed net does NOT re-widen it, so the
// rating belongs here, on the first route)
typecad.route(vcc, { powerInfo: { current: 1.5, maxTempRise: 10 } });
typecad.assign(vcc, 'power');
// ONE ground route for the whole net — every pad routed again lays another
// parallel tree, and duplicate ground paths confound the flow/thermal
// solvers' early development. Rated like the rail (1.5 A return).
typecad.named('GND').net(r2.pin(2), c2.pin(2), c1.pin(2));
const gnd = typecad.named('GND').net(rf1.pin(2), y1.pin(2), r3.pin(2));
const v1 = new Power({ power: r1.pin(1), gnd: c2.pin(2), voltage: 3.3, name: 'V3V3' });
void v1;
typecad.route(gnd, { powerInfo: { current: 1.5, maxTempRise: 10 } });
typecad.assign(gnd, 'power');

typecad.outline(10, 10, 104, 74, 0.1);

// rails carry the 1.5 A load: a net class sizes the WHOLE net (multi-pin
// route() powerInfo sizing is unreliable — star routes lose the rating),
// 0.55 mm ≈ IPC-2221 for 1.5 A / 10°C rise on 1 oz outer copper
typecad.netClass('power', { track_width: 0.55 });

typecad.zone({
  net: 'GND',
  bounds: typecad.board,
  layers: ['F.Cu', 'B.Cu'],
  fillMode: 'hatched',
  hatchGap: 0.5,
  hatchThickness: 0.25,
});
// one trace threading the entire top row, wired so DC actually flows from
// the rail to ground: VCC → R1 → [C1 shunts that node to GND — a series cap
// would DC-block the chain] → L1 → D1 → D3 (LED) → RF1 → GND, with Y1 tapped
// from the LED-cathode node to GND (DC-open, it rides the trace without
// blocking the return). KiCad diode symbols number the cathode 1 and the
// anode 2, so the chain enters each diode at pin 2 and leaves at pin 1 to
// keep them forward-biased
const r1_out = typecad.net(r1.pin(2), c1.pin(1), l1.pin(1));
typecad.route(r1_out);
typecad.named('GND').net(c1.pin(2));
const l1_d1 = typecad.net(l1.pin(2), d1.pin(2));
typecad.route(l1_d1);
const d1_led = typecad.net(d1.pin(1), d3.pin(2));
typecad.route(d1_led);
const led_gnd = typecad.net(d3.pin(1), rf1.pin(1), y1.pin(1));
typecad.route(led_gnd);
// rf1.2 / y1.2 / r3.2 join GND through the single consolidated route above
const j71_u51 = typecad.net(u5.pin(2), j7.pin(2));
typecad.route(j71_u51);
typecad.text({ text: 'rd-skeleton', x: 62, y: 80, layer: 'F.SilkS', font: 'OCR A Std', width: 1.5, height: 1.5 });
// typecad.stitch('GND', { pitch: 2.5, margin: 5 });
// two explicit GND layer-tie vias (F.Cu↔B.Cu, the pour spans both layers),
// standard 0.6/0.3 geometry each rated for the full 1.5 A return — the pair
// shares it equally in the thermal view's via model (0.75 A each)
const viaTie = (x: number, y: number) =>
  new TrackBuilder(typecad, { net: 'GND' })
    .from({ x, y }, 'F.Cu')
    .via({ size: 0.6, drill: 0.3, powerInfo: { current: 1.5, maxTempRise: 10 } })
    .to({ x: x + 0.4, y }, 'B.Cu');
const gndVias = [viaTie(50, 38), viaTie(55, 40)];

typecad.create(
  r1, c1, l1, d1, d3, rf1, y1,
  r2, d2, c2, led2, q1, q2, sw1, r3,
  u3, u4, u7, u5, u6, x1, rv1,
  j6, j7, j3, j4, j5, sw3, sw2,
  ...gndVias,
);
 