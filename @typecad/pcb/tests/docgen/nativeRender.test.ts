import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderNativeLayerSvg,
  renderNativeDrillSvg,
} from '../../src/cli/docgen/utils/nativeRender.js';
import { findLayerTheme, layerThemeColor } from '../../src/gerber_viewer/themes.js';
import { detectLayer } from '../../src/gerber_viewer/detect_layer.js';
import { renderSvg } from '../../src/gerber_viewer/render/svg.js';
import type { GerberImage } from '../../src/gerber_viewer/index.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const board = path.join(fixturesDir, 'one_hz.kicad_pcb');

describe('docgen native layer images', () => {
  it('renders a single copper layer to a self-contained SVG', () => {
    const svg = renderNativeLayerSvg(board, ['F.Cu'], 'KiCAD Default', 'img-fcu');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="/);
    // KiCad-default front copper ink, via the theme's board.copper.f entry
    expect(svg).toContain('rgb(200, 52, 52)');
    // pads render as <use> references to prefixed aperture symbols
    expect(svg).toMatch(/<use[^>]+href="#img-fcu-ap0_\d+"/);
    // requested layers are on-stage regardless of the kind's display default
    expect(svg).not.toContain('display="none"');
  });

  it('renders a mixed combination with outline, copper and fab in painter order', () => {
    const svg = renderNativeLayerSvg(board, ['Edge.Cuts', 'F.Cu', 'F.Mask', 'F.Fab'], undefined, 'img-assembly');
    const order = ['data-kind="edge"', 'data-kind="copper"', 'data-kind="mask"', 'data-kind="fab"'].map(
      (k) => svg.indexOf(k),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('mirrors back-side combinations (kicad-cli --mirror parity)', () => {
    const front = renderNativeLayerSvg(board, ['F.Cu'], undefined, 'img-front');
    const back = renderNativeLayerSvg(board, ['B.Cu', 'B.Mask'], undefined, 'img-back');
    expect(front).not.toContain('scale(-1,1)');
    expect(back).toContain('scale(-1,1)');
  });

  it('rejects unknown layer names with the available set', () => {
    expect(() => renderNativeLayerSvg(board, ['F.Cu', 'Nope.Layer'], undefined, 'img-x')).toThrow(
      /Unknown PCB layer\(s\): Nope\.Layer/,
    );
  });

  it('accepts the full built-in user-layer range like kicad-cli (empty layers render blank)', () => {
    // kicad-cli resolved User.N through KiCad's built-in layer table even
    // when the board carries nothing there — docs naming them must build
    const svg = renderNativeLayerSvg(board, ['Edge.Cuts', 'User.5', 'F.Fab'], undefined, 'img-dims');
    expect(svg).toContain('data-kind="edge"');
    expect(svg).toContain('data-kind="fab"');
    // the empty user layer contributes a group but no geometry and no bounds
    expect(svg).not.toContain('data-kind="copper"');
    const avail = (() => {
      try {
        renderNativeLayerSvg(board, ['Nope.Layer'], undefined, 'img-x2');
      } catch (e) {
        return String(e);
      }
      return '';
    })();
    expect(avail).toContain('User.9');
  });

  it('renders the drill map with holes over the board outline', () => {
    const svg = renderNativeDrillSvg(board, 'img-drill');
    expect(svg).toContain('data-kind="drill"');
    expect(svg).toContain('data-kind="edge"');
    // the one_hz board has via + component drills; holes never intercept
    // pointer events (they render above silk/fab and would block text ink)
    expect(svg).toMatch(/<circle cx="[^"]+" cy="[^"]+" r="[^"]+" pointer-events="none"\/>/);
  });

  it('keys plotted output per board so repeated renders reuse one plot', () => {
    const a = renderNativeLayerSvg(board, ['F.Cu'], undefined, 'img-a');
    const b = renderNativeLayerSvg(board, ['F.Cu'], undefined, 'img-b');
    expect(a).toContain('href="#img-a-');
    expect(b).toContain('href="#img-b-');
  });
});

describe('layer theme resolution', () => {
  it("maps KiCad's default theme name to the vendored KiCad palette", () => {
    const theme = findLayerTheme('KiCAD Default');
    expect(theme?.id).toBe('kicad-2020');
  });

  it('resolves registered themes by id and label, spacing-insensitively', () => {
    expect(findLayerTheme('typeCAD-dark')?.id).toBe('typecad');
    expect(findLayerTheme('KiCad 2020')?.id).toBe('kicad-2020');
  });

  it('returns null for unknown names (callers keep detect-layer colors)', () => {
    expect(findLayerTheme('nope')).toBeNull();
    expect(findLayerTheme(undefined)).toBeNull();
  });

  it('colors front/back/inner copper and silk from the theme board section', () => {
    const theme = findLayerTheme('typecad')!;
    const mk = (name: string) => {
      const img = { attributes: {}, warnings: [] } as never;
      return detectLayer(name, img);
    };
    expect(layerThemeColor(theme, mk('board-f_cu.gtl'))).toBe('rgb(48, 222, 102)');
    expect(layerThemeColor(theme, mk('board-b_cu.gbl'))).toBe('rgb(72, 148, 235)');
    expect(layerThemeColor(theme, mk('board-in1_cu.g1'))).toBe('rgb(228, 183, 80)');
    expect(layerThemeColor(theme, mk('board-f_silkscreen.gto'))).toBe('rgb(240, 240, 240)');
    expect(layerThemeColor(theme, mk('board-b_silkscreen.gbo'))).toBe('rgb(182, 182, 182)');
    expect(layerThemeColor(theme, mk('board-edge_cuts.gm1'))).toBeDefined();
  });
});

describe('renderSvg id and mirror options', () => {
  const emptyGerber = (): GerberImage => ({
    sourceName: 't',
    units: 'mm',
    format: { zeroMode: 'L', notation: 'A', integerDigits: 3, decimalDigits: 6 },
    apertures: new Map(),
    macros: new Map(),
    ops: [],
    attributes: {},
    warnings: [],
  });

  it('unique-ifies pan/flip and aperture ids under a prefix', () => {
    const layer = {
      info: { ...detectLayer('b-f_cu.gtl', emptyGerber()), defaultVisible: true },
      image: emptyGerber(),
    };
    const svg = renderSvg([layer], { idPrefix: 'doc1' });
    expect(svg).toContain('id="doc1-panzoom"');
    expect(svg).toContain('id="doc1-yflip"');
    // no prefix keeps the interactive viewer's historical ids
    const bare = renderSvg([layer]);
    expect(bare).toContain('id="panzoom"');
    expect(bare).toContain('id="yflip"');
  });

  it('mirrorX flips the viewBox x origin', () => {
    const layer = {
      info: { ...detectLayer('b-f_cu.gtl', emptyGerber()), defaultVisible: true },
      image: emptyGerber(),
    };
    const plain = renderSvg([layer]);
    const mirrored = renderSvg([layer], { mirrorX: true });
    const vb = (s: string): number[] =>
      s.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
    expect(vb(mirrored)[0]).toBeLessThan(0);
    expect(vb(mirrored)[2]).toBe(vb(plain)[2]);
    expect(mirrored).toContain('scale(-1,1)');
  });
});
