import { describe, it, expect } from 'vitest';
import {
  KI_MODULE_INFO,
  KI_DESCRIPTION,
  KI_TAGS_INFO,
  KI_FP_TYPE,
  KI_REFERENCE,
  KI_PACKAGE_VALUE,
  KI_FAB_REF,
  KI_END_FILE,
  KI_PAD,
  KI_LINE,
  KI_HOLE,
  KI_VIA,
  KI_CIRCLE,
  KI_ARC,
  KI_TEXT,
  KI_MODEL_3D,
  KI_RECT,
  KI_PAD_SHAPE,
  KI_PAD_LAYER,
  KI_PAD_LAYER_THT,
  KI_LAYERS,
  KiFootprintPad,
  KiFootprintTrack,
  KiFootprintHole,
  KiFootprintCircle,
  KiFootprintRectangle,
  KiFootprintArc,
  KiFootprintText,
  KiFootprintVia,
  KiFootprintSolidRegion,
  KiFootprintCopperArea,
  KiFootprintInfo,
  Ki3dModelBase,
  Ki3dModel,
  KiFootprint,
} from '../../src/kipm/kicad/parametersKicadFootprint.js';

describe('template constants', () => {
  it('KI_MODULE_INFO contains module placeholder', () => {
    expect(KI_MODULE_INFO).toContain('(module');
  });

  it('KI_PAD contains pad placeholder', () => {
    expect(KI_PAD).toContain('(pad');
  });

  it('KI_LINE contains fp_line', () => {
    expect(KI_LINE).toContain('(fp_line');
  });

  it('KI_HOLE contains thru_hole', () => {
    expect(KI_HOLE).toContain('thru_hole');
  });

  it('KI_CIRCLE contains fp_circle', () => {
    expect(KI_CIRCLE).toContain('(fp_circle');
  });

  it('KI_ARC contains fp_arc', () => {
    expect(KI_ARC).toContain('(fp_arc');
  });

  it('KI_END_FILE is closing paren', () => {
    expect(KI_END_FILE).toBe(')');
  });

  it('KI_MODEL_3D contains model', () => {
    expect(KI_MODEL_3D).toContain('(model');
  });

  it('KI_RECT contains fp_rect', () => {
    expect(KI_RECT).toContain('(fp_rect');
  });
});

describe('KI_PAD_SHAPE', () => {
  it('maps ELLIPSE to circle', () => {
    expect(KI_PAD_SHAPE.ELLIPSE).toBe('circle');
  });

  it('maps RECT to rect', () => {
    expect(KI_PAD_SHAPE.RECT).toBe('rect');
  });

  it('maps OVAL to oval', () => {
    expect(KI_PAD_SHAPE.OVAL).toBe('oval');
  });
});

describe('KI_PAD_LAYER', () => {
  it('maps layer 1 to front copper', () => {
    expect(KI_PAD_LAYER[1]).toBe('F.Cu F.Paste F.Mask');
  });

  it('maps layer 11 to all copper', () => {
    expect(KI_PAD_LAYER[11]).toBe('*.Cu *.Paste *.Mask');
  });
});

describe('KI_LAYERS', () => {
  it('maps layer 1 to F.Cu', () => {
    expect(KI_LAYERS[1]).toBe('F.Cu');
  });

  it('maps layer 10 to Edge.Cuts', () => {
    expect(KI_LAYERS[10]).toBe('Edge.Cuts');
  });

  it('maps layer 3 to F.SilkS', () => {
    expect(KI_LAYERS[3]).toBe('F.SilkS');
  });
});

describe('KiFootprintPad', () => {
  it('constructs and rounds values', () => {
    const pad = new KiFootprintPad({
      type: 'smd',
      shape: 'rect',
      pos_x: 1.23456,
      pos_y: 2.34567,
      width: 3.456,
      height: 4.567,
      layers: 'F.Cu',
      number: 1,
      drill: 0,
      orientation: 0,
      polygon: '',
    });
    expect(pad.pos_x).toBe(1.23);
    expect(pad.type).toBe('smd');
  });
});

describe('KiFootprintTrack', () => {
  it('constructs with defaults', () => {
    const t = new KiFootprintTrack();
    expect(t.points_start_x).toEqual([]);
    expect(t.stroke_width).toBe(0);
  });

  it('constructs with data', () => {
    const t = new KiFootprintTrack({
      points_start_x: [1, 2],
      points_start_y: [3, 4],
      points_end_x: [5, 6],
      points_end_y: [7, 8],
      stroke_width: 0.25,
      layers: 'F.SilkS',
    });
    expect(t.points_start_x).toEqual([1, 2]);
    expect(t.layers).toBe('F.SilkS');
  });
});

describe('KiFootprintHole', () => {
  it('constructs and rounds', () => {
    const h = new KiFootprintHole({ pos_x: 1.555, pos_y: 2.666, size: 3.777 });
    expect(h.pos_x).toBe(1.56);
    expect(h.pos_y).toBe(2.67);
    expect(h.size).toBe(3.78);
  });
});

describe('KiFootprintCircle', () => {
  it('constructs and rounds', () => {
    const c = new KiFootprintCircle({
      cx: 1.111,
      cy: 2.222,
      end_x: 3.333,
      end_y: 4.444,
      layers: 'F.SilkS',
      stroke_width: 0.555,
    });
    expect(c.cx).toBe(1.11);
    expect(c.layers).toBe('F.SilkS');
  });
});

describe('KiFootprintRectangle', () => {
  it('extends KiFootprintTrack', () => {
    const r = new KiFootprintRectangle({
      points_start_x: [0],
      points_start_y: [0],
      points_end_x: [10],
      points_end_y: [10],
      layers: 'F.Cu',
      stroke_width: 0.1,
    });
    expect(r.points_start_x).toEqual([0]);
    expect(r).toBeInstanceOf(KiFootprintTrack);
  });
});

describe('KiFootprintArc', () => {
  it('constructs and rounds', () => {
    const a = new KiFootprintArc({
      start_x: 1.234,
      start_y: 2.345,
      end_x: 3.456,
      end_y: 4.567,
      angle: 90.0,
      layers: 'F.SilkS',
      stroke_width: 0.1,
    });
    expect(a.start_x).toBe(1.23);
    expect(a.angle).toBe(90);
  });

  it('getBoundingBox for near-full circle', () => {
    const a = new KiFootprintArc({
      start_x: 5,
      start_y: 0,
      end_x: 0,
      end_y: 3,
      angle: 359,
      layers: 'F.SilkS',
      stroke_width: 0.2,
    });
    const bb = a.getBoundingBox();
    expect(bb.min_x).toBeLessThan(bb.max_x);
    expect(bb.min_y).toBeLessThan(bb.max_y);
  });

  it('getBoundingBox for general arc', () => {
    const a = new KiFootprintArc({
      start_x: 0,
      start_y: 0,
      end_x: 10,
      end_y: 10,
      angle: 90,
      layers: 'F.Cu',
      stroke_width: 0.1,
    });
    const bb = a.getBoundingBox();
    expect(bb.min_x).toBe(0);
    expect(bb.max_x).toBe(10);
  });
});

describe('KiFootprintText', () => {
  it('constructs and rounds', () => {
    const t = new KiFootprintText({
      pos_x: 1.555,
      pos_y: 2.666,
      orientation: 0,
      text: 'REF',
      layers: 'F.SilkS',
      font_size: 1.0,
      thickness: 0.15,
      display: '',
      mirror: '',
    });
    expect(t.text).toBe('REF');
    expect(t.pos_x).toBe(1.56);
  });
});

describe('KiFootprintVia', () => {
  it('constructs and rounds', () => {
    const v = new KiFootprintVia({ pos_x: 1.555, pos_y: 2.666, size: 0.8, diameter: 1.2 });
    expect(v.pos_x).toBe(1.56);
    expect(v.diameter).toBe(1.2);
  });
});

describe('KiFootprintSolidRegion', () => {
  it('defaults name to empty', () => {
    const s = new KiFootprintSolidRegion();
    expect(s.name).toBe('');
  });

  it('constructs with name', () => {
    const s = new KiFootprintSolidRegion({ name: 'region1' });
    expect(s.name).toBe('region1');
  });
});

describe('KiFootprintCopperArea', () => {
  it('defaults name to empty', () => {
    const c = new KiFootprintCopperArea();
    expect(c.name).toBe('');
  });
});

describe('KiFootprintInfo', () => {
  it('constructs with data', () => {
    const info = new KiFootprintInfo({ name: 'SOIC-8', fp_type: 'smd' });
    expect(info.name).toBe('SOIC-8');
    expect(info.fp_type).toBe('smd');
  });
});

describe('Ki3dModelBase', () => {
  it('defaults to 0', () => {
    const b = new Ki3dModelBase();
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
    expect(b.z).toBe(0);
  });

  it('constructs with values', () => {
    const b = new Ki3dModelBase({ x: 1, y: 2, z: 3 });
    expect(b.x).toBe(1);
  });
});

describe('Ki3dModel', () => {
  it('constructs with data', () => {
    const m = new Ki3dModel({
      name: 'model',
      translation: new Ki3dModelBase({ x: 1, y: 2, z: 3 }),
      rotation: new Ki3dModelBase({ x: 0, y: 90, z: 0 }),
      raw_wrl: 'VRML data',
    });
    expect(m.name).toBe('model');
    expect(m.raw_wrl).toBe('VRML data');
    expect(m.rotation!.y).toBe(90);
  });

  it('defaults raw_wrl to null', () => {
    const m = new Ki3dModel({
      name: 'x',
      translation: null,
      rotation: null,
    });
    expect(m.raw_wrl).toBeNull();
  });
});

describe('KiFootprint', () => {
  it('constructs with empty defaults', () => {
    const fp = new KiFootprint();
    expect(fp.pads).toEqual([]);
    expect(fp.tracks).toEqual([]);
    expect(fp.arcs).toEqual([]);
    expect(fp.model_3d).toBeUndefined();
  });

  it('constructs with data', () => {
    const info = new KiFootprintInfo({ name: 'QFP', fp_type: 'smd' });
    const fp = new KiFootprint({
      info,
      pads: [
        new KiFootprintPad({
          type: 'smd',
          shape: 'rect',
          pos_x: 0,
          pos_y: 0,
          width: 1,
          height: 1,
          layers: 'F.Cu',
          number: 1,
          drill: 0,
          orientation: 0,
          polygon: '',
        }),
      ],
    });
    expect(fp.info!.name).toBe('QFP');
    expect(fp.pads).toHaveLength(1);
  });

  it('accepts 3d model', () => {
    const model = new Ki3dModel({
      name: 'test',
      translation: null,
      rotation: null,
    });
    const fp = new KiFootprint({ model_3d: model });
    expect(fp.model_3d).not.toBeNull();
    expect(fp.model_3d!.name).toBe('test');
  });
});
