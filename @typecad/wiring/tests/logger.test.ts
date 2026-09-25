import { describe, it, expect, afterEach } from 'vitest';
import { Connector } from '../src/connector.js';
import { Cable } from '../src/cable.js';
import { Wiring } from '../src/wiring.js';
import { setLogger, getLogger } from '../src/logger.js';

describe('setLogger', () => {
  const original = getLogger();

  afterEach(() => {
    setLogger(original);
  });

  it('captures library output through a custom logger', () => {
    const messages: string[] = [];
    setLogger({ info: (message) => messages.push(message) });

    new Connector({ name: 'LOGGED', pins: ['1'] });

    expect(messages).toContain('LOGGED created');
  });

  it('silences all library output when set to null', () => {
    setLogger(null);

    const messages: string[] = [];
    // Even wiring additions stay quiet
    const a = new Connector({ name: 'QUIET_A', pins: ['1'] });
    const b = new Connector({ name: 'QUIET_B', pins: ['1'] });
    const cable = new Cable({ name: 'QUIET_C' });
    cable.net({ left: a.pin(1), right: b.pin(1) });
    const harness = new Wiring();
    harness.connectors(a, b);
    harness.cables(cable);

    expect(messages).toEqual([]);
    expect(getLogger().info('x')).toBeUndefined();
  });
});
