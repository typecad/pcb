// ---------------------------------------------------------------------------
// Mod-EC v3 — lock-in impedance EC module (STM32G431)
//
// Full redesign of the 555-era v2. The probe is a 2-terminal cell
// (electrodes on J1.2 = DRIVE and J1.1 = PROBE_1); the measurement is
// synchronous (lock-in) demodulation, so the reading is the cell's
// in-phase (conductive) response with quadrature junk rejected.
//
// Signal chain:
//   DAC1_OUT1 (PA4) -> DRIVE/J1.2: sine centered at VCC/2 (zero DC ->
//   no electrolysis), amplitude/frequency set in firmware
//   cell -> PROBE_1/J1.1 -> R1 1k 0.1% sense -> GND
//   PROBE_1 -> ADC1_IN1 (PA0), sampled phase-locked to the sine
//   Rcell = R1 * (V_drive/V_sense - 1)  (magnitudes from the lock-in)
//
// Switches:
//   U3+R3  10k 0.1% across the cell (DRIVE<->PROBE_1) — injects a known
//          conductance to verify the whole chain (front-end self-check)
//   U4+R4  100R parallel sense resistor — high-conductivity range
//
// Controls: PB3 = REF_SW, PB4 = RANGE_SW.
// Layout + routing: manual.
// ---------------------------------------------------------------------------

import { PCB, Component, Connector, Resistor, Capacitor, TrackBuilder } from '@typecad/pcb';

const typecad = new PCB('mod-ec', {
  layers: 4,
  rules: {
    min_track_width: 0.127,
    min_clearance: 0.127,
    min_copper_edge_clearance: 0.02,
  },
});

typecad.stackup(4, { layers: { 'F.SilkS': { material: 'Liquid Photo', color: 'White' }, 'F.Mask': { thickness: 0.01, material: 'Dry Film', epsilon_r: 3.3, loss_tangent: 0, color: 'Green' }, 'F.Cu': { thickness: 0.035 }, 'dielectric 1': { thickness: 0.21, material: 'FR4', epsilon_r: 4.5, loss_tangent: 0.02, color: 'FR4 natural' }, 'In1.Cu': { thickness: 0.035 }, 'dielectric 2': { thickness: 1.02, material: 'FR4', epsilon_r: 4.5, loss_tangent: 0.02, color: 'FR4 natural' }, 'In2.Cu': { thickness: 0.035 }, 'dielectric 3': { thickness: 0.21, material: 'FR4', epsilon_r: 4.5, loss_tangent: 0.02, color: 'FR4 natural' }, 'B.Cu': { thickness: 0.035 }, 'B.Mask': { thickness: 0.01, material: 'Dry Film', epsilon_r: 3.3, loss_tangent: 0, color: 'Green' }, 'B.SilkS': { material: 'Liquid Photo', color: 'White' } } });
typecad.text({ text: "mod-EC v3", x: 145.75, y: 91.75, height: 1, width: 1, thickness: 0.25 });
typecad.text({ text: "PROBE", x: 135.1, y: 79.1, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: "DRIVE", x: 135.1, y: 81.7, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: "GND", x: 135.1, y: 84.3, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: "1_WIRE", x: 135.1, y: 86.85, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: "SWCLK", x: 135.1, y: 89.4, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: "SWDIO", x: 135.1, y: 91.8, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: "GND", x: 151.2, y: 79.25, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: "VCC", x: 151.3, y: 81.7, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: "SDA", x: 151.3, y: 84.3, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: "SCL", x: 151.3, y: 86.8, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: "X", x: 151.9, y: 89.35, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: "X", x: 151.9, y: 91.89, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: "microfire.co", x: 139.8, y: 94, layer: "B.SilkS", height: 1, width: 1, thickness: 0.15, justify: { mirror: true } });
typecad.outline(130, 78, 25, 15);

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

// EC probe connector (castellated edge, left side)
const j1 = new Connector({
  reference: 'J1',
  number: 6,
  footprint: 'uFire:CastellatedHeader-2.54x6',
  pcb: { x: 130.9, y: 85.52, rotation: 0 },
});
j1.valueLayout = { x: -0.05, y: 9.5, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
j1.referenceLayout = { x: 0.1, y: -2.5, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: false };
j1.pcb = { x: 130.9, y: 85.52 };
// I2C / UART power connector (castellated edge, right side)
const j2 = new Connector({
  reference: 'J2',
  number: 6,
  footprint: 'uFire:CastellatedHeader-2.54x6',
  pcb: { x: 154.34, y: 85.52, rotation: 180 },
});
j2.valueLayout = { x: -0.05, y: 9.5, rotation: 180, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
j2.referenceLayout = { x: 0.1, y: -2.5, rotation: 180, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: false };

// STM32G431KB — Cortex-M4F 170MHz, 4Msps ADC, dual DAC, 3 on-chip op-amps.
// Runs the lock-in demodulation entirely in firmware.
const u1 = new Component({
  reference: 'U1',
  value: 'STM32G431KBUx',
  symbol: 'MCU_ST_STM32G4:STM32G431KBUx',
  footprint: 'Package_DFN_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm',
  pcb: { x: 143.2, y: 85.4, rotation: 0 },
});
u1.fabLayout = { x: 0, y: 0, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
u1.valueLayout = { x: 0, y: 3.83, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
u1.referenceLayout = { x: 0, y: -3.83, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
u1.pcb = { x: 148.2, y: 82.2 };

// excitation + sense network
//
// LAYOUT ORDER (sense side, probe -> MCU): J1.1 -> R1 (sense, at the
// castellation; GND end via = cell-current return) -> node star point
// [D1 clamp first, then the R4/R3 switch taps] -> C2 (at the
// MCU pin: ADC kickback reservoir + anti-alias) -> PA0.
// DRIVE side: PA4 ->PB0 trace -> OPAMP2 -> PA7 -> R5 -> J1.2; sense
// returns to MID = PA6 (OPAMP1 buffered VCC/2 from DAC1_OUT2).
// Keep DAC_OUT/DRIVE and PROBE_1
// traces separated (coupling between them bypasses the cell).
const r1 = new Resistor({ reference: 'R1', value: '1k 0.1%', pcb: { x: 134.0, y: 79.5, rotation: 0 } });
r1.fabLayout = { x: 0, y: 0, rotation: 180, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
r1.valueLayout = { x: 0, y: 1.43, rotation: 180, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
r1.referenceLayout = { x: 0, y: -1.43, rotation: 180, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
r1.pcb = { x: 138, y: 88.6, rotation: 180 };
const c2 = new Capacitor({ reference: 'C2', value: '1nF C0G', pcb: { x: 140.6, y: 89.4, rotation: 0 } });
c2.fabLayout = { x: 0, y: 0, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
c2.valueLayout = { x: 0, y: 1.43, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c2.referenceLayout = { x: 0, y: 1.65, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c2.pcb = { x: 141.2, y: 88.6, rotation: 0 };
const d1 = new Component({
  reference: 'D1',
  value: 'BAT54S',
  symbol: 'Diode:BAT54S',
  footprint: 'Package_TO_SOT_SMD:SOT-323_SC-70',
  pcb: { x: 137.3, y: 80.7, rotation: 0 },
});
d1.fabLayout = { x: 0, y: 0, rotation: 90, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
d1.valueLayout = { x: 0, y: 1.8, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
d1.referenceLayout = { x: 0, y: -1.8, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
d1.pcb = { x: 137.8, y: 79.6, rotation: 180 };

// reference injection across the cell
const r3 = new Resistor({ reference: 'R3', value: '10k 0.1%', pcb: { x: 139.0, y: 79.0, rotation: 90 } });
r3.fabLayout = { x: 0, y: 0, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
r3.valueLayout = { x: 0, y: 1.43, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
r3.referenceLayout = { x: 2.4, y: -0.2, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
r3.pcb = { x: 133.6, y: 79.2, rotation: 0 };
// U3: TS3A24159 dual SPDT (0.3R Ron — 3x better than the single TS5A3160s
// it replaces, and the selector's Ron sits in series with the 1k sense leg).
// Ch1 = sense-leg selector: COM1->PROBE_1, NC1->R1 (1k default), NO1->R4
// (100k low-conductivity leg), IN1->RANGE_SW.
// Ch2 = reference injection: COM2->R3 (10k across the cell via NO2->DRIVE),
// NC2 unused, IN2->REF_SW.
// PIN MAP (verify vs TI datasheet): 1=VCC 2=NO1 3=NC1 4=IN1 5=COM1 6=GND
// 7=NO2 8=IN2 9=NC2 10=COM2
const u3 = new Component({
  reference: 'U3',
  value: 'TS3A24159DRC',
  symbol: 'Analog_Switch:TS3A24159DRC',
  footprint: 'Package_SON:Texas_S-PVSON-N10',
  pcb: { x: 137.5, y: 84.0, rotation: 0 },
});
u3.fabLayout = { x: 0, y: 0, rotation: 90, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
u3.valueLayout = { x: 0, y: 2.9, rotation: 90, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
u3.referenceLayout = { x: 0, y: 2.9, rotation: 180, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
u3.pcb = { x: 137.6, y: 84.8, rotation: 90 };

// sense-leg selector (SPDT): COM on PROBE_1, NC -> R1 1k (default, optimal
// for the mid range), NO -> R4 100k (low-conductivity leg — divider SNR
// optimum wants Rsense ~ R5+Rcell, so weak signals get the LARGE leg)
const r4 = new Resistor({ reference: 'R4', value: '100k 0.1%', pcb: { x: 137.5, y: 86.4, rotation: 0 } });
r4.fabLayout = { x: 0, y: 0, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
r4.valueLayout = { x: 0, y: 1.43, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
r4.referenceLayout = { x: 0.2, y: 1.65, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
r4.pcb = { x: 134.8, y: 88.6 };

// decoupling
const c1 = new Capacitor({ reference: 'C1', value: '100nF', pcb: { x: 143.3, y: 89.2, rotation: 0 } });
c1.fabLayout = { x: 0, y: 0, rotation: 180, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
c1.valueLayout = { x: 0, y: 1.43, rotation: 180, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c1.referenceLayout = { x: 0.75, y: 1.25, rotation: 180, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c1.pcb = { x: 133.75, y: 86.75, rotation: 180 }; // VDDA (pin 15 @ 144.45,87.84)
const c3 = new Capacitor({ reference: 'C3', value: '100nF', pcb: { x: 147.4, y: 87.9, rotation: 0 } });
c3.fabLayout = { x: 0, y: 0, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
c3.valueLayout = { x: 0, y: 1.43, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c3.referenceLayout = { x: 0, y: 1.1, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c3.pcb = { x: 143.4, y: 80.35, rotation: 180 }; // VDD (pin 17 @ 145.64,87.15) (pin 17 @ 145.64,87.15)
const c6 = new Capacitor({ reference: 'C6', value: '100nF', pcb: { x: 140.8, y: 81.4, rotation: 0 } });
c6.fabLayout = { x: 0, y: 0, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
c6.valueLayout = { x: 0, y: 1.43, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c6.referenceLayout = { x: 0, y: -1.43, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c6.pcb = { x: 143.425, y: 81.95, rotation: 180 }; // NRST (pin 4 @ 140.76,85.15)

// excitation series resistor: PA4 (DAC1_OUT1) -> R5 -> DRIVE. Keeps the
// DAC buffer's load >= ~1.1k even at the top of the range (the buffer is
// specified for >=5k; the residual droop/distortion is harmless because
// the firmware measures the ACTUAL drive on PA4 = ADC1_IN5 and uses the
// measured magnitude in the solve).
const r5 = new Resistor({ reference: 'R5', value: '1k 0.1%', pcb: { x: 146.0, y: 89.5, rotation: 0 } });
r5.fabLayout = { x: 0, y: 0, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
r5.valueLayout = { x: 0, y: 1.43, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
r5.referenceLayout = { x: 0, y: -1.43, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
r5.pcb = { x: 133.6, y: 81.6, rotation: 180 };

// SWDIO series resistor
const r2 = new Resistor({ reference: 'R2', value: '470', pcb: { x: 133.9, y: 91.9, rotation: 0 } });
r2.fabLayout = { x: 0, y: 0, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
r2.valueLayout = { x: 0, y: 1.43, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
r2.referenceLayout = { x: 2.6, y: 0.1, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };

// ---------------------------------------------------------------------------
// Nets
// ---------------------------------------------------------------------------

// power
typecad.named('VCC').net(j2.pin(5), u1.pin(1), u1.pin(15), u1.pin(17), c1.pin(1), c3.pin(1));
typecad.named('GND').net(
  j2.pin(6),
  j1.pin(3), // guard / spare probe pad
  u1.pin(14),
  u1.pin(16),
  u1.pin(32),
  u1.pin(33),
  c1.pin(2),
  c3.pin(2),
  c6.pin(2),
);
typecad.named('NRST').net(u1.pin(4), c6.pin(1));

// excitation + sense chain (2-terminal divider)
typecad.named('DAC1_OUT1').net(u1.pin(9), u1.pin(13)); // PA4 -> PB0 trace: feeds OPAMP2 VINP (VERIFY PB0 = OPAMP2_VINP0 on K pkg)
typecad.named('AMP_OUT').net(u1.pin(12), r5.pin(1)); // PA7 = OPAMP2_VOUT (drive buffer, also ADC1_IN8)
typecad.named('DRIVE').net(r5.pin(2), j1.pin(2), u3.pin(7)); // excitation + Ch2 NO2 reference throw
typecad.named('PROBE_1').net(
  j1.pin(1),
  u3.pin(5),
  r3.pin(1),
  d1.pin(3),
  c2.pin(1),
  u1.pin(5), // ADC1_IN1
);
typecad.named('GND').net(d1.pin(1)); // clamp bottom rail
typecad.named('DAC1_OUT2').net(u1.pin(10), u1.pin(6)); // PA5 -> PA1 trace: DAC1_OUT2 feeds OPAMP1 VINP
typecad.named('MID').net(c2.pin(2), r1.pin(2), r4.pin(2), u1.pin(11)); // PA6 = OPAMP1_VOUT: sense return + AA cap
typecad.named('VCC').net(d1.pin(2));

// switches
typecad.named('RANGE_SW').net(u1.pin(27), u3.pin(4)); // PB4 -> Ch1 IN1 (selector)
typecad.named('REF_SW').net(u1.pin(26), u3.pin(8)); // PB3 -> Ch2 IN2 (reference)
typecad.named('CH2_COM').net(u3.pin(10), r3.pin(2)); // Ch2 COM2
typecad.named('CH1_NC').net(u3.pin(3), r1.pin(1)); // Ch1 NC: default 1k sense leg
typecad.named('CH1_NO').net(u3.pin(2), r4.pin(1)); // Ch1 NO: 100k low-conductivity leg
typecad.named('VCC').net(u3.pin(1));
typecad.named('GND').net(u3.pin(6));

// host I2C
typecad.named('SDA').net(u1.pin(30), j2.pin(4)); // PB7 / I2C1_SDA
typecad.named('SCL').net(u1.pin(31), j2.pin(3)); // PB8 / I2C1_SCL

// host UART
typecad.named('UART_TX').net(u1.pin(19), j2.pin(1)); // PA9 / USART1_TX
typecad.named('UART_RX').net(u1.pin(20), j2.pin(2)); // PA10 / USART1_RX

// one-wire temperature probe pad (host-provided temp source)
// typecad.named('1_WIRE').net(u1.pin(25), j1.pin(4)); // PA15 (moved off PA7 = opamp output)

// SWD programming: SWDIO through R2 to the edge, SWCLK direct
typecad.named('SWDIO').net(u1.pin(23), r2.pin(1)); // PA13
typecad.named('SWDIO_E').net(r2.pin(2), j1.pin(6));
typecad.named('SWCLK').net(u1.pin(24), j1.pin(5)); // PA14

// ---------------------------------------------------------------------------
// Silkscreen
// ---------------------------------------------------------------------------

// typecad.text({ text: 'mod-EC v3', x: 135.9, y: 92.6, height: 1, width: 1, thickness: 0.25 });
// typecad.text({ text: 'PROBE', x: 135.1, y: 79.1, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
// typecad.text({ text: 'DRIVE', x: 135.1, y: 81.7, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
// typecad.text({ text: 'GND', x: 135.1, y: 84.3, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
// typecad.text({ text: '1_WIRE', x: 135.1, y: 86.85, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
// typecad.text({ text: 'SWCLK', x: 135.1, y: 89.4, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
// typecad.text({ text: 'SWDIO', x: 135.1, y: 91.8, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
// typecad.text({ text: 'GND', x: 151.2, y: 79.25, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
// typecad.text({ text: 'VCC', x: 151.3, y: 81.7, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
// typecad.text({ text: 'SDA', x: 151.3, y: 84.3, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
// typecad.text({ text: 'SCL', x: 151.3, y: 86.8, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
// typecad.text({ text: 'X', x: 151.9, y: 89.35, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
// typecad.text({ text: 'X', x: 151.9, y: 91.89, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
// typecad.text({ text: 'microfire.co', x: 139.8, y: 94, layer: 'B.SilkS', height: 1, width: 1, thickness: 0.15, justify: { mirror: true } });

// ---------------------------------------------------------------------------
// Ground pours — all four copper layers
// ---------------------------------------------------------------------------

typecad.zone({ net: 'GND', layers: ['F.Cu'], x: 130, y: 78, width: 25, height: 15, minThickness: 0.254, clearance: 0.254, fill: { thermalGap: 0.254, thermalBridgeWidth: 0.4064, islandRemovalMode: 2, islandAreaMin: 10} });
typecad.zone({ net: 'GND', layers: ['B.Cu'], x: 130, y: 78, width: 25, height: 15, minThickness: 0.254, clearance: 0.254, fill: { thermalGap: 0.254, thermalBridgeWidth: 0.4064, islandRemovalMode: 2, islandAreaMin: 10} });
typecad.zone({ net: 'GND', layers: ['In1.Cu'], x: 130, y: 78, width: 25, height: 15, minThickness: 0.254, clearance: 0.254, fill: { thermalGap: 0.254, thermalBridgeWidth: 0.4064, islandRemovalMode: 2, islandAreaMin: 10} });
typecad.zone({ net: 'GND', layers: ['In2.Cu'], x: 130, y: 78, width: 25, height: 15, minThickness: 0.254, clearance: 0.254, fill: { thermalGap: 0.254, thermalBridgeWidth: 0.4064, islandRemovalMode: 2, islandAreaMin: 10} });

// ---------------------------------------------------------------------------
// PLACEMENT — grounded in the built pads manifest (real pad coordinates).
//
// U1 field: pads x 140.76-145.64, y 82.96-87.84 (chip center 143.2, 85.4):
//   PA0 sense  (5)  @ 140.76,85.65   PA6 MID   (11) @ 142.45,87.84
//   PA1 op1+   (6)  @ 140.76,86.15   PA7 drive (12) @ 142.95,87.84
//   NRST       (4)  @ 140.76,85.15   PA4/PA5/PB0 (9/10/13) bottom row
//   VDD 17 @ 145.64,87.15  VDDA 15 @ 144.45,87.84  SDA 30 @ 142.45,82.96
//   SCL 31 @ 141.95,82.96  SWDIO 23 @ 145.64,84.15  SWCLK 24 @ 145.64,83.65
// J1: PROBE_1 (1) @ 131.24,79.16   DRIVE (2) @ 131.24,81.7
//     1_WIRE (4) @ 131.24,86.78   SWCLK (5) @ 131.24,89.32  SWDIO_E (6) @ 131.24,91.86
// J2: GND (6) @ 153.73,79.18  VCC (5) @ 153.73,81.72  SDA (4) @ 153.73,84.26  SCL (3) @ 153.73,86.8
//
// Analog signal-path order (sense): J1.1 -> R1 (Kelvin, at the castellation)
// -> D1 (clamp, first tap) -> U3 taps -> C2 -> PA0.
//
// TRACE WIDTHS for routing (IPC-2221, external, 1 oz, 10 C rise; current
// budget: VCC/GND 150 mA design, analog <= 0.8 mA, SWD bursts ~30 mA):
//   VCC/GND feeds ....... 0.40 mm  (~1.7 A capacity)
//   analog + I2C ......... 0.20 mm  (~0.7 A)
//   digital (SWD/UART/1W)  0.15 mm  (~0.4 A)
//   powerInfo({ current: 0.15, maxTempRise: 10, thickness: 35 }) on VCC/GND
// MID return traces: star them to PA6; a short In1 hop under the chip is
// clean if F.Cu crossings bite. GND: everything lands in the F/B pours.
// ---------------------------------------------------------------------------

// Net: VCC
const track_VCC: TrackBuilder[] = [];
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 141.7595, y: 78.95 }, "F.Cu", 0.127).to({ x: 142, y: 78.7095, layer: "F.Cu", width: 0.127 }).via({ size: 0.6, drill: 0.3 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 142.5345, y: 78.7095 }, "F.Cu", 0.25).to({ x: 144.175, y: 80.35, layer: "F.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 149.45, y: 85.2 }, "F.Cu", 0.127).to({ x: 150, y: 85.75, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 134.5, y: 85.75 }, "F.Cu", 0.25).to({ x: 134.5, y: 86.725, layer: "F.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 145.7625, y: 80.45 }, "F.Cu", 0.127).to({ x: 144.275, y: 80.45, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 150.6375, y: 84.8645 }, "F.Cu", 0.127).to({ x: 150.502, y: 85, layer: "F.Cu", width: 0.127 }).via({ size: 0.6, drill: 0.3 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 135.25, y: 86.75 }, "F.Cu", 0.127).to({ x: 135.75, y: 86.25, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 134.5, y: 86.725 }, "F.Cu", 0.25).to({ x: 134.525, y: 86.75, layer: "F.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 135.775, y: 86.275 }, "F.Cu", 0.127).to({ x: 136.6, y: 86.275, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 150, y: 85.75 }, "F.Cu", 0.127).to({ x: 150.502, y: 85.248, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 150.6375, y: 83.95 }, "F.Cu", 0.127).to({ x: 150.6375, y: 84.8645, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 135.75, y: 86.25 }, "F.Cu", 0.127).to({ x: 135.775, y: 86.275, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 144.275, y: 80.45 }, "F.Cu", 0.127).to({ x: 144.175, y: 80.35, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 134.525, y: 86.75 }, "F.Cu", 0.127).to({ x: 135.25, y: 86.75, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 149.45, y: 84.6375 }, "F.Cu", 0.127).to({ x: 149.45, y: 85.2, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 150.502, y: 85.248 }, "F.Cu", 0.127).to({ x: 150.502, y: 85, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 138.6875, y: 78.95 }, "F.Cu", 0.127).to({ x: 141.7595, y: 78.95, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 142, y: 78.7095 }, "F.Cu", 0.25).to({ x: 142.5345, y: 78.7095, layer: "F.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 144.5595, y: 82.5 }, "In1.Cu", 0.25).to({ x: 152.5, y: 82.5, layer: "In1.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 138.5, y: 84.75 }, "In1.Cu", 0.25).to({ x: 135.5, y: 84.75, layer: "In1.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 143.52975, y: 81.47025 }, "In1.Cu", 0.25).to({ x: 144.5595, y: 82.5, layer: "In1.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 150.502, y: 84.498 }, "In1.Cu", 0.25).to({ x: 150.502, y: 85, layer: "In1.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 141.77975, y: 81.47025 }, "In1.Cu", 0.25).to({ x: 138.5, y: 84.75, layer: "In1.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 142, y: 78.7095 }, "In1.Cu", 0.25).to({ x: 142, y: 79.9405, layer: "In1.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 153.28, y: 81.72 }, "In1.Cu", 0.25).to({ x: 154, y: 81.72, layer: "In1.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 142, y: 79.9405 }, "In1.Cu", 0.25).to({ x: 143.52975, y: 81.47025, layer: "In1.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 152.5, y: 82.5 }, "In1.Cu", 0.25).to({ x: 153.28, y: 81.72, layer: "In1.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 143.52975, y: 81.47025 }, "In1.Cu", 0.25).to({ x: 141.77975, y: 81.47025, layer: "In1.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 152.5, y: 82.5 }, "In1.Cu", 0.25).to({ x: 150.502, y: 84.498, layer: "In1.Cu", width: 0.25 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 135.5, y: 84.75 }, "In1.Cu", 0.25).to({ x: 134.5, y: 85.75, layer: "In1.Cu", width: 0.25 }).via({ size: 0.6, drill: 0.3 }));

// Net: GND
const track_GND: TrackBuilder[] = [];
track_GND.push(typecad.track({ net: 'GND' }).from({ x: 148.95, y: 82.95 }, "F.Cu", 0.127).to({ x: 148.2, y: 82.2, layer: "F.Cu", width: 0.127 }));
track_GND.push(typecad.track({ net: 'GND' }).from({ x: 145.4875, y: 78.8 }, "F.Cu", 0.127).to({ x: 145.4, y: 78.8, layer: "F.Cu", width: 0.127 }));
track_GND.push(typecad.track({ net: 'GND' }).from({ x: 146.45, y: 79.7625 }, "F.Cu", 0.127).to({ x: 145.4875, y: 78.8, layer: "F.Cu", width: 0.127 }));
track_GND.push(typecad.track({ net: 'GND' }).from({ x: 146.45, y: 80.45 }, "F.Cu", 0.127).to({ x: 148.2, y: 82.2, layer: "F.Cu", width: 0.127 }));
track_GND.push(typecad.track({ net: 'GND' }).from({ x: 149.95, y: 83.95 }, "F.Cu", 0.127).to({ x: 148.2, y: 82.2, layer: "F.Cu", width: 0.127 }));
track_GND.push(typecad.track({ net: 'GND' }).from({ x: 149.95, y: 84.6375 }, "F.Cu", 0.127).to({ x: 149.95, y: 83.95, layer: "F.Cu", width: 0.127 }));
track_GND.push(typecad.track({ net: 'GND' }).from({ x: 146.45, y: 79.7625 }, "F.Cu", 0.127).to({ x: 146.45, y: 80.45, layer: "F.Cu", width: 0.127 }));
track_GND.push(typecad.track({ net: 'GND' }).from({ x: 148.95, y: 84.6375 }, "F.Cu", 0.127).to({ x: 148.95, y: 82.95, layer: "F.Cu", width: 0.127 }));

// Net: NRST
const track_NRST: TrackBuilder[] = [];
track_NRST.push(typecad.track({ net: 'NRST' }).from({ x: 145.7625, y: 81.95 }, "F.Cu", 0.127).to({ x: 144.2, y: 81.95, layer: "F.Cu", width: 0.127 }));

// Net: DAC1_OUT1
const track_DAC1_OUT1: TrackBuilder[] = [];
track_DAC1_OUT1.push(typecad.track({ net: 'DAC1_OUT1' }).from({ x: 145.6, y: 84.8 }, "F.Cu", 0.127).to({ x: 146.2875, y: 84.8, layer: "F.Cu", width: 0.127 }));
track_DAC1_OUT1.push(typecad.track({ net: 'DAC1_OUT1' }).from({ x: 148.4405, y: 85.4595 }, "F.Cu", 0.127).to({ x: 148.45, y: 85.45, layer: "F.Cu", width: 0.127 }).to({ x: 148.45, y: 84.6375, layer: "F.Cu", width: 0.127 }));
track_DAC1_OUT1.push(typecad.track({ net: 'DAC1_OUT1' }).from({ x: 148.4405, y: 85.794314 }, "F.Cu", 0.127).to({ x: 148.4405, y: 85.4595, layer: "F.Cu", width: 0.127 }));
track_DAC1_OUT1.push(typecad.track({ net: 'DAC1_OUT1' }).from({ x: 146.2875, y: 84.8 }, "F.Cu", 0.127).to({ x: 146.45, y: 84.6375, layer: "F.Cu", width: 0.127 }));
track_DAC1_OUT1.push(typecad.track({ net: 'DAC1_OUT1' }).from({ x: 146.6, y: 85.8 }, "In1.Cu", 0.127).to({ x: 145.6, y: 84.8, layer: "In1.Cu", width: 0.127 }).via({ size: 0.6, drill: 0.3 }));
track_DAC1_OUT1.push(typecad.track({ net: 'DAC1_OUT1' }).from({ x: 148.4405, y: 85.794314 }, "In1.Cu", 0.127).to({ x: 148.434814, y: 85.8, layer: "In1.Cu", width: 0.127 }).to({ x: 146.6, y: 85.8, layer: "In1.Cu", width: 0.127 }));

// Net: AMP_OUT
const track_AMP_OUT: TrackBuilder[] = [];
track_AMP_OUT.push(typecad.track({ net: 'AMP_OUT' }).from({ x: 147.95, y: 85.9405 }, "F.Cu", 0.127).to({ x: 147.6, y: 86.2905, layer: "F.Cu", width: 0.127 }).via({ size: 0.6, drill: 0.3 }));
track_AMP_OUT.push(typecad.track({ net: 'AMP_OUT' }).from({ x: 147.95, y: 84.6375 }, "F.Cu", 0.127).to({ x: 147.95, y: 85.9405, layer: "F.Cu", width: 0.127 }));
track_AMP_OUT.push(typecad.track({ net: 'AMP_OUT' }).from({ x: 135.6, y: 81.6 }, "F.Cu", 0.127).to({ x: 134.425, y: 81.6, layer: "F.Cu", width: 0.127 }));
track_AMP_OUT.push(typecad.track({ net: 'AMP_OUT' }).from({ x: 139.4905, y: 85.4905 }, "B.Cu", 0.127).to({ x: 135.6, y: 81.6, layer: "B.Cu", width: 0.127 }).via({ size: 0.6, drill: 0.3 }));
track_AMP_OUT.push(typecad.track({ net: 'AMP_OUT' }).from({ x: 138.9095, y: 86.0715 }, "B.Cu", 0.127).to({ x: 138.9095, y: 87.403172, layer: "B.Cu", width: 0.127 }));
track_AMP_OUT.push(typecad.track({ net: 'AMP_OUT' }).from({ x: 139.4905, y: 85.4905 }, "B.Cu", 0.127).to({ x: 138.9095, y: 86.0715, layer: "B.Cu", width: 0.127 }));
track_AMP_OUT.push(typecad.track({ net: 'AMP_OUT' }).from({ x: 138.9095, y: 87.403172 }, "B.Cu", 0.127).to({ x: 139.196828, y: 87.6905, layer: "B.Cu", width: 0.127 }));
track_AMP_OUT.push(typecad.track({ net: 'AMP_OUT' }).from({ x: 146.2, y: 87.6905 }, "B.Cu", 0.127).to({ x: 147.6, y: 86.2905, layer: "B.Cu", width: 0.127 }));
track_AMP_OUT.push(typecad.track({ net: 'AMP_OUT' }).from({ x: 139.196828, y: 87.6905 }, "B.Cu", 0.127).to({ x: 146.2, y: 87.6905, layer: "B.Cu", width: 0.127 }));

// Net: DRIVE
const track_DRIVE: TrackBuilder[] = [];
track_DRIVE.push(typecad.track({ net: 'DRIVE' }).from({ x: 138, y: 82.94 }, "F.Cu", 0.127).to({ x: 138.1, y: 83.04, layer: "F.Cu", width: 0.127 }));
track_DRIVE.push(typecad.track({ net: 'DRIVE' }).from({ x: 132.675, y: 81.7 }, "F.Cu", 0.127).to({ x: 132.775, y: 81.6, layer: "F.Cu", width: 0.127 }));
track_DRIVE.push(typecad.track({ net: 'DRIVE' }).from({ x: 138, y: 82 }, "F.Cu", 0.127).to({ x: 138, y: 82.94, layer: "F.Cu", width: 0.127 }));
track_DRIVE.push(typecad.track({ net: 'DRIVE' }).from({ x: 131.24, y: 81.7 }, "F.Cu", 0.127).to({ x: 132.675, y: 81.7, layer: "F.Cu", width: 0.127 }));
track_DRIVE.push(typecad.track({ net: 'DRIVE' }).from({ x: 131.24, y: 81.7 }, "In1.Cu", 0.127).to({ x: 131.8305, y: 81.1095, layer: "In1.Cu", width: 0.127 }));
track_DRIVE.push(typecad.track({ net: 'DRIVE' }).from({ x: 137.1095, y: 81.1095 }, "In1.Cu", 0.127).to({ x: 138, y: 82, layer: "In1.Cu", width: 0.127 }).via({ size: 0.6, drill: 0.3 }));
track_DRIVE.push(typecad.track({ net: 'DRIVE' }).from({ x: 131.8305, y: 81.1095 }, "In1.Cu", 0.127).to({ x: 137.1095, y: 81.1095, layer: "In1.Cu", width: 0.127 }));

// Net: PROBE_1
const track_PROBE_1: TrackBuilder[] = [];
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 140.425, y: 86.825 }, "F.Cu", 0.127).to({ x: 140.425, y: 88.6, layer: "F.Cu", width: 0.127 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 132.735, y: 79.16 }, "F.Cu", 0.127).to({ x: 132.775, y: 79.2, layer: "F.Cu", width: 0.127 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 138.6, y: 86.275 }, "F.Cu", 0.127).to({ x: 139.875, y: 86.275, layer: "F.Cu", width: 0.127 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 136.9125, y: 79.6 }, "F.Cu", 0.127).to({ x: 139.875, y: 82.5625, layer: "F.Cu", width: 0.127 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 135.7125, y: 78.4 }, "F.Cu", 0.127).to({ x: 136.9125, y: 79.6, layer: "F.Cu", width: 0.127 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 140.1125, y: 82.8 }, "F.Cu", 0.127).to({ x: 139.875, y: 82.5625, layer: "F.Cu", width: 0.127 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 132.775, y: 79.2 }, "F.Cu", 0.127).to({ x: 133.575, y: 78.4, layer: "F.Cu", width: 0.127 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 139.875, y: 82.5625 }, "F.Cu", 0.127).to({ x: 139.875, y: 86.275, layer: "F.Cu", width: 0.127 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 131.24, y: 79.16 }, "F.Cu", 0.127).to({ x: 132.735, y: 79.16, layer: "F.Cu", width: 0.127 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 145.325001, y: 82.45 }, "F.Cu", 0.127).to({ x: 144.975001, y: 82.8, layer: "F.Cu", width: 0.127 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 133.575, y: 78.4 }, "F.Cu", 0.127).to({ x: 135.7125, y: 78.4, layer: "F.Cu", width: 0.127 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 145.7625, y: 82.45 }, "F.Cu", 0.127).to({ x: 145.325001, y: 82.45, layer: "F.Cu", width: 0.127 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 139.875, y: 86.275 }, "F.Cu", 0.127).to({ x: 140.425, y: 86.825, layer: "F.Cu", width: 0.127 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 144.975001, y: 82.8 }, "F.Cu", 0.127).to({ x: 140.1125, y: 82.8, layer: "F.Cu", width: 0.127 }));

// Net: DAC1_OUT2
const track_DAC1_OUT2: TrackBuilder[] = [];
track_DAC1_OUT2.push(typecad.track({ net: 'DAC1_OUT2' }).from({ x: 145.1095, y: 85.003172 }, "F.Cu", 0.127).to({ x: 145.706328, y: 85.6, layer: "F.Cu", width: 0.127 }));
track_DAC1_OUT2.push(typecad.track({ net: 'DAC1_OUT2' }).from({ x: 145.7625, y: 82.95 }, "F.Cu", 0.127).to({ x: 145.325001, y: 82.95, layer: "F.Cu", width: 0.127 }).to({ x: 145.1095, y: 83.165501, layer: "F.Cu", width: 0.127 }));
track_DAC1_OUT2.push(typecad.track({ net: 'DAC1_OUT2' }).from({ x: 146.95, y: 85.215789 }, "F.Cu", 0.127).to({ x: 146.95, y: 84.6375, layer: "F.Cu", width: 0.127 }));
track_DAC1_OUT2.push(typecad.track({ net: 'DAC1_OUT2' }).from({ x: 145.706328, y: 85.6 }, "F.Cu", 0.127).to({ x: 146.565789, y: 85.6, layer: "F.Cu", width: 0.127 }).to({ x: 146.95, y: 85.215789, layer: "F.Cu", width: 0.127 }));
track_DAC1_OUT2.push(typecad.track({ net: 'DAC1_OUT2' }).from({ x: 145.1095, y: 83.165501 }, "F.Cu", 0.127).to({ x: 145.1095, y: 85.003172, layer: "F.Cu", width: 0.127 }));

// Net: MID
const track_MID: TrackBuilder[] = [];
track_MID.push(typecad.track({ net: 'MID' }).from({ x: 143.924999, y: 88.6 }, "F.Cu", 0.127).to({ x: 141.975, y: 88.6, layer: "F.Cu", width: 0.127 }));
track_MID.push(typecad.track({ net: 'MID' }).from({ x: 135.625, y: 88.6 }, "F.Cu", 0.127).to({ x: 137.175, y: 88.6, layer: "F.Cu", width: 0.127 }));
track_MID.push(typecad.track({ net: 'MID' }).from({ x: 138.075, y: 89.5 }, "F.Cu", 0.127).to({ x: 141.075, y: 89.5, layer: "F.Cu", width: 0.127 }).to({ x: 141.975, y: 88.6, layer: "F.Cu", width: 0.127 }));
track_MID.push(typecad.track({ net: 'MID' }).from({ x: 137.175, y: 88.6 }, "F.Cu", 0.127).to({ x: 138.075, y: 89.5, layer: "F.Cu", width: 0.127 }));
track_MID.push(typecad.track({ net: 'MID' }).from({ x: 147.45, y: 84.6375 }, "F.Cu", 0.127).to({ x: 147.45, y: 85.074999, layer: "F.Cu", width: 0.127 }).to({ x: 143.924999, y: 88.6, layer: "F.Cu", width: 0.127 }));

// Net: RANGE_SW
const track_RANGE_SW: TrackBuilder[] = [];
track_RANGE_SW.push(typecad.track({ net: 'RANGE_SW' }).from({ x: 149, y: 78.6 }, "F.Cu", 0.127).to({ x: 149, y: 79.7125, layer: "F.Cu", width: 0.127 }));
track_RANGE_SW.push(typecad.track({ net: 'RANGE_SW' }).from({ x: 138.1, y: 86.275 }, "F.Cu", 0.127).to({ x: 138.1, y: 86.721, layer: "F.Cu", width: 0.127 }).to({ x: 138.579, y: 87.2, layer: "F.Cu", width: 0.127 }).to({ x: 139.4, y: 87.2, layer: "F.Cu", width: 0.127 }).via({ size: 0.6, drill: 0.3 }));
track_RANGE_SW.push(typecad.track({ net: 'RANGE_SW' }).from({ x: 149, y: 79.7125 }, "F.Cu", 0.127).to({ x: 148.95, y: 79.7625, layer: "F.Cu", width: 0.127 }));
track_RANGE_SW.push(typecad.track({ net: 'RANGE_SW' }).from({ x: 146.3095, y: 80.2905 }, "B.Cu", 0.127).to({ x: 146.3095, y: 78.396828, layer: "B.Cu", width: 0.127 }));
track_RANGE_SW.push(typecad.track({ net: 'RANGE_SW' }).from({ x: 146.596828, y: 78.1095 }, "B.Cu", 0.127).to({ x: 148.5095, y: 78.1095, layer: "B.Cu", width: 0.127 }));
track_RANGE_SW.push(typecad.track({ net: 'RANGE_SW' }).from({ x: 146.3095, y: 78.396828 }, "B.Cu", 0.127).to({ x: 146.596828, y: 78.1095, layer: "B.Cu", width: 0.127 }));
track_RANGE_SW.push(typecad.track({ net: 'RANGE_SW' }).from({ x: 148.5095, y: 78.1095 }, "B.Cu", 0.127).to({ x: 149, y: 78.6, layer: "B.Cu", width: 0.127 }).via({ size: 0.6, drill: 0.3 }));
track_RANGE_SW.push(typecad.track({ net: 'RANGE_SW' }).from({ x: 139.4, y: 87.2 }, "B.Cu", 0.127).to({ x: 146.3095, y: 80.2905, layer: "B.Cu", width: 0.127 }));

// Net: REF_SW
const track_REF_SW: TrackBuilder[] = [];
track_REF_SW.push(typecad.track({ net: 'REF_SW' }).from({ x: 149.45, y: 79.7625 }, "F.Cu", 0.127).to({ x: 149.45, y: 79.15, layer: "F.Cu", width: 0.127 }));
track_REF_SW.push(typecad.track({ net: 'REF_SW' }).from({ x: 137.6, y: 83.325 }, "F.Cu", 0.127).to({ x: 137.6, y: 82.4, layer: "F.Cu", width: 0.127 }).to({ x: 137, y: 81.8, layer: "F.Cu", width: 0.127 }).via({ size: 0.6, drill: 0.3 }));
track_REF_SW.push(typecad.track({ net: 'REF_SW' }).from({ x: 149.45, y: 79.15 }, "F.Cu", 0.127).to({ x: 150, y: 78.6, layer: "F.Cu", width: 0.127 }).via({ size: 0.6, drill: 0.3 }));
track_REF_SW.push(typecad.track({ net: 'REF_SW' }).from({ x: 149.4, y: 79.2 }, "In2.Cu", 0.127).to({ x: 144.75, y: 79.2, layer: "In2.Cu", width: 0.127 }).to({ x: 139.6, y: 79.2, layer: "In2.Cu", width: 0.127 }).to({ x: 137, y: 81.8, layer: "In2.Cu", width: 0.127 }));
track_REF_SW.push(typecad.track({ net: 'REF_SW' }).from({ x: 150, y: 78.6 }, "In2.Cu", 0.127).to({ x: 149.4, y: 79.2, layer: "In2.Cu", width: 0.127 }));

// Net: CH2_COM
const track_CH2_COM: TrackBuilder[] = [];
track_CH2_COM.push(typecad.track({ net: 'CH2_COM' }).from({ x: 134.425, y: 79.2 }, "F.Cu", 0.127).to({ x: 133.6, y: 80.025, layer: "F.Cu", width: 0.127 }).to({ x: 133.6, y: 82.6, layer: "F.Cu", width: 0.127 }).to({ x: 134.325, y: 83.325, layer: "F.Cu", width: 0.127 }).to({ x: 136.6, y: 83.325, layer: "F.Cu", width: 0.127 }));

// Net: CH1_NC
const track_CH1_NC: TrackBuilder[] = [];
track_CH1_NC.push(typecad.track({ net: 'CH1_NC' }).from({ x: 137.6, y: 86.275 }, "F.Cu", 0.127).to({ x: 137.6, y: 86.721, layer: "F.Cu", width: 0.127 }).to({ x: 138.825, y: 87.946, layer: "F.Cu", width: 0.127 }).to({ x: 138.825, y: 88.6, layer: "F.Cu", width: 0.127 }));

// Net: CH1_NO
const track_CH1_NO: TrackBuilder[] = [];
track_CH1_NO.push(typecad.track({ net: 'CH1_NO' }).from({ x: 137.1, y: 86.275 }, "F.Cu", 0.127).to({ x: 137.1, y: 86.721, layer: "F.Cu", width: 0.127 }).to({ x: 135.8865, y: 87.9345, layer: "F.Cu", width: 0.127 }).to({ x: 134.6405, y: 87.9345, layer: "F.Cu", width: 0.127 }).to({ x: 133.975, y: 88.6, layer: "F.Cu", width: 0.127 }));

// Net: SDA
const track_SDA: TrackBuilder[] = [];
track_SDA.push(typecad.track({ net: 'SDA' }).from({ x: 147.45, y: 79.7625 }, "F.Cu", 0.127).to({ x: 147.45, y: 79.15, layer: "F.Cu", width: 0.127 }).to({ x: 148, y: 78.6, layer: "F.Cu", width: 0.127 }).via({ size: 0.6, drill: 0.3 }));
track_SDA.push(typecad.track({ net: 'SDA' }).from({ x: 153.2095, y: 83.4695 }, "B.Cu", 0.127).to({ x: 154, y: 84.26, layer: "B.Cu", width: 0.127 }));
track_SDA.push(typecad.track({ net: 'SDA' }).from({ x: 153.2095, y: 81.2095 }, "B.Cu", 0.127).to({ x: 153.2095, y: 83.4695, layer: "B.Cu", width: 0.127 }));
track_SDA.push(typecad.track({ net: 'SDA' }).from({ x: 151.3095, y: 79.3095 }, "B.Cu", 0.127).to({ x: 153.2095, y: 81.2095, layer: "B.Cu", width: 0.127 }));
track_SDA.push(typecad.track({ net: 'SDA' }).from({ x: 148, y: 78.6 }, "B.Cu", 0.127).to({ x: 148.7095, y: 79.3095, layer: "B.Cu", width: 0.127 }).to({ x: 151.3095, y: 79.3095, layer: "B.Cu", width: 0.127 }));

// Net: SCL
const track_SCL: TrackBuilder[] = [];
track_SCL.push(typecad.track({ net: 'SCL' }).from({ x: 146.95, y: 78.75 }, "F.Cu", 0.127).to({ x: 146.8, y: 78.6, layer: "F.Cu", width: 0.127 }).via({ size: 0.6, drill: 0.3 }));
track_SCL.push(typecad.track({ net: 'SCL' }).from({ x: 146.95, y: 79.7625 }, "F.Cu", 0.127).to({ x: 146.95, y: 78.75, layer: "F.Cu", width: 0.127 }));
track_SCL.push(typecad.track({ net: 'SCL' }).from({ x: 154, y: 85.8 }, "B.Cu", 0.127).to({ x: 154, y: 86.8, layer: "B.Cu", width: 0.127 }));
track_SCL.push(typecad.track({ net: 'SCL' }).from({ x: 146.8, y: 78.6 }, "B.Cu", 0.127).to({ x: 154, y: 85.8, layer: "B.Cu", width: 0.127 }));

// Net: UART_TX
const track_UART_TX: TrackBuilder[] = [];
track_UART_TX.push(typecad.track({ net: 'UART_TX' }).from({ x: 150.6375, y: 82.95 }, "F.Cu", 0.127).to({ x: 151.074999, y: 82.95, layer: "F.Cu", width: 0.127 }).to({ x: 151.75, y: 83.625001, layer: "F.Cu", width: 0.127 }));
track_UART_TX.push(typecad.track({ net: 'UART_TX' }).from({ x: 151.75, y: 89.63 }, "F.Cu", 0.127).to({ x: 154, y: 91.88, layer: "F.Cu", width: 0.127 }));
track_UART_TX.push(typecad.track({ net: 'UART_TX' }).from({ x: 151.75, y: 83.625001 }, "F.Cu", 0.127).to({ x: 151.75, y: 89.63, layer: "F.Cu", width: 0.127 }));

// Net: UART_RX
const track_UART_RX: TrackBuilder[] = [];
track_UART_RX.push(typecad.track({ net: 'UART_RX' }).from({ x: 152, y: 83.489408 }, "F.Cu", 0.127).to({ x: 152, y: 83.515791, layer: "F.Cu", width: 0.127 }));
track_UART_RX.push(typecad.track({ net: 'UART_RX' }).from({ x: 152.004, y: 87.344 }, "F.Cu", 0.127).to({ x: 154, y: 89.34, layer: "F.Cu", width: 0.127 }));
track_UART_RX.push(typecad.track({ net: 'UART_RX' }).from({ x: 150.6375, y: 82.45 }, "F.Cu", 0.127).to({ x: 150.960592, y: 82.45, layer: "F.Cu", width: 0.127 }));
track_UART_RX.push(typecad.track({ net: 'UART_RX' }).from({ x: 152, y: 83.515791 }, "F.Cu", 0.127).to({ x: 152.004, y: 83.519791, layer: "F.Cu", width: 0.127 }));
track_UART_RX.push(typecad.track({ net: 'UART_RX' }).from({ x: 150.960592, y: 82.45 }, "F.Cu", 0.127).to({ x: 152, y: 83.489408, layer: "F.Cu", width: 0.127 }));
track_UART_RX.push(typecad.track({ net: 'UART_RX' }).from({ x: 152.004, y: 83.519791 }, "F.Cu", 0.127).to({ x: 152.004, y: 87.344, layer: "F.Cu", width: 0.127 }));

// Net: SWDIO
const track_SWDIO: TrackBuilder[] = [];
track_SWDIO.push(typecad.track({ net: 'SWDIO' }).from({ x: 133.075, y: 90.675 }, "F.Cu", 0.127).to({ x: 133.075, y: 91.9, layer: "F.Cu", width: 0.127 }));
track_SWDIO.push(typecad.track({ net: 'SWDIO' }).from({ x: 150.6375, y: 80.95 }, "F.Cu", 0.127).to({ x: 151.55, y: 80.95, layer: "F.Cu", width: 0.127 }));
track_SWDIO.push(typecad.track({ net: 'SWDIO' }).from({ x: 133, y: 90.6 }, "F.Cu", 0.127).to({ x: 133.075, y: 90.675, layer: "F.Cu", width: 0.127 }));
track_SWDIO.push(typecad.track({ net: 'SWDIO' }).from({ x: 151.8, y: 81.2 }, "In2.Cu", 0.127).to({ x: 142.4, y: 81.2, layer: "In2.Cu", width: 0.127 }).to({ x: 133, y: 90.6, layer: "In2.Cu", width: 0.127 }).via({ size: 0.6, drill: 0.3 }));

// Net: SWDIO_E
const track_SWDIO_E: TrackBuilder[] = [];
track_SWDIO_E.push(typecad.track({ net: 'SWDIO_E' }).from({ x: 134.0595, y: 92.5655 }, "F.Cu", 0.127).to({ x: 134.725, y: 91.9, layer: "F.Cu", width: 0.127 }));
track_SWDIO_E.push(typecad.track({ net: 'SWDIO_E' }).from({ x: 131.9455, y: 92.5655 }, "F.Cu", 0.127).to({ x: 134.0595, y: 92.5655, layer: "F.Cu", width: 0.127 }));
track_SWDIO_E.push(typecad.track({ net: 'SWDIO_E' }).from({ x: 131.24, y: 91.86 }, "F.Cu", 0.127).to({ x: 131.9455, y: 92.5655, layer: "F.Cu", width: 0.127 }));

// Net: SWCLK
const track_SWCLK: TrackBuilder[] = [];
track_SWCLK.push(typecad.track({ net: 'SWCLK' }).from({ x: 151, y: 80.0875 }, "F.Cu", 0.127).to({ x: 150.6375, y: 80.45, layer: "F.Cu", width: 0.127 }));
track_SWCLK.push(typecad.track({ net: 'SWCLK' }).from({ x: 142.8, y: 79.8 }, "In2.Cu", 0.127).to({ x: 139.3, y: 83.3, layer: "In2.Cu", width: 0.127 }).to({ x: 133.28, y: 89.32, layer: "In2.Cu", width: 0.127 }));
track_SWCLK.push(typecad.track({ net: 'SWCLK' }).from({ x: 151, y: 79.8 }, "In2.Cu", 0.127).to({ x: 142.8, y: 79.8, layer: "In2.Cu", width: 0.127 }));
track_SWCLK.push(typecad.track({ net: 'SWCLK' }).from({ x: 133.28, y: 89.32 }, "In2.Cu", 0.127).to({ x: 131.24, y: 89.32, layer: "In2.Cu", width: 0.127 }));

typecad.via({ at: { x: 135.8, y: 80.4 }, net: 'GND', size: 0.6, drill: 0.3 });
typecad.via({ at: { x: 139, y: 82.4 }, net: 'GND', size: 0.6, drill: 0.3 });
typecad.via({ at: { x: 152.75, y: 89.25 }, net: 'GND', size: 0.6, drill: 0.3 });
typecad.via({ at: { x: 143.75, y: 78.5 }, net: 'GND', size: 0.6, drill: 0.3 });
typecad.via({ at: { x: 132.75, y: 80.25 }, net: 'GND', size: 0.6, drill: 0.3 });
typecad.via({ at: { x: 139.8, y: 80.4 }, net: 'GND', size: 0.6, drill: 0.3 });
typecad.via({ at: { x: 137.25, y: 87.5 }, net: 'GND', size: 0.6, drill: 0.3 });
typecad.via({ at: { x: 148.4405, y: 85.794314 }, net: 'DAC1_OUT1', size: 0.6, drill: 0.3 });
typecad.via({ at: { x: 144.75, y: 79.2 }, net: 'REF_SW', size: 0.6, drill: 0.3 });
typecad.via({ at: { x: 151.8, y: 81.2 }, net: 'SWDIO', size: 0.6, drill: 0.3 });
typecad.via({ at: { x: 151, y: 79.8 }, net: 'SWCLK', size: 0.6, drill: 0.3 });

typecad.create(
  j1,
  j2,
  u1,
  u3,
  d1,
  r1,
  r2,
  r3,
  r4,
  r5,
  c1,
  c2,
  c3,
  c6,
  ...track_VCC,
  ...track_GND,
  ...track_NRST,
  ...track_DAC1_OUT1,
  ...track_AMP_OUT,
  ...track_DRIVE,
  ...track_PROBE_1,
  ...track_DAC1_OUT2,
  ...track_MID,
  ...track_RANGE_SW,
  ...track_REF_SW,
  ...track_CH2_COM,
  ...track_CH1_NC,
  ...track_CH1_NO,
  ...track_SDA,
  ...track_SCL,
  ...track_UART_TX,
  ...track_UART_RX,
  ...track_SWDIO,
  ...track_SWDIO_E,
  ...track_SWCLK
);
