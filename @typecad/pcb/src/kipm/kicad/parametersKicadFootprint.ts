import type { EasyedaRawData } from '../types.js';

export const KI_MODULE_INFO = '(module {package_lib}:{package_name} (layer F.Cu) (tedit {edit})\n';
export const KI_DESCRIPTION = `\t(descr "{datasheet_link}, generated with easyeda2kicad.py on {date}")\n`;
export const KI_TAGS_INFO = `\t(tags "{tag}")\n`;
export const KI_FP_TYPE = '\t(attr {component_type})\n';
export const KI_REFERENCE = `\t(fp_text reference REF** (at {pos_x} {pos_y}) (layer F.SilkS)
\t\t(effects (font (size 1 1) (thickness 0.15)))
\t)\n`;
export const KI_PACKAGE_VALUE = `\t(fp_text value {package_name} (at {pos_x} {pos_y}) (layer F.Fab)
\t\t(effects (font (size 1 1) (thickness 0.15)))
\t)\n`;
export const KI_FAB_REF = `\t(fp_text user %R (at 0 0) (layer F.Fab)
\t\t(effects (font (size 1 1) (thickness 0.15)))
\t)\n`;
export const KI_END_FILE = ')';

export const KI_PAD = `\t(pad {number} {type} {shape} (at {pos_x:.2f} {pos_y:.2f} {orientation:.2f}) (size {width:.2f} {height:.2f}) (layers {layers}){drill}{polygon})\n`;
export const KI_LINE = `\t(fp_line (start {start_x:.2f} {start_y:.2f}) (end {end_x:.2f} {end_y:.2f}) (layer {layers}) (width {stroke_width:.2f}))\n`;
export const KI_HOLE = `\t(pad "" thru_hole circle (at {pos_x:.2f} {pos_y:.2f}) (size {size:.2f} {size:.2f}) (drill {size:.2f}) (layers *.Cu *.Mask))\n`;
export const KI_VIA = `\t(pad "" thru_hole circle (at {pos_x:.2f} {pos_y:.2f}) (size {diameter:.2f} {diameter:.2f}) (drill {size:.2f}) (layers *.Cu *.Paste *.Mask))\n`;
export const KI_CIRCLE = `\t(fp_circle (center {cx:.2f} {cy:.2f}) (end {end_x:.2f} {end_y:.2f}) (layer {layers}) (width {stroke_width:.2f}))\n`;
export const KI_ARC = `\t(fp_arc (start {start_x:.2f} {start_y:.2f}) (end {end_x:.2f} {end_y:.2f}) (angle {angle:.2f}) (layer {layers}) (width {stroke_width:.2f}))\n`;
export const KI_TEXT = `\t(fp_text user {text} (at {pos_x:.2f} {pos_y:.2f} {orientation:.2f}) (layer {layers}){display}\n\t\t(effects (font (size {font_size:.2f} {font_size:.2f}) (thickness {thickness:.2f})) (justify left{mirror}))\n\t)\n`;
export const KI_MODEL_3D = `\t(model "{file_3d}"\n\t\t(offset (xyz {pos_x:.3f} {pos_y:.3f} {pos_z:.3f}))\n\t\t(scale (xyz 1 1 1))\n\t\t(rotate (xyz {rot_x:.0f} {rot_y:.0f} {rot_z:.0f}))\n\t)\n`;
export const KI_RECT = `\t(fp_rect (start {start_x:.2f} {start_y:.2f}) (end {end_x:.2f} {end_y:.2f}) (layer {layers}) (width {stroke_width:.2f}))\n`;

export const KI_PAD_SHAPE: Record<string, string> = {
  ELLIPSE: 'circle',
  RECT: 'rect',
  OVAL: 'oval',
  POLYGON: 'custom',
};

export const KI_PAD_LAYER: Record<number, string> = {
  1: 'F.Cu F.Paste F.Mask',
  2: 'B.Cu B.Paste B.Mask',
  3: 'F.SilkS',
  11: '*.Cu *.Paste *.Mask',
  13: 'F.Fab',
  15: 'Dwgs.User',
};

export const KI_PAD_LAYER_THT: Record<number, string> = {
  1: 'F.Cu F.Mask',
  2: 'B.Cu B.Mask',
  3: 'F.SilkS',
  11: '*.Cu *.Mask',
  13: 'F.Fab',
  15: 'Dwgs.User',
};

export const KI_LAYERS: Record<number, string> = {
  1: 'F.Cu',
  2: 'B.Cu',
  3: 'F.SilkS',
  4: 'B.SilkS',
  5: 'F.Paste',
  6: 'B.Paste',
  7: 'F.Mask',
  8: 'B.Mask',
  10: 'Edge.Cuts',
  11: 'Edge.Cuts',
  12: 'Cmts.User',
  13: 'F.Fab',
  14: 'B.Fab',
  15: 'Dwgs.User',
  101: 'F.Fab',
};

function roundFloatValues(obj: object): void {
  const o = obj as Record<string, unknown>;
  for (const key in o) {
    if (Object.prototype.hasOwnProperty.call(o, key)) {
      if (typeof o[key] === 'number') {
        (o as Record<string, unknown>)[key] = Math.round((o[key] as number) * 100) / 100;
      }
    }
  }
}

export class KiFootprintPad {
  type: string;
  shape: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  layers: string;
  number: number | string;
  drill: number | string;
  orientation: number;
  polygon: string;

  constructor({
    type,
    shape,
    pos_x,
    pos_y,
    width,
    height,
    layers,
    number,
    drill,
    orientation,
    polygon,
  }: EasyedaRawData) {
    this.type = type as string;
    this.shape = shape as string;
    this.pos_x = pos_x as number;
    this.pos_y = pos_y as number;
    this.width = width as number;
    this.height = height as number;
    this.layers = layers as string;
    this.number = number as number | string;
    this.drill = drill as number | string;
    this.orientation = orientation as number;
    this.polygon = polygon as string;
    roundFloatValues(this);
  }
}

export class KiFootprintTrack {
  points_start_x: number[];
  points_start_y: number[];
  points_end_x: number[];
  points_end_y: number[];
  stroke_width: number;
  layers: string;

  constructor(data: EasyedaRawData = {}) {
    this.points_start_x = (data.points_start_x ?? []) as number[];
    this.points_start_y = (data.points_start_y ?? []) as number[];
    this.points_end_x = (data.points_end_x ?? []) as number[];
    this.points_end_y = (data.points_end_y ?? []) as number[];
    this.stroke_width = (data.stroke_width ?? 0) as number;
    this.layers = (data.layers ?? '') as string;
  }
}

export class KiFootprintHole {
  pos_x: number;
  pos_y: number;
  size: number;

  constructor({ pos_x, pos_y, size }: EasyedaRawData) {
    this.pos_x = pos_x as number;
    this.pos_y = pos_y as number;
    this.size = size as number;
    roundFloatValues(this);
  }
}

export class KiFootprintCircle {
  cx: number;
  cy: number;
  end_x: number;
  end_y: number;
  layers: string;
  stroke_width: number;

  constructor({ cx, cy, end_x, end_y, layers, stroke_width }: EasyedaRawData) {
    this.cx = cx as number;
    this.cy = cy as number;
    this.end_x = end_x as number;
    this.end_y = end_y as number;
    this.layers = layers as string;
    this.stroke_width = stroke_width as number;
    roundFloatValues(this);
  }
}

export class KiFootprintRectangle extends KiFootprintTrack {
  constructor(options: EasyedaRawData = {}) {
    super(options);
  }
}

export class KiFootprintArc {
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
  angle: number;
  layers: string;
  stroke_width: number;

  constructor({ start_x, start_y, end_x, end_y, angle, layers, stroke_width }: EasyedaRawData) {
    this.start_x = start_x as number;
    this.start_y = start_y as number;
    this.end_x = end_x as number;
    this.end_y = end_y as number;
    this.angle = angle as number;
    this.layers = layers as string;
    this.stroke_width = stroke_width as number;
    roundFloatValues(this);
  }

  getBoundingBox() {
    if (Math.abs(this.angle) >= 359 && Math.abs(this.start_y) === 0) {
      const centerX = this.start_x;
      const centerY = 0;
      const radius = Math.abs(this.end_y);

      const totalRadius = radius + this.stroke_width / 2;

      return {
        min_x: centerX - totalRadius,
        max_x: centerX + totalRadius,
        min_y: centerY - totalRadius,
        max_y: centerY + totalRadius,
      };
    }

    const dx = this.end_x - this.start_x;
    const dy = this.end_y - this.start_y;
    const angleRad = ((this.angle / 10) * Math.PI) / 180;

    const chord = Math.sqrt(dx * dx + dy * dy);
    const radius = chord / (2 * Math.sin(angleRad / 2));

    const points: number[][] = [
      [this.start_x, this.start_y],
      [this.end_x, this.end_y],
    ];

    const minX = Math.min(...points.map((p) => p[0]));
    const maxX = Math.max(...points.map((p) => p[0]));
    const minY = Math.min(...points.map((p) => p[1]));
    const maxY = Math.max(...points.map((p) => p[1]));

    return {
      min_x: minX,
      max_x: maxX,
      min_y: minY,
      max_y: maxY,
    };
  }
}

export class KiFootprintText {
  pos_x: number;
  pos_y: number;
  orientation: number;
  text: string;
  layers: string;
  font_size: number;
  thickness: number;
  display: string;
  mirror: string;

  constructor({ pos_x, pos_y, orientation, text, layers, font_size, thickness, display, mirror }: EasyedaRawData) {
    this.pos_x = pos_x as number;
    this.pos_y = pos_y as number;
    this.orientation = orientation as number;
    this.text = text as string;
    this.layers = layers as string;
    this.font_size = font_size as number;
    this.thickness = thickness as number;
    this.display = display as string;
    this.mirror = mirror as string;
    roundFloatValues(this);
  }
}

export class KiFootprintVia {
  pos_x: number;
  pos_y: number;
  size: number;
  diameter: number;

  constructor({ pos_x, pos_y, size, diameter }: EasyedaRawData) {
    this.pos_x = pos_x as number;
    this.pos_y = pos_y as number;
    this.size = size as number;
    this.diameter = diameter as number;
    roundFloatValues(this);
  }
}

export class KiFootprintSolidRegion {
  name: string;

  constructor({ name = '' }: EasyedaRawData = {}) {
    this.name = name as string;
  }
}

export class KiFootprintCopperArea {
  name: string;

  constructor({ name = '' }: EasyedaRawData = {}) {
    this.name = name as string;
  }
}

export class KiFootprintInfo {
  name: string;
  fp_type: string;

  constructor({ name, fp_type }: EasyedaRawData) {
    this.name = name as string;
    this.fp_type = fp_type as string;
  }
}

export class Ki3dModelBase {
  x: number;
  y: number;
  z: number;

  constructor({ x = 0.0, y = 0.0, z = 0.0 }: EasyedaRawData = {}) {
    this.x = x as number;
    this.y = y as number;
    this.z = z as number;
  }
}

export class Ki3dModel {
  name: string;
  translation: Ki3dModelBase | null;
  rotation: Ki3dModelBase | null;
  raw_wrl: string | null;

  constructor({
    name,
    translation,
    rotation,
    raw_wrl = null,
  }: {
    name: string;
    translation: Ki3dModelBase | null;
    rotation: Ki3dModelBase | null;
    raw_wrl?: string | null;
  }) {
    this.name = name;
    this.translation = translation;
    this.rotation = rotation;
    this.raw_wrl = raw_wrl;
  }
}

export class KiFootprint {
  info: KiFootprintInfo | undefined;
  model_3d: Ki3dModel | null | undefined;
  pads: KiFootprintPad[];
  tracks: KiFootprintTrack[];
  vias: KiFootprintVia[];
  holes: KiFootprintHole[];
  circles: KiFootprintCircle[];
  arcs: KiFootprintArc[];
  rectangles: KiFootprintRectangle[];
  texts: KiFootprintText[];
  solid_regions: KiFootprintSolidRegion[];
  copper_areas: KiFootprintCopperArea[];

  constructor({
    info,
    model_3d,
    pads = [],
    tracks = [],
    vias = [],
    holes = [],
    circles = [],
    arcs = [],
    rectangles = [],
    texts = [],
    solid_regions = [],
    copper_areas = [],
  }: {
    info?: KiFootprintInfo;
    model_3d?: Ki3dModel | null;
    pads?: KiFootprintPad[];
    tracks?: KiFootprintTrack[];
    vias?: KiFootprintVia[];
    holes?: KiFootprintHole[];
    circles?: KiFootprintCircle[];
    arcs?: KiFootprintArc[];
    rectangles?: KiFootprintRectangle[];
    texts?: KiFootprintText[];
    solid_regions?: KiFootprintSolidRegion[];
    copper_areas?: KiFootprintCopperArea[];
  } = {}) {
    this.info = info;
    this.model_3d = model_3d;
    this.pads = pads;
    this.tracks = tracks;
    this.vias = vias;
    this.holes = holes;
    this.circles = circles;
    this.arcs = arcs;
    this.rectangles = rectangles;
    this.texts = texts;
    this.solid_regions = solid_regions;
    this.copper_areas = copper_areas;
  }
}
