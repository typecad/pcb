import { describe, it, expect } from 'vitest';
import {
  Resistor,
  Capacitor,
  Inductor,
  Diode,
  LED,
  Fuse,
  Connector,
  TestPoint,
  MountingHole,
  NetTie,
  passiveFactory,
  type PassiveSize,
  type MountingHoleInit,
} from '../../src/passives/index.js';

describe('chip passives (default size)', () => {
  it('Resistor has correct defaults', () => {
    const r = new Resistor();
    expect(r.footprint).toBe('Resistor_SMD:R_0603_1608Metric');
    expect(r.symbol).toBe('Device:R_Small');
    expect(r.reference).toMatch(/^R\d+$/);
    expect(r.value).toBe('');
  });

  it('Resistor accepts custom options', () => {
    const r = new Resistor({ value: '4.7 kOhm', wattage: '0.25 W' });
    expect(r.value).toBe('4.7 kOhm');
    expect(r.wattage).toBe('0.25 W');
  });

  it('Resistor allows overriding footprint and symbol', () => {
    const r = new Resistor({ footprint: 'lib:Custom_R', symbol: 'MyLib:R_Custom' });
    expect(r.footprint).toBe('lib:Custom_R');
    expect(r.symbol).toBe('MyLib:R_Custom');
  });

  it('Capacitor has correct defaults', () => {
    const c = new Capacitor();
    expect(c.footprint).toBe('Capacitor_SMD:C_0603_1608Metric');
    expect(c.symbol).toBe('Device:C_Small');
    expect(c.reference).toMatch(/^C\d+$/);
  });

  it('Inductor has correct defaults', () => {
    const l = new Inductor();
    expect(l.footprint).toBe('Inductor_SMD:L_0603_1608Metric');
    expect(l.symbol).toBe('Device:L_Small');
    expect(l.reference).toMatch(/^L\d+$/);
  });

  it('Diode has correct defaults', () => {
    const d = new Diode();
    expect(d.footprint).toBe('Diode_SMD:D_0603_1608Metric');
    expect(d.symbol).toBe('Device:D_Small');
    expect(d.reference).toMatch(/^D\d+$/);
  });

  it('LED has correct defaults', () => {
    const led = new LED();
    expect(led.footprint).toBe('LED_SMD:LED_0603_1608Metric');
    expect(led.symbol).toBe('Device:LED_Small');
    expect(led.reference).toMatch(/^D\d+$/);
  });

  it('Fuse has correct defaults', () => {
    const f = new Fuse();
    expect(f.footprint).toBe('Fuse:Fuse_0603_1608Metric');
    expect(f.symbol).toBe('Device:Fuse_Small');
    expect(f.reference).toMatch(/^F\d+$/);
  });

  it('all components have Component-like properties', () => {
    const comps = [new Resistor(), new Capacitor(), new Inductor(), new Diode(), new LED(), new Fuse()];
    for (const comp of comps) {
      expect(comp).toHaveProperty('reference');
      expect(comp).toHaveProperty('value');
      expect(comp).toHaveProperty('footprint');
      expect(comp).toHaveProperty('symbol');
      expect(comp).toHaveProperty('pin');
      expect(typeof comp.pin).toBe('function');
    }
  });
});

describe('size option', () => {
  const resistorFootprint: Record<PassiveSize, string> = {
    '0201': 'Resistor_SMD:R_0201_0603Metric',
    '0402': 'Resistor_SMD:R_0402_1005Metric',
    '0603': 'Resistor_SMD:R_0603_1608Metric',
    '0805': 'Resistor_SMD:R_0805_2012Metric',
    '1206': 'Resistor_SMD:R_1206_3216Metric',
    '1210': 'Resistor_SMD:R_1210_3225Metric',
  };

  it('selects the footprint for every size', () => {
    for (const [size, footprint] of Object.entries(resistorFootprint)) {
      expect(new Resistor({ size: size as PassiveSize }).footprint).toBe(footprint);
    }
  });

  it('an explicit footprint wins over the size preset', () => {
    const r = new Resistor({ size: '0805', footprint: 'Resistor_SMD:R_1206_3216Metric' });
    expect(r.footprint).toBe('Resistor_SMD:R_1206_3216Metric');
  });

  it('Fuse footprints resolve for the sizes that carry one', () => {
    const fuseSizes: [PassiveSize, string][] = [
      ['0603', 'Fuse:Fuse_0603_1608Metric'],
      ['0805', 'Fuse:Fuse_0805_2012Metric'],
      ['1206', 'Fuse:Fuse_1206_3216Metric'],
      ['1210', 'Fuse:Fuse_1210_3225Metric'],
    ];
    for (const [size, footprint] of fuseSizes) {
      expect(new Fuse({ size: size as never }).footprint).toBe(footprint);
    }
  });
});

describe('Connector', () => {
  it('creates a default single-pin connector', () => {
    const c = new Connector();
    expect(c.footprint).toContain('PinHeader_1x01');
    expect(c.symbol).toContain('Conn_01x01');
    expect(c.reference).toMatch(/^J\d+$/);
  });

  it('pads single-digit pin count', () => {
    const c = new Connector({ number: 5 });
    expect(c.footprint).toContain('PinHeader_1x05');
    expect(c.symbol).toContain('Conn_01x05');
  });

  it('handles double-digit pin count', () => {
    const c = new Connector({ number: 10 });
    expect(c.footprint).toContain('PinHeader_1x10');
    expect(c.symbol).toContain('Conn_01x10');
  });

  it('templates the JST-SH series from the pin count', () => {
    const c = new Connector({ number: 10, series: 'JST-SH' });
    expect(c.footprint).toBe('Connector_JST:JST_SH_SM10B-SRSS-TB_1x10-1MP_P1.00mm_Horizontal');
    expect(c.symbol).toBe('Connector:Conn_01x10_Pin');
  });

  it('accepts custom footprint', () => {
    const c = new Connector({ number: 3, footprint: 'Connector_JST:JST_SH_1x03' });
    expect(c.footprint).toBe('Connector_JST:JST_SH_1x03');
  });
});

describe('TestPoint', () => {
  it('has correct defaults', () => {
    const tp = new TestPoint();
    expect(tp.footprint).toBe('TestPoint:TestPoint_Pad_D1.0mm');
    expect(tp.symbol).toBe('Connector:TestPoint');
    expect(tp.reference).toMatch(/^TP\d+$/);
  });

  it('accepts custom footprint', () => {
    const tp = new TestPoint({ footprint: 'TestPoint:TestPoint_Keystone_5015_Micro_Mini' });
    expect(tp.footprint).toBe('TestPoint:TestPoint_Keystone_5015_Micro_Mini');
  });
});

describe('MountingHole', () => {
  it('defaults to M2', () => {
    const mh = new MountingHole();
    expect(mh.footprint).toBe('MountingHole:MountingHole_2.2mm_M2');
    expect(mh.reference).toMatch(/^MH\d+$/);
  });

  it('maps each size to correct footprint', () => {
    const cases: [NonNullable<MountingHoleInit['size']>, string][] = [
      ['M2', 'MountingHole:MountingHole_2.2mm_M2'],
      ['M2.5', 'MountingHole:MountingHole_2.7mm_M2.5'],
      ['M3', 'MountingHole:MountingHole_3.2mm_M3'],
      ['M4', 'MountingHole:MountingHole_4.3mm_M4'],
      ['M5', 'MountingHole:MountingHole_5.3mm_M5'],
      ['M6', 'MountingHole:MountingHole_6.4mm_M6'],
      ['M8', 'MountingHole:MountingHole_8.4mm_M8'],
    ];
    for (const [size, expectedFootprint] of cases) {
      expect(new MountingHole({ size }).footprint).toBe(expectedFootprint);
    }
  });
});

describe('NetTie', () => {
  it('defaults to a 2-pin tie when no nets are given', () => {
    const t = new NetTie();
    expect(t.footprint).toBe('NetTie:NetTie-2_SMD_Pad0.5mm');
    expect(t.symbol).toBe('Device:NetTie_2');
  });

  it('pin count follows the number of nets', () => {
    expect(new NetTie({}).symbol).toBe('Device:NetTie_2');
  });
});

describe('passiveFactory (Package default)', () => {
  it('binds every factory to the requested size', () => {
    const f = passiveFactory('0805');
    expect(new f.Resistor().footprint).toBe('Resistor_SMD:R_0805_2012Metric');
    expect(new f.Capacitor().footprint).toBe('Capacitor_SMD:C_0805_2012Metric');
    expect(new f.Inductor().footprint).toBe('Inductor_SMD:L_0805_2012Metric');
    expect(new f.Diode().footprint).toBe('Diode_SMD:D_0805_2012Metric');
    expect(new f.LED().footprint).toBe('LED_SMD:LED_0805_2012Metric');
    expect(new f.Fuse().footprint).toBe('Fuse:Fuse_0805_2012Metric');
  });

  it('defaults to 0603', () => {
    const f = passiveFactory();
    expect(new f.Resistor().footprint).toBe('Resistor_SMD:R_0603_1608Metric');
  });

  it('options still pass through, with size overridable per instance', () => {
    const f = passiveFactory('0805');
    expect(new f.Resistor({ value: '10k' }).value).toBe('10k');
    expect(new f.Resistor({ size: '1206' }).footprint).toBe('Resistor_SMD:R_1206_3216Metric');
  });
});
