/**
 * typeCAD/pcb — ngspice simulation demo
 *
 * Exercises the full simulation API:
 *   1. zero-ceremony `.op()`  — bare simulate(), whole circuit netlisted
 *      automatically, power rails discovered from attached Power objects
 *   2. result accessors       — getVoltage / getCurrent / getPower / get
 *   3. ngspice device models  — simulation.model on an LED
 *   4. opting out             — simulation.exclude
 *   5. explicit Power passing  — simulate(vin) still works and wins
 *   6. headless `.tran()`     — transient analysis in batch mode, parsed
 *      waveform returned (no plot windows; pass openPlots=true for those)
 *   7. `.dc()` sweep          — DC transfer characteristic over a named source
 *   8. `.ac()` analysis       — small-signal frequency sweep with complex
 *      results: getMagnitude / getDb / getPhaseDeg (Bode-style)
 *   9. subcircuits            — simulation.subckt + simulation.library
 *      (.include of a vendor-style .lib), simulation.pinOrder terminal
 *      mapping, simulation.params instance parameters
 *
 * Run from this folder:  npx tsx src/spice_demo.ts   (or: npm start)
 * Requires ngspice in PATH (Windows DC/transient batch mode uses ngspice_con).
 */
import fs from 'node:fs';
import { Schematic, Power, Component, Resistor, Capacitor, LED } from '@typecad/pcb';

const failures: string[] = [];

function check(name: string, condition: boolean, detail = ''): void {
  console.log(`  ${condition ? '\u2705' : '\u274C'} ${name}${detail ? ` \u2014 ${detail}` : ''}`);
  if (!condition) failures.push(name);
}

function approx(actual: number | undefined, expected: number, tolerance: number): boolean {
  return actual !== undefined && Math.abs(actual - expected) <= tolerance;
}

function fmt(n: number, digits = 4): string {
  return n.toFixed(digits);
}

// ---------------------------------------------------------------------------
// 1. Voltage divider — the entire circuit, no opt-in flags, no passed sources
// ---------------------------------------------------------------------------
console.log('\n\u{1F9EA} 1. Voltage divider \u2014 bare simulate().op()');
console.log('   passives are netlisted automatically; Power stamped 9 V onto r1\'s pin');

const divider = new Schematic('vdiv');
const r1 = new Resistor({ value: '10k' });
const r2 = new Resistor({ value: '22k' });

divider.named('in').net(r1.pin(1));
divider.named('tap').net(r1.pin(2), r2.pin(1));
divider.named('gnd').net(r2.pin(2));
divider.add(r1, r2);

// Power stamps voltage ratings on the pins it touches; simulate() finds them
new Power({ power: r1.pin(1), gnd: r2.pin(2), voltage: 9 });

const op = divider.simulate().op();

if (op === null) {
  console.log('\u26A0 ngspice not found or failed \u2014 install it and ensure it is in PATH.');
  process.exit(1);
}

// theory: v(tap) = 9 * 22/(10+22) = 6.1875 V, i = 9/32k = 281.25 uA
check('v(in) = 9 V', approx(op.getVoltage('in'), 9, 0.01), fmt(op.getVoltage('in')));
check('v(tap) = 6.1875 V', approx(op.getVoltage('tap'), 6.1875, 0.01), fmt(op.getVoltage('tap')));
check(`i(${r1.reference}) = 281.25 uA`, approx(op.getCurrent(r1.reference), 0.00028125, 1e-6), fmt(op.getCurrent(r1.reference), 6));
check(`p(${r2.reference}) = 1.7402 mW`, approx(op.getPower(r2.reference), 0.0017402, 1e-5), fmt(op.getPower(r2.reference), 6));
check('get("i(v1)") = -281.25 uA (raw variable access)', approx(op.get('i(v1)'), -0.00028125, 1e-6), fmt(op.get('i(v1)'), 6));

// ---------------------------------------------------------------------------
// 2. LED driver — ngspice .model, simulation.exclude, explicit Power passing
// ---------------------------------------------------------------------------
console.log('\n\u{1F534} 2. LED driver \u2014 simulation.model + simulation.exclude + simulate(power)');

const ledDriver = new Schematic('led_driver');
const rs = new Resistor({ value: '330' });
const led = new LED({
  value: 'red', // stays on the schematic/BOM; the netlist uses the model card
  simulation: { model: 'DLED D (IS=1a RS=3.3 N=1.8)' },
});
const load = new Resistor({ value: '1k', simulation: { exclude: true } });

ledDriver.named('p5v').net(rs.pin(1));
ledDriver.named('anode').net(rs.pin(2), led.pin(2), load.pin(1)); // KiCad diodes: pin 1 = K, pin 2 = A
ledDriver.named('gnd').net(led.pin(1), load.pin(2));
ledDriver.add(rs, led, load);

const v5 = new Power({ power: rs.pin(1), gnd: led.pin(1), voltage: 5 });
const ledOp = ledDriver.simulate(v5).op();

if (ledOp === null) {
  console.log('\u26A0 LED simulation failed');
  process.exit(1);
}

// theory: v(anode) ~ 1.75 V diode drop -> i = (5 - 1.75)/330 ~ 9.86 mA
check('v(anode) ~ 1.75 V (diode forward drop)', approx(ledOp.getVoltage('anode'), 1.75, 0.1), fmt(ledOp.getVoltage('anode')));
check(`i(${led.reference}) ~ 9.86 mA`, approx(ledOp.getCurrent(led.reference), 0.00986, 0.001), fmt(ledOp.getCurrent(led.reference), 6));

const ledNetlist = fs.readFileSync('./build/led_driver.cir', 'utf-8');
check('netlist has .model DLED card', ledNetlist.includes('.model DLED D (IS=1a RS=3.3 N=1.8)'));
check('LED instance references the model, not the value', new RegExp(`^${led.reference} anode gnd DLED$`, 'm').test(ledNetlist));
check(`excluded ${load.reference} absent from netlist`, !ledNetlist.includes(`${load.reference} anode gnd`));

// ---------------------------------------------------------------------------
// 3. RC charging curve — headless transient analysis with parsed waveform
// ---------------------------------------------------------------------------
console.log('\n\u{1F4C8} 3. RC transient \u2014 headless .tran(), waveform in result.values');

const rc = new Schematic('rc_charge');
const rr = new Resistor({ value: '1k' });
const cc = new Capacitor({ value: '1u' });

rc.named('vin').net(rr.pin(1));
rc.named('vc').net(rr.pin(2), cc.pin(1));
rc.named('gnd').net(cc.pin(2));
rc.add(rr, cc);

new Power({ power: rr.pin(1), gnd: cc.pin(2), voltage: 5 });

// uic = true: start from vc = 0 so the charging curve is visible
const wave = rc.simulate().tran('10u', '5m', undefined, undefined, true);

if (wave === null) {
  console.log('\u26A0 transient simulation failed');
  process.exit(1);
}

const time = wave.values['time'];
const vc = wave.values['v(vc)'];
check('waveform parsed with hundreds of points', wave.numPoints > 100 && vc.length === wave.numPoints, `${wave.numPoints} points`);
check('t = 0 starts discharged (uic)', approx(vc[0], 0, 0.05), fmt(vc[0]));

// one time constant (tau = R*C = 1 ms): vc ~ 63.2% of 5 V = 3.16 V
let atTau = 0;
for (let i = 0; i < time.length; i++) {
  if (time[i] <= 0.001) atTau = vc[i];
}
check('v(vc) ~ 3.16 V at t = 1*tau (63.2%)', approx(atTau, 3.161, 0.1), fmt(atTau));
check('v(vc) ~ 4.97 V at t = 5*tau (99.3%)', approx(vc[vc.length - 1], 4.9663, 0.01), fmt(vc[vc.length - 1]));

// ---------------------------------------------------------------------------
// 4. DC sweep — transfer characteristic over a named source
// ---------------------------------------------------------------------------
console.log('\n\u{1F4C9} 4. DC sweep \u2014 .dc(source, start, stop, step), getWaveform / getAt');

const sweepBoard = new Schematic('vdiv_sweep');
const sr1 = new Resistor({ value: '10k' });
const sr2 = new Resistor({ value: '22k' });

sweepBoard.named('in').net(sr1.pin(1));
sweepBoard.named('tap').net(sr1.pin(2), sr2.pin(1));
sweepBoard.named('gnd').net(sr2.pin(2));
sweepBoard.add(sr1, sr2);

// naming the source gives .dc() something stable to sweep
const vs = new Power({ power: sr1.pin(1), gnd: sr2.pin(2), voltage: 9, name: 'VS' });

const sweep = sweepBoard.simulate(vs).dc('VS', 0, 9, 0.5);

if (sweep === null) {
  console.log('\u26A0 DC sweep failed');
  process.exit(1);
}

const rail = sweep.getWaveform('v(v-sweep)');
const tapSweep = sweep.getWaveform('v(tap)');
check('sweep axis runs 0 \u2192 9 V in 0.5 V steps', rail.length === 19 && rail[0] === 0 && rail[18] === 9, `${rail.length} points`);
check('divider ratio constant across the sweep', approx(tapSweep[9], rail[9] * (22 / 32), 0.001), `v(tap)=${fmt(tapSweep[9])} at v(in)=${fmt(rail[9])}`);
check('getAt(v(tap), last) = 6.1875 V', approx(sweep.getAt('v(tap)', rail.length - 1), 6.1875, 0.001), fmt(sweep.getAt('v(tap)', rail.length - 1)));

// ---------------------------------------------------------------------------
// 5. AC analysis — frequency sweep, complex results (Bode-style)
// ---------------------------------------------------------------------------
console.log('\n\u{1F50D} 5. AC analysis \u2014 .ac(sweep, points, fstart, fstop), getDb / getPhaseDeg');

const acBoard = new Schematic('rc_ac');
const ar1 = new Resistor({ value: '1k' });
const ac1 = new Capacitor({ value: '1u' });

acBoard.named('vin').net(ar1.pin(1));
acBoard.named('vc').net(ar1.pin(2), ac1.pin(1));
acBoard.named('gnd').net(ac1.pin(2));
acBoard.add(ar1, ac1);

// AC magnitude 1 on the source makes v(vc) directly the transfer function
const acSrc = new Power({ power: ar1.pin(1), gnd: ac1.pin(2), voltage: 2.5, ac: 1 });

const bode = acBoard.simulate(acSrc).ac('dec', 20, 1, '100k');

if (bode === null) {
  console.log('\u26A0 AC analysis failed');
  process.exit(1);
}

const frequency = bode.getWaveform('frequency');
const fcIndex = frequency.reduce((best, f, i) => (Math.abs(f - 159.155) < Math.abs(frequency[best] - 159.155) ? i : best), 0);
check('complex results flagged', bode.flags.includes('complex'));
check('flat (0 dB) well below fc', approx(bode.getDb('v(vc)', 0), 0, 0.01), fmt(bode.getDb('v(vc)', 0), 2));
check('-3.01 dB at fc = 1/(2*PI*R*C) ~ 159 Hz', approx(bode.getDb('v(vc)', fcIndex), -3.01, 0.15), `${fmt(bode.getDb('v(vc)', fcIndex), 2)} dB @ ${fmt(frequency[fcIndex], 0)} Hz`);
check('phase = -45 deg at fc', approx(bode.getPhaseDeg('v(vc)', fcIndex), -45, 1.5), fmt(bode.getPhaseDeg('v(vc)', fcIndex), 1));
check('~ -56 dB at 100 kHz (629x above fc)', approx(bode.getDb('v(vc)'), -55.96, 0.5), fmt(bode.getDb('v(vc)'), 2));
check('getMagnitude ~ 1 in passband', approx(bode.getMagnitude('v(vc)', 0), 1, 0.001), fmt(bode.getMagnitude('v(vc)', 0), 4));

// ---------------------------------------------------------------------------
// 6. Subcircuits — .lib include, pinOrder terminal mapping, instance params
// ---------------------------------------------------------------------------
console.log('\n\u{1F9E9} 6. Subcircuits \u2014 simulation.subckt + library + pinOrder + params');

const subBoard = new Schematic('subckt_demo');
const sbR = new Resistor({ value: '10' });
const ladder = new Component({
  footprint: 'Resistor_SMD:R_0603_1608Metric',
  reference: 'X1',
  simulation: { subckt: 'RLAG', library: 'models/demos.lib', pinOrder: [3, 2, 1] },
});
ladder.pin(1);
ladder.pin(2);
ladder.pin(3);

subBoard.named('vin').net(sbR.pin(1));
subBoard.named('left').net(sbR.pin(2), ladder.pin(1));
subBoard.named('mid').net(ladder.pin(2));
subBoard.named('gnd').net(ladder.pin(3));
subBoard.add(sbR, ladder);

new Power({ power: sbR.pin(1), gnd: ladder.pin(3), voltage: 6 });

const subOp = subBoard.simulate().op();

if (subOp === null) {
  console.log('\u26A0 subcircuit simulation failed');
  process.exit(1);
}

const subNetlist = fs.readFileSync('./build/subckt_demo.cir', 'utf-8');
check('.include emitted relative to the netlist', subNetlist.includes('.include ../models/demos.lib'));
check('X card follows pinOrder [3,2,1]', /^X1 gnd mid left RLAG$/m.test(subNetlist));
// chain: vin -10- left -2k- mid -1k- gnd
check('v(mid) = 6 * 1k/3010 = 1.993 V', approx(subOp.getVoltage('mid'), 1.9934, 0.001), fmt(subOp.getVoltage('mid')));
check('v(left) = 6 * 3k/3010 = 5.980 V', approx(subOp.getVoltage('left'), 5.9801, 0.001), fmt(subOp.getVoltage('left')));

// instance parameters: m=2 parallels a semiconductor resistor (R = RSH/m)
const paramBoard = new Schematic('res_params');
const top = new Resistor({ value: '1k', simulation: { model: 'RMOD R (RSH=1k)', params: 'm=2' } });
const bottom = new Resistor({ value: '1k' });
paramBoard.named('vin').net(top.pin(1));
paramBoard.named('mid').net(top.pin(2), bottom.pin(1));
paramBoard.named('gnd').net(bottom.pin(2));
paramBoard.add(top, bottom);
new Power({ power: top.pin(1), gnd: bottom.pin(2), voltage: 3 });

const paramOp = paramBoard.simulate().op();
if (paramOp !== null) {
  const paramNetlist = fs.readFileSync('./build/res_params.cir', 'utf-8');
  check('params appended to the device card', new RegExp(`^${top.reference} vin mid RMOD m=2$`, 'm').test(paramNetlist));
  // top leg is RSH/m = 500 ohm against a 1k bottom leg: v(mid) = 2 V
  check('m=2 halves the model resistance: v(mid) = 2 V', approx(paramOp.getVoltage('mid'), 2, 0.001), fmt(paramOp.getVoltage('mid')));
} else {
  check('params simulation ran', false);
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------
console.log('\n\u{1F4E6} artifacts');
console.log(`   netlists: ${fs.readdirSync('./build').filter((f) => f.endsWith('.cir')).join(', ')} (./build/)`);
console.log(`   raw data: ${fs.readdirSync('.').filter((f) => f.endsWith('.out')).join(', ')} (./)`);
console.log('   pass openPlots=true to tran() if you want ngspice plot windows');

// ---------------------------------------------------------------------------
console.log(`\n${failures.length === 0 ? '\u{1F389} all checks passed' : `\u274C ${failures.length} check(s) failed: ${failures.join(', ')}`}`);
process.exitCode = failures.length === 0 ? 0 : 1;
