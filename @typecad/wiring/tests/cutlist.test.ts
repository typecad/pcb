import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Connector } from '../src/connector.js';
import { Cable } from '../src/cable.js';
import { Wiring } from '../src/wiring.js';

describe('Wiring.cutlist', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-wiring-cutlist-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists every wire run with color, gauge, length and endpoints', () => {
    const mcu = new Connector({ name: 'MCU', pins: ['3V3', 'GND', 'SDA'] });
    const sensor = new Connector({ name: 'SENSOR', pins: ['VCC', 'GND', 'SDA', 'SHLD'] });
    const env = new Connector({ name: 'ENV', pins: ['VCC', 'GND', 'SDA'] });

    const cable = new Cable({ name: 'BUS', gauge: '28 AWG', length: '15cm' });
    cable.net({ name: 'VCC', color: 'red', left: mcu.pin(1), right: [sensor.pin(1), env.pin(1)] });
    cable.net({ name: 'GND', color: 'black', left: mcu.pin(2), right: [sensor.pin(2), env.pin(2)] });
    cable.net({ name: 'SDA', color: 'blue', striped: 'green', left: mcu.pin(3), right: sensor.pin(3) });
    cable.shield({ left: mcu.pin(2), right: sensor.pin(4) });

    const harness = new Wiring();
    harness.connectors(mcu, sensor, env);
    harness.cables(cable);

    const file = path.join(tmpDir, 'cutlist.csv');
    harness.cutlist(file);

    const csv = fs.readFileSync(file, 'utf8');
    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe('Designator,Wire,Color,Gauge,Length,From,To');
    // Taps list every endpoint on the To side (quoted: the field contains commas)
    expect(lines).toContain('BUS,VCC,red,28 AWG,15cm,MCU:1:3V3,"SENSOR:1:VCC, ENV:1:VCC"');
    expect(lines).toContain('BUS,GND,black,28 AWG,15cm,MCU:2:GND,"SENSOR:2:GND, ENV:2:GND"');
    // Striped colors render as color/striped
    expect(lines).toContain('BUS,SDA,blue/green,28 AWG,15cm,MCU:3:SDA,SENSOR:3:SDA');
    // Shield runs are labeled and always black
    expect(lines).toContain('BUS,SHIELD,black,28 AWG,15cm,MCU:2:GND,SENSOR:4:SHLD');
  });

  it('falls back to wire numbers when nets are unnamed', () => {
    const a = new Connector({ name: 'A' });
    const b = new Connector({ name: 'B' });
    a.addPin(1);
    b.addPin(1);
    const cable = new Cable({ name: 'C' });
    cable.net({ left: a.pin(1), right: b.pin(1) });

    const harness = new Wiring();
    harness.connectors(a, b);
    harness.cables(cable);

    const file = path.join(tmpDir, 'cutlist-unnamed.csv');
    harness.cutlist(file);

    const csv = fs.readFileSync(file, 'utf8');
    expect(csv).toContain('C,1,white,,,A:1,B:1');
  });
});
