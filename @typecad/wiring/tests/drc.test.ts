import { describe, it, expect } from 'vitest';
import { Connector } from '../src/connector.js';
import { Cable } from '../src/cable.js';
import { Wiring } from '../src/wiring.js';

describe('Wiring.drc', () => {
  it('returns no issues for a clean harness', () => {
    const a = new Connector({ name: 'A', pins: ['1', '2'] });
    const b = new Connector({ name: 'B', pins: ['1', '2'] });
    const cable = new Cable({ name: 'C' });
    cable.net({ left: a.pin(1), right: b.pin(1) });
    cable.net({ left: a.pin(2), right: b.pin(2) });

    const harness = new Wiring();
    harness.connectors(a, b);
    harness.cables(cable);

    expect(harness.drc()).toEqual([]);
  });

  it('reports pins that are not connected to any net', () => {
    const a = new Connector({ name: 'A', pins: ['used', 'unused'] });
    const b = new Connector({ name: 'B', pins: ['1'] });
    const cable = new Cable({ name: 'C' });
    cable.net({ left: a.pin(1), right: b.pin(1) });

    const harness = new Wiring();
    harness.connectors(a, b);
    harness.cables(cable);

    const issues = harness.drc();
    expect(issues.length).toBe(1);
    expect(issues[0].code).toBe('UNUSED_PIN');
    expect(issues[0].message).toContain("Connector 'A' pin 2 (named 'unused')");
  });

  it('reports a pin used by two wires of the same cable as a short', () => {
    const a = new Connector({ name: 'A', pins: ['1', '2'] });
    const b = new Connector({ name: 'B', pins: ['1', '2'] });
    const cable = new Cable({ name: 'C' });
    cable.net({ left: a.pin(1), right: b.pin(1) });
    cable.net({ left: a.pin(1), right: b.pin(2) }); // reuses A:1

    const harness = new Wiring();
    harness.connectors(a, b);
    harness.cables(cable);

    const issues = harness.drc();
    expect(issues.some(issue => issue.code === 'SHORT' && issue.message.includes('A:1'))).toBe(true);
  });

  it('reports two wires connecting the same pin pair as duplicates', () => {
    const a = new Connector({ name: 'A', pins: ['1', '2'] });
    const b = new Connector({ name: 'B', pins: ['1', '2'] });
    const cable = new Cable({ name: 'C' });
    cable.net({ name: 'one', left: a.pin(1), right: b.pin(1) });
    cable.net({ name: 'two', left: a.pin(1), right: b.pin(1) });

    const harness = new Wiring();
    harness.connectors(a, b);
    harness.cables(cable);

    const issues = harness.drc();
    expect(issues.some(issue => issue.code === 'DUPLICATE_WIRE' && issue.message.includes("'one'") && issue.message.includes("'two'"))).toBe(true);
  });

  it('does not flag a drain pin shared between a shield and a signal wire', () => {
    const a = new Connector({ name: 'A', pins: ['1', '2'] });
    const b = new Connector({ name: 'B', pins: ['1', '2'] });
    const cable = new Cable({ name: 'C' });
    cable.net({ left: a.pin(1), right: b.pin(1) });
    cable.shield({ left: a.pin(2), right: b.pin(2) });

    const harness = new Wiring();
    harness.connectors(a, b);
    harness.cables(cable);

    expect(harness.drc()).toEqual([]);
  });
});
