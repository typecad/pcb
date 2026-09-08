import { describe, it, expect } from 'vitest';
import {
  KicadVersion,
  KiPinType,
  KiPinStyle,
  KiBoxFill,
  sanitize_fields,
  apply_text_style,
  apply_pin_name_style,
  KiSymbolInfo,
  KiSymbolPin,
  KiSymbolRectangle,
  KiSymbolPolygon,
  KiSymbolCircle,
  KiSymbolArc,
  KiSymbolBezier,
  KiSymbol,
} from '../../src/kipm/kicad/parametersKicadSymbol.js';

describe('KicadVersion', () => {
  it('has expected values', () => {
    expect(KicadVersion.v5).toBe('v5');
    expect(KicadVersion.v6).toBe('v6');
    expect(KicadVersion.v6_99).toBe('v6_99');
  });
});

describe('KiPinType', () => {
  it('has expected pin types', () => {
    expect(KiPinType._input).toBe('_input');
    expect(KiPinType.output).toBe('output');
    expect(KiPinType.power_in).toBe('power_in');
    expect(KiPinType.no_connect).toBe('no_connect');
  });
});

describe('KiPinStyle', () => {
  it('has expected styles', () => {
    expect(KiPinStyle.line).toBe('line');
    expect(KiPinStyle.clock).toBe('clock');
    expect(KiPinStyle.inverted).toBe('inverted');
  });
});

describe('KiBoxFill', () => {
  it('has expected fill modes', () => {
    expect(KiBoxFill.none).toBe('none');
    expect(KiBoxFill.outline).toBe('outline');
    expect(KiBoxFill.background).toBe('background');
  });
});

describe('sanitize_fields', () => {
  it('removes spaces', () => {
    expect(sanitize_fields('Hello World')).toBe('HelloWorld');
  });

  it('replaces slashes with underscores', () => {
    expect(sanitize_fields('A/B/C')).toBe('A_B_C');
  });

  it('handles combined spaces and slashes', () => {
    expect(sanitize_fields('My Component/V2')).toBe('MyComponent_V2');
  });

  it('returns empty string unchanged', () => {
    expect(sanitize_fields('')).toBe('');
  });
});

describe('apply_text_style', () => {
  it('wraps trailing # with overline for v6', () => {
    expect(apply_text_style('VCC#', KicadVersion.v6)).toBe('~{VCC}');
  });

  it('wraps trailing # with tilde for v5', () => {
    expect(apply_text_style('VCC#', KicadVersion.v5)).toBe('~VCC~');
  });

  it('returns text unchanged when no trailing #', () => {
    expect(apply_text_style('GND', KicadVersion.v6)).toBe('GND');
  });
});

describe('apply_pin_name_style', () => {
  it('applies style to each slash-separated segment', () => {
    expect(apply_pin_name_style('VCC#/GND#', KicadVersion.v6)).toBe('~{VCC}/~{GND}');
  });

  it('handles single name', () => {
    expect(apply_pin_name_style('CLK#', KicadVersion.v6)).toBe('~{CLK}');
  });

  it('handles name without #', () => {
    expect(apply_pin_name_style('RST', KicadVersion.v5)).toBe('RST');
  });
});

describe('KiSymbolInfo', () => {
  it('constructs with data', () => {
    const info = new KiSymbolInfo({
      name: 'Resistor',
      prefix: 'R',
      package: '0805',
      manufacturer: 'Yageo',
      datasheet: 'http://doc.com',
      lcsc_id: 'C123',
      jlc_id: 'J456',
    });
    expect(info.name).toBe('Resistor');
    expect(info.prefix).toBe('R');
  });

  it('export_v5 includes DEF and fields', () => {
    const info = new KiSymbolInfo({
      name: 'Cap',
      prefix: 'C',
      package: '0603',
      y_low: -100,
      y_high: 100,
    });
    const result = info.export_v5();
    expect(result).toContain('DEF Cap');
    expect(result).toContain('DRAW');
  });

  it('export_v6 returns array of property strings', () => {
    const info = new KiSymbolInfo({
      name: 'IC',
      prefix: 'U',
      package: 'SOIC-8',
      y_low: -50,
      y_high: 50,
    });
    const result = info.export_v6();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toContain('Reference');
    expect(result[1]).toContain('Value');
  });

  it('export_v5 includes optional fields when provided', () => {
    const info = new KiSymbolInfo({
      name: 'X',
      prefix: 'U',
      package: 'PKG',
      manufacturer: 'Mfg',
      datasheet: 'DS',
      lcsc_id: 'LC',
      jlc_id: 'JL',
    });
    const result = info.export_v5();
    expect(result).toContain('F3 "DS"');
    expect(result).toContain('F4 "Mfg"');
    expect(result).toContain('F6 "LC"');
    expect(result).toContain('F7 "JL"');
  });
});

describe('KiSymbolPin', () => {
  it('constructs and exports v5', () => {
    const pin = new KiSymbolPin({
      name: 'VCC',
      number: '1',
      style: 'line',
      length: 100,
      type: 'power_in',
      orientation: '0',
      pos_x: 0,
      pos_y: 100,
    });
    const result = pin.export_v5();
    expect(result).toContain('X VCC 1');
    expect(result).toContain('W');
  });

  it('constructs and exports v6', () => {
    const pin = new KiSymbolPin({
      name: 'CLK#',
      number: '3',
      style: 'clock',
      length: 2.54,
      type: '_input',
      orientation: '180',
      pos_x: 5,
      pos_y: -3,
    });
    const result = pin.export_v6();
    expect(result).toContain('pin input clock');
    expect(result).toContain('~{CLK}');
    expect(result).toContain('number "3"');
  });

  it('export_v5 defaults orientation to L for unknown', () => {
    const pin = new KiSymbolPin({
      name: 'A',
      number: '1',
      style: 'line',
      length: 100,
      type: 'unspecified',
      orientation: '999',
      pos_x: 0,
      pos_y: 0,
    });
    const result = pin.export_v5();
    expect(result).toContain(' L ');
  });
});

describe('KiSymbolRectangle', () => {
  it('constructs with defaults', () => {
    const r = new KiSymbolRectangle();
    expect(r.pos_x0).toBe(0);
    expect(r.pos_y0).toBe(0);
  });

  it('export_v5', () => {
    const r = new KiSymbolRectangle({ pos_x0: 0, pos_y0: 0, pos_x1: 100, pos_y1: 50 });
    expect(r.export_v5()).toContain('S 0 0 100 50');
  });

  it('export_v6', () => {
    const r = new KiSymbolRectangle({ pos_x0: 0, pos_y0: 0, pos_x1: 2.54, pos_y1: 2.54 });
    expect(r.export_v6()).toContain('rectangle');
    expect(r.export_v6()).toContain('start 0.00 0.00');
  });
});

describe('KiSymbolPolygon', () => {
  it('export_v5 with closed polygon', () => {
    const p = new KiSymbolPolygon({
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      points_number: 3,
      is_closed: true,
    });
    const result = p.export_v5();
    expect(result).toContain('P 3');
    expect(result).toContain('f');
  });

  it('export_v5 with open polyline', () => {
    const p = new KiSymbolPolygon({
      points: [
        [0, 0],
        [50, 50],
      ],
      points_number: 2,
      is_closed: false,
    });
    expect(p.export_v5()).toContain('N');
  });

  it('export_v6', () => {
    const p = new KiSymbolPolygon({
      points: [
        [0, 0],
        [1, 1],
      ],
      points_number: 2,
      is_closed: false,
    });
    expect(p.export_v6()).toContain('polyline');
    expect(p.export_v6()).toContain('xy 0.00 0.00');
  });
});

describe('KiSymbolCircle', () => {
  it('export_v5 with background fill', () => {
    const c = new KiSymbolCircle({ pos_x: 50, pos_y: 50, radius: 25, background_filling: true });
    expect(c.export_v5()).toContain('C 50 50 25');
    expect(c.export_v5()).toContain('f');
  });

  it('export_v6 without fill', () => {
    const c = new KiSymbolCircle({ pos_x: 0, pos_y: 0, radius: 10, background_filling: false });
    expect(c.export_v6()).toContain('circle');
    expect(c.export_v6()).toContain('none');
  });
});

describe('KiSymbolArc', () => {
  it('export_v5', () => {
    const a = new KiSymbolArc({
      center_x: 10,
      center_y: 10,
      radius: 5,
      angle_start: 0,
      angle_end: 90,
      start_x: 15,
      start_y: 10,
      middle_x: 10,
      middle_y: 15,
      end_x: 10,
      end_y: 15,
    });
    expect(a.export_v5()).toContain('A 10 10 5');
  });

  it('export_v6', () => {
    const a = new KiSymbolArc({
      center_x: 0,
      center_y: 0,
      radius: 5,
      angle_start: 0,
      angle_end: 0,
      start_x: 5,
      start_y: 0,
      middle_x: 0,
      middle_y: 5,
      end_x: -5,
      end_y: 0,
    });
    expect(a.export_v6()).toContain('arc');
    expect(a.export_v6()).toContain('start 5.00 0.00');
  });
});

describe('KiSymbolBezier', () => {
  it('export_v5 with closed bezier', () => {
    const b = new KiSymbolBezier({
      points: [
        [0, 0],
        [10, 10],
        [20, 0],
      ],
      points_number: 3,
      is_closed: true,
    });
    expect(b.export_v5()).toContain('B 3');
    expect(b.export_v5()).toContain('f');
  });

  it('export_v6', () => {
    const b = new KiSymbolBezier({
      points: [
        [0, 0],
        [1, 1],
      ],
      points_number: 2,
      is_closed: false,
    });
    expect(b.export_v6()).toContain('gr_curve');
  });
});

describe('KiSymbol', () => {
  it('export_v5 produces valid output', () => {
    const info = new KiSymbolInfo({ name: 'Test', prefix: 'U', package: 'PKG' });
    const sym = new KiSymbol({
      info,
      pins: [
        new KiSymbolPin({
          name: 'A',
          number: '1',
          style: 'line',
          length: 100,
          type: 'unspecified',
          orientation: '0',
          pos_x: 0,
          pos_y: 100,
        }),
      ],
      rectangles: [new KiSymbolRectangle({ pos_x0: 0, pos_y0: 0, pos_x1: 100, pos_y1: 100 })],
    });
    const result = sym.export_v5();
    expect(result).toContain('# Test');
    expect(result).toContain('X A 1');
    expect(result).toContain('S 0 0 100 100');
    expect(result).toContain('ENDDRAW');
    expect(result).toContain('ENDDEF');
  });

  it('export_v6 produces valid output', () => {
    const info = new KiSymbolInfo({ name: 'Test', prefix: 'U' });
    const sym = new KiSymbol({ info });
    const result = sym.export_v6();
    expect(result).toContain('symbol "Test"');
    expect(result).toContain('in_bom yes');
  });

  it('export dispatches to v5 or v6', () => {
    const info = new KiSymbolInfo({ name: 'Comp', prefix: 'R' });
    const sym = new KiSymbol({ info });
    const v5 = sym.export(KicadVersion.v5);
    const v6 = sym.export(KicadVersion.v6);
    expect(v5).toContain('DEF Comp');
    expect(v6).toContain('symbol "Comp"');
  });
});
