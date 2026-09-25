import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Connector } from '../src/connector.js';
import { Cable } from '../src/cable.js';
import { Wiring } from '../src/wiring.js';

describe('multi-page diagrams', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-wiring-pages-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function buildTwoPageHarness() {
    const mcu = new Connector({ name: 'MCU', pins: ['SDA', 'SCL'] });
    const sensor = new Connector({ name: 'SENSOR', pins: ['SDA', 'SCL'] });
    const i2c = new Cable({ name: 'I2C' });
    i2c.net({ left: mcu.pin(1), right: sensor.pin(1) });
    i2c.net({ left: mcu.pin(2), right: sensor.pin(2) });

    const led = new Connector({ name: 'LED', page: 'aux', pins: ['A', 'K'] });
    const switchConn = new Connector({ name: 'SW', page: 'aux', pins: ['1', '2'] });
    const aux = new Cable({ name: 'AUX', page: 'aux' });
    aux.net({ color: 'red', left: switchConn.pin(1), right: led.pin(1) });
    aux.net({ color: 'black', left: switchConn.pin(2), right: led.pin(2) });

    const harness = new Wiring();
    harness.connectors(mcu, sensor, led, switchConn);
    harness.cables(i2c, aux);
    return { harness };
  }

  it('writes one DOT file per page with a name suffix for named pages', () => {
    const { harness } = buildTwoPageHarness();
    const base = path.join(tmpDir, 'harness');
    harness.create(base);

    expect(fs.existsSync(`${base}.dot`)).toBe(true);
    expect(fs.existsSync(`${base}-aux.dot`)).toBe(true);

    const main = fs.readFileSync(`${base}.dot`, 'utf8');
    const aux = fs.readFileSync(`${base}-aux.dot`, 'utf8');
    expect(main).toContain('MCU');
    expect(main).toContain('I2C');
    expect(main).not.toContain('AUX');
    expect(aux).toContain('AUX');
    expect(aux).toContain('LED');
    expect(aux).not.toContain('I2C');
  });

  it('writes a single plain file when no pages are used', () => {
    const a = new Connector({ name: 'A', pins: ['1'] });
    const b = new Connector({ name: 'B', pins: ['1'] });
    const cable = new Cable({ name: 'C' });
    cable.net({ left: a.pin(1), right: b.pin(1) });

    const harness = new Wiring();
    harness.connectors(a, b);
    harness.cables(cable);

    const base = path.join(tmpDir, 'single');
    harness.create(base);

    expect(fs.existsSync(`${base}.dot`)).toBe(true);
  });

  it('throws when a cable references a connector on a different page', () => {
    const local = new Connector({ name: 'LOCAL', pins: ['1'] });
    const remote = new Connector({ name: 'REMOTE', page: 'elsewhere', pins: ['1'] });
    const cable = new Cable({ name: 'CROSS' });
    cable.net({ left: local.pin(1), right: remote.pin(1) });

    const harness = new Wiring();
    harness.connectors(local, remote);
    harness.cables(cable);

    expect(() => harness.create(path.join(tmpDir, 'cross'))).toThrow(/same page/);
  });
});
