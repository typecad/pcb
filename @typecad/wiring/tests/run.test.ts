import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWiring } from '../src/cli/run.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * End-to-end test of the CLI pipeline using a plain JavaScript entry.
 * The fixture lives inside the package so `import '@typecad/wiring'`
 * resolves through package self-reference (exports field).
 * The TypeScript loading path (tsx) is exercised by running the built
 * binary directly against a .ts entry.
 */
describe('runWiring (JavaScript entry)', () => {
  const tmpDir = path.join(testDir, '.tmp', 'run');
  const outDir = path.join(tmpDir, 'out');

  beforeAll(() => {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'harness.js'),
      `import { Connector, Cable, Wiring } from '@typecad/wiring';

const mcu = new Connector({ name: 'E2E_MCU', type: 'Header', pins: ['A', 'B'] });
const dev = new Connector({ name: 'E2E_DEV', type: 'JST', pins: ['A', 'B'] });

const cable = new Cable({ name: 'E2E_BUS', type: 'Ribbon' });
cable.net({ color: 'red', left: mcu.pin(1), right: dev.pin(1) });
cable.net({ color: 'black', left: mcu.pin(2), right: dev.pin(2) });

const harness = new Wiring();
harness.connectors(mcu, dev);
harness.cables(cable);

export default harness;
`
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates the DOT file and optional BOM from an entry module', async () => {
    const result = await runWiring({
      command: 'generate',
      entry: path.join(tmpDir, 'harness.js'),
      out: outDir,
      bom: true,
      json: false,
      help: false,
      version: false
    });

    expect(fs.existsSync(path.join(outDir, 'harness.dot'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'harness-bom.csv'))).toBe(true);
    expect(result.connectors).toBe(2);
    expect(result.cables).toBe(1);
    expect(result.nets).toBe(2);

    const dot = fs.readFileSync(path.join(outDir, 'harness.dot'), 'utf8');
    expect(dot).toContain('E2E_MCU');
    expect(dot).toContain('E2E_BUS');
  });

  it('skips the BOM unless requested', async () => {
    const outSolo = path.join(tmpDir, 'solo');
    fs.mkdirSync(outSolo, { recursive: true });

    const result = await runWiring({
      command: 'generate',
      entry: path.join(tmpDir, 'harness.js'),
      out: outSolo,
      json: false,
      help: false,
      version: false
    });

    expect(fs.existsSync(path.join(outSolo, 'harness.dot'))).toBe(true);
    expect(fs.existsSync(path.join(outSolo, 'harness-bom.csv'))).toBe(false);
    expect(result.bom).toBeUndefined();
  });

  it('rejects a DRC-dirty harness in --strict mode even when validation passes', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'drc.js'),
      `import { Connector, Cable, Wiring } from '@typecad/wiring';

const a = new Connector({ name: 'DRC_A', pins: ['used', 'floating'] });
const b = new Connector({ name: 'DRC_B', pins: ['1'] });

const cable = new Cable({ name: 'DRC_BUS' });
cable.net({ left: a.pin(1), right: b.pin(1) });

const harness = new Wiring();
harness.connectors(a, b);
harness.cables(cable);

export default harness;
`
    );

    const outDrc = path.join(tmpDir, 'drc-out');
    await expect(runWiring({
      command: 'generate',
      entry: path.join(tmpDir, 'drc.js'),
      out: outDrc,
      strict: true,
      json: false,
      help: false,
      version: false
    })).rejects.toThrow(/UNUSED_PIN|not connected/);

    expect(fs.existsSync(outDrc)).toBe(false);
  });

  it('rejects an invalid harness in --strict mode before writing files', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'invalid.js'),
      `import { Connector, Cable, Wiring } from '@typecad/wiring';

const a = new Connector({ name: 'STRICT_A', pins: ['X'] });
const b = new Connector({ name: 'STRICT_B', pins: ['X'] });
const lonely = new Connector({ name: 'STRICT_LONELY', pins: ['X'] });

const cable = new Cable({ name: 'STRICT_BUS' });
cable.net({ left: a.pin(1), right: b.pin(1) });

const harness = new Wiring();
harness.connectors(a, b, lonely);
harness.cables(cable);

export default harness;
`
    );

    const outStrict = path.join(tmpDir, 'strict');
    await expect(runWiring({
      command: 'generate',
      entry: path.join(tmpDir, 'invalid.js'),
      out: outStrict,
      strict: true,
      json: false,
      help: false,
      version: false
    })).rejects.toThrow(/Unconnected connectors/);

    // Nothing should have been generated for the invalid run
    expect(fs.existsSync(outStrict)).toBe(false);
  });
});
