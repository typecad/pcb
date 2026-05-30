import { describe, it, expect } from 'vitest';
import { Resistor, Capacitor, Inductor, Diode, LED, Fuse } from '../../../passives/0603/index.js';
import { Resistor as R0402, Capacitor as C0402, Inductor as I0402, Diode as D0402, LED as L0402 } from '../../../passives/0402/index.js';
import { Resistor as R0201, Capacitor as C0201, Inductor as I0201, Diode as D0201, LED as L0201 } from '../../../passives/0201/index.js';
import { Resistor as R0805, Capacitor as C0805, Inductor as I0805, Diode as D0805, LED as L0805, Fuse as F0805 } from '../../../passives/0805/index.js';
import { Resistor as R1206, Capacitor as C1206, Inductor as I1206, Diode as D1206, LED as L1206, Fuse as F1206 } from '../../../passives/1206/index.js';
import { Resistor as R1210, Capacitor as C1210, Inductor as I1210, Diode as D1210, LED as L1210, Fuse as F1210 } from '../../../passives/1210/index.js';
import { Connector } from '../../../passives/connector/index.js';
import { Testpoint } from '../../../passives/testpoint/index.js';
import { MountingHole } from '../../../passives/mounting_hole/index.js';

describe('0603 passives', () => {
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

    it('Capacitor accepts custom options', () => {
        const c = new Capacitor({ value: '100 nF', voltage: '6 V' });
        expect(c.value).toBe('100 nF');
        expect(c.voltage).toBe('6 V');
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
        const r = new Resistor();
        const c = new Capacitor();
        const l = new Inductor();
        const d = new Diode();
        const led = new LED();
        const f = new Fuse();
        for (const comp of [r, c, l, d, led, f]) {
            expect(comp).toHaveProperty('reference');
            expect(comp).toHaveProperty('value');
            expect(comp).toHaveProperty('footprint');
            expect(comp).toHaveProperty('symbol');
            expect(comp).toHaveProperty('pin');
            expect(typeof comp.pin).toBe('function');
        }
    });
});

describe('0402 passives', () => {
    it('Resistor has correct footprint', () => {
        const r = new R0402();
        expect(r.footprint).toBe('Resistor_SMD:R_0402_1005Metric');
    });
});

describe('0201 passives', () => {
    it('Resistor has correct footprint', () => {
        const r = new R0201();
        expect(r.footprint).toBe('Resistor_SMD:R_0201_0603Metric');
    });
});

describe('0805 passives', () => {
    it('Resistor has correct footprint', () => {
        const r = new R0805();
        expect(r.footprint).toBe('Resistor_SMD:R_0805_2012Metric');
    });

    it('Fuse has correct footprint', () => {
        const f = new F0805();
        expect(f.footprint).toBe('Fuse:Fuse_0805_2012Metric');
    });
});

describe('1206 passives', () => {
    it('Resistor has correct footprint', () => {
        const r = new R1206();
        expect(r.footprint).toBe('Resistor_SMD:R_1206_3216Metric');
    });

    it('Fuse has correct footprint', () => {
        const f = new F1206();
        expect(f.footprint).toBe('Fuse:Fuse_1206_3216Metric');
    });
});

describe('1210 passives', () => {
    it('Resistor has correct footprint', () => {
        const r = new R1210();
        expect(r.footprint).toBe('Resistor_SMD:R_1210_3225Metric');
    });

    it('Fuse has correct footprint', () => {
        const f = new F1210();
        expect(f.footprint).toBe('Fuse:Fuse_1210_3225Metric');
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

    it('accepts custom footprint', () => {
        const c = new Connector({ number: 3, footprint: 'Connector_JST:JST_SH_1x03' });
        expect(c.footprint).toBe('Connector_JST:JST_SH_1x03');
    });
});

describe('Testpoint', () => {
    it('has correct defaults', () => {
        const tp = new Testpoint();
        expect(tp.footprint).toBe('TestPoint:TestPoint_Pad_D1.0mm');
        expect(tp.symbol).toBe('Connector:TestPoint');
        expect(tp.reference).toMatch(/^TP\d+$/);
    });

    it('accepts custom footprint', () => {
        const tp = new Testpoint({ footprint: 'TestPoint:TestPoint_Keystone_5015_Micro_Mini' });
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
        const cases: [string, string][] = [
            ['M2', 'MountingHole:MountingHole_2.2mm_M2'],
            ['M2.5', 'MountingHole:MountingHole_2.7mm_M2.5'],
            ['M3', 'MountingHole:MountingHole_3.2mm_M3'],
            ['M4', 'MountingHole:MountingHole_4.3mm_M4'],
            ['M5', 'MountingHole:MountingHole_5.3mm_M5'],
            ['M6', 'MountingHole:MountingHole_6.4mm_M6'],
            ['M8', 'MountingHole:MountingHole_8.4mm_M8'],
        ];
        for (const [size, expectedFootprint] of cases) {
            const mh = new MountingHole({ size: size as any });
            expect(mh.footprint).toBe(expectedFootprint);
        }
    });

    it('allows overriding footprint', () => {
        const mh = new MountingHole({ footprint: 'Custom:MH_Pad' });
        expect(mh.footprint).toBe('Custom:MH_Pad');
    });
});
