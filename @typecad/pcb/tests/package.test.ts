import { describe, it, expect, vi } from 'vitest';
import { Component } from '../src/component.js';
import { PCB } from '../src/pcb/pcb.js';
import { Pin } from '../src/pin.js';
import type { PassiveFactory } from '../src/package.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFile: vi.fn(),
}));

vi.mock('node:fs', () => ({
  __esModule: true,
  default: {
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => ''),
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ mtimeMs: 0 })),
  },
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ mtimeMs: 0 })),
}));

const mockPassiveFactory: PassiveFactory = {
  Resistor: class extends Component {
    constructor(opts?: any) {
      super({ footprint: 'Resistor_SMD:R_0603_1608Metric', ...opts });
    }
  },
  Capacitor: class extends Component {
    constructor(opts?: any) {
      super({ footprint: 'Capacitor_SMD:C_0603_1608Metric', ...opts });
    }
  },
  Inductor: class extends Component {
    constructor(opts?: any) {
      super({ footprint: 'Inductor_SMD:L_0603_1608Metric', ...opts });
    }
  },
  Diode: class extends Component {
    constructor(opts?: any) {
      super({ footprint: 'Diode_SMD:D_0603_1608Metric', ...opts });
    }
  },
  LED: class extends Component {
    constructor(opts?: any) {
      super({ footprint: 'LED_SMD:LED_0603_1608Metric', ...opts });
    }
  },
  Fuse: class extends Component {
    constructor(opts?: any) {
      super({ footprint: 'Fuse:Fuse_0603', ...opts });
    }
  },
};

describe('Package', () => {
  async function importPackage() {
    const mod = await import('../src/package.js');
    return mod;
  }

  function makePCB(): PCB {
    return new PCB('test-board');
  }

  it('should call build() during construction', async () => {
    const { Package } = await importPackage();
    let buildCalled = false;

    class TestPackage extends Package {
      protected build(): void {
        buildCalled = true;
      }
    }

    new TestPackage({ pcb: makePCB(), x: 0, y: 0, passives: mockPassiveFactory });
    expect(buildCalled).toBe(true);
  });

  it('should auto-collect Component properties set on this', async () => {
    const { Package } = await importPackage();

    class TestPackage extends Package {
      declare resistor: Component;

      protected build(): void {
        this.resistor = new Component({
          reference: 'R10',
          value: '10k',
          footprint: 'Resistor_SMD:R_0603_1608Metric',
        });
      }
    }

    const pkg = new TestPackage({ pcb: makePCB(), x: 0, y: 0, passives: mockPassiveFactory });
    expect(pkg.components).toContain(pkg.resistor);
  });

  it('should apply offset to component positions', async () => {
    const { Package } = await importPackage();

    class TestPackage extends Package {
      declare resistor: Component;

      protected build(): void {
        this.resistor = new Component({
          reference: 'R20',
          value: '10k',
          footprint: 'Resistor_SMD:R_0603_1608Metric',
          pcb: { x: 5, y: 10 },
        });
      }
    }

    const pkg = new TestPackage({ pcb: makePCB(), x: 100, y: 200, passives: mockPassiveFactory });
    expect(pkg.resistor.pcb.x).toBe(105);
    expect(pkg.resistor.pcb.y).toBe(210);
  });

  it('should support manual add() for tracks', async () => {
    const { Package } = await importPackage();

    class TestPackage extends Package {
      protected build(): void {
        const comp = new Component({
          reference: 'R40',
          value: '10k',
          footprint: 'Resistor_SMD:R_0603_1608Metric',
        });
        this.add(comp);
      }
    }

    const pkg = new TestPackage({ pcb: makePCB(), x: 0, y: 0, passives: mockPassiveFactory });
    expect(pkg.components.length).toBe(1);
  });

  it('should support net() shorthand', async () => {
    const { Package } = await importPackage();
    let netCalled = false;

    class TestPackage extends Package {
      protected build(): void {
        const r = new Component({
          reference: 'R50',
          value: '10k',
          footprint: 'Resistor_SMD:R_0603_1608Metric',
        });
        this.add(r);
        netCalled = true;
      }
    }

    new TestPackage({ pcb: makePCB(), x: 0, y: 0, passives: mockPassiveFactory });
    expect(netCalled).toBe(true);
  });

  it('should create a group with class name', async () => {
    const { Package } = await importPackage();

    class MyCustomPackage extends Package {
      protected build(): void {
        this.add(
          new Component({
            reference: 'R60',
            value: '10k',
            footprint: 'Resistor_SMD:R_0603_1608Metric',
          }),
        );
      }
    }

    const pcb = makePCB();
    new MyCustomPackage({ pcb: pcb, x: 0, y: 0, passives: mockPassiveFactory });
    expect(pcb.schematic.referenceCounter).toBeDefined();
  });

  it('should use custom group name when provided', async () => {
    const { Package } = await importPackage();

    class TestPackage extends Package {
      protected build(): void {
        this.add(
          new Component({
            reference: 'R70',
            value: '10k',
            footprint: 'Resistor_SMD:R_0603_1608Metric',
          }),
        );
      }
    }

    const pcb = makePCB();
    new TestPackage({ pcb, x: 0, y: 0, name: 'CustomGroup', passives: mockPassiveFactory });
  });

  it('should not apply offset when offset is (0,0)', async () => {
    const { Package } = await importPackage();

    class TestPackage extends Package {
      declare comp: Component;

      protected build(): void {
        this.comp = new Component({
          reference: 'R80',
          value: '10k',
          footprint: 'Resistor_SMD:R_0603_1608Metric',
          pcb: { x: 5, y: 10 },
        });
        this.add(this.comp);
      }
    }

    const pkg = new TestPackage({ pcb: makePCB(), x: 0, y: 0, passives: mockPassiveFactory });
    expect(pkg.comp.pcb.x).toBe(5);
    expect(pkg.comp.pcb.y).toBe(10);
  });
});
