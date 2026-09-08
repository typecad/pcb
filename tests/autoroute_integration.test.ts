import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import { PCB, getPcbState, autorouteBatchOnPcb } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';

describe('Autoroute integration', () => {
  const buildDir = './build';
  const boardName = 'test_autoroute';

  beforeEach(() => {
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_pcb`);
    } catch (e) {
      /* ignore */
    }
    try {
      fs.mkdirSync(buildDir);
    } catch (e) {
      /* ignore */
    }
  });

  it('routes a 3-pin net (MST) and writes segments to the board file', () => {
    const pcb = new PCB(boardName);

    const c1 = new Component('test:pad');
    c1.reference = 'U1';
    c1.pins = [c1.pin(1)];
    c1.pcb = { x: 10, y: 10 } as any;

    const c2 = new Component('test:pad');
    c2.reference = 'U2';
    c2.pins = [c2.pin(1)];
    c2.pcb = { x: 30, y: 30 } as any;

    const c3 = new Component('test:pad');
    c3.reference = 'J1';
    c3.pins = [c3.pin(1)];
    c3.pcb = { x: 50, y: 50 } as any;

    pcb.add(c1, c2, c3);

    const simpleFootprint = '(footprint (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu")))';
    vi.spyOn(c1, 'footprint_lib').mockReturnValue(simpleFootprint as any);
    vi.spyOn(c2, 'footprint_lib').mockReturnValue(simpleFootprint as any);
    vi.spyOn(c3, 'footprint_lib').mockReturnValue(simpleFootprint as any);

    pcb.stage(c1, c2, c3);

    const vcc_net = pcb.net(c1.pins[0], c2.pins[0], c3.pins[0]);

    const result = pcb.route(vcc_net, {
      gridResolution: 0.5,
      layers: ['F.Cu'],
      maxIterations: 50000,
    });
    expect(result.success).toBe(true);

    expect(getPcbState(pcb).stagedOutlines.length).toBeGreaterThan(0);

    pcb.create(c1, c2, c3);

    const contents = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(contents.includes('(segment')).toBeTruthy();

    const stagedElementUuids = getPcbState(pcb)
      .stagedOutlines.flatMap((o: any) => (o.elements ?? []).map((el: any) => el.uuid))
      .filter(Boolean);
    expect(stagedElementUuids.length).toBeGreaterThan(0);
    const foundAny = stagedElementUuids.some((u: string) => contents.includes(u));
    expect(foundAny).toBeTruthy();
  });

  it('rejects route() after create() as a known bad-code pattern', () => {
    const pcb = new PCB(boardName);

    const c1 = new Component('test:pad');
    c1.reference = 'U1';
    c1.pins = [c1.pin(1)];
    c1.pcb = { x: 10, y: 10 } as any;

    const c2 = new Component('test:pad');
    c2.reference = 'U2';
    c2.pins = [c2.pin(1)];
    c2.pcb = { x: 30, y: 30 } as any;

    pcb.add(c1, c2);

    const simpleFootprint = '(footprint (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu")))';
    vi.spyOn(c1, 'footprint_lib').mockReturnValue(simpleFootprint as any);
    vi.spyOn(c2, 'footprint_lib').mockReturnValue(simpleFootprint as any);

    pcb.stage(c1, c2);
    pcb.net(c1.pins[0], c2.pins[0]);
    pcb.create(c1, c2);

    // Both route() forms must throw with reordering guidance after create().
    expect(() => pcb.route(pcb.net(c1.pins[0], c2.pins[0]))).toThrowError(/before create/i);
    expect(() => pcb.route({ from: c1.pins[0], to: c2.pins[0] })).toThrowError(/before create/i);
    // Batch routing is the same trap.
    expect(() => autorouteBatchOnPcb(pcb, [{ from: c1.pins[0], to: c2.pins[0] }])).toThrowError(/before create/i);
  });
});
