import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../src/utils/logging.js', () => ({
  default: { log: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn(), success: vi.fn() },
}));

import { main } from '../src/cli/add-component/index.js';
import type { CliArgs } from '../src/cli/types.js';

const SYMBOL = `(kicad_symbol_lib
  (symbol "Conn"
    (property "Reference" "J" (at 0 0 0))
    (property "Footprint" "Connector:PinHeader_1x02" (at 0 0 0))
    (symbol "Conn_1_1"
      (pin power_in line (at 0 0 0) (length 2.54) (name "VIN") (number "1"))
      (pin power_out line (at 2.54 0 0) (length 2.54) (name "GND") (number "2"))
    )
  )
)`;

const FOOTPRINT = `(footprint "PinHeader_1x02" (layer "F.Cu") (pad "1" thru_hole circle (at 0 0) (size 1.7 1.7) (drill 1.0) (layers "*.Cu" "*.Mask")))`;

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'add-component-int-'));
  await writeFile(join(tmpRoot, 'conn.kicad_sym'), SYMBOL, 'utf8');
  await writeFile(join(tmpRoot, 'pinheader.kicad_mod'), FOOTPRINT, 'utf8');
});

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('add component (local symbol + footprint files)', () => {
  it('generates a component class with the symbol pins and copies the library files', async () => {
    await main({
      local: true,
      symbol: join(tmpRoot, 'conn.kicad_sym'),
      footprint: join(tmpRoot, 'pinheader.kicad_mod'),
      folder: join(tmpRoot, 'project'),
    } as CliArgs);

    const generated = await readFile(join(tmpRoot, 'project', 'src', 'Conn.ts'), 'utf8');
    expect(generated).toContain('export class Conn extends Component');
    expect(generated).toContain(`VIN = this.pin(1, { type: 'power_in' });`);
    expect(generated).toContain(`GND = this.pin(2, { type: 'power_out' });`);
    // symbol and reference prefix are passed through the Component init so
    // pin field initializers can never resolve the designator too early
    expect(generated).toContain('footprint: "pinheader:PinHeader_1x02"');
    expect(generated).toContain('symbol: "conn:Conn"');
    expect(generated).toContain('prefix: "J",');

    expect(existsSync(join(tmpRoot, 'project', 'build', 'lib', 'conn.kicad_sym'))).toBe(true);
    expect(existsSync(join(tmpRoot, 'project', 'build', 'lib', 'footprints', 'pinheader.kicad_mod'))).toBe(true);
  });
});
