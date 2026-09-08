import { describe, it, expect, afterAll } from 'vitest';
import { Power, Component } from '../src/index.js';
import { Schematic } from '../src/schematic.js';
import fs from 'fs';

const outputFiles = ['vdiv_equal.out', 'vdiv_netlist.out', 'vdiv_unequal.out'];

afterAll(() => {
  for (const f of outputFiles) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

class Resistor extends Component {
  constructor(opts: { value?: string; simulation?: { include: boolean; model?: string } } = {}) {
    super('Resistor_SMD:R_0603_1608Metric');
    this.symbol = 'Device:R_Small';
    if (opts.value) this.value = opts.value;
    if (opts.simulation) this.simulation = { include: opts.simulation.include, model: opts.simulation.model ?? '' };
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
});
