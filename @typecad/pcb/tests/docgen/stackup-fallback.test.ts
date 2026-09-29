import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateStackupSvgString } from '../../src/cli/docgen/utils/pcbLayerRenderer.js';
import { extractStackup } from '../../src/cli/docgen/utils/pcbLayerRenderer.js';

// minimal boards with no `(setup (stackup))` node — what typeCAD writes
const board2Layer = `(kicad_pcb (version 20250114) (general (thickness 1.6))
  (segment (start 0 0) (end 10 0) (width 0.2) (layer "F.Cu") (net 0))
  (segment (start 0 0) (end 10 0) (width 0.2) (layer "B.Cu") (net 0))
)`;

const board4Layer = `(kicad_pcb (version 20250114) (general (thickness 1.6))
  (segment (start 0 0) (end 10 0) (width 0.2) (layer "F.Cu") (net 0))
  (segment (start 0 0) (end 10 0) (width 0.2) (layer "In1.Cu") (net 0))
  (segment (start 0 0) (end 10 0) (width 0.2) (layer "In2.Cu") (net 0))
  (segment (start 0 0) (end 10 0) (width 0.2) (layer "B.Cu") (net 0))
)`;

async function withTempBoard(source: string, fn: (file: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stackup-'));
  const file = path.join(dir, 'board.kicad_pcb');
  await fs.writeFile(file, source, 'utf8');
  try {
    await fn(file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe('default stackup synthesis (boards without a stackup node)', () => {
  it('extractStackup reports failure for a board without a stackup node', async () => {
    await withTempBoard(board2Layer, async (file) => {
      const res = await extractStackup(file);
      expect(res.success).toBe(false);
    });
  });

  it('generateStackupSvgString falls back to a 2-layer default instead of null', async () => {
    await withTempBoard(board2Layer, async (file) => {
      const svg = await generateStackupSvgString(file);
      expect(svg).not.toBeNull();
      expect(svg).toContain('PCB Layer Stackup');
      // two copper rows (F.Cu/B.Cu) plus one FR4 dielectric between them
      expect(svg!.match(/Cu 18um \+ plating/g)).toHaveLength(2);
      expect(svg).toContain('FR4');
      expect(svg).toContain('Finished PCB thickness: 1.60mm');
    });
  });

  it('a 4-layer board synthesizes four copper rows and three dielectrics', async () => {
    await withTempBoard(board4Layer, async (file) => {
      const svg = await generateStackupSvgString(file);
      expect(svg).not.toBeNull();
      expect(svg!.match(/Cu 18um \+ plating/g)).toHaveLength(4);
      // prepreg / core / prepreg between the four copper layers
      expect(svg!.match(/prepreg/g)).toHaveLength(2);
      expect(svg!.match(/core/g)).toHaveLength(1);
    });
  });
});
