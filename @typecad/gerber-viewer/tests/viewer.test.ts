import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildViewerFromFiles } from '../src/build.js';
import { buildViewerHtml } from '../src/render/viewer_html.js';
import { renderSvg } from '../src/render/svg.js';
import { detectLayer } from '../src/detect_layer.js';
import { parseGerber } from '../src/gerber/parse_gerber.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (name: string) => fs.readFileSync(path.join(fixtures, name), 'utf8');

describe('buildViewerHtml', () => {
  const image = parseGerber(read('traces.gbr'));
  const info = detectLayer('demo-F_Cu.gbr', image);
  const svg = renderSvg([{ info, image }]);
  const html = buildViewerHtml(svg, [info], { title: 'demo board' });

  it('is fully self-contained (no external references)', () => {
    expect(html).not.toMatch(/src="http/i);
    expect(html).not.toMatch(/href="http/i);
    expect(html).toContain('<script>');
    expect(html).toContain('#board');
  });

  it('lists layers with toggles and opacity sliders', () => {
    expect(html).toContain('demo-F_Cu.gbr');
    expect(html).toContain('class="layer-vis"');
    expect(html).toContain('class="layer-opacity"');
    expect(html).toContain('data-layer-id="demo-f_cu-gbr"');
  });

  it('embeds the svg with a board id and panzoom group', () => {
    expect(html).toContain('id="board"');
    expect(html).toContain('id="panzoom"');
    expect(html).toContain('id="yflip"');
  });
});

describe('buildViewerFromFiles', () => {
  it('assembles a viewer from a directory of mixed fab files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gerview-'));
    fs.writeFileSync(path.join(dir, 'demo-F_Cu.gbr'), read('traces.gbr'));
    fs.writeFileSync(path.join(dir, 'demo-Edge_Cuts.gbr'), read('edge.gbr'));
    fs.writeFileSync(path.join(dir, 'demo.drl'), read('drill.drl'));
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'not a drill file');

    const result = buildViewerFromFiles([dir], { title: 'demo' });
    // the shared "demo-" board prefix is stripped for display, kept as fullName
    expect(result.layers.map((l) => l.name)).toEqual(['Edge_Cuts.gbr', 'F_Cu.gbr', 'drl']);
    expect(result.layers.every((l) => l.fullName!.startsWith('demo'))).toBe(true);
    expect(result.html).toContain('3 layers');
    expect(result.html).toContain('M 0 0 L 8 0 L 8 6 L 0 6 Z');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('throws a helpful error when nothing parses', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gerview-'));
    fs.writeFileSync(path.join(dir, 'noise.gbr'), 'this is not a gerber\n');
    expect(() => buildViewerFromFiles([dir])).toThrow(/could be parsed/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
