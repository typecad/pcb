import { describe, it, expect } from 'vitest';
import { Connector } from '../src/connector.js';
import { Cable } from '../src/cable.js';
import { Wiring } from '../src/wiring.js';
import { generateGraphviz } from '../src/graphviz.js';

function buildHarness() {
  const mcu = new Connector({
    name: 'MCU',
    type: 'Header',
    subtype: '1x5',
    pins: ['VCC', 'GND', 'SDA', 'SCL', 'SHIELD']
  });
  const sensor = new Connector({
    name: 'SENSOR',
    type: 'JST',
    subtype: 'SH 1.0mm',
    mpn: 'SM04B-SRSS-TB',
    pins: ['VCC', 'GND', 'SDA', 'SCL', 'SHIELD']
  });
  const cable = new Cable({ name: 'I2C_BUS', type: 'Ribbon', gauge: '28 AWG', length: '20cm' });
  cable.net({ color: 'red', left: mcu.pin(1), right: sensor.pin(1) });
  cable.net({ color: 'black', left: mcu.pin(2), right: sensor.pin(2) });
  cable.net({ color: 'blue', left: mcu.pin(3), right: sensor.pin(3) });
  cable.net({ color: 'yellow', left: mcu.pin(4), right: sensor.pin(4) });
  cable.shield({ left: mcu.pin(5), right: sensor.pin(5) });

  const harness = new Wiring();
  harness.connectors(mcu, sensor);
  harness.cables(cable);
  return { harness, mcu, sensor, cable };
}

describe('generateGraphviz', () => {
  it('emits exactly one edge statement per pin (no reversed duplicates)', () => {
    const { harness } = buildHarness();
    const dot = generateGraphviz(harness.getConnectors(), harness.getCables());

    const edgeEndpoints = dot
      .split('\n')
      .filter(line => line.includes('->'))
      .map(line => line
        .split('->')
        .map(side => side.trim())
        .sort()
        .join(' -> '));

    // 4 nets x 2 pins + 1 shield net x 2 pins = 10 edges
    expect(edgeEndpoints.length).toBe(10);
    expect(new Set(edgeEndpoints).size).toBe(10);
  });

  it('orients edges left-to-right and anchors them to the matching cable ports', () => {
    const { harness } = buildHarness();
    const dot = generateGraphviz(harness.getConnectors(), harness.getCables());

    expect(dot).toContain('digraph {');
    // Left connector (MCU) points into the cable's west port
    expect(dot).toContain('MCU:p1 -> I2C_BUS:w1w');
    // Cable's east port points into the right connector (SENSOR)
    expect(dot).toContain('I2C_BUS:w1e -> SENSOR:p1');
    // Never the mirrored forms
    expect(dot).not.toContain('I2C_BUS:w1w -> MCU');
    expect(dot).not.toContain('SENSOR:p1 -> I2C_BUS');
  });

  it('uses placement, not the stale per-net role, when a pin is shared across cables', () => {
    const a = new Connector({ name: 'A', pins: ['1', '2'] });
    const b = new Connector({ name: 'B', pins: ['1', '2'] });
    const c = new Connector({ name: 'C', pins: ['1'] });

    const c1 = new Cable({ name: 'C1' });
    c1.net({ left: a.pin(1), right: b.pin(1) });
    c1.shield({ left: a.pin(2), right: b.pin(2) });

    const c2 = new Cable({ name: 'C2' });
    c2.net({ left: c.pin(1), right: a.pin(2) }); // reuses a.pin(2), flipping its side to 'e'

    const harness = new Wiring();
    harness.connectors(a, b, c);
    harness.cables(c1, c2);

    const dot = generateGraphviz(harness.getConnectors(), harness.getCables());

    // A sits in the left column, so its shield wire must use the west port
    expect(dot).toContain('A:p2 -> C1:w2w');
    expect(dot).not.toContain('C1:w2e -> A:p2');
    expect(dot).toContain('C1:w2e -> B:p2');
  });

  it('renders pin labels through Pin.toString() including names', () => {
    const { harness } = buildHarness();
    const dot = generateGraphviz(harness.getConnectors(), harness.getCables());

    expect(dot).toContain('MCU:1:VCC');
    expect(dot).toContain('SENSOR:4:SCL');
  });

  it('marks shield nets in the cable node', () => {
    const { harness } = buildHarness();
    const dot = generateGraphviz(harness.getConnectors(), harness.getCables());

    expect(dot).toContain('[shield]');
  });

  it('shows far-end pin cross-references on connector pin rows', () => {
    const { harness } = buildHarness();
    const dot = generateGraphviz(harness.getConnectors(), harness.getCables());

    // Connectors are emitted in order [MCU, SENSOR]; scope to the MCU block
    // so we check the cross-reference inside MCU's table, not SENSOR's own rows
    const mcuBlock = dot.slice(dot.indexOf('MCU [label='), dot.indexOf('SENSOR [label='));
    expect(mcuBlock).toContain('SENSOR:1');
    expect(mcuBlock).toContain('SENSOR:4');

    const sensorBlock = dot.slice(dot.indexOf('SENSOR [label='));
    expect(sensorBlock).toContain('MCU:1');
  });

  it('shows the net name in the wire center cell instead of the index', () => {
    const a = new Connector({ name: 'A', pins: ['SDA', 'SCL'] });
    const b = new Connector({ name: 'B', pins: ['SDA', 'SCL'] });
    const cable = new Cable({ name: 'NAMED' });
    cable.net({ name: 'SDA', color: 'blue', left: a.pin(1), right: b.pin(1) });
    cable.net({ color: 'yellow', left: a.pin(2), right: b.pin(2) });

    const harness = new Wiring();
    harness.connectors(a, b);
    harness.cables(cable);

    const dot = generateGraphviz(harness.getConnectors(), harness.getCables());

    expect(dot).toContain('<b>SDA</b>');
    // Unnamed nets keep their index
    expect(dot).toContain('<b>2</b>');
    expect(dot).not.toContain('<b>1</b>');
  });

  it('declares fillcolor only once per node attribute list', () => {
    const { harness } = buildHarness();
    const dot = generateGraphviz(harness.getConnectors(), harness.getCables());

    const nodeLines = dot.split('\n').filter(line => line.includes('shape=box'));
    expect(nodeLines.length).toBeGreaterThan(0);
    for (const line of nodeLines) {
      expect(line.match(/fillcolor/g)?.length).toBe(1);
    }
  });

  it('throws when a cable references an unknown connector', () => {
    const rogue = new Connector({ name: 'ROGUE', pins: ['A'] });
    const cable = new Cable({ name: 'C' });
    // Bypass API validation by wiring a pin owned by an unregistered connector
    cable.net({ left: rogue.pin(1) });

    expect(() =>
      generateGraphviz([new Connector({ name: 'OTHER', pins: ['A'] })], [cable])
    ).toThrow(/not found/);
  });
});

describe('Cable shield', () => {
  it('deduplicates pins added to the shield net', () => {
    const a = new Connector({ name: 'A', pins: ['1', '2', '3'] });
    const b = new Connector({ name: 'B', pins: ['1', '2', '3'] });
    const cable = new Cable({ name: 'CAB' });

    cable.shield({ left: a.pin(1), right: b.pin(1) });
    cable.shield({ left: a.pin(1) }); // duplicate left pin, ignored
    cable.shield({ left: a.pin(2), right: b.pin(2) }); // new pins append to same net

    const shields = cable.nets.filter(net => net.isShield);
    expect(shields.length).toBe(1);
    expect(shields[0].pins.length).toBe(4);
  });
});
