// ---------------------------------------------------------------------------
// Mod-EC v3 — lock-in impedance EC module (STM32G431)
//
// Full redesign of the 555-era v2. The probe is a 2-terminal cell
// (electrodes on J1.2 = DRIVE and J1.1 = PROBE_1); the measurement is
// synchronous (lock-in) demodulation, so the reading is the cell's
// in-phase (conductive) response with quadrature junk rejected.
//
// Signal chain:
//   DAC1_OUT1 (PA4) -> PB0 (OPAMP2_VINP) -> OPAMP2 -> PA6 (pin 11) =
//   AMP_OUT -> R5 1k -> DRIVE/J1.2: sine centered at VCC/2 (zero DC ->
//   no electrolysis), amplitude/frequency set in firmware
//   cell: DRIVE/J1.2 <-> PROBE_1/J1.1; the sense leg returns PROBE_1 ->
//   U3 Ch1 (R1 1k default, or R4 100k) -> MID. MID is NOT ground: it is
//   PA2 (pin 7) = OPAMP1 buffering VCC/2 (DAC1_OUT2 on PA5 -> PA1).
//   PROBE_1 -> ADC1_IN1 (PA0), sampled phase-locked to the sine
//   Rcell = R1 * (V_drive/V_sense - 1)  (magnitudes from the lock-in;
//   take V_drive at the DRIVE node, or at PA6 and subtract the R5 drop)
//
// Switches:
//   U3 (TS3A24159) Ch2 + R3 10k 0.1% across the cell (DRIVE<->PROBE_1)
//          - injects a known conductance to verify the whole chain
//          (front-end self-check); open by default, closed on REF_SW high
//   U3 Ch1: sense-leg selector R1 1k (default) / R4 100k
//          (low-conductivity range), thrown by RANGE_SW
//
// Controls: PB3 = REF_SW, PB4 = RANGE_SW.
// Layout + routing: manual.
// ---------------------------------------------------------------------------

import { PCB, Component, Connector, Resistor, Capacitor, TrackBuilder, Image } from '@typecad/pcb';
import { syncBoard, syncTracks } from './_sync.js';

const typecad = new PCB('mod-ec', {
  layers: 4,
  rules: {
    min_track_width: 0.127,
    min_clearance: 0.127,
    min_copper_edge_clearance: 0.02,
  },
});

typecad.stackup(4, { layers: { 'F.SilkS': { material: 'Liquid Photo', color: 'White' }, 'F.Mask': { thickness: 0.01, material: 'Dry Film', epsilon_r: 3.3, loss_tangent: 0, color: 'Green' }, 'F.Cu': { thickness: 0.035 }, 'dielectric 1': { thickness: 0.21, material: 'FR4', epsilon_r: 4.5, loss_tangent: 0.02, color: 'FR4 natural' }, 'In1.Cu': { thickness: 0.035 }, 'dielectric 2': { thickness: 1.02, material: 'FR4', epsilon_r: 4.5, loss_tangent: 0.02, color: 'FR4 natural' }, 'In2.Cu': { thickness: 0.035 }, 'dielectric 3': { thickness: 0.21, material: 'FR4', epsilon_r: 4.5, loss_tangent: 0.02, color: 'FR4 natural' }, 'B.Cu': { thickness: 0.035 }, 'B.Mask': { thickness: 0.01, material: 'Dry Film', epsilon_r: 3.3, loss_tangent: 0, color: 'Green' }, 'B.SilkS': { material: 'Liquid Photo', color: 'White' } } });
typecad.text({ text: "mod-EC v3", x: 145.76, y: 91.75, height: 1, width: 1, thickness: 0.25 });
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

// STM32G431KB - Cortex-M4F 170MHz, 4Msps ADC, dual DAC, 3 on-chip op-amps.
// Runs the lock-in demodulation entirely in firmware.
//
// ORDERABLE PART: STM32G431KBT3 (see mpn below) - LQFP-32 7x7x1.4 mm,
// 0.8 mm pitch. The STM32G431KBUx / UFQFPN-32 variant is NOT purchasable,
// so this block now uses the LQFP symbol + footprint.
// Datasheet: https://www.st.com/resource/en/datasheet/stm32g431c6.pdf
// Pins 1..32 are identical between the two packages (verified against the
// MCU_ST_STM32G4 bases STM32G431K_6-8-B_Tx vs STM32G431K_6-8-B_Ux, which
// the KBTx / KBUx symbols extend: same numbers, same names, no diffs).
// Only the QFN's exposed pad (pin 33 = VSS = EP) is gone, so it was
// dropped from GND - GND stays on pin 14 (VSSA), 16 (VSS), 32 (VSS).
// LAYOUT TODO: body 5x5 -> 7x7 and pitch 0.5 -> 0.8 mm, so the footprint
// has outgrown the old QFN spot (148.2,82.2) - re-place U1 and re-lay all
// U1 escapes; every track coordinate further down still assumes QFN pads.
const u1 = new Component({
  reference: 'U1',
  value: 'STM32G431KBT3',
  symbol: 'MCU_ST_STM32G4:STM32G431KBTx',
  footprint: 'Package_QFP:LQFP-32_7x7mm_P0.8mm',
  mpn: 'STM32G431KBT3',
  datasheet: 'https://www.st.com/resource/en/datasheet/stm32g431c6.pdf',
  description: 'ST STM32G431KB, Cortex-M4F 170MHz, 128KB flash, LQFP-32 7x7',
  pcb: { x: 143.2, y: 85.4, rotation: 0 },
});
u1.fabLayout = { x: 0, y: 0, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
u1.valueLayout = { x: 0, y: 3.83, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
u1.referenceLayout = { x: 0, y: -3.83, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
u1.pcb = { x: 147.25, y: 85.75 };

// excitation + sense network
//
// LAYOUT ORDER (sense side, probe -> MCU): J1.1 -> R1 (sense, at the
// castellation; GND end via = cell-current return) -> node star point
// [D1 clamp first, then the R4/R3 switch taps] -> C2 (at the
// MCU pin: ADC kickback reservoir + anti-alias) -> PA0.
// DRIVE side: PA4 -> PB0 trace -> OPAMP2 -> PA6 (pin 11) -> R5 -> J1.2;
// sense returns to MID = PA2 (pin 7, OPAMP1 buffered VCC/2 from
// DAC1_OUT2). PA7 (pin 12) is deliberately free: it is an op-amp INPUT
// (OPAMP2_VINP), never an output - do not route drive there.
// Keep DAC_OUT/DRIVE and PROBE_1
// traces separated (coupling between them bypasses the cell).
const r1 = new Resistor({ reference: 'R1', value: '1k 0.1%', pcb: { x: 134.0, y: 79.5, rotation: 0 } });
r1.fabLayout = { x: 0, y: 0, rotation: 180, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
r1.valueLayout = { x: 0, y: 1.43, rotation: 180, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
r1.referenceLayout = { layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true, x: -2.25, y: -1.5, rotation: 180 };
r1.pcb = { x: 138, y: 88.5, rotation: 180 };
const c2 = new Capacitor({ reference: 'C2', value: '1nF C0G', pcb: { x: 140.6, y: 89.4, rotation: 0 } });
c2.fabLayout = { x: 0, y: 0, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
c2.valueLayout = { x: 0, y: 1.43, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c2.referenceLayout = { x: 0, y: 1.65, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c2.pcb = { x: 138, y: 90, rotation: 0 };
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
// U3: TS3A24159DRCR dual SPDT (0.3R Ron — 3x better than the single TS5A3160s
// it replaces, and the selector's Ron sits in series with the 1k sense leg).
// ORDERABLE PART: TS3A24159DRCR — DRC = TI VSON-10 = this footprint
// (Package_SON:Texas_S-PVSON-N10), R = tape & reel.
// Datasheet (TI SCDS238): https://www.ti.com/lit/ds/symlink/ts3a24159.pdf
// Ch1 = sense-leg selector: COM1->PROBE_1, NC1->R1 (1k default), NO1->R4
// (100k low-conductivity leg), IN1->RANGE_SW.
// Ch2 = reference injection: COM2->R3 (10k across the cell via NO2->DRIVE),
// NC2 unused, IN2->REF_SW.
// PIN MAP (verified vs TI SCDS238 Table 5-1 / the TS3A24159DRCR datasheet):
//   1=VCC  2=NO1  3=COM1  4=IN1  5=NC1  6=GND  7=NC2  8=IN2  9=COM2  10=NO2
// Function table: IN=L -> COM-NC (default throw), IN=H -> COM-NO.
// The net calls below follow this map (they previously used a wrong one:
// 3=NC1, 5=COM1, 7=NO2, 9=NC2, 10=COM2, which put PROBE_1 on NC1, DRIVE on
// NC2 and left COM2 unrouted - RANGE_SW high opened the sense leg instead
// of selecting R4, and the Ch2 self-check could never close).
// LAYOUT TODO: the U3 stubs (track_CH1_NC / track_CH2_COM / track_DRIVE /
// track_PROBE_1) still land on the OLD pad coordinates - re-lay them for
// pin 5 = R1, pin 3 = PROBE_1, pin 9 = R3, pin 10 = DRIVE.
const u3 = new Component({
  reference: 'U3',
  value: 'TS3A24159DRC',
  symbol: 'Analog_Switch:TS3A24159DRC',
  footprint: 'Package_SON:Texas_S-PVSON-N10',
  mpn: 'TS3A24159DRCR',
  datasheet: 'https://www.ti.com/lit/ds/symlink/ts3a24159.pdf',
  description: 'TI dual SPDT analog switch, 0.3 ohm, VSON-10 (DRC), tape & reel',
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
r4.referenceLayout = { layer: 'F.SilkS', height: 0.75, thickness: 0.1, show: true, x: 0, y: 1.25, rotation: 0, width: 0.8 };
r4.pcb = { x: 135, y: 88.5 };

// decoupling
const c1 = new Capacitor({ reference: 'C1', value: '100nF', pcb: { x: 143.3, y: 89.2, rotation: 0 } });
c1.fabLayout = { x: 0, y: 0, rotation: 180, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
c1.valueLayout = { x: 0, y: 1.43, rotation: 180, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c1.referenceLayout = { layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true, x: 0, y: 1.25, rotation: 180 };
c1.pcb = { x: 133.75, y: 86.5, rotation: 180 }; // VDDA (pin 15 @ 144.45,87.84)
const c3 = new Capacitor({ reference: 'C3', value: '100nF', pcb: { x: 147.4, y: 87.9, rotation: 0 } });
c3.fabLayout = { x: 0, y: 0, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
c3.valueLayout = { x: 0, y: 1.43, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c3.referenceLayout = { x: 0, y: 1.1, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c3.pcb = { x: 141.25, y: 79.25, rotation: 180 }; // VDD (pin 17 @ 145.64,87.15) (pin 17 @ 145.64,87.15)
const c6 = new Capacitor({ reference: 'C6', value: '100nF', pcb: { x: 140.8, y: 81.4, rotation: 0 } });
c6.fabLayout = { x: 0, y: 0, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, bold: false, italic: false, show: true };
c6.valueLayout = { x: 0, y: 1.43, rotation: 0, layer: 'F.Fab', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c6.referenceLayout = { x: 0, y: -1.43, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };
c6.pcb = { x: 141.25, y: 80.75, rotation: 180 }; // NRST (pin 4 @ 140.76,85.15)

// excitation series resistor: PA4 (DAC1_OUT1) -> PB0 -> OPAMP2 -> PA6
// (AMP_OUT) -> R5 -> DRIVE. Keeps the buffer's load >= ~1.1k even at the
// top of the range (the op-amp is specified for >=5k; the residual droop
// is harmless if the solve uses the drive magnitude actually applied).
// MEASUREMENT NOTE: PA4 sits UPSTREAM of the buffer, so it cannot see the
// electrode voltage - and there is no "ADC1_IN5" on this part. PA4 =
// ADC2_IN17, PA6 = ADC2_IN3 (op-amp output, still excludes the R5 drop).
// Sense Vdrive at the DRIVE node, or at PA6 and add the R5 (1k) drop to
// the Rcell solve - otherwise R5 shows up as a systematic +1k in the top
// (1k) range.
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
  c1.pin(2),
  c3.pin(2),
  c6.pin(2),
);
typecad.named('NRST').net(u1.pin(4), c6.pin(1));

// excitation + sense chain (2-terminal divider)
typecad.named('DAC1_OUT1').net(u1.pin(9), u1.pin(13)); // PA4 -> PB0 trace: feeds OPAMP2 VINP (verified - PB0 carries OPAMP2_VINP on the 32-pin K symbols)
typecad.named('AMP_OUT').net(u1.pin(11), r5.pin(1)); // PA6 = OPAMP2_VOUT (drive buffer; PA6 is also ADC2_IN3)
typecad.named('DRIVE').net(r5.pin(2), j1.pin(2), u3.pin(10)); // excitation + Ch2 NO2 reference throw
typecad.named('PROBE_1').net(
  j1.pin(1),
  u3.pin(3), // Ch1 COM1 - common goes to the cell, throws go to R1/R4
  r3.pin(1),
  d1.pin(3),
  c2.pin(1),
  u1.pin(5), // ADC1_IN1
);
typecad.named('GND').net(d1.pin(1)); // clamp bottom rail
typecad.named('DAC1_OUT2').net(u1.pin(10), u1.pin(6)); // PA5 -> PA1 trace: DAC1_OUT2 feeds OPAMP1 VINP
typecad.named('MID').net(c2.pin(2), r1.pin(2), r4.pin(2), u1.pin(7)); // PA2 = OPAMP1_VOUT: sense return + AA cap
typecad.named('VCC').net(d1.pin(2));

// switches
typecad.named('RANGE_SW').net(u1.pin(27), u3.pin(4)); // PB4 -> Ch1 IN1 (selector)
typecad.named('REF_SW').net(u1.pin(26), u3.pin(8)); // PB3 -> Ch2 IN2 (reference)
typecad.named('CH2_COM').net(u3.pin(9), r3.pin(2)); // Ch2 COM2 - pin 7 (NC2) left open so R3 is out by default
typecad.named('CH1_NC').net(u3.pin(5), r1.pin(1)); // Ch1 NC1: default 1k sense leg (IN1=L)
typecad.named('CH1_NO').net(u3.pin(2), r4.pin(1)); // Ch1 NO: 100k low-conductivity leg
typecad.named('VCC').net(u3.pin(1));
typecad.named('GND').net(u3.pin(6), u3.pin(11)); // pin 6 = GND, pin 11 = exposed thermal pad

// host I2C
typecad.named('SDA').net(u1.pin(30), j2.pin(4)); // PB7 / I2C1_SDA
typecad.named('SCL').net(u1.pin(31), j2.pin(3)); // PB8 / I2C1_SCL

// host UART
typecad.named('UART_TX').net(u1.pin(19), j2.pin(1)); // PA9 / USART1_TX
typecad.named('UART_RX').net(u1.pin(20), j2.pin(2)); // PA10 / USART1_RX

// one-wire temperature probe pad (host-provided temp source)
// typecad.named('1_WIRE').net(u1.pin(25), j1.pin(4)); // PA15 (kept off PA7, which is an op-amp input)

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






// ---------------------------------------------------------------------------
// PLACEMENT - grounded in the built pads manifest (real pad coordinates).
//
// NOTE: the U1 block below is QFN-era data (chip center 143.2, 85.4 and
// 0.5 mm pitch pads) - stale now that U1 is the LQFP-32 7x7 (0.8 mm) at
// 148.2, 82.2. Re-derive pad coordinates from the new footprint when you
// re-lay the U1 escapes. J1/J2 rows are unaffected.
//
// U1 field: pads x 140.76-145.64, y 82.96-87.84 (chip center 143.2, 85.4):
//   PA0 sense  (5)  @ 140.76,85.65   PA2 MID    (7)  @ 141.45,87.84
//   PA1 op1+   (6)  @ 140.76,86.15   PA6 drive  (11) @ 142.45,87.84
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
// MID return traces: star them to PA2 (pin 7); a short In1 hop under the
// chip is clean if F.Cu crossings bite. GND: everything lands in the F/B pours.
// ---------------------------------------------------------------------------

// Net: VCC
const track_VCC: TrackBuilder[] = [];
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 136.575, y: 86.25 }, "F.Cu", 0.127).to({ x: 136.6, y: 86.275, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 141.3845, y: 79.8905 }, "F.Cu", 0.127).to({ x: 141.3845, y: 81.509499, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 142.025, y: 79.25 }, "F.Cu", 0.127).to({ x: 141.3845, y: 79.8905, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 142.325001, y: 82.45 }, "F.Cu", 0.127).to({ x: 143.075, y: 82.95, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 141.3845, y: 81.509499 }, "F.Cu", 0.127).to({ x: 142.325001, y: 82.45, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 136.375, y: 86.5 }, "F.Cu", 0.127).to({ x: 136.6, y: 86.275, layer: "F.Cu", width: 0.127 }));
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 134.525, y: 86.5 }, "F.Cu", 0.127).to({ x: 136.375, y: 86.5, layer: "F.Cu", width: 0.127 }));

// Net: DRIVE
const track_DRIVE: TrackBuilder[] = [];
track_DRIVE.push(typecad.track({ net: 'DRIVE' }).from({ x: 132.675, y: 81.7 }, "F.Cu", 0.127).to({ x: 132.775, y: 81.6, layer: "F.Cu", width: 0.127 }));
track_DRIVE.push(typecad.track({ net: 'DRIVE' }).from({ x: 134.5, y: 83.325 }, "F.Cu", 0.127).to({ x: 136.6, y: 83.325, layer: "F.Cu", width: 0.127 }));
track_DRIVE.push(typecad.track({ net: 'DRIVE' }).from({ x: 131.24, y: 81.7 }, "F.Cu", 0.127).to({ x: 132.675, y: 81.7, layer: "F.Cu", width: 0.127 }));
track_DRIVE.push(typecad.track({ net: 'DRIVE' }).from({ x: 130.04, y: 81.7 }, "F.Cu", 0.127).to({ x: 131.24, y: 81.7, layer: "F.Cu", width: 0.127 }));
track_DRIVE.push(typecad.track({ net: 'DRIVE' }).from({ x: 132.775, y: 81.6 }, "F.Cu", 0.127).to({ x: 134.5, y: 83.325, layer: "F.Cu", width: 0.127 }));
track_DRIVE.push(typecad.track({ net: 'DRIVE' }).from({ x: 136.6, y: 83.325 }, "F.Cu", 0.3).to({ x: 136.6, y: 83.04, layer: "F.Cu", width: 0.3 }));

// Net: PROBE_1
const track_PROBE_1: TrackBuilder[] = [];
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 138.905, y: 81.531 }, "F.Cu", 0.15).to({ x: 139.562, y: 82.188, layer: "F.Cu", width: 0.15 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 143.071, y: 86.146 }, "F.Cu", 0.2).to({ x: 143.075, y: 86.15, layer: "F.Cu", width: 0.2 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 139.562, y: 82.188 }, "F.Cu", 0.15).to({ x: 141.073, y: 83.7, layer: "F.Cu", width: 0.15 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 136.912, y: 79.907 }, "F.Cu", 0.15).to({ x: 138.537, y: 81.531, layer: "F.Cu", width: 0.15 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 133.388, y: 78.359 }, "F.Cu", 0.15).to({ x: 135.672, y: 78.359, layer: "F.Cu", width: 0.15 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 138.537, y: 81.531 }, "F.Cu", 0.15).to({ x: 138.905, y: 81.531, layer: "F.Cu", width: 0.15 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 132.775, y: 78.972 }, "F.Cu", 0.15).to({ x: 133.388, y: 78.359, layer: "F.Cu", width: 0.15 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 136.912, y: 79.6 }, "F.Cu", 0.15).to({ x: 136.912, y: 79.907, layer: "F.Cu", width: 0.15 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 132.735, y: 79.16 }, "F.Cu", 0.3).to({ x: 132.775, y: 79.2, layer: "F.Cu", width: 0.3 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 130.04, y: 79.16 }, "F.Cu", 0.3).to({ x: 131.24, y: 79.16, layer: "F.Cu", width: 0.3 }).to({ x: 132.735, y: 79.16, layer: "F.Cu", width: 0.3 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 135.672, y: 78.359 }, "F.Cu", 0.15).to({ x: 136.912, y: 79.6, layer: "F.Cu", width: 0.15 }));
track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 132.775, y: 79.2 }, "F.Cu", 0.2).to({ x: 132.775, y: 78.972, layer: "F.Cu", width: 0.2 }));

// Net: MID
const track_MID: TrackBuilder[] = [];
track_MID.push(typecad.track({ net: 'MID' }).from({ x: 135.825, y: 88.5 }, "F.Cu", 0.3).to({ x: 137.175, y: 88.5, layer: "F.Cu", width: 0.3 }));
track_MID.push(typecad.track({ net: 'MID' }).from({ x: 137.275, y: 88.5 }, "F.Cu", 0.3).to({ x: 138.775, y: 90, layer: "F.Cu", width: 0.3 }));
track_MID.push(typecad.track({ net: 'MID' }).from({ x: 137.175, y: 88.5 }, "F.Cu", 0.3).to({ x: 137.275, y: 88.5, layer: "F.Cu", width: 0.3 }));

// Net: CH2_COM
const track_CH2_COM: TrackBuilder[] = [];
track_CH2_COM.push(typecad.track({ net: 'CH2_COM' }).from({ x: 137.1, y: 81.875 }, "F.Cu", 0.127).to({ x: 137.1, y: 83.04, layer: "F.Cu", width: 0.127 }));
track_CH2_COM.push(typecad.track({ net: 'CH2_COM' }).from({ x: 134.425, y: 79.2 }, "F.Cu", 0.127).to({ x: 137.1, y: 81.875, layer: "F.Cu", width: 0.127 }));

// Net: SWDIO_E
const track_SWDIO_E: TrackBuilder[] = [];
track_SWDIO_E.push(typecad.track({ net: 'SWDIO_E' }).from({ x: 134.0595, y: 92.5655 }, "F.Cu", 0.127).to({ x: 134.725, y: 91.9, layer: "F.Cu", width: 0.127 }));
track_SWDIO_E.push(typecad.track({ net: 'SWDIO_E' }).from({ x: 131.9455, y: 92.5655 }, "F.Cu", 0.127).to({ x: 134.0595, y: 92.5655, layer: "F.Cu", width: 0.127 }));
track_SWDIO_E.push(typecad.track({ net: 'SWDIO_E' }).from({ x: 131.24, y: 91.86 }, "F.Cu", 0.127).to({ x: 131.9455, y: 92.5655, layer: "F.Cu", width: 0.127 }));
track_SWDIO_E.push(typecad.track({ net: 'SWDIO_E' }).from({ x: 130.04, y: 91.86 }, "F.Cu", 0.127).to({ x: 131.24, y: 91.86, layer: "F.Cu", width: 0.127 }));

// Net: SWCLK
const track_SWCLK: TrackBuilder[] = [];
track_SWCLK.push(typecad.track({ net: 'SWCLK' }).from({ x: 130.04, y: 89.32 }, "F.Cu", 0.127).to({ x: 131.24, y: 89.32, layer: "F.Cu", width: 0.127 }));

// ink-swatch.png demos every artwork ink on the back of the board:
//   red    -> exposed copper (gold through its mask opening)
//   white  -> silkscreen
//   blue   -> mask opening (bare substrate)
//   purple -> maskPaint: closes the blue opening (two-tone mask art)
//   black  -> hidden copper (real metal, invisible under intact mask)
syncBoard(typecad, {});
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
  ...track_DRIVE,
  ...track_PROBE_1,
  ...track_MID,
  ...track_CH2_COM,
  ...track_SWDIO_E,
  ...track_SWCLK, ...syncTracks
);
