import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildViewerFromFiles } from '../src/gerber_viewer/build.js';
import { buildViewerHtml } from '../src/gerber_viewer/render/viewer_html.js';
import { renderSvg } from '../src/gerber_viewer/render/svg.js';
import { detectLayer } from '../src/gerber_viewer/detect_layer.js';
import { parseGerber } from '../src/gerber_viewer/gerber/parse_gerber.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gerber');
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

  it('persists layer settings to localStorage keyed per board', () => {
    expect(html).toContain("gerber-viewer:v1:' + document.title");
    expect(html).toContain('localStorage.getItem');
    expect(html).toContain('localStorage.setItem');
    // every mutation path saves: checkbox, opacity slider, All/None buttons
    expect(html).toMatch(/syncLayer\(cb\); persist\(\)/);
    expect(html).toMatch(/syncOpacity\(slider\); persist\(\)/);
    expect(html).toMatch(/function setAll\(on\) \{[\s\S]*?persist\(\);/);
  });

  it('has a dark/light theme selector that persists and respects the OS preference', () => {
    expect(html).toContain('id="btn-theme"');
    expect(html).toContain("'gerber-viewer:theme:v1'");
    // light theme overrides via a body class; OS preference is the first-visit default
    expect(html).toMatch(/body\.light\s*\{/);
    expect(html).toContain('prefers-color-scheme: light');
    expect(html).toMatch(/applyTheme\(savedTheme\)/);
  });

  it('themes the board canvas and keeps clear-polarity cutouts in sync', () => {
    // dark canvas by default, white in light theme
    expect(html).toMatch(/--page:\s*#16181d/);
    expect(html).toMatch(/body\.light\s*\{[\s\S]*?--page:\s*#ffffff/);
    // the svg's clear-polarity var follows the computed canvas color
    expect(html).toContain("svg.style.setProperty('--bg'");
    // near-black layer kinds are recolored on the dark canvas, cutouts exempt
    expect(html).toMatch(/\[data-kind="silkscreen"\]/);
    expect(html).toMatch(/\[data-kind="drill"\]/);
    expect(html).toMatch(/\[data-kind\] \.cut\s*\{/);
    // region paths carry stroke="none" — they must NOT get the recolor stroke
    // or TrueType text glyphs balloon with a 1-unit outline
    expect(html).toMatch(/\[stroke\]:not\(\[stroke='none'\]\)/);
    // sidebar chips follow the dark-theme recoloring
    expect(html).toMatch(/\.layer-row\[data-kind="silkscreen"\] \.chip/);
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

  it('uses a crosshair cursor on the board canvas', () => {
    expect(html).toMatch(/#board\s*\{[^}]*cursor:\s*crosshair/);
    expect(html).not.toContain("cursor = 'grab'");
    // crosshair everywhere — also while the ruler tool is armed
    expect(html).not.toContain('cursor: cell');
  });

  it('has a measurement tool that sticks rulers, clears on Escape, and follows the theme', () => {
    expect(html).toContain('id="btn-measure"');
    // overlay group rides inside panzoom (injected after the y-flip group)
    expect(html).toContain('id="yflip"');
    expect(html).toMatch(/<\/g><g id="measure"><\/g><g id="drc"><\/g><\/g><\/svg>/);
    // click-to-start / click-to-stick state machine + Escape clears all
    expect(html).toContain('measureStart = p;');
    expect(html).toContain('rulers.push(');
    expect(html).toMatch(/ev\.key === 'Escape'[\s\S]*?rulers = \[\]/);
    // theme-following ruler colors
    expect(html).toMatch(/--measure:\s*#6db3f2/);
    expect(html).toMatch(/body\.light\s*\{[\s\S]*?--measure:\s*#0b62c4/);
    expect(html).toMatch(/#measure line\s*\{[^}]*var\(--measure\)/);
    // shift snaps the endpoint to 45-degree increments (live and on stick)
    expect(html).toContain('function snapToAngles');
    expect(html).toMatch(/if \(ev\.shiftKey\) mouseBoard = snapToAngles\(measureStart, mouseBoard\)/);
    expect(html).toMatch(/if \(ev\.shiftKey\) p = snapToAngles\(measureStart, p\)/);
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

describe('viewer tooling (probing, search, report, DRC, export)', () => {
  const image = parseGerber(read('traces.gbr'));
  const info = detectLayer('demo-F_Cu.gbr', image);
  const svg = renderSvg([{ info, image }]);
  const html = buildViewerHtml(svg, [info], {
    title: 'demo board',
    report: {
      units: 'mm',
      board: { width: 29.17, height: 23.17 },
      copper: [{ layer: 'F_Cu.gtl', traceLength: 4.414, minWidth: 0.5, maxWidth: 0.5, flashes: 2 }],
      drills: [{ diameter: 0.6, count: 3, plated: true }],
      holes: 3,
      slots: 1,
    },
    drcMarkers: [{ x: 10, y: 20, description: 'clearance — pad of J1' }],
  });

  it('renders the fab report panel from the computed stats', () => {
    expect(html).toContain('id="fab-report"');
    expect(html).toContain('29.17 × 23.17 mm');
    expect(html).toContain('F_Cu.gtl');
    expect(html).toContain('⌀ 0.60');
    expect(html).toContain('3 holes, 1 slots');
  });

  it('embeds DRC markers as JSON and renders them client-side with a toggle', () => {
    expect(html).toContain('id="drc-data"');
    expect(html).toContain('clearance — pad of J1');
    expect(html).toContain('id="btn-drc"');
    expect(html).toMatch(/drcGroup\.classList\.toggle\('hidden'\)/);
  });

  it('has component search, net highlighting, hover probing, and exports', () => {
    expect(html).toContain('id="comp-search"');
    expect(html).toMatch(/highlightNet\('data-net', net\)/);
    expect(html).toMatch(/closest\('\[data-net\],\[data-ref\],\[data-pin\]'\)/);
    expect(html).toContain('id="btn-svg"');
    expect(html).toContain('id="btn-png"');
    expect(html).toMatch(/exportSvgString/);
  });

  it('emits data-net/ref/pin attributes on attributed geometry', () => {
    const attributed = parseGerber(
      [
        '%FSLAX36Y36*%',
        '%MOMM*%',
        '%ADD10C,1*%',
        '%TO.N,GND*%',
        'D10*',
        'X1000000Y1000000D02*',
        'X2000000Y1000000D01*',
        '%TD*%',
        '%TO.P,U1,3*%',
        'X3000000Y2000000D03*',
        'M02*',
      ].join('\n'),
    );
    const out = renderSvg([{ info: detectLayer('x-F_Cu.gtl', attributed), image: attributed }]);
    expect(out).toContain('data-net="GND"');
    expect(out).toContain('data-ref="U1"');
    expect(out).toContain('data-pin="3"');
  });
});
