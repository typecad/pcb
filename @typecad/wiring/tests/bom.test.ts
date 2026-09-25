import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Connector } from '../src/connector.js';
import { Cable } from '../src/cable.js';
import { Wiring } from '../src/wiring.js';

describe('Wiring.bom', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-wiring-bom-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a CSV with the documented header, cables and connectors', () => {
    const mcu = new Connector({
      name: 'MCU',
      type: 'Header',
      subtype: '1x2',
      pins: ['A', 'B'],
      additionals: [{ quantity: 2, item: 'screw', mpn: 'SCR-1' }]
    });
    const dev = new Connector({ name: 'DEV', type: 'JST', pins: ['A', 'B'] });

    const plain = new Cable({ name: 'PLAIN', type: 'Wire', gauge: '22 AWG', length: '10cm', mpn: 'W-1' });
    plain.net({ color: 'red', left: mcu.pin(1), right: dev.pin(1) });
    plain.net({ color: 'black', left: mcu.pin(2), right: dev.pin(2) });

    const bundle = new Cable({ name: 'BUNDLED', type: 'Stranded', bundle: true, mpn: 'W-2' });
    bundle.net({ color: 'blue', left: mcu.pin(1), right: dev.pin(1) });
    bundle.net({ color: 'green', left: mcu.pin(2), right: dev.pin(2) });

    const harness = new Wiring();
    harness.connectors(mcu, dev);
    harness.cables(plain, bundle);

    const bomFile = path.join(tmpDir, 'bom.csv');
    harness.bom(bomFile);

    const csv = fs.readFileSync(bomFile, 'utf8');
    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe('Designator,Description,Quantity,MPN');
    // Non-bundled cable: single item with 2x connection count
    expect(lines).toContain('PLAIN,Wire 2x 22 AWG 10cm,1,W-1');
    // Bundled cable: per-wire quantity equals the connection count
    expect(lines).toContain('BUNDLED,Wire Stranded 2x,2,W-2');
    // Connector with subtype and pin count
    expect(lines).toContain('MCU,Header 1x2 2-pin,1,');
    // Connector additional with quantity
    expect(lines).toContain('MCU,screw,2,SCR-1');
  });

  it('appends " shielded" to non-bundled shielded cable descriptions', () => {
    const a = new Connector({ name: 'A', pins: ['1', '2'] });
    const b = new Connector({ name: 'B', pins: ['1', '2'] });
    const shielded = new Cable({ name: 'SHIELDED_CABLE', type: 'Coax' });
    shielded.net({ left: a.pin(1), right: b.pin(1) });
    shielded.shield({ left: a.pin(2), right: b.pin(2) });

    const harness = new Wiring();
    harness.connectors(a, b);
    harness.cables(shielded);

    const bomFile = path.join(tmpDir, 'bom-shielded.csv');
    harness.bom(bomFile);

    const csv = fs.readFileSync(bomFile, 'utf8');
    expect(csv).toContain('SHIELDED_CABLE,Coax 1x shielded,1,');
  });

  it('quotes fields containing commas or quotes', () => {
    const a = new Connector({ name: 'A', pins: ['1', '2'] });
    const b = new Connector({ name: 'B', pins: ['1', '2'] });
    const cable = new Cable({
      name: 'COMMA_CABLE',
      type: 'Wire, special',
      additionals: [{ quantity: 1, item: 'Crimp, 22-26 AWG "gold"', mpn: 'CR-1' }]
    });
    cable.net({ left: a.pin(1), right: b.pin(1) });

    const harness = new Wiring();
    harness.connectors(a, b);
    harness.cables(cable);

    const bomFile = path.join(tmpDir, 'bom-escaped.csv');
    harness.bom(bomFile);

    const csv = fs.readFileSync(bomFile, 'utf8');
    const lines = csv.trim().split('\n');
    expect(lines).toContain('COMMA_CABLE,"Wire, special 1x",1,');
    expect(lines).toContain('COMMA_CABLE,"Crimp, 22-26 AWG ""gold""",1,CR-1');
  });

  it('aggregates rows by MPN with summed quantities in grouped mode', () => {
    const a = new Connector({ name: 'JA', type: 'JST', mpn: 'CONN-1', pins: ['1', '2'] });
    const b = new Connector({ name: 'JB', type: 'JST', mpn: 'CONN-1', pins: ['1', '2'] });
    const c = new Connector({ name: 'JC', type: 'Molex', mpn: 'CONN-2', pins: ['1', '2'] });

    const cable1 = new Cable({ name: 'C1', type: 'Ribbon', mpn: 'CAB-1' });
    cable1.net({ left: a.pin(1), right: b.pin(1) });
    const cable2 = new Cable({ name: 'C2', type: 'Ribbon', mpn: 'CAB-1' });
    cable2.net({ left: b.pin(2), right: c.pin(1) });

    const harness = new Wiring();
    harness.connectors(a, b, c);
    harness.cables(cable1, cable2);

    const bomFile = path.join(tmpDir, 'bom-grouped.csv');
    harness.bom(bomFile, { grouped: true });

    const csv = fs.readFileSync(bomFile, 'utf8');
    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe('Designator,Description,Quantity,MPN');
    // Same MPN connectors collapse into one row with summed quantity
    expect(lines).toContain('JA + JB,JST 2-pin,2,CONN-1');
    expect(lines).toContain('JC,Molex 2-pin,1,CONN-2');
    // Same MPN cables collapse too
    expect(lines).toContain('C1 + C2,Ribbon 1x,2,CAB-1');
  });
});
