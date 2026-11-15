import { describe, it, expect } from 'vitest';
import { PCB, Capacitor } from '../src/index.js';

/**
 * Reference designators must follow the order components are passed to
 * create(), regardless of the order nets happen to mention their pins — a
 * user naming variables c1/c2 in source order expects C1/C2 in the BOM and
 * the tree, not an ordering derived from which net() call touched which
 * component first.
 */
describe('reference designator assignment order', () => {
  it('assigns C1/C2 by create() order even when nets mention them in reverse', () => {
    const pcb = new PCB('ref_order');
    const c1 = new Capacitor({ value: '100nF' });
    const c2 = new Capacitor({ value: '10uF' });

    // c2 appears in a net BEFORE c1 ever does — first-touch order would
    // hand C1 to the 10uF.
    pcb.named('vbus').net(c2.pin(1));
    pcb.named('gnd').net(c1.pin(2), c2.pin(2));

    pcb.create(c1, c2);

    expect(c1.reference).toBe('C1');
    expect(c2.reference).toBe('C2');
  });

  it('assigns references in create() argument order across prefixes', () => {
    const pcb = new PCB('ref_order_two');
    const first = new Capacitor({ value: '1uF' });
    const second = new Capacitor({ value: '2uF' });
    const third = new Capacitor({ value: '3uF' });

    // nets touch them in every order but the create order
    pcb.named('a').net(third.pin(1), first.pin(1));
    pcb.named('b').net(second.pin(1));
    pcb.named('c').net(third.pin(2), second.pin(2), first.pin(2));

    pcb.create(first, second, third);

    expect(first.reference).toBe('C1');
    expect(second.reference).toBe('C2');
    expect(third.reference).toBe('C3');
  });
});
