import { describe, it, expect } from 'vitest';
import {
  pxToMil,
  pxToMm,
  convertEePins,
  convertEeRectangles,
  convertEeCircles,
  convertEeEllipses,
  convertEePolylines,
  convertEePolygons,
  convertEePaths,
  convertToKicad,
  tuneFootprintRefPath,
  ExporterSymbolKicad,
} from '../../src/kipm/kicad/exportKicadSymbol.js';
import {
  EeSymbolPin,
  EeSymbolPinSettings,
  EeSymbolPinDot,
  EeSymbolPinPath,
  EeSymbolPinName,
  EeSymbolPinDotBis,
  EeSymbolPinClock,
  EeSymbolRectangle,
  EeSymbolCircle,
  EeSymbolEllipse,
  EeSymbolPolyline,
  EeSymbolPolygon,
  EeSymbolPath,
  EeSymbol,
  EeSymbolBbox,
} from '../../src/kipm/easyeda/parametersEasyeda.js';
import { KicadVersion, KiSymbol, KiSymbolInfo } from '../../src/kipm/kicad/parametersKicadSymbol.js';

describe('pxToMil', () => {
  it('converts pixels to mils', () => {
    expect(pxToMil(10)).toBe(100);
  });

  it('floors fractional values', () => {
    expect(pxToMil(1.5)).toBe(15);
  });
});

describe('pxToMm', () => {
  it('converts pixels to mm', () => {
    expect(pxToMm(10)).toBeCloseTo(2.54, 5);
  });

  it('handles zero', () => {
    expect(pxToMm(0)).toBe(0);
  });
});

function makePin(overrides: Record<string, unknown> = {}) {
  return new EeSymbolPin({
    settings: {
      is_displayed: 'show',
      type: '0',
      spice_pin_number: 1,
      pos_x: 200,
      pos_y: 100,
      rotation: 0,
      id: 1,
      is_locked: false,
      ...overrides,
    },
    pin_dot: { dot_x: 0, dot_y: 0 },
    pin_path: { path: 'M0 0h10', color: '#000' },
    name: { text: 'PIN1', is_displayed: 'show' },
    dot: { is_displayed: '0', circle_x: 0, circle_y: 0 },
    clock: { is_displayed: '0', path: '' },
  });
}

describe('convertEePins', () => {
  it('converts EasyEDA pins to KiCad pins v5', () => {
    const bbox = new EeSymbolBbox({ x: 100, y: 50 });
    const pins = [makePin()];
    const result = convertEePins(pins, bbox, KicadVersion.v5);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('PIN1');
    expect(result[0].number).toBe('1');
  });

  it('converts EasyEDA pins to KiCad pins v6', () => {
    const bbox = new EeSymbolBbox({ x: 0, y: 0 });
    const pins = [makePin()];
    const result = convertEePins(pins, bbox, KicadVersion.v6);
    expect(result).toHaveLength(1);
  });

  it('detects inverted style when dot is displayed', () => {
    const bbox = new EeSymbolBbox({ x: 0, y: 0 });
    const pin = new EeSymbolPin({
      settings: { type: '0', spice_pin_number: 1, pos_x: 0, pos_y: 0, rotation: 0 },
      pin_dot: { dot_x: 0, dot_y: 0 },
      pin_path: { path: 'M0 0h10', color: '#000' },
      name: { text: 'PIN' },
      dot: { is_displayed: 'show', circle_x: 0, circle_y: 0 },
      clock: { is_displayed: '0', path: '' },
    });
    const result = convertEePins([pin], bbox, KicadVersion.v5);
    expect(result[0].style).toBe('inverted');
  });

  it('detects clock style when clock is displayed', () => {
    const bbox = new EeSymbolBbox({ x: 0, y: 0 });
    const pin = new EeSymbolPin({
      settings: { type: '0', spice_pin_number: 1, pos_x: 0, pos_y: 0, rotation: 0 },
      pin_dot: { dot_x: 0, dot_y: 0 },
      pin_path: { path: 'M0 0h10', color: '#000' },
      name: { text: 'CLK' },
      dot: { is_displayed: '0', circle_x: 0, circle_y: 0 },
      clock: { is_displayed: 'show', path: 'M0 0L5 5' },
    });
    const result = convertEePins([pin], bbox, KicadVersion.v5);
    expect(result[0].style).toBe('clock');
  });

  it('detects inverted_clock when both dot and clock displayed', () => {
    const bbox = new EeSymbolBbox({ x: 0, y: 0 });
    const pin = new EeSymbolPin({
      settings: { type: '0', spice_pin_number: 1, pos_x: 0, pos_y: 0, rotation: 0 },
      pin_dot: { dot_x: 0, dot_y: 0 },
      pin_path: { path: 'M0 0h10', color: '#000' },
      name: { text: 'CLK' },
      dot: { is_displayed: 'show', circle_x: 0, circle_y: 0 },
      clock: { is_displayed: 'show', path: 'M0 0L5 5' },
    });
    const result = convertEePins([pin], bbox, KicadVersion.v5);
    expect(result[0].style).toBe('inverted_clock');
  });
});

describe('convertEeRectangles', () => {
  it('converts rectangles v5', () => {
    const bbox = new EeSymbolBbox({ x: 50, y: 50 });
    const rect = new EeSymbolRectangle({
      pos_x: 50,
      pos_y: 50,
      width: 20,
      height: 10,
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: '#fff',
      id: 1,
      is_locked: false,
    });
    const result = convertEeRectangles([rect], bbox, KicadVersion.v5);
    expect(result).toHaveLength(1);
  });

  it('converts rectangles v6', () => {
    const bbox = new EeSymbolBbox({ x: 0, y: 0 });
    const rect = new EeSymbolRectangle({
      pos_x: 0,
      pos_y: 0,
      width: 10,
      height: 10,
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: '#fff',
      id: 1,
      is_locked: false,
    });
    const result = convertEeRectangles([rect], bbox, KicadVersion.v6);
    expect(result[0].pos_x0).toBeCloseTo(0, 5);
  });
});

describe('convertEeCircles', () => {
  it('converts circles with fill', () => {
    const bbox = new EeSymbolBbox({ x: 0, y: 0 });
    const circle = new EeSymbolCircle({
      center_x: 10,
      center_y: 10,
      radius: 5,
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: '#ff0000',
      id: 1,
      is_locked: false,
    });
    const result = convertEeCircles([circle], bbox, KicadVersion.v5);
    expect(result).toHaveLength(1);
    expect(result[0].background_filling).toBe(true);
  });
});

describe('convertEeEllipses', () => {
  it('filters out non-circular ellipses', () => {
    const bbox = new EeSymbolBbox({ x: 0, y: 0 });
    const ellipse = new EeSymbolEllipse({
      center_x: 5,
      center_y: 5,
      radius_x: 3,
      radius_y: 5,
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: 'none',
      id: 1,
      is_locked: false,
    });
    const result = convertEeEllipses([ellipse], bbox, KicadVersion.v5);
    expect(result).toHaveLength(0);
  });

  it('converts circular ellipses to circles', () => {
    const bbox = new EeSymbolBbox({ x: 0, y: 0 });
    const ellipse = new EeSymbolEllipse({
      center_x: 5,
      center_y: 5,
      radius_x: 3,
      radius_y: 3,
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: 'none',
      id: 1,
      is_locked: false,
    });
    const result = convertEeEllipses([ellipse], bbox, KicadVersion.v5);
    expect(result).toHaveLength(1);
  });
});

describe('convertEePolylines', () => {
  it('converts polylines to polygons', () => {
    const bbox = new EeSymbolBbox({ x: 0, y: 0 });
    const poly = new EeSymbolPolyline({
      points: '0 0 10 0 10 10',
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: 'none',
      id: 1,
      is_locked: false,
    });
    const result = convertEePolylines([poly], bbox, KicadVersion.v5);
    expect(result).toHaveLength(1);
    expect(result[0].points_number).toBe(3);
  });

  it('adds closing point when fill_color is truthy', () => {
    const bbox = new EeSymbolBbox({ x: 0, y: 0 });
    const poly = new EeSymbolPolyline({
      points: '0 0 10 0 10 10',
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: '#fff',
      id: 1,
      is_locked: false,
    });
    const result = convertEePolylines([poly], bbox, KicadVersion.v5);
    expect(result[0].is_closed).toBe(true);
  });
});

describe('convertEePolygons', () => {
  it('delegates to convertEePolylines', () => {
    const bbox = new EeSymbolBbox({ x: 0, y: 0 });
    const poly = new EeSymbolPolygon({
      points: '0 0 10 0 10 10',
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: 'none',
      id: 1,
    });
    const result = convertEePolygons([poly], bbox, KicadVersion.v5);
    expect(result).toHaveLength(1);
  });
});

describe('convertEePaths', () => {
  it('converts M/L/Z paths', () => {
    const bbox = new EeSymbolBbox({ x: 0, y: 0 });
    const path = new EeSymbolPath({
      paths: 'M 0 0 L 10 0 L 10 10 Z',
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: 'none',
      id: 1,
      is_locked: false,
    });
    const [polygons] = convertEePaths([path], bbox, KicadVersion.v5);
    expect(polygons).toHaveLength(1);
    expect(polygons[0].is_closed).toBe(true);
  });

  it('skips C commands', () => {
    const bbox = new EeSymbolBbox({ x: 0, y: 0 });
    const path = new EeSymbolPath({
      paths: 'M 0 0 C 1 1 2 2 3 3 L 10 10',
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: 'none',
      id: 1,
      is_locked: false,
    });
    const [polygons] = convertEePaths([path], bbox, KicadVersion.v5);
    expect(polygons).toHaveLength(1);
  });
});

describe('convertToKicad', () => {
  it('converts an EeSymbol to KiSymbol', () => {
    const eeSym = new EeSymbol({
      info: { name: 'Resistor', prefix: 'R?', package: '0805' },
      bbox: { x: 100, y: 100 },
      pins: [],
      rectangles: [
        {
          pos_x: 100,
          pos_y: 100,
          width: 20,
          height: 10,
          stroke_color: '#000',
          stroke_width: 1,
          stroke_style: '',
          fill_color: '#fff',
          id: 1,
          is_locked: false,
        },
      ],
    });
    const result = convertToKicad(eeSym, KicadVersion.v5);
    expect(result).toBeInstanceOf(KiSymbol);
    expect(result.info.name).toBe('Resistor');
    expect(result.info.prefix).toBe('R');
    expect(result.rectangles).toHaveLength(1);
  });
});

describe('tuneFootprintRefPath', () => {
  it('prepends lib name to package path', () => {
    const kiInfo = new KiSymbolInfo({
      name: 'Test',
      prefix: 'U',
      package: 'PKG',
    });
    const sym = new KiSymbol({ info: kiInfo });
    tuneFootprintRefPath(sym, 'mylib');
    expect(sym.info.package).toBe('mylib:PKG');
  });
});

describe('ExporterSymbolKicad', () => {
  it('converts and exports a symbol', () => {
    const eeSym = new EeSymbol({
      info: { name: 'Cap', prefix: 'C?', package: '0603' },
      bbox: { x: 0, y: 0 },
    });
    const exporter = new ExporterSymbolKicad(eeSym, KicadVersion.v6);
    const result = exporter.export('mylib');
    expect(result).toContain('symbol "Cap"');
    expect(exporter.output.info.package).toContain('mylib:');
  });
});
