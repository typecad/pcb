import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { PCB, getPcbState } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';
import { JLCPCB_STANDARD_RULES } from '../src/pcb/pcb_rules.js';

const buildDir = './build';

function readProject(boardName: string): Record<string, unknown> {
  const raw = fs.readFileSync(`${buildDir}/${boardName}.kicad_pro`, 'utf8');
  return JSON.parse(raw);
}

describe('NetClassRegistry via PCB', () => {
  it('netClass() defines a class; netClassFor() resolves dimensions floored at board rules', () => {
    const pcb = new PCB('nc_define');
    pcb.netClass('power', { track_width: 0.5 });
    const resolved = pcb.netClasses.netClassFor('__none__'); // not assigned yet
    expect(resolved).toBeUndefined();
    // defining doesn't error and stores it
    expect(pcb.netClasses.has('power')).toBe(true);
  });

  it('rejects the reserved "Default" class name', () => {
    const pcb = new PCB('nc_reserved');
    expect(() => pcb.netClass('Default', { track_width: 0.5 })).toThrow(RangeError);
  });

  it('assign() records a net→class mapping by net name', () => {
    const pcb = new PCB('nc_assign');
    pcb.netClass('power', { track_width: 0.5 });
    const net = pcb.named('gnd').net();
    pcb.assign(net, 'power');
    expect(pcb.netClasses.classNameFor('gnd')).toBe('power');
    expect(pcb.netClasses.netClassFor('gnd')?.track_width).toBe(0.5);
  });

  it('assign() works with auto-named (unnamed) nets', () => {
    const pcb = new PCB('nc_autoname');
    pcb.netClass('power', { track_width: 0.5 });
    // a pin to attach a net to
    const c = new Component('test:pad');
    c.reference = 'R1';
    c.pins = [c.pin(1)];
    c.pcb = { x: 10, y: 10 } as any;
    pcb.add(c);
    const net = pcb.net(c.pin(1)); // → net1
    pcb.assign(net, 'power');
    expect(pcb.netClasses.classNameFor(net.name)).toBe('power');
  });

  it('unspecified class dimensions fall back to board rules floor', () => {
    const pcb = new PCB('nc_floor');
    pcb.netClass('signal', {});
    const net = pcb.named('sda').net();
    pcb.assign(net, 'signal');
    const dims = pcb.netClasses.netClassFor('sda');
    expect(dims?.track_width).toBe(JLCPCB_STANDARD_RULES.min_track_width);
    expect(dims?.clearance).toBe(JLCPCB_STANDARD_RULES.min_clearance);
  });
});

describe('PCB create() writes net classes to .kicad_pro', () => {
  const boardName = 'nc_create';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_pcb`);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_pro`);
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_pcb`);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_pro`);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_sch`);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.net`);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.csv`);
    } catch {
      /* ignore */
    }
  });

  it('writes user class + assignment into the project file', () => {
    const pcb = new PCB(boardName);
    pcb.netClass('power', { track_width: 0.5, clearance: 0.3, via_diameter: 0.8, via_drill: 0.4 });

    const c = new Component('test:pad');
    c.reference = 'R1';
    c.pins = [c.pin(1)];
    c.pcb = { x: 10, y: 10 } as any;
    vi.spyOn(c, 'footprint_lib').mockReturnValue(
      '(footprint (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu")))' as any,
    );
    pcb.add(c);
    const gnd = pcb.named('gnd').net(c.pin(1));
    pcb.assign(gnd, 'power');

    pcb.create(c);

    const doc = readProject(boardName);
    const cls = doc.net_settings.classes.find((c2: { name: string }) => c2.name === 'power');
    expect(cls).toBeDefined();
    expect(cls.track_width).toBe(0.5);
    expect(cls.via_diameter).toBe(0.8);

    const patterns = doc.net_settings.netclass_patterns;
    expect(patterns).toContainEqual({ netclass: 'power', pattern: 'gnd' });
  });

  it('unassigned nets produce no pattern entry (fall back to Default)', () => {
    const pcb = new PCB(boardName);
    pcb.netClass('power', { track_width: 0.5 });
    // define class but assign nothing
    pcb.create();
    const doc = readProject(boardName);
    const patterns = doc.net_settings.netclass_patterns;
    expect(patterns ?? []).toHaveLength(0);
    // Default still present
    const names = doc.net_settings.classes.map((c: { name: string }) => c.name);
    expect(names).toContain('Default');
  });
});

describe('Autorouter honors net class dimensions', () => {
  const boardName = 'nc_route';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_pcb`);
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_pcb`);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_sch`);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_pro`);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.net`);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.csv`);
    } catch {
      /* ignore */
    }
  });

  it('routes a net with a wide-trace class at the class track width', () => {
    const pcb = new PCB(boardName);
    pcb.netClass('power', { track_width: 0.5 });

    const c1 = new Component('test:pad');
    c1.reference = 'U1';
    c1.pins = [c1.pin(1)];
    c1.pcb = { x: 10, y: 10 } as any;

    const c2 = new Component('test:pad');
    c2.reference = 'U2';
    c2.pins = [c2.pin(1)];
    c2.pcb = { x: 30, y: 30 } as any;

    pcb.add(c1, c2);

    const fp = '(footprint (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu")))';
    vi.spyOn(c1, 'footprint_lib').mockReturnValue(fp as any);
    vi.spyOn(c2, 'footprint_lib').mockReturnValue(fp as any);

    pcb.stage(c1, c2);
    const net = pcb.net(c1.pins[0], c2.pins[0]);
    pcb.assign(net, 'power');

    const result = pcb.route(net, { gridResolution: 0.5, layers: ['F.Cu'], maxIterations: 50000 });
    expect(result.success).toBe(true);

    pcb.create(c1, c2);

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    // The generated segment must carry the class's 0.5mm width, not the 0.2 default
    expect(board).toContain('(width 0.5)');
    expect(board).not.toContain('(width 0.2)');
  });
});
