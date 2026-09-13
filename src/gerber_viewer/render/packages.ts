/**
 * The package grammar: component *geometry* archetypes (what shape to draw)
 * kept strictly separate from component *semantics* (how to color it). A
 * chip is a chip whether it is a resistor, MLCC or ferrite bead — the
 * reference prefix and netlist value decide the appearance, the footprint
 * name and pad topology decide the shape.
 *
 * Classification hierarchy (first match wins):
 *   1. footprint-name table (netlist mode)
 *   2. pad topology (works from gerbers alone)
 *   3. generic body behind the pads
 */

/** Geometry archetypes — each has a dedicated glyph. */
export type PackageKind =
  | 'chip' // 2-terminal SMD: resistor/capacitor/inductor/fuse
  | 'axial' // 2-terminal through-hole (lying axial resistor/diode)
  | 'radial' // radial electrolytic can (through-hole or SMD)
  | 'dome' // through-hole LED dome
  | 'sot' // small transistor: SOT-23/323/563, body + legs
  | 'soic' // gull-wing 2-sided IC: SOIC/TSSOP/SSOP/MSOP
  | 'dip' // through-hole dual-in-line IC
  | 'qfn' // leadless: QFN/DFN — body hides the pads
  | 'qfp' // gull-wing 4-sided IC — leads peek on all sides
  | 'bga' // grid array — body only, pin-1 dot
  | 'header' // pin header / socket: plastic body, pins up
  | 'terminal' // terminal block: body with screw dots on top
  | 'connector' // shrouded connector: USB/barrel/JST — body + shield tabs
  | 'crystal' // crystal: metal rounded body
  | 'can' // metal can module: oscillator/RF shield — metal lid over pads
  | 'to' // TO-220/TO-92 power package with tab
  | 'trimmer' // trimmer potentiometer: body + screw wiper
  | 'slide' // slide/DIP switch: body + actuator nub
  | 'rotary' // rotary encoder: body + shaft
  | 'button' // pushbutton
  | 'generic' // odd SMD part: body behind visible pads
  | 'skip';

/** What the component *is*, from the reference prefix. */
export type SemanticKind =
  | 'resistor'
  | 'capacitor'
  | 'inductor' // L and FB
  | 'diode' // D (non-LED)
  | 'led'
  | 'transistor' // Q
  | 'ic' // U
  | 'crystal' // Y/X
  | 'connector' // J/P/CN
  | 'switch' // SW
  | 'fuse' // F
  | 'potentiometer' // RV
  | 'none';

/**
 * KiCad footprint-name table → package archetype. First match in table
 * order wins, so order matters: anchored families (axial resistors, TH
 * diodes) must come before the broad `/Diode/`-style entries that would
 * otherwise claim them, and the anchors tolerate a `Lib:` prefix (netlist
 * footprint values read "Resistor_THT:R_Axial_…").
 */
const FOOTPRINT_PATTERNS: Array<{ re: RegExp; kind: PackageKind }> = [
  { re: /MountingHole|Fiducial/i, kind: 'skip' },
  { re: /CP_Radial|CP_THT|CP_Elec|CP_Tantalum|CP_SMD|Capacitor_THT/i, kind: 'radial' },
  { re: /LED_THT|LED_D\d/i, kind: 'dome' },
  { re: /Potentiometer|Trimmer|POT_/i, kind: 'trimmer' },
  { re: /RotaryEncoder|Rotary_Encoder|Encoder/i, kind: 'rotary' },
  { re: /SW_DIP|SW_Slide|Slide_|Toggle|OS102011/i, kind: 'slide' },
  { re: /USB|BarrelJack|Barrel_Jack|JST|Molex|Hirose|FFC|HDMI|D-?Sub|RJ45|RJ11|Modular|IPEX|MCX/i, kind: 'connector' },
  { re: /RF_Module|RF_Shielding|Oscillator|TCXO|Shield|ESP-/i, kind: 'can' },
  { re: /PinHeader|PinSocket|Socket|RoundSocket|CardEdge|PCI|DIMM|SIMM|SODIMM/i, kind: 'header' },
  { re: /TerminalBlock|Terminal|BarrierBlock/i, kind: 'terminal' },
  { re: /QFN|DFN|VQFN|UQFN|WQFN|Dfn/i, kind: 'qfn' },
  { re: /QFP|LQFP|TQFP|PQFP|HQFP|Qfp/i, kind: 'qfp' },
  { re: /BGA|WLCSP|LGA/i, kind: 'bga' },
  { re: /SOIC|TSSOP|SSOP|MSOP|VSSOP|SOP|SO_|DSO|SOICW/i, kind: 'soic' },
  { re: /DIP|PDIP|CDIP|SDIP/i, kind: 'dip' },
  { re: /SOT(?:-|_)?\d|SOT-223|TO-92|TO-126|TO-220|TO-252|DPAK|TO-247|SOT223/i, kind: 'to' },
  { re: /Crystal|Resonator/i, kind: 'crystal' },
  { re: /SW_Push|SW_PushButton|Button|Tact|SPST/i, kind: 'button' },
  { re: /LED|Photodiode|Phototransistor/i, kind: 'chip' },
  { re: /^(?:[\w-]+:)?(?:Resistor_THT|R_Axial|D_Axial|D_THT|Diode_THT)/i, kind: 'axial' },
  { re: /Diode|D_SOD|SOD-?\d|Schottky|Zener|TVS/i, kind: 'chip' },
  { re: /^(?:[\w-]+:)?(?:Resistor_SMD|R_)/i, kind: 'chip' },
  { re: /^(?:[\w-]+:)?(?:Capacitor_SMD|CP_|C_)/i, kind: 'chip' },
  { re: /^(?:[\w-]+:)?(?:Inductor|L_)/i, kind: 'chip' },
  { re: /FerriteBead|FB_/i, kind: 'chip' },
  { re: /Fuse|Polyfuse/i, kind: 'chip' },
];

/** Map a KiCad footprint name to a package archetype, if it matches at all. */
export function classifyPackageFromName(name: string): PackageKind | null {
  for (const { re, kind } of FOOTPRINT_PATTERNS) {
    if (re.test(name)) return kind;
  }
  return null;
}

/** Reference prefix → semantic kind ("LED3" → led, "R12" → resistor). */
export function semanticFromRef(ref: string): SemanticKind {
  const m = /^([A-Za-z]+)/.exec(ref);
  const prefix = (m?.[1] ?? '').toUpperCase();
  if (prefix.startsWith('LED')) return 'led';
  if (prefix === 'RV') return 'potentiometer';
  switch (prefix) {
    case 'R':
    case 'RN':
      return 'resistor';
    case 'C':
    case 'CP':
      return 'capacitor';
    case 'L':
    case 'FB':
      return 'inductor';
    case 'D':
      return 'diode';
    case 'Q':
      return 'transistor';
    case 'U':
      return 'ic';
    case 'Y':
    case 'X':
      return 'crystal';
    case 'J':
    case 'P':
    case 'CN':
    case 'CON':
    case 'TP':
      return 'connector';
    case 'SW':
    case 'S':
      return 'switch';
    case 'F':
    case 'FS':
      return 'fuse';
    default:
      return 'none';
  }
}

/** Resistor band colors for a value string ("1kohm", "10k", "4.7k", "100R"). */
const BAND_COLORS = [
  '#3a3d42', // 0 — "black", lifted to stay visible on dark bodies
  '#7a4a2b', // 1 brown
  '#c93a3a', // 2 red
  '#d97b1e', // 3 orange
  '#d9c545', // 4 yellow
  '#3f9b4f', // 5 green
  '#3f6fb5', // 6 blue
  '#8a5fb5', // 7 violet
  '#8f949b', // 8 gray
  '#e6e9ec', // 9 white
];

/**
 * Parse a resistor value into 3 band colors (two significant digits + the
 * multiplier) plus the gold tolerance band. Returns null when the value is
 * not a plain resistance.
 */
export function resistorBands(value: string | undefined): string[] | null {
  if (!value) return null;
  const m = /^\s*([\d.]+)\s*(T|G|M|m|k|K|R|ohm|Ω)?/i.exec(value);
  if (!m) return null;
  let ohms = parseFloat(m[1]!);
  if (!Number.isFinite(ohms) || ohms < 0) return null;
  // SI multipliers are case-sensitive past k: M/G/T are mega/giga/tera while
  // a lowercase m is milli (10m = 0.01 ohm, not 10 Mohm)
  const unit = m[2] ?? '';
  if (unit === 'k' || unit === 'K') ohms *= 1e3;
  else if (unit === 'M') ohms *= 1e6;
  else if (unit === 'm') ohms *= 1e-3;
  else if (unit === 'G') ohms *= 1e9;
  else if (unit === 'T') ohms *= 1e12;

  if (ohms === 0) return [BAND_COLORS[0]!, BAND_COLORS[0]!, BAND_COLORS[0]!]; // 0R jumper
  const exp = Math.floor(Math.log10(ohms));
  const scaled = ohms / Math.pow(10, exp);
  // two significant digits (round the second), renormalizing on rollover:
  // 9.99k rounds to "10" x 10^3 — the decade count moves into the digits,
  // the multiplier band stays at the value's own exponent
  const d1 = Math.floor(scaled);
  const d2 = Math.round((scaled - d1) * 10);
  let digits = d1 * 10 + d2;
  let multiplier = exp - 1;
  if (d2 >= 10) {
    digits = d1 === 9 ? 10 : (d1 + 1) * 10;
    multiplier = exp;
  }
  return [BAND_COLORS[Math.floor(digits / 10)]!, BAND_COLORS[digits % 10]!, BAND_COLORS[Math.max(0, Math.min(9, multiplier))]!];
}

/** Gold tolerance band (drawn after the three value bands). */
export const TOLERANCE_BAND = '#caa53f';
