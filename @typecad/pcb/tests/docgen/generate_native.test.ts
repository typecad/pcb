import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateDocumentation } from '../../src/cli/docgen/index.js';
import { renderKicad3DView } from '../../src/cli/docgen/utils/svg.js';
import { KiCAD } from '../../src/kicad.js';

// docgen's markdown stack is an optional dependency set — skip the
// end-to-end run entirely where it isn't installed (probed at module load,
// before it.skipIf captures the flag)
let markdownStackAvailable = false;
try {
  await import('markdown-it');
  await import('@shikijs/markdown-it');
  markdownStackAvailable = true;
} catch {
  markdownStackAvailable = false;
}

const fixturesDir = path.join(import.meta.dirname!, 'fixtures');

describe('generateDocumentation (native images)', () => {
  it.skipIf(!markdownStackAvailable)(
    'renders layer, drill and stackup images without kicad-cli',
    async () => {
      const md = [
        '---',
        'title: native docgen',
        'kicad_theme: KiCAD Default',
        '---',
        '',
        '# Board',
        '',
        '![{F.Cu}](./images/fcu.svg =550)',
        '',
        '![{Edge.Cuts,F.Cu,F.Mask,F.Fab}](./images/front-assembly.svg =550)',
        '',
        '![{B.Cu,B.Mask}](./images/back.svg =550)',
        '',
        '![{Drill}](./images/drills.svg)',
        '',
        '![{Stackup}](./images/stackup.svg)',
        '',
      ].join('\n');

      const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docgen-native-'));
      const inputFile = path.join(workDir, 'doc.md');
      const outputFile = path.join(workDir, 'doc.html');
      await fs.writeFile(inputFile, md, 'utf-8');

      try {
        await generateDocumentation(inputFile, path.join(fixturesDir, 'one_hz.kicad_pcb'), outputFile, {
          quiet: true,
          openFile: false,
        });

        const html = await fs.readFile(outputFile, 'utf-8');
        // every specced image got an inlined native SVG, keyed by unique ids
        expect(html).toContain('svg-inline');
        expect(html).toMatch(/id="img-\d+-fcu-panzoom"/);
        expect(html).toMatch(/id="img-\d+-front-assembly-panzoom"/);
        expect(html).toMatch(/id="img-\d+-back-panzoom"/);
        expect(html).toMatch(/id="img-\d+-drills-panzoom"/);
        // back-side image is mirrored
        expect(html).toContain('scale(-1,1)');
        // no image placeholders were dropped
        expect(html).not.toMatch(/<img[^>]+src="\.\//);
        // KiCad-default palette ink made it into the layer images
        expect(html).toContain('rgb(200, 52, 52)');
      } finally {
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    },
    120_000,
  );

  it.skipIf(!markdownStackAvailable)(
    'skips {Render/…} images with a warning when kicad-cli is missing',
    async () => {
      const md = ['# Board', '', '![{F.Cu}](./images/fcu.svg =550)', '', '![{Render/front/0/0/0}](./images/render.png =550)', ''].join('\n');

      const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docgen-norender-'));
      const inputFile = path.join(workDir, 'doc.md');
      const outputFile = path.join(workDir, 'doc.html');
      await fs.writeFile(inputFile, md, 'utf-8');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const availableSpy = vi.spyOn(KiCAD, 'isAvailable').mockReturnValue(false);
      try {
        // must complete without throwing — the render image is optional
        await generateDocumentation(inputFile, path.join(fixturesDir, 'one_hz.kicad_pcb'), outputFile, {
          quiet: true,
          openFile: false,
        });

        const html = await fs.readFile(outputFile, 'utf-8');
        // native layer image still inlined…
        expect(html).toMatch(/id="img-\d+-fcu-panzoom"/);
        // …and the skipped render placeholder was dropped, not left broken
        expect(html).not.toContain('./images/render.png');
      } finally {
        availableSpy.mockRestore();
        warnSpy.mockRestore();
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    },
    120_000,
  );
});

describe('kicad-cli availability probe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isAvailable() reports false when no install is discoverable', () => {
    vi.spyOn(KiCAD, 'instance', 'get').mockImplementation(() => {
      throw new Error('KiCad CLI not found');
    });
    expect(KiCAD.isAvailable()).toBe(false);
  });

  it('renderKicad3DView skips (null) instead of throwing without kicad-cli', async () => {
    const spy = vi.spyOn(KiCAD, 'isAvailable').mockReturnValue(false);
    try {
      const buf = await renderKicad3DView({ side: 'front', x: '0', y: '0', z: '0' }, 'whatever.kicad_pcb');
      expect(buf).toBeNull();
      // no kicad-cli process was ever attempted
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
