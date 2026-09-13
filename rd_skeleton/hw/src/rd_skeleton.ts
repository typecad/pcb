import { PCB, Component } from '@typecad/pcb';

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
const d1 = new Component({ symbol: 'Device:D_Small', footprint: 'Diode_SMD:D_0805_2012Metric', reference: 'D1', value: '1N4148W' });
d1.pcb = { x: 59, y: 18 };
const led1 = new Component({ symbol: 'Device:LED', footprint: 'LED_SMD:LED_0805_2012Metric', reference: 'LED1', value: 'red' });
led1.pcb = { x: 73, y: 18 };
const f1 = new Component({ symbol: 'Device:Fuse_Small', footprint: 'Fuse:Fuse_0603_1608Metric', reference: 'F1', value: '500mA' });
f1.pcb = { x: 87, y: 18 };
const y1 = new Component({ symbol: 'Device:Crystal', footprint: 'Crystal:Crystal_SMD_3215-2Pin_3.2x1.5mm', reference: 'Y1', value: '8MHz' });
y1.pcb = { x: 101, y: 18 };

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

typecad.named('GND').net(c2.pin(2));
typecad.outline(10, 10, 104, 74, 0.1);

typecad.zone({
  net: 'GND',
  bounds: typecad.board,
  layers: ['F.Cu', 'B.Cu'],
  fillMode: 'hatched',
  hatchGap: 0.5,
  hatchThickness: 0.25,
});
const r12_c11 = typecad.net(r1.pin(2), c1.pin(1));
typecad.route(r12_c11);

typecad.text({ text: 'rd-skeleton', x: 62, y: 80, layer: 'F.SilkS', font: 'OCR A Std', width: 1.5, height: 1.5 });
typecad.stitch('GND', { pitch: 2.5, margin: 5 });
typecad.create(
  r1, c1, l1, d1, led1, f1, y1,
  r2, d2, c2, led2, q1, q2, sw1,
  u3, u4, u7, u5, u6, x1, rv1,
  j6, j7, j3, j4, j5, sw3, sw2,
);
 