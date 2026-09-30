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

typecad.stackup(4);
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
j1.pcb = { x: 130.76, y: 85.51 };
// I2C / UART power connector (castellated edge, right side)
const j2 = new Connector({
  reference: 'J2',
  number: 6,
  footprint: 'uFire:CastellatedHeader-2.54x6',
  pcb: { x: 154.07, y: 85.52, rotation: 180 },
});

// STM32G431KB — Cortex-M4F 170MHz, 4Msps ADC, dual DAC, 3 on-chip op-amps.
// Runs the lock-in demodulation entirely in firmware.
const u1 = new Component({
  reference: 'U1',
  value: 'STM32G431KBUx',
  symbol: 'MCU_ST_STM32G4:STM32G431KBUx',
  footprint: 'Package_DFN_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm',
  pcb: { x: 143.2, y: 85.4, rotation: 0 },
});

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
r1.pcb = { x: 136.5, y: 80.5 };
const c2 = new Capacitor({ reference: 'C2', value: '1nF C0G', pcb: { x: 140.6, y: 89.4, rotation: 0 } });
const d1 = new Component({
  reference: 'D1',
  value: 'BAT54S',
  symbol: 'Diode:BAT54S',
  footprint: 'Package_TO_SOT_SMD:SOT-323_SC-70',
  pcb: { x: 137.3, y: 80.7, rotation: 0 },
});
d1.pcb = { x: 134.5, y: 88 };

// reference injection across the cell
const r3 = new Resistor({ reference: 'R3', value: '10k 0.1%', pcb: { x: 139.0, y: 79.0, rotation: 90 } });
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
u3.pcb = { x: 137.5, y: 83.5 };

// sense-leg selector (SPDT): COM on PROBE_1, NC -> R1 1k (default, optimal
// for the mid range), NO -> R4 100k (low-conductivity leg — divider SNR
// optimum wants Rsense ~ R5+Rcell, so weak signals get the LARGE leg)
const r4 = new Resistor({ reference: 'R4', value: '100k 0.1%', pcb: { x: 137.5, y: 86.4, rotation: 0 } });

// decoupling
const c1 = new Capacitor({ reference: 'C1', value: '100nF', pcb: { x: 143.3, y: 89.2, rotation: 0 } }); // VDDA (pin 15 @ 144.45,87.84)
const c3 = new Capacitor({ reference: 'C3', value: '100nF', pcb: { x: 147.4, y: 87.9, rotation: 0 } }); // VDD (pin 17 @ 145.64,87.15) (pin 17 @ 145.64,87.15)
const c6 = new Capacitor({ reference: 'C6', value: '100nF', pcb: { x: 140.8, y: 81.4, rotation: 0 } }); // NRST (pin 4 @ 140.76,85.15)

// excitation series resistor: PA4 (DAC1_OUT1) -> R5 -> DRIVE. Keeps the
// DAC buffer's load >= ~1.1k even at the top of the range (the buffer is
// specified for >=5k; the residual droop/distortion is harmless because
// the firmware measures the ACTUAL drive on PA4 = ADC1_IN5 and uses the
// measured magnitude in the solve).
const r5 = new Resistor({ reference: 'R5', value: '1k 0.1%', pcb: { x: 146.0, y: 89.5, rotation: 0 } });

// SWDIO series resistor
const r2 = new Resistor({ reference: 'R2', value: '470', pcb: { x: 133.9, y: 91.9, rotation: 0 } });

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
typecad.net(u3.pin(10), r3.pin(2)); // Ch2 COM2
typecad.net(u3.pin(3), r1.pin(1)); // Ch1 NC: default 1k sense leg
typecad.net(u3.pin(2), r4.pin(1)); // Ch1 NO: 100k low-conductivity leg
typecad.named('VCC').net(u3.pin(1));
typecad.named('GND').net(u3.pin(6));

// host I2C
typecad.named('SDA').net(u1.pin(30), j2.pin(4)); // PB7 / I2C1_SDA
typecad.named('SCL').net(u1.pin(31), j2.pin(3)); // PB8 / I2C1_SCL

// host UART
typecad.named('UART_TX').net(u1.pin(19), j2.pin(1)); // PA9 / USART1_TX
typecad.named('UART_RX').net(u1.pin(20), j2.pin(2)); // PA10 / USART1_RX

// one-wire temperature probe pad (host-provided temp source)
typecad.named('1_WIRE').net(u1.pin(25), j1.pin(4)); // PA15 (moved off PA7 = opamp output)

// SWD programming: SWDIO through R2 to the edge, SWCLK direct
typecad.named('SWDIO').net(u1.pin(23), r2.pin(1)); // PA13
typecad.named('SWDIO_E').net(r2.pin(2), j1.pin(6));
typecad.named('SWCLK').net(u1.pin(24), j1.pin(5)); // PA14

// ---------------------------------------------------------------------------
// Silkscreen
// ---------------------------------------------------------------------------

typecad.text({ text: 'mod-EC v3', x: 135.9, y: 92.6, height: 1, width: 1, thickness: 0.25 });
typecad.text({ text: 'PROBE', x: 135.1, y: 79.1, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: 'DRIVE', x: 135.1, y: 81.7, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: 'GND', x: 135.1, y: 84.3, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: '1_WIRE', x: 135.1, y: 86.85, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: 'SWCLK', x: 135.1, y: 89.4, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: 'SWDIO', x: 135.1, y: 91.8, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: 'GND', x: 151.2, y: 79.25, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: 'VCC', x: 151.3, y: 81.7, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: 'SDA', x: 151.3, y: 84.3, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: 'SCL', x: 151.3, y: 86.8, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: 'X', x: 151.9, y: 89.35, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: 'X', x: 151.9, y: 91.89, layer: 'B.SilkS', height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });
typecad.text({ text: 'microfire.co', x: 139.8, y: 94, layer: 'B.SilkS', height: 1, width: 1, thickness: 0.15, justify: { mirror: true } });

// ---------------------------------------------------------------------------
// Ground pours — all four copper layers
// ---------------------------------------------------------------------------

typecad.zone({ net: 'GND', layers: ['F.Cu'], x: 130, y: 78, width: 25, height: 15, minThickness: 0.254, clearance: 0.254 });
typecad.zone({ net: 'GND', layers: ['B.Cu'], x: 130, y: 78, width: 25, height: 15, minThickness: 0.254, clearance: 0.254 });
typecad.zone({ net: 'GND', layers: ['In1.Cu'], x: 130, y: 78, width: 25, height: 15, minThickness: 0.254, clearance: 0.254 });
typecad.zone({ net: 'GND', layers: ['In2.Cu'], x: 130, y: 78, width: 25, height: 15, minThickness: 0.254, clearance: 0.254 });

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

const route1 = new TrackBuilder(typecad, { net: 'PROBE_1',  })
  .from({ x: 129.9, y: 79.15 }, 'F.Cu', 0.3)
  .to({ x: 131.1, y: 79.15, layer: 'F.Cu', width: 0.3 });

const route2 = new TrackBuilder(typecad, { net: 'DRIVE',  })
  .from({ x: 129.9, y: 81.69 }, 'F.Cu', 0.3)
  .to({ x: 131.1, y: 81.69, layer: 'F.Cu', width: 0.3 });

const route3 = new TrackBuilder(typecad, { net: 'GND',  })
  .from({ x: 129.9, y: 84.23 }, 'F.Cu', 0.3)
  .to({ x: 131.1, y: 84.23, layer: 'F.Cu', width: 0.3 });

const route4 = new TrackBuilder(typecad, { net: '1_WIRE',  })
  .from({ x: 129.9, y: 86.77 }, 'F.Cu', 0.3)
  .to({ x: 131.1, y: 86.77, layer: 'F.Cu', width: 0.3 });

const route5 = new TrackBuilder(typecad, { net: 'SWCLK',  })
  .from({ x: 129.9, y: 89.31 }, 'F.Cu', 0.3)
  .to({ x: 131.1, y: 89.31, layer: 'F.Cu', width: 0.3 });

const route6 = new TrackBuilder(typecad, { net: 'SWDIO_E',  })
  .from({ x: 129.9, y: 91.85 }, 'F.Cu', 0.3)
  .to({ x: 131.1, y: 91.85, layer: 'F.Cu', width: 0.3 });

const route7 = new TrackBuilder(typecad, { net: 'UART_TX',  })
  .from({ x: 153.73, y: 91.88 }, 'F.Cu', 0.3)
  .to({ x: 154.93, y: 91.88, layer: 'F.Cu', width: 0.3 });

const route8 = new TrackBuilder(typecad, { net: 'UART_RX',  })
  .from({ x: 153.73, y: 89.34 }, 'F.Cu', 0.3)
  .to({ x: 154.93, y: 89.34, layer: 'F.Cu', width: 0.3 });

const route9 = new TrackBuilder(typecad, { net: 'SCL',  })
  .from({ x: 153.73, y: 86.8 }, 'F.Cu', 0.3)
  .to({ x: 154.93, y: 86.8, layer: 'F.Cu', width: 0.3 });

const route10 = new TrackBuilder(typecad, { net: 'SDA',  })
  .from({ x: 153.73, y: 84.26 }, 'F.Cu', 0.3)
  .to({ x: 154.93, y: 84.26, layer: 'F.Cu', width: 0.3 });

const route11 = new TrackBuilder(typecad, { net: 'VCC',  })
  .from({ x: 153.73, y: 81.72 }, 'F.Cu', 0.3)
  .to({ x: 154.93, y: 81.72, layer: 'F.Cu', width: 0.3 });

const route12 = new TrackBuilder(typecad, { net: 'GND',  })
  .from({ x: 153.73, y: 79.18 }, 'F.Cu', 0.3)
  .to({ x: 154.93, y: 79.18, layer: 'F.Cu', width: 0.3 });

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
  c6, route1, route2, route3, route4, route5, route6, route7, route8, route9, route10, route11, route12
);
