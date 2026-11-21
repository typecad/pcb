import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PCB } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';
import { PadResolver } from '../src/routing/shared/pad_resolver.js';

const fp = (body: string) => `(footprint "X" (layer "F.Cu") ${body})`;
const smd = (n: string, x: number, y: number, size = 0.6, layer = 'F.Cu') =>
  `(pad "${n}" smd rect (at ${x} ${y}) (size ${size} ${size}) (layers "${layer}"))`;

function part(name: string, ref: string, x: number, y: number, footprint: string, pins: string[]) {
  const c = new Component(name);
  c.reference = ref;
  c.pins = pins.map((p) => c.pin(p));
  c.pcb = { x, y } as never;
  vi.spyOn(c, 'footprint_lib').mockReturnValue(footprint as never);
  return c;
}

describe('pad geometry follows footprint content, not name', () => {
  it('resolves two same-named footprints to their own pads', () => {
    const small = part('lib:same', 'A1', 0, 0, fp(smd('1', 0, 0, 0.5)), ['1']);
    const big = part('lib:same', 'A2', 10, 0, fp(smd('1', 2, 3, 4)), ['1']);
    expect(PadResolver.getPadGeometry(small, '1')!.size.width).toBe(0.5);
    const g = PadResolver.getPadGeometry(big, '1')!;
    expect(g.size.width).toBe(4);
    expect(g.center).toEqual({ x: 12, y: 3 });
  });
});

describe('boards in one process do not see each other’s parts', () => {
  it('a part placed on another board is not an obstacle here', () => {
    // board A: a large pad right on board B's straight path, never built
    const a = new PCB('iso_a');
    const wall = part('lib:wall', 'W1', 10, 5, fp(smd('1', 0, 0, 3)), ['1']);
    const wall2 = part('lib:pad', 'W2', 10, 20, fp(smd('1', 0, 0)), ['1']);
    a.add(wall, wall2);
    a.named('A_NET').net(wall.pins[0]!, wall2.pins[0]!);

    // board B: two pads with a clear straight line through x = 10
    const b = new PCB('iso_b');
    const p = part('lib:pad', 'P1', 5, 5, fp(smd('1', 0, 0)), ['1']);
    const q = part('lib:pad', 'P2', 15, 5, fp(smd('1', 0, 0)), ['1']);
    b.add(p, q);
    b.stage(p, q);
    const r = b.route(b.named('B_NET').net(p.pins[0]!, q.pins[0]!), { width: 0.2, clearance: 0.2, layers: ['F.Cu'] });
    expect(r.success).toBe(true);
    const ys = r.routeDetails.flatMap((d) => d.path?.nodes.map((n) => n.y) ?? []);
    // going around W1 (3mm pad at y = 5) needs >= 1.8mm of offset; small jogs near the pads are fine
    expect(Math.max(...ys.map((y) => Math.abs(y - 5)))).toBeLessThan(1.2);
  });
});

describe('back-copper pads of a front-side footprint', () => {
  beforeEach(() => fs.mkdirSync('./build', { recursive: true }));

  it('stay on B.Cu in the written board (card-edge fingers)', () => {
    const pcb = new PCB('bcu_front');
    pcb.outline(0, 0, 20, 20);
    const edge = part('lib:edge', 'J1', 10, 10, fp(smd('1', 0, 0) + smd('2', 0, 0, 0.6, 'B.Cu')), ['1', '2']);
    pcb.add(edge);
    pcb.create(edge);
    const text = fs.readFileSync(path.join('build', 'bcu_front.kicad_pcb'), 'utf8');
    expect(text).toMatch(/\(pad "2" smd rect[^\n]*\(layers "B\.Cu"\)/);
    expect(text).toMatch(/\(pad "1" smd rect[^\n]*\(layers "F\.Cu"\)/);
  });

  it('flip exactly once on a back-side part (every pad layer, not twice)', () => {
    const pcb = new PCB('bcu_back');
    pcb.outline(0, 0, 20, 20);
    const pad = (n: string, layers: string) => `(pad "${n}" smd rect (at 0 0) (size 0.6 0.6) (layers ${layers}))`;
    const p = part('lib:back', 'U1', 10, 10, fp(pad('1', '"F.Cu" "F.Paste" "F.Mask"') + pad('2', '"B.Cu"')), ['1', '2']);
    p.pcb = { x: 10, y: 10, side: 'back' } as never;
    pcb.add(p);
    pcb.create(p);
    const text = fs.readFileSync(path.join('build', 'bcu_back.kicad_pcb'), 'utf8');
    expect(text).toMatch(/\(pad "1" smd rect[^\n]*\(layers "B\.Cu" "B\.Paste" "B\.Mask"\)/);
    expect(text).toMatch(/\(pad "2" smd rect[^\n]*\(layers "F\.Cu"\)/);
  });
});

describe('duplicate pad numbers', () => {
  it('routes every pad that shares the pin number', () => {
    const pcb = new PCB('dup_pads');
    // shield: pad "2" twice, either side of the signal pin
    const bnc = part('lib:bnc', 'J1', 10, 10, fp(smd('1', 0, 0) + smd('2', -5, 0) + smd('2', 5, 0)), ['1', '2']);
    const gnd = part('lib:pad', 'G1', 10, 20, fp(smd('1', 0, 0)), ['1']);
    pcb.add(bnc, gnd);
    pcb.stage(bnc, gnd);
    expect(PadResolver.padCount(bnc, '2')).toBe(2);
    expect(PadResolver.getPadGeometry(bnc, PadResolver.padOccurrencePin('2', 1))!.center).toEqual({ x: 15, y: 10 });

    const r = pcb.route(pcb.named('GND').net(bnc.pin('2'), gnd.pin('1')), { width: 0.2, clearance: 0.2, layers: ['F.Cu'] });
    expect(r.success).toBe(true);
    expect(r.routeCount).toBe(2); // three terminals: G1.1, J1.2 (x=5), J1.2 (x=15)
    const ends = r.routeDetails.flatMap((d) => {
      const n = d.path?.nodes ?? [];
      return [n[0], n[n.length - 1]].filter(Boolean).map((p) => `${p!.x.toFixed(1)},${p!.y.toFixed(1)}`);
    });
    expect(ends).toContain('5.0,10.0');
    expect(ends).toContain('15.0,10.0');
  });
});
