import { describe, it, expect } from 'vitest';
import {
  convertToMm,
  EasyedaPinType,
  EeSymbolBbox,
  EeSymbolPinSettings,
  EeSymbolPinDot,
  EeSymbolPinPath,
  EeSymbolPinName,
  EeSymbolPinDotBis,
  EeSymbolPinClock,
  EeSymbolPin,
  EeSymbolRectangle,
  EeSymbolCircle,
  EeSymbolArc,
  EeSymbolEllipse,
  EeSymbolPolyline,
  EeSymbolPolygon,
  EeSymbolPath,
  EeSymbolInfo,
  EeSymbol,
  EeFootprintBbox,
  EeFootprintPad,
  EeFootprintTrack,
  EeFootprintHole,
  EeFootprintVia,
  EeFootprintCircle,
  EeFootprintRectangle,
  EeFootprintArc,
  EeFootprintText,
  EeFootprintInfo,
  Ee3dModelBase,
  Ee3dModel,
  ee_footprint,
} from '../../src/kipm/easyeda/parametersEasyeda.js';

describe('convertToMm', () => {
  it('converts a number', () => {
    expect(convertToMm(10)).toBeCloseTo(2.54, 5);
  });

  it('converts a string', () => {
    expect(convertToMm('20')).toBeCloseTo(5.08, 5);
  });

  it('converts zero', () => {
    expect(convertToMm(0)).toBe(0);
  });

  it('converts negative values', () => {
    expect(convertToMm(-10)).toBeCloseTo(-2.54, 5);
  });
});

describe('EasyedaPinType', () => {
  it('has expected pin types', () => {
    expect(EasyedaPinType.unspecified).toBe(0);
    expect(EasyedaPinType._input).toBe(1);
    expect(EasyedaPinType.output).toBe(2);
    expect(EasyedaPinType.bidirectional).toBe(3);
    expect(EasyedaPinType.power).toBe(4);
  });
});

describe('EeSymbolBbox', () => {
  it('constructs with x and y', () => {
    const bbox = new EeSymbolBbox({ x: 100, y: 200 });
    expect(bbox.x).toBe(100);
    expect(bbox.y).toBe(200);
  });

  it('has correct fields', () => {
    expect(EeSymbolBbox.fields).toEqual(['x', 'y']);
  });
});

describe('EeSymbolPinSettings', () => {
  it('constructs with full data', () => {
    const s = new EeSymbolPinSettings({
      is_displayed: 'show',
      type: '2',
      spice_pin_number: 1,
      pos_x: 10,
      pos_y: 20,
      rotation: 90,
      id: 5,
      is_locked: true,
    });
    expect(s.is_displayed).toBe(true);
    expect(s.type).toBe(2);
    expect(s.spice_pin_number).toBe(1);
    expect(s.pos_x).toBe(10);
    expect(s.pos_y).toBe(20);
    expect(s.rotation).toBe(90);
    expect(s.id).toBe(5);
    expect(s.is_locked).toBe(true);
  });

  it('defaults type to unspecified for invalid value', () => {
    const s = new EeSymbolPinSettings({ type: '99' });
    expect(s.type).toBe(EasyedaPinType.unspecified);
  });

  it('defaults rotation to 0', () => {
    const s = new EeSymbolPinSettings({});
    expect(s.rotation).toBe(0);
  });

  it('defaults is_locked to false', () => {
    const s = new EeSymbolPinSettings({});
    expect(s.is_locked).toBe(false);
  });

  it('is_displayed is false when not "show"', () => {
    const s = new EeSymbolPinSettings({ is_displayed: 'hide' });
    expect(s.is_displayed).toBe('hide');
  });
});

describe('EeSymbolPinDot', () => {
  it('constructs with coordinates', () => {
    const d = new EeSymbolPinDot({ dot_x: 1, dot_y: 2 });
    expect(d.dot_x).toBe(1);
    expect(d.dot_y).toBe(2);
  });
});

describe('EeSymbolPinPath', () => {
  it('replaces v with h in path', () => {
    const p = new EeSymbolPinPath({ path: 'M0 0v10', color: '#000' });
    expect(p.path).toBe('M0 0h10');
    expect(p.color).toBe('#000');
  });
});

describe('EeSymbolPinName', () => {
  it('constructs with pt font_size', () => {
    const n = new EeSymbolPinName({
      is_displayed: 'show',
      pos_x: 0,
      pos_y: 0,
      rotation: 0,
      text: 'VCC',
      text_anchor: 'start',
      font: 'sans',
      font_size: '12pt',
    });
    expect(n.font_size).toBe(12);
    expect(n.text).toBe('VCC');
  });

  it('defaults font_size to 7.0', () => {
    const n = new EeSymbolPinName({ text: 'GND' });
    expect(n.font_size).toBe(7.0);
  });

  it('handles numeric font_size', () => {
    const n = new EeSymbolPinName({ font_size: 10 });
    expect(n.font_size).toBe(10);
  });
});

describe('EeSymbolPinDotBis', () => {
  it('constructs with data', () => {
    const d = new EeSymbolPinDotBis({ is_displayed: 'show', circle_x: 5, circle_y: 6 });
    expect(d.is_displayed).toBe(true);
    expect(d.circle_x).toBe(5);
    expect(d.circle_y).toBe(6);
  });
});

describe('EeSymbolPinClock', () => {
  it('constructs with data', () => {
    const c = new EeSymbolPinClock({ is_displayed: 'show', path: 'M0 0L10 0' });
    expect(c.is_displayed).toBe(true);
    expect(c.path).toBe('M0 0L10 0');
  });
});

describe('EeSymbolPin', () => {
  it('constructs with all sub-objects', () => {
    const pin = new EeSymbolPin({
      settings: { is_displayed: 'show', type: '1', spice_pin_number: 3 },
      pin_dot: { dot_x: 0, dot_y: 0 },
      pin_path: { path: 'M0 0', color: '#fff' },
      name: { text: 'CLK', is_displayed: 'show' },
      dot: { is_displayed: '0', circle_x: 0, circle_y: 0 },
      clock: { is_displayed: '0', path: '' },
    });
    expect(pin.settings.type).toBe(1);
    expect(pin.name.text).toBe('CLK');
  });
});

describe('EeSymbolRectangle', () => {
  it('constructs with data', () => {
    const r = new EeSymbolRectangle({
      pos_x: 10,
      pos_y: 20,
      width: 30,
      height: 40,
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: 'solid',
      fill_color: '#fff',
      id: 1,
      is_locked: false,
    });
    expect(r.pos_x).toBe(10);
    expect(r.width).toBe(30);
    expect(r.fill_color).toBe('#fff');
    expect(r.rx).toBeNull();
  });
});

describe('EeSymbolCircle', () => {
  it('constructs with fill color string', () => {
    const c = new EeSymbolCircle({
      center_x: 5,
      center_y: 5,
      radius: 10,
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: 'solid',
      fill_color: '#ff0000',
      id: 1,
      is_locked: false,
    });
    expect(c.fill_color).toBe(true);
  });

  it('sets fill_color false for "none"', () => {
    const c = new EeSymbolCircle({
      center_x: 0,
      center_y: 0,
      radius: 5,
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: 'none',
      id: 2,
      is_locked: false,
    });
    expect(c.fill_color).toBe(false);
  });

  it('sets fill_color false for empty', () => {
    const c = new EeSymbolCircle({
      center_x: 0,
      center_y: 0,
      radius: 5,
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: '',
      id: 3,
    });
    expect(c.fill_color).toBe(false);
  });
});

describe('EeSymbolArc', () => {
  it('constructs and parses path', () => {
    const a = new EeSymbolArc({
      path: 'M 0 0 A 5 5 0 0 1 10 0',
      helper_dots: '',
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: 'none',
      id: 1,
      is_locked: false,
    });
    expect(a.path.length).toBeGreaterThan(0);
    expect(a.fill_color).toBe(false);
  });
});

describe('EeSymbolEllipse', () => {
  it('constructs with data', () => {
    const e = new EeSymbolEllipse({
      center_x: 1,
      center_y: 2,
      radius_x: 3,
      radius_y: 4,
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: '#00ff00',
      id: 1,
      is_locked: false,
    });
    expect(e.radius_x).toBe(3);
    expect(e.radius_y).toBe(4);
    expect(e.fill_color).toBe(true);
  });
});

describe('EeSymbolPolyline', () => {
  it('constructs with data', () => {
    const p = new EeSymbolPolyline({
      points: '0 0 10 10 20 0',
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: 'none',
      id: 1,
      is_locked: false,
    });
    expect(p.points).toBe('0 0 10 10 20 0');
    expect(p.fill_color).toBe(false);
  });
});

describe('EeSymbolPolygon', () => {
  it('extends EeSymbolPolyline', () => {
    const p = new EeSymbolPolygon({
      points: '0 0 10 10',
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: 'none',
      id: 1,
    });
    expect(p.points).toBe('0 0 10 10');
    expect(p).toBeInstanceOf(EeSymbolPolyline);
  });
});

describe('EeSymbolPath', () => {
  it('constructs with data', () => {
    const p = new EeSymbolPath({
      paths: 'M0 0L10 10',
      stroke_color: '#000',
      stroke_width: 1,
      stroke_style: '',
      fill_color: 'none',
      id: 1,
      is_locked: false,
    });
    expect(p.paths).toBe('M0 0L10 10');
  });
});

describe('EeSymbolInfo', () => {
  it('constructs with defaults', () => {
    const info = new EeSymbolInfo();
    expect(info.name).toBe('');
    expect(info.prefix).toBe('');
  });

  it('constructs with all fields', () => {
    const info = new EeSymbolInfo({
      name: 'Resistor',
      prefix: 'R',
      package: '0805',
      manufacturer: 'Yageo',
      datasheet: 'http://example.com',
      lcsc_id: 'C123',
      jlc_id: 'J456',
    });
    expect(info.name).toBe('Resistor');
    expect(info.prefix).toBe('R');
    expect(info.package).toBe('0805');
  });
});

describe('EeSymbol', () => {
  it('constructs with empty defaults', () => {
    const sym = new EeSymbol({ info: {}, bbox: { x: 0, y: 0 } });
    expect(sym.pins).toEqual([]);
    expect(sym.rectangles).toEqual([]);
    expect(sym.circles).toEqual([]);
  });

  it('constructs with info and bbox', () => {
    const sym = new EeSymbol({
      info: { name: 'Cap' },
      bbox: { x: 50, y: 50 },
    });
    expect(sym.info.name).toBe('Cap');
    expect(sym.bbox.x).toBe(50);
  });

  it('maps pins array', () => {
    const sym = new EeSymbol({
      info: {},
      bbox: { x: 0, y: 0 },
      pins: [
        {
          settings: { is_displayed: 'show', type: '0', spice_pin_number: 1 },
          pin_dot: { dot_x: 0, dot_y: 0 },
          pin_path: { path: 'M0 0', color: '#000' },
          name: { text: 'Pin1' },
          dot: { is_displayed: '0', circle_x: 0, circle_y: 0 },
          clock: { is_displayed: '0', path: '' },
        },
      ],
    });
    expect(sym.pins).toHaveLength(1);
    expect(sym.pins[0].name.text).toBe('Pin1');
  });
});

describe('EeFootprintBbox', () => {
  it('constructs and converts to mm', () => {
    const b = new EeFootprintBbox({ x: 100, y: 200 });
    b.convert_to_mm();
    expect(b.x).toBeCloseTo(25.4, 1);
    expect(b.y).toBeCloseTo(50.8, 1);
  });
});

describe('EeFootprintPad', () => {
  it('constructs and converts to mm', () => {
    const pad = new EeFootprintPad({
      shape: 'RECT',
      center_x: 10,
      center_y: 20,
      width: 5,
      height: 3,
      layer_id: 1,
      net: 0,
      number: 1,
      hole_radius: 1,
      points: '',
      rotation: 0,
      id: 1,
      hole_length: 0,
      hole_point: '',
      is_plated: true,
      is_locked: false,
    });
    expect(pad.shape).toBe('RECT');
    pad.convert_to_mm();
    expect(pad.center_x).toBeCloseTo(convertToMm(10), 5);
    expect(pad.width).toBeCloseTo(convertToMm(5), 5);
  });
});

describe('EeFootprintTrack', () => {
  it('constructs and converts to mm', () => {
    const t = new EeFootprintTrack({
      stroke_width: 2,
      layer_id: 1,
      net: 0,
      points: '0 0 10 10',
      id: 1,
      is_locked: false,
    });
    t.convert_to_mm();
    expect(t.stroke_width).toBeCloseTo(convertToMm(2), 5);
  });
});

describe('EeFootprintHole', () => {
  it('constructs and converts to mm', () => {
    const h = new EeFootprintHole({
      center_x: 5,
      center_y: 10,
      radius: 2,
      id: 1,
      is_locked: false,
    });
    h.convert_to_mm();
    expect(h.center_x).toBeCloseTo(convertToMm(5), 5);
    expect(h.radius).toBeCloseTo(convertToMm(2), 5);
  });
});

describe('EeFootprintVia', () => {
  it('constructs and converts to mm', () => {
    const v = new EeFootprintVia({
      center_x: 3,
      center_y: 4,
      diameter: 6,
      net: 0,
      radius: 1,
      id: 1,
      is_locked: false,
    });
    v.convert_to_mm();
    expect(v.center_x).toBeCloseTo(convertToMm(3), 5);
    expect(v.diameter).toBeCloseTo(convertToMm(6), 5);
  });
});

describe('EeFootprintCircle', () => {
  it('constructs and converts to mm', () => {
    const c = new EeFootprintCircle({
      cx: 10,
      cy: 20,
      radius: 5,
      stroke_width: 1,
      layer_id: 1,
      id: 1,
      is_locked: false,
    });
    c.convert_to_mm();
    expect(c.cx).toBeCloseTo(convertToMm(10), 5);
    expect(c.radius).toBeCloseTo(convertToMm(5), 5);
  });
});

describe('EeFootprintRectangle', () => {
  it('constructs and converts to mm', () => {
    const r = new EeFootprintRectangle({
      x: 1,
      y: 2,
      width: 10,
      height: 20,
      stroke_width: 1,
      id: 1,
      layer_id: 1,
      is_locked: false,
    });
    r.convert_to_mm();
    expect(r.x).toBeCloseTo(convertToMm(1), 5);
    expect(r.width).toBeCloseTo(convertToMm(10), 5);
  });
});

describe('EeFootprintArc', () => {
  it('constructs with data', () => {
    const a = new EeFootprintArc({
      stroke_width: 1,
      layer_id: 1,
      net: 0,
      path: 'M0 0A5 5',
      helper_dots: '',
      id: 1,
      is_locked: false,
    });
    expect(a.path).toBe('M0 0A5 5');
  });
});

describe('EeFootprintText', () => {
  it('constructs and converts to mm', () => {
    const t = new EeFootprintText({
      type: 'T',
      center_x: 10,
      center_y: 20,
      stroke_width: 1,
      rotation: 0,
      miror: 0,
      layer_id: 1,
      net: 0,
      font_size: 5,
      text: 'REF',
      text_path: '',
      is_displayed: 'show',
      id: 1,
      is_locked: false,
    });
    t.convert_to_mm();
    expect(t.center_x).toBeCloseTo(convertToMm(10), 5);
    expect(t.font_size).toBeCloseTo(convertToMm(5), 5);
  });
});

describe('EeFootprintInfo', () => {
  it('constructs with data', () => {
    const info = new EeFootprintInfo({ name: 'SOIC-8', fp_type: 'smd' });
    expect(info.name).toBe('SOIC-8');
    expect(info.fp_type).toBe('smd');
  });
});

describe('Ee3dModelBase', () => {
  it('defaults to 0', () => {
    const b = new Ee3dModelBase();
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
    expect(b.z).toBe(0);
  });

  it('constructs with values', () => {
    const b = new Ee3dModelBase({ x: 1, y: 2, z: 3 });
    expect(b.x).toBe(1);
    expect(b.y).toBe(2);
    expect(b.z).toBe(3);
  });

  it('converts to mm', () => {
    const b = new Ee3dModelBase({ x: 10, y: 20, z: 30 });
    b.convert_to_mm();
    expect(b.x).toBeCloseTo(convertToMm(10), 5);
  });
});

describe('Ee3dModel', () => {
  it('constructs with full data', () => {
    const m = new Ee3dModel({
      name: 'model1',
      uuid: 'abc',
      translation: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 90, z: 0 },
      raw_obj: 'v 0 0 0',
      step: 'step data',
    });
    expect(m.name).toBe('model1');
    expect(m.raw_obj).toBe('v 0 0 0');
    expect(m.step).toBe('step data');
    expect(m.translation.x).toBe(1);
    expect(m.rotation.y).toBe(90);
  });

  it('converts to mm only translation', () => {
    const m = new Ee3dModel({
      name: 'test',
      uuid: 'x',
      translation: { x: 100, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    });
    m.convert_to_mm();
    expect(m.translation.x).toBeCloseTo(convertToMm(100), 5);
  });
});

describe('ee_footprint', () => {
  it('constructs with all arrays', () => {
    const fp = new ee_footprint({
      info: { name: 'QFP', fp_type: 'smd' },
      bbox: { x: 0, y: 0 },
      pads: [],
      tracks: [],
      holes: [],
      vias: [],
      circles: [],
      arcs: [],
      rectangles: [],
      texts: [],
    });
    expect(fp.info.name).toBe('QFP');
    expect(fp.pads).toEqual([]);
  });

  it('constructs with model_3d', () => {
    const fp = new ee_footprint({
      info: { name: 'BGA', fp_type: 'smd' },
      bbox: { x: 0, y: 0 },
      model_3d: { name: '3d', uuid: 'u1' },
    });
    expect(fp.model_3d).not.toBeNull();
    expect(fp.model_3d!.name).toBe('3d');
  });

  it('model_3d is null when not provided', () => {
    const fp = new ee_footprint({
      info: { name: 'DIP', fp_type: 'tht' },
      bbox: { x: 0, y: 0 },
    });
    expect(fp.model_3d).toBeNull();
  });
});
