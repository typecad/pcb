import { describe, it, expect } from 'vitest';
import { Connector } from '../src/connector.js';
import { Cable } from '../src/cable.js';
import { Wiring } from '../src/wiring.js';
import { generateGraphviz } from '../src/graphviz.js';
import { isValidGraphvizColor, escapeCsv } from '../src/validation.js';

describe('wire color validation', () => {
  it('accepts X11 names (case-insensitive), numbered variants and hex values', () => {
    expect(isValidGraphvizColor('red')).toBe(true);
    expect(isValidGraphvizColor('DarkGreen')).toBe(true);
    expect(isValidGraphvizColor('gray50')).toBe(true);
    expect(isValidGraphvizColor('skyblue2')).toBe(true);
    expect(isValidGraphvizColor('#ff0000')).toBe(true);
    expect(isValidGraphvizColor('#abc')).toBe(true);
  });

  it('rejects unknown colors', () => {
    expect(isValidGraphvizColor('borgundy')).toBe(false);
    expect(isValidGraphvizColor('')).toBe(false);
    expect(isValidGraphvizColor('#zzzzzz')).toBe(false);
  });

  it('throws a NetError for unknown net and striped colors', () => {
    const a = new Connector({ name: 'A', pins: ['1'] });
    const b = new Connector({ name: 'B', pins: ['1'] });
    const cable = new Cable({ name: 'C' });

    expect(() => cable.net({ color: 'notacolor', left: a.pin(1), right: b.pin(1) }))
      .toThrow(/Unknown wire color 'notacolor'/);
    expect(() => cable.net({ color: 'red', striped: 'oops', left: a.pin(1), right: b.pin(1) }))
      .toThrow(/Unknown striped color 'oops'/);
  });
});

describe('multi-pin nets (taps/splices)', () => {
  it('accepts pin arrays on either side and renders one net row', () => {
    const a = new Connector({ name: 'A', pins: ['1', '2'] });
    const b = new Connector({ name: 'B', pins: ['1'] });
    const c = new Connector({ name: 'C', pins: ['1', '2'] });

    const cable = new Cable({ name: 'TAP' });
    cable.net({ color: 'red', left: [a.pin(1), a.pin(2)], right: [b.pin(1), c.pin(1)] });

    expect(cable.nets.length).toBe(1);
    expect(cable.nets[0].pins.length).toBe(4);

    const harness = new Wiring();
    harness.connectors(a, b, c);
    harness.cables(cable);

    const dot = generateGraphviz(harness.getConnectors(), harness.getCables());

    // Every pin gets exactly one edge
    const edges = dot.split('\n').filter(line => line.includes('->'));
    expect(edges.length).toBe(4);

    // A (first pin owner) is the left column; its two pins anchor west
    expect(dot).toContain('A:p1 -> TAP:w1w');
    expect(dot).toContain('A:p2 -> TAP:w1w');
    expect(dot).toContain('TAP:w1e -> B:p1');
    expect(dot).toContain('TAP:w1e -> C:p1');
  });

  it('still rejects nets with no pins at all', () => {
    const cable = new Cable({ name: 'EMPTY' });
    expect(() => cable.net({})).toThrow(/Both left and right sides missing/);
  });
});

describe('escapeCsv', () => {
  it('leaves plain fields untouched', () => {
    expect(escapeCsv('Ribbon 2x')).toBe('Ribbon 2x');
  });

  it('quotes fields with commas, quotes or newlines', () => {
    expect(escapeCsv('a,b')).toBe('"a,b"');
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsv('line\nbreak')).toBe('"line\nbreak"');
  });
});
