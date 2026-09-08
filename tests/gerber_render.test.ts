import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectLayer, finalizeAndSortLayers } from '../src/gerber_viewer/detect_layer.js';
import { parseExcellon } from '../src/gerber_viewer/gerber/parse_excellon.js';
import { parseGerber } from '../src/gerber_viewer/gerber/parse_gerber.js';
import { computeLayerBounds, renderSvg, type RenderLayer } from '../src/gerber_viewer/render/svg.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gerber');
const read = (name: string) => fs.readFileSync(path.join(fixtures, name), 'utf8');

const parsed = [
  { name: 'demo-F_Cu.gbr', image: parseGerber(read('traces.gbr'), { name: 'demo-F_Cu.gbr' }) },
  { name: 'demo-Edge_Cuts.gbr', image: parseGerber(read('edge.gbr'), { name: 'demo-Edge_Cuts.gbr' }) },
  { name: 'demo.drl', image: parseExcellon(read('drill.drl'), { name: 'demo.drl' }) },
];
const images = new Map(parsed.map((p) => [p.name, p.image]));
const layers = finalizeAndSortLayers(parsed.map((p) => detectLayer(p.name, p.image)));

const byId = new Map(layers.map((l) => [l.id, l]));
const renderLayers: RenderLayer[] = layers.map((info) => ({
  info,
  image: images.get(info.name)!,
}));

describe('renderSvg', () => {
  const svg = renderSvg(renderLayers);

  it('produces a single rooted svg with flipped viewBox', () => {
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    const viewBox = /viewBox="([^"]+)"/.exec(svg)![1]!.split(' ').map(Number);
    // board spans y 0..~6 (edge outline up to y=6); flipped view starts at -maxY
    expect(viewBox[1]).toBeLessThan(0);
    expect(viewBox[3]).toBeGreaterThan(6);
    expect(svg).toContain('data-units="mm"');
  });

  it('emits aperture defs and use references for flashes', () => {
    expect((svg.match(/<g id="ap\d+_\d+">/g) ?? []).length).toBeGreaterThanOrEqual(2); // rect + polygon pads
    expect(svg).toContain('href="#ap');
    // polygon pad (hexagon) has 6 vertex pairs
    expect(svg).toMatch(/<polygon points="(?:[-\d.]+,[-\d.]+ ){5}[-\d.]+,[-\d.]+"/);
  });

  it('renders traces with strokes and arc commands', () => {
    expect(svg).toContain('stroke="#c87533"'); // front copper color
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toMatch(/ A [\d.]+ [\d.]+ 0 [01] [01] /);
    expect(svg).toContain('M 1 1 L 3 1 L 3 2');
  });

  it('renders regions with evenodd fill and clear-polarity cutouts', () => {
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('class="cut"');
    expect(svg).toContain('.cut{fill:var(--bg');
  });

  it('renders drill holes as circles and slots as strokes', () => {
    expect(svg).toMatch(/<circle cx="10" cy="10" r="0.3"/);
    expect(svg).toMatch(/<circle cx="30" cy="20" r="0.5"/);
    expect(svg).toContain('M 5 5 L 5 8');
  });

  it('tags layer groups and hides non-default layers', () => {
    expect(svg).toContain('data-layer-id="demo-f_cu-gbr"');
    // kind is exposed for viewer-side theme recoloring
    expect(svg).toContain('data-kind="copper"');
    expect(svg).toContain('data-kind="drill"');
    // drill is visible by default, drill group has no display attr
    const drillGroup = svg.split('data-layer-id="demo-drl"')[1]!.slice(0, 200);
    expect(drillGroup).not.toContain('display="none"');
  });

  it('computes sensible layer bounds', () => {
    const edgeBounds = computeLayerBounds(renderLayers[0]!);
    expect(edgeBounds).toEqual({ minX: 0, minY: 0, maxX: 8, maxY: 6 });
  });
});
