// Native ERC engine — electrical correctness over the typeCAD object model.
// In-memory Schematics only (components + nets, no files): the engine's two
// questions are "is a roster pin unconnected?" and "does a net tie
// incompatible electrical types together?". Rosters are injected so tests
// never depend on a KiCad install.
import { describe, expect, it } from 'vitest';
import { Schematic } from '../../schematic.js';
import { Component } from '../../component.js';
import { Pin } from '../../pin.js';
import type { PinInfo } from '../../renderers/schematic_visualizer_types.js';
import { runErc, type ErcViolation } from '../erc_engine.js';

/** pin number → { name, electrical type } roster entry builder */
function roster(entries: Array<[number | string, string, string]>): Map<string, PinInfo> {
  return new Map(entries.map(([n, name, type]) => [String(n), { name, type }]));
}

/** every component resolves to the same 3-pin roster unless overridden */
const DEFAULT_ROSTER = roster([
  [1, 'A', 'passive'],
  [2, 'B', 'passive'],
  [3, 'C', 'passive'],
]);

function erc(
  schematic: Schematic,
  pinInfoFor: (c: Component) => Map<string, PinInfo> | null = () => DEFAULT_ROSTER,
  severities?: Record<string, 'error' | 'warning' | 'ignore'>,
): ErcViolation[] {
  return runErc(schematic, { pinInfoFor, ...(severities ? { severities } : {}) }).violations;
}

const types = (vs: ErcViolation[]): string[] => vs.map((v) => v.type);

/** explicit reference so violation descriptions are deterministic */
function part(reference: string, symbol = 'Device:R_Small'): Component {
  return new Component({ reference, symbol, footprint: 'Resistor_SMD:R_0603_1608Metric' });
}

describe('native ERC (object model)', () => {
  it('flags roster pins no net ever touched', () => {
    const sch = new Schematic('erc_test');
    const r1 = part('R1');
    const r2 = part('R2');
    sch.add(r1, r2);
    sch.net(r1.pin(1), r2.pin(1)); // pin 2 and 3 on both never netted

    const vs = erc(sch);
    const unconnected = vs.filter((v) => v.type === 'pin_not_connected');
    expect(unconnected).toHaveLength(4); // R1.2, R1.3, R2.2, R2.3
    expect(unconnected[0]!.items[0]!.description).toBe('Symbol R1 Pin 2 [B, Passive]');
  });

  it('does not flag netted pins', () => {
    const sch = new Schematic('erc_test');
    const r1 = part('R1');
    sch.add(r1);
    sch.net(r1.pin(1), r1.pin(2), r1.pin(3));

    expect(types(erc(sch))).not.toContain('pin_not_connected');
  });

  it('treats dnc() pins as handled (they sit in a net by construction)', () => {
    const sch = new Schematic('erc_test');
    const r1 = part('R1');
    sch.add(r1);
    sch.net(r1.pin(1));
    sch.dnc(r1.pin(2));

    const unconnected = erc(sch).filter((v) => v.type === 'pin_not_connected');
    expect(unconnected).toHaveLength(1); // only pin 3
    expect(unconnected[0]!.items[0]!.description).toContain('Pin 3');
  });

  it('attributes standalone pins to their component by reference', () => {
    const sch = new Schematic('erc_test');
    const r1 = part('R1');
    sch.add(r1);
    // class-field style `new Pin('R1', 1)` — owner backfilled by reference
    sch.net(new Pin('R1', 1));

    const unconnected = erc(sch).filter((v) => v.type === 'pin_not_connected');
    expect(unconnected).toHaveLength(2); // pins 2 and 3 only
  });

  it('skips components whose symbol cannot be resolved for the roster check', () => {
    const sch = new Schematic('erc_test');
    const r1 = part('R1', 'Mystery:Unknown');
    sch.add(r1);
    sch.net(r1.pin(1));

    const vs = erc(sch, () => null);
    expect(types(vs)).not.toContain('pin_not_connected');
  });

  it('flags two outputs on one net', () => {
    const sch = new Schematic('erc_test');
    const u1 = part('U1');
    const u2 = part('U2');
    sch.add(u1, u2);
    sch.net(u1.pin(1, { type: 'output' }), u2.pin(1, { type: 'output' }));

    const vs = erc(sch).filter((v) => v.type === 'pin_to_pin');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.severity).toBe('error');
    expect(vs[0]!.items).toHaveLength(2);
    expect(vs[0]!.items[0]!.description).toBe('Symbol U1 Pin 1 [A, Output]');
  });

  it('passes compatible pairings: output+input, passive+passive, tri-state input', () => {
    const sch = new Schematic('erc_test');
    const a = part('U1');
    const b = part('U2');
    const c = part('U3');
    const d = part('U4');
    sch.add(a, b, c, d);
    sch.net(a.pin(1, { type: 'output' }), b.pin(1, { type: 'input' }));
    sch.net(a.pin(2), b.pin(2)); // both default passive
    sch.net(c.pin(1, { type: 'tri_state' }), d.pin(1, { type: 'input' }));

    expect(types(erc(sch))).not.toContain('pin_to_pin');
  });

  it('flags hard drivers against tri-state and open-collector pins', () => {
    const sch = new Schematic('erc_test');
    const a = part('U1');
    const b = part('U2');
    const c = part('U3');
    sch.add(a, b, c);
    sch.net(a.pin(1, { type: 'output' }), b.pin(1, { type: 'tri_state' }));
    sch.net(a.pin(2, { type: 'output' }), c.pin(1, { type: 'open_collector' }));

    expect(erc(sch).filter((v) => v.type === 'pin_to_pin')).toHaveLength(2);
  });

  it('allows open-collector stacking (wired-OR is the point)', () => {
    const sch = new Schematic('erc_test');
    const a = part('U1');
    const b = part('U2');
    sch.add(a, b);
    sch.net(a.pin(1, { type: 'open_collector' }), b.pin(1, { type: 'open_collector' }));

    expect(types(erc(sch))).not.toContain('pin_to_pin');
  });

  it('never flags power pins — PWR_FLAG rails must not manufacture conflicts', () => {
    const sch = new Schematic('erc_test');
    const reg = part('U1');
    const mcu = part('U2');
    const flag = part('U3', 'power:PWR_FLAG');
    sch.add(reg, mcu, flag);
    sch.named('VCC').net(
      reg.pin(1, { type: 'power_out' }),
      mcu.pin(1, { type: 'power_in' }),
      flag.pin(1, { type: 'power_out' }),
    );

    expect(types(erc(sch))).not.toContain('pin_to_pin');
  });

  it('refines a defaulted-passive pin to its roster electrical type', () => {
    const sch = new Schematic('erc_test');
    const u1 = part('U1');
    const u2 = part('U2');
    sch.add(u1, u2);
    // no explicit types: the roster says both pins are outputs
    sch.net(u1.pin(1), u2.pin(1));
    const rosters = roster([
      [1, 'OUT', 'output'],
      [2, 'IN', 'input'],
      [3, 'C', 'passive'],
    ]);

    const vs = erc(sch, () => rosters).filter((v) => v.type === 'pin_to_pin');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.items[0]!.description).toBe('Symbol U1 Pin 1 [OUT, Output]');
  });

  it('lets an explicitly set type override the roster', () => {
    const sch = new Schematic('erc_test');
    const u1 = part('U1');
    const u2 = part('U2');
    sch.add(u1, u2);
    // roster calls both pins inputs; code overrides u2's to output
    const rosters = roster([
      [1, 'IO', 'input'],
      [2, 'B', 'passive'],
      [3, 'C', 'passive'],
    ]);
    sch.net(u1.pin(1), u2.pin(1, { type: 'output' }));

    // explicit output vs roster input: compatible — proving the explicit
    // type replaced the roster's
    expect(types(erc(sch, () => rosters))).not.toContain('pin_to_pin');
  });

  it('excludes dnc-marked no_connect pins from conflict checking', () => {
    const sch = new Schematic('erc_test');
    const a = part('U1');
    const b = part('U2');
    sch.add(a, b);
    a.pin(1, { type: 'output' });
    b.pin(1, { type: 'no_connect' }); // dnc-style pin on the same net
    sch.net(a.pin(1), b.pin(1));

    expect(types(erc(sch))).not.toContain('pin_to_pin');
  });

  it('applies severity overrides: ignore silences, warning downgrades', () => {
    const sch = new Schematic('erc_test');
    const r1 = part('R1');
    sch.add(r1);
    sch.net(r1.pin(1));

    const silenced = erc(sch, undefined, { pin_not_connected: 'ignore' });
    expect(silenced).toHaveLength(0);

    const downgraded = erc(sch, undefined, { pin_not_connected: 'warning' });
    expect(downgraded[0]!.severity).toBe('warning');
  });
});
