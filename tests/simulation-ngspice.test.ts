import { describe, it, expect, afterAll } from 'vitest';
import { Power, Component, Capacitor, LED } from '../src/index.js';
import { Schematic } from '../src/schematic.js';
import fs from 'fs';

const outputFiles = [
  'vdiv_equal.out',
  'vdiv_netlist.out',
  'vdiv_unequal.out',
  'rc_tran.out',
  'led_model.out',
  'vdiv_auto.out',
  'vdiv_excluded.out',
  'vdiv_sweep.out',
  'rc_ac.out',
  'subckt_use.out',
  'subckt_order.out',
  'res_params.out',
  'pulse_tran.out',
  'diode_area.out',
  'value_ws.out',
];

const outputDirs = ['models'];

afterAll(() => {
  for (const f of outputFiles) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  for (const d of outputDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

class Resistor extends Component {
  constructor(
    opts: {
      value?: string;
      simulation?: {
        include?: boolean;
        model?: string;
        exclude?: boolean;
        subckt?: string;
        library?: string;
        params?: string;
        pinOrder?: Array<number | string>;
      };
    } = {},
  ) {
    super('Resistor_SMD:R_0603_1608Metric');
    this.symbol = 'Device:R_Small';
    if (opts.value) this.value = opts.value;
    if (opts.simulation) this.simulation = { ...opts.simulation, model: opts.simulation.model ?? '' };
  }
}

describe('Voltage Divider ngspice Simulation', () => {
  it('should simulate a 5V voltage divider with equal resistors and return correct results', () => {
    let typecad = new Schematic('vdiv_equal');
    let r1 = new Resistor({ value: '10k', simulation: { include: true } });
    let r2 = new Resistor({ value: '10k', simulation: { include: true } });

    typecad.named('in').net(r1.pin(1));
    typecad.named('vdiv').net(r1.pin(2), r2.pin(1));
    typecad.named('gnd').net(r2.pin(2));
    typecad.add(r1, r2);

    let vin = new Power({ power: r1.pin(1), gnd: r2.pin(2), voltage: 5.0 });

    const result = typecad.simulate(vin).op();

    if (result === null) {
      console.log('ngspice not installed — skipping simulation assertions');
      return;
    }

    expect(result).not.toBeNull();
    expect(result!.getVoltage('in')).toBeCloseTo(5.0, 2);
    expect(result!.getVoltage('vdiv')).toBeCloseTo(2.5, 2);
    expect(result!.getCurrent(r1.reference)).toBeCloseTo(0.00025, 4);
    expect(result!.getCurrent(r2.reference)).toBeCloseTo(0.00025, 4);
    expect(result!.getPower(r1.reference)).toBeCloseTo(0.000625, 4);
    expect(result!.getPower(r2.reference)).toBeCloseTo(0.000625, 4);
  });

  it('should simulate a 3.3V voltage divider with unequal resistors', () => {
    let typecad = new Schematic('vdiv_unequal');
    let r1 = new Resistor({ value: '1k', simulation: { include: true } });
    let r2 = new Resistor({ value: '2k', simulation: { include: true } });

    typecad.named('in').net(r1.pin(1));
    typecad.named('vdiv').net(r1.pin(2), r2.pin(1));
    typecad.named('gnd').net(r2.pin(2));
    typecad.add(r1, r2);

    let vin = new Power({ power: r1.pin(1), gnd: r2.pin(2), voltage: 3.3 });

    const result = typecad.simulate(vin).op();

    if (result === null) {
      console.log('ngspice not installed — skipping simulation assertions');
      return;
    }

    expect(result).not.toBeNull();
    expect(result!.getVoltage('in')).toBeCloseTo(3.3, 2);
    expect(result!.getVoltage('vdiv')).toBeCloseTo(2.2, 2);
    expect(result!.getCurrent(r1.reference)).toBeCloseTo(0.0011, 3);
    expect(result!.getCurrent(r2.reference)).toBeCloseTo(0.0011, 3);
  });

  it('should generate a valid netlist in ./build/', () => {
    let typecad = new Schematic('vdiv_netlist');
    let r1 = new Resistor({ value: '10k', simulation: { include: true } });
    let r2 = new Resistor({ value: '10k', simulation: { include: true } });

    typecad.named('in').net(r1.pin(1));
    typecad.named('vdiv').net(r1.pin(2), r2.pin(1));
    typecad.named('gnd').net(r2.pin(2));
    typecad.add(r1, r2);

    let vin = new Power({ power: r1.pin(1), gnd: r2.pin(2), voltage: 5.0 });

    const result = typecad.simulate(vin).op();

    if (result !== null) {
      const netlist = fs.readFileSync('./build/vdiv_netlist.cir', 'utf-8');
      expect(netlist).toContain(r1.reference);
      expect(netlist).toContain(r2.reference);
      expect(netlist).toContain('10k');
      expect(netlist).toContain('V1');
      expect(netlist).toContain('in');
      expect(netlist).toContain('vdiv');
      expect(netlist).toContain('gnd');
      expect(netlist).toContain('.control');
      expect(netlist).toContain('.end');
    }
  });

  it('should run a headless transient analysis and return the parsed waveform', () => {
    let typecad = new Schematic('rc_tran');
    let r1 = new Resistor({ value: '1k', simulation: { include: true } });
    let c1 = new Capacitor({ value: '1u', simulation: { include: true } });

    typecad.named('vin').net(r1.pin(1));
    typecad.named('vc').net(r1.pin(2), c1.pin(1));
    typecad.named('gnd').net(c1.pin(2));
    typecad.add(r1, c1);

    let src = new Power({ power: r1.pin(1), gnd: c1.pin(2), voltage: 5.0 });

    // uic: start from v(vc) = 0 so the charging curve is visible
    const result = typecad.simulate(src).tran('10u', '5m', undefined, undefined, true);

    if (result === null) {
      console.log('ngspice not installed — skipping simulation assertions');
      return;
    }

    expect(result.numPoints).toBeGreaterThan(100);
    const vc = result.values['v(vc)'];
    expect(vc.length).toBe(result.numPoints);
    expect(vc[0]).toBeCloseTo(0, 1);
    // 5 time constants (tau = R*C = 1ms) -> vc ~ 5 * (1 - e^-5) = 4.9663 V
    expect(vc[vc.length - 1]).toBeCloseTo(4.9663, 2);
  });

  it('should emit a valid ngspice .model card and omit the value token for modeled devices', () => {
    let typecad = new Schematic('led_model');
    let r1 = new Resistor({ value: '330', simulation: { include: true } });
    let d1 = new LED({
      value: 'red',
      simulation: { include: true, model: 'Dled D (IS=1a RS=3.3 N=1.8)' },
    });

    typecad.named('p5v').net(r1.pin(1));
    // KiCad diode symbols number the cathode 1 and the anode 2 — the netlist
    // generator flips the pair for the D card (anode first)
    typecad.named('anode').net(r1.pin(2), d1.pin(2));
    typecad.named('gnd').net(d1.pin(1));
    typecad.add(r1, d1);

    let src = new Power({ power: r1.pin(1), gnd: d1.pin(1), voltage: 5.0 });

    const result = typecad.simulate(src).op();

    if (result === null) {
      console.log('ngspice not installed — skipping simulation assertions');
      return;
    }

    const netlist = fs.readFileSync('./build/led_model.cir', 'utf-8');
    // the instance card references the model name, not the value
    expect(netlist).toMatch(new RegExp(`^${d1.reference} anode gnd Dled$`, 'm'));
    expect(netlist).not.toMatch(new RegExp(`^${d1.reference} anode gnd red`, 'm'));
    expect(netlist).toContain('.model Dled D (IS=1a RS=3.3 N=1.8)');

    // ~9.86 mA through the LED: (5 V - 1.75 V forward drop) / 330 ohm
    expect(result.getCurrent(d1.reference)).toBeGreaterThan(0.009);
    expect(result.getCurrent(d1.reference)).toBeLessThan(0.011);

    // per-pad branch injections (the flow-visualization data): R1 feeds the
    // anode node, D1 draws from it, and the source's terminal pads land on
    // the same pads as the devices they host, netting against them
    const padInj = (net: string, ref: string, pin: string) =>
      (result.branches?.[net] ?? []).filter((b) => b.ref === ref && b.pin === pin).reduce((s, b) => s + b.i, 0);
    expect(result.branches?.p5v).toHaveLength(2);
    expect(padInj('anode', r1.reference, '2')).toBeGreaterThan(0.009);
    expect(padInj('anode', r1.reference, '2')).toBeLessThan(0.011);
    expect(padInj('anode', d1.reference, '2')).toBeLessThan(-0.009);
    expect(Math.abs(padInj('gnd', d1.reference, '1'))).toBeLessThan(0.001);
  });

  it('should simulate the whole circuit with no opt-in flags and a bare simulate() call', () => {
    let typecad = new Schematic('vdiv_auto');
    // no simulation: { include: true } anywhere — passives are auto-included
    let r1 = new Resistor({ value: '10k' });
    let r2 = new Resistor({ value: '10k' });

    typecad.named('in').net(r1.pin(1));
    typecad.named('vdiv').net(r1.pin(2), r2.pin(1));
    typecad.named('gnd').net(r2.pin(2));
    typecad.add(r1, r2);

    // Power stamps voltage onto the pins; simulate() discovers it without
    // the Power being passed in
    new Power({ power: r1.pin(1), gnd: r2.pin(2), voltage: 5.0 });

    const result = typecad.simulate().op();

    if (result === null) {
      console.log('ngspice not installed — skipping simulation assertions');
      return;
    }

    expect(result.getVoltage('in')).toBeCloseTo(5.0, 2);
    expect(result.getVoltage('vdiv')).toBeCloseTo(2.5, 2);
    expect(result.getCurrent(r1.reference)).toBeCloseTo(0.00025, 4);
  });

  it('should exclude components flagged with simulation.exclude', () => {
    let typecad = new Schematic('vdiv_excluded');
    let r1 = new Resistor({ value: '10k' });
    let r2 = new Resistor({ value: '10k' });
    // netted like r2 (vdiv -> gnd) but opted out of the simulation
    let r3 = new Resistor({ value: '22k', simulation: { exclude: true } });

    typecad.named('in').net(r1.pin(1));
    typecad.named('vdiv').net(r1.pin(2), r2.pin(1), r3.pin(1));
    typecad.named('gnd').net(r2.pin(2), r3.pin(2));
    typecad.add(r1, r2, r3);

    let vin = new Power({ power: r1.pin(1), gnd: r2.pin(2), voltage: 5.0 });

    const result = typecad.simulate(vin).op();

    if (result === null) {
      console.log('ngspice not installed — skipping simulation assertions');
      return;
    }

    const netlist = fs.readFileSync('./build/vdiv_excluded.cir', 'utf-8');
    expect(netlist).toContain(`${r1.reference} in vdiv 10k`);
    expect(netlist).toContain(`${r2.reference} vdiv gnd 10k`);
    expect(netlist).not.toContain(`${r3.reference} vdiv gnd`);
    // with r3 excluded the divider is still equal halves
    expect(result.getVoltage('vdiv')).toBeCloseTo(2.5, 2);
  });
});

describe('Full-featured simulation API', () => {
  it('should run a DC sweep over a named source', () => {
    let typecad = new Schematic('vdiv_sweep');
    let r1 = new Resistor({ value: '10k' });
    let r2 = new Resistor({ value: '22k' });

    typecad.named('in').net(r1.pin(1));
    typecad.named('tap').net(r1.pin(2), r2.pin(1));
    typecad.named('gnd').net(r2.pin(2));
    typecad.add(r1, r2);

    let vs = new Power({ power: r1.pin(1), gnd: r2.pin(2), voltage: 5, name: 'VS' });

    const result = typecad.simulate(vs).dc('VS', 0, 5, 1);

    if (result === null) {
      console.log('ngspice not installed — skipping simulation assertions');
      return;
    }

    const sweep = result.getWaveform('v(v-sweep)');
    const tap = result.getWaveform('v(tap)');
    expect(result.numPoints).toBe(6);
    expect(sweep[0]).toBeCloseTo(0, 6);
    expect(sweep[sweep.length - 1]).toBeCloseTo(5, 6);
    // divider ratio 22/32 stays linear across the sweep
    for (let i = 0; i < sweep.length; i++) {
      expect(tap[i]).toBeCloseTo(sweep[i] * (22 / 32), 3);
    }
    expect(result.getAt('v(tap)', 5)).toBeCloseTo(3.4375, 3);
  });

  it('should run an AC analysis and parse complex results with magnitude/phase helpers', () => {
    let typecad = new Schematic('rc_ac');
    let r1 = new Resistor({ value: '1k' });
    let c1 = new Capacitor({ value: '1u' });

    typecad.named('vin').net(r1.pin(1));
    typecad.named('vc').net(r1.pin(2), c1.pin(1));
    typecad.named('gnd').net(c1.pin(2));
    typecad.add(r1, c1);

    let src = new Power({ power: r1.pin(1), gnd: c1.pin(2), voltage: 2.5, ac: 1 });

    const result = typecad.simulate(src).ac('dec', 5, 1, '100k');

    if (result === null) {
      console.log('ngspice not installed — skipping simulation assertions');
      return;
    }

    expect(result.flags).toContain('complex');
    expect(result.numPoints).toBeGreaterThan(10);

    // fc = 1/(2*pi*R*C) ~ 159 Hz; flat near 0 dB well below, rolling off above
    const frequency = result.getWaveform('frequency');
    expect(result.getDb('v(vc)', 0)).toBeCloseTo(0, 2);
    // at 100 kHz: 20*log10(159/100000) ~ -56 dB, phase ~ -90 deg
    expect(result.getDb('v(vc)')).toBeLessThan(-53);
    expect(result.getDb('v(vc)')).toBeGreaterThan(-59);
    expect(result.getPhaseDeg('v(vc)')).toBeLessThan(-88);
    expect(result.getPhaseDeg('v(vc)')).toBeGreaterThan(-92);
    expect(result.getMagnitude('v(vc)', 0)).toBeCloseTo(1, 3);
    expect(frequency.length).toBe(result.numPoints);
  });

  it('should instantiate a .subckt from a library file via .include', () => {
    fs.mkdirSync('models', { recursive: true });
    fs.writeFileSync(
      'models/test_rpar.lib',
      '* two 1k resistors in parallel = 500 ohm between A and B\n.subckt RPAR A B\nR1 A B 1k\nR2 A B 1k\n.ends RPAR\n',
    );

    let typecad = new Schematic('subckt_use');
    let r1 = new Resistor({ value: '500' });
    let x1 = new Component({
      footprint: 'Resistor_SMD:R_0603_1608Metric',
      reference: 'X1',
      simulation: { subckt: 'RPAR', library: 'models/test_rpar.lib' },
    });
    x1.pin(1);
    x1.pin(2);

    typecad.named('vin').net(r1.pin(1));
    typecad.named('mid').net(r1.pin(2), x1.pin(1));
    typecad.named('gnd').net(x1.pin(2));
    typecad.add(r1, x1);

    let src = new Power({ power: r1.pin(1), gnd: x1.pin(2), voltage: 5 });

    const result = typecad.simulate(src).op();

    if (result === null) {
      console.log('ngspice not installed — skipping simulation assertions');
      return;
    }

    const netlist = fs.readFileSync('./build/subckt_use.cir', 'utf-8');
    expect(netlist).toContain('X1 mid gnd RPAR');
    // include path is rewritten relative to the netlist's build/ directory
    expect(netlist).toContain('.include ../models/test_rpar.lib');
    // 500 ohm + (1k || 1k) divider from 5 V
    expect(result.getVoltage('mid')).toBeCloseTo(2.5, 3);
  });

  it('should map component pins onto subckt ports with simulation.pinOrder', () => {
    fs.mkdirSync('models', { recursive: true });
    // asymmetric ladder: A -1k- B -2k- C
    fs.writeFileSync(
      'models/test_lag.lib',
      '* A -1k- B -2k- C\n.subckt RLAG A B C\nR1 A B 1k\nR2 B C 2k\n.ends RLAG\n',
    );

    let typecad = new Schematic('subckt_order');
    let rs = new Resistor({ value: '10' });
    let x1 = new Component({
      footprint: 'Resistor_SMD:R_0603_1608Metric',
      reference: 'X1',
      simulation: { subckt: 'RLAG', library: 'models/test_lag.lib', pinOrder: [3, 2, 1] },
    });
    x1.pin(1);
    x1.pin(2);
    x1.pin(3);

    typecad.named('vin').net(rs.pin(1));
    typecad.named('left').net(rs.pin(2), x1.pin(1));
    typecad.named('mid').net(x1.pin(2));
    typecad.named('gnd').net(x1.pin(3));
    typecad.add(rs, x1);

    let src = new Power({ power: rs.pin(1), gnd: x1.pin(3), voltage: 6 });

    const result = typecad.simulate(src).op();

    if (result === null) {
      console.log('ngspice not installed — skipping simulation assertions');
      return;
    }

    const netlist = fs.readFileSync('./build/subckt_order.cir', 'utf-8');
    // pinOrder [3,2,1] reverses the terminal order: gnd mid left
    expect(netlist).toContain('X1 gnd mid left RLAG');
    // chain: vin -10- left -2k- mid -1k- gnd -> v(mid) = 6*1k/3010, v(left) = 6*3k/3010
    expect(result.getVoltage('mid')).toBeCloseTo((6 * 1000) / 3010, 2);
    expect(result.getVoltage('left')).toBeCloseTo((6 * 3000) / 3010, 2);
  });

  it('should append simulation.params as instance parameters', () => {
    let typecad = new Schematic('res_params');
    let r1 = new Resistor({ value: '1k', simulation: { model: 'RMOD R (RSH=1k)', params: 'm=2' } });

    typecad.named('vin').net(r1.pin(1));
    typecad.named('gnd').net(r1.pin(2));
    typecad.add(r1);

    let src = new Power({ power: r1.pin(1), gnd: r1.pin(2), voltage: 3 });

    const result = typecad.simulate(src).op();

    // emission is asserted even when ngspice is unavailable
    const netlist = fs.readFileSync('./build/res_params.cir', 'utf-8');
    expect(netlist).toContain(`${r1.reference} vin gnd RMOD m=2`);
    expect(netlist).toContain('.model RMOD R (RSH=1k)');

    if (result === null) {
      console.log('ngspice not installed — skipping simulation assertions');
      return;
    }

    // m=2 parallels the device: R = RSH/m = 500 ohm -> 3 V / 500 = 6 mA
    expect(result.getCurrent(r1.reference)).toBeCloseTo(0.006, 3);
  });

  it('should accept named instance parameters on diode cards (ngspice 44+ rejects positional ones)', () => {
    let typecad = new Schematic('diode_area');
    let r1 = new Resistor({ value: '330' });
    let d1 = new LED({
      value: 'red',
      // named form parses on strict ngspice builds; a positional '2' would not
      simulation: { model: 'DLED D (IS=1a RS=3.3 N=1.8)', params: 'area=2' },
    });

    typecad.named('p5v').net(r1.pin(1));
    // KiCad diode symbols number the cathode 1 and the anode 2 — the netlist
    // generator flips the pair for the D card (anode first)
    typecad.named('anode').net(r1.pin(2), d1.pin(2));
    typecad.named('gnd').net(d1.pin(1));
    typecad.add(r1, d1);

    let src = new Power({ power: r1.pin(1), gnd: d1.pin(1), voltage: 5 });

    const result = typecad.simulate(src).op();

    const netlist = fs.readFileSync('./build/diode_area.cir', 'utf-8');
    expect(netlist).toContain(`${d1.reference} anode gnd DLED area=2`);

    if (result === null) {
      console.log('ngspice not installed — skipping simulation assertions');
      return;
    }

    // area 2 doubles IS -> Vf drops ~32 mV -> ~9.96 mA (vs 9.86 mA at area 1)
    expect(result.getCurrent(d1.reference)).toBeGreaterThan(0.0099);
    expect(result.getCurrent(d1.reference)).toBeLessThan(0.01001);
  });

  it('should skip values containing whitespace instead of emitting multi-token cards', () => {
    let typecad = new Schematic('value_ws');
    let noisy = new Resistor({ value: '10k ohm' }); // would emit "R? in tap 10k ohm"
    let r1 = new Resistor({ value: '10k' });
    let r2 = new Resistor({ value: '22k' });

    typecad.named('in').net(noisy.pin(1), r1.pin(1));
    typecad.named('tap').net(noisy.pin(2), r1.pin(2), r2.pin(1));
    typecad.named('gnd').net(r2.pin(2));
    typecad.add(noisy, r1, r2);

    let src = new Power({ power: r1.pin(1), gnd: r2.pin(2), voltage: 9 });

    const result = typecad.simulate(src).op();

    const netlist = fs.readFileSync('./build/value_ws.cir', 'utf-8');
    expect(netlist).not.toContain('ohm');

    if (result === null) {
      console.log('ngspice not installed — skipping simulation assertions');
      return;
    }

    // the clean 10k/22k divider still simulates: v(tap) = 9 * 22/32
    expect(result.getVoltage('tap')).toBeCloseTo(6.1875, 3);
  });

  it('should drive a transient with a waveform source (PULSE)', () => {
    let typecad = new Schematic('pulse_tran');
    let r1 = new Resistor({ value: '1k' });

    typecad.named('vin').net(r1.pin(1));
    typecad.named('gnd').net(r1.pin(2));
    typecad.add(r1);

    let src = new Power({
      power: r1.pin(1),
      gnd: r1.pin(2),
      voltage: 0,
      waveform: 'PULSE(0 5 1m 1u 1u 5m 20m)',
      name: 'VCLK',
    });

    // 1 ms rise delay, 5 ms high time, 20 ms period
    const result = typecad.simulate(src).tran('100u', '10m');

    if (result === null) {
      console.log('ngspice not installed — skipping simulation assertions');
      return;
    }

    const time = result.getWaveform('time');
    const vin = result.getWaveform('v(vin)');
    const at = (t: number) => {
      let v = vin[0];
      for (let i = 0; i < time.length && time[i] <= t; i++) v = vin[i];
      return v;
    };
    expect(at(0.5e-3)).toBeCloseTo(0, 2);
    expect(at(3e-3)).toBeCloseTo(5, 2);
    // per-device vectors are probed in transient mode too
    expect(result.getWaveform(`i(${r1.reference.toLowerCase()})`).length).toBe(result.numPoints);
  });
});
