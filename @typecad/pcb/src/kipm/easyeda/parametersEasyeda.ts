import { parseSvgPath as parse_svg_path } from './svgPathParser.js';
import type { SvgPathMoveTo, SvgPathLineTo, SvgPathEllipticalArc, SvgPathClosePath } from './svgPathParser.js';
import type { EasyedaRawData } from '../types.js';

type SvgPathElement = SvgPathMoveTo | SvgPathLineTo | SvgPathEllipticalArc | SvgPathClosePath;

interface BoundingBox3d {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

const EasyedaPinType = {
  unspecified: 0,
  _input: 1,
  output: 2,
  bidirectional: 3,
  power: 4,
} as const;
Object.freeze(EasyedaPinType);

class EeSymbolBbox {
  constructor({ x, y }: { x?: number | string; y?: number | string }) {
    this.x = x!;
    this.y = y!;
  }
  x: number | string;
  y: number | string;
  static get fields() {
    return ['x', 'y'];
  }
}

class EeSymbolPinSettings {
  constructor(data: EasyedaRawData) {
    this.is_displayed = data.is_displayed === 'show' ? true : (data.is_displayed as boolean);
    const t = parseInt((data.type ?? '0') as string, 10);
    this.type = [0, 1, 2, 3, 4].includes(t) ? t : EasyedaPinType.unspecified;
    this.spice_pin_number = data.spice_pin_number as number | string;
    this.pos_x = data.pos_x as number | string;
    this.pos_y = data.pos_y as number | string;
    this.rotation = (data.rotation as number) || 0.0;
    this.id = data.id as number | string;
    this.is_locked = (data.is_locked as boolean) || false;
  }
  is_displayed: boolean;
  type: number;
  spice_pin_number: number | string;
  pos_x: number | string;
  pos_y: number | string;
  rotation: number;
  id: number | string;
  is_locked: boolean;
  static get fields() {
    return ['is_displayed', 'type', 'spice_pin_number', 'pos_x', 'pos_y', 'rotation', 'id', 'is_locked'];
  }
}

class EeSymbolPinDot {
  constructor({ dot_x, dot_y }: { dot_x?: number | string; dot_y?: number | string }) {
    this.dot_x = dot_x!;
    this.dot_y = dot_y!;
  }
  dot_x: number | string;
  dot_y: number | string;
  static get fields() {
    return ['dot_x', 'dot_y'];
  }
}

class EeSymbolPinPath {
  constructor({ path, color }: { path?: string; color?: string }) {
    this.path = path!.replace(/v/g, 'h');
    this.color = color!;
  }
  path: string;
  color: string;
  static get fields() {
    return ['path', 'color'];
  }
}

class EeSymbolPinName {
  constructor(data: EasyedaRawData) {
    this.is_displayed = data.is_displayed === 'show' ? true : (data.is_displayed as boolean);
    this.pos_x = data.pos_x as number | string;
    this.pos_y = data.pos_y as number | string;
    this.rotation = (data.rotation as number) || 0.0;
    this.text = data.text as string;
    this.text_anchor = data.text_anchor as string;
    this.font = data.font as string;
    if (typeof data.font_size === 'string' && data.font_size.includes('pt')) {
      this.font_size = parseFloat(data.font_size.replace('pt', ''));
    } else {
      this.font_size = (data.font_size as number) || 7.0;
    }
  }
  is_displayed: boolean;
  pos_x: number | string;
  pos_y: number | string;
  rotation: number;
  text: string;
  text_anchor: string;
  font: string;
  font_size: number;
  static get fields() {
    return ['is_displayed', 'pos_x', 'pos_y', 'rotation', 'text', 'text_anchor', 'font', 'font_size'];
  }
}

class EeSymbolPinDotBis {
  constructor(data: EasyedaRawData) {
    this.is_displayed = data.is_displayed === 'show' ? true : (data.is_displayed as boolean);
    this.circle_x = data.circle_x as number | string;
    this.circle_y = data.circle_y as number | string;
  }
  is_displayed: boolean;
  circle_x: number | string;
  circle_y: number | string;
  static get fields() {
    return ['is_displayed', 'circle_x', 'circle_y'];
  }
}

class EeSymbolPinClock {
  constructor(data: EasyedaRawData) {
    this.is_displayed = data.is_displayed === 'show' ? true : (data.is_displayed as boolean);
    this.path = data.path as string;
  }
  is_displayed: boolean;
  path: string;
  static get fields() {
    return ['is_displayed', 'path'];
  }
}

class EeSymbolPin {
  constructor({
    settings,
    pin_dot,
    pin_path,
    name,
    dot,
    clock,
  }: {
    settings?: EasyedaRawData;
    pin_dot?: EasyedaRawData;
    pin_path?: EasyedaRawData;
    name?: EasyedaRawData;
    dot?: EasyedaRawData;
    clock?: EasyedaRawData;
  }) {
    this.settings = new EeSymbolPinSettings(settings!);
    this.pin_dot = new EeSymbolPinDot(pin_dot! as Record<string, number | string>);
    this.pin_path = new EeSymbolPinPath(pin_path! as Record<string, string>);
    this.name = new EeSymbolPinName(name!);
    this.dot = new EeSymbolPinDotBis(dot!);
    this.clock = new EeSymbolPinClock(clock!);
  }
  settings: EeSymbolPinSettings;
  pin_dot: EeSymbolPinDot;
  pin_path: EeSymbolPinPath;
  name: EeSymbolPinName;
  dot: EeSymbolPinDotBis;
  clock: EeSymbolPinClock;
}

class EeSymbolRectangle {
  constructor(data: EasyedaRawData) {
    this.pos_x = data.pos_x as number | string;
    this.pos_y = data.pos_y as number | string;
    this.rx = (data.rx as number | string) || null;
    this.ry = (data.ry as number | string) || null;
    this.width = data.width as number | string;
    this.height = data.height as number | string;
    this.stroke_color = data.stroke_color as string;
    this.stroke_width = data.stroke_width as number | string;
    this.stroke_style = data.stroke_style as string;
    this.fill_color = data.fill_color as string;
    this.id = data.id as number | string;
    this.is_locked = data.is_locked as boolean;
  }
  pos_x: number | string;
  pos_y: number | string;
  rx: number | string | null;
  ry: number | string | null;
  width: number | string;
  height: number | string;
  stroke_color: string;
  stroke_width: number | string;
  stroke_style: string;
  fill_color: string;
  id: number | string;
  is_locked: boolean;
  static get fields() {
    return [
      'pos_x',
      'pos_y',
      'rx',
      'ry',
      'width',
      'height',
      'stroke_color',
      'stroke_width',
      'stroke_style',
      'fill_color',
      'id',
      'is_locked',
    ];
  }
}

class EeSymbolCircle {
  constructor(data: EasyedaRawData) {
    this.center_x = data.center_x as number | string;
    this.center_y = data.center_y as number | string;
    this.radius = data.radius as number | string;
    this.stroke_color = data.stroke_color as string;
    this.stroke_width = data.stroke_width as number | string;
    this.stroke_style = data.stroke_style as string;
    this.fill_color = Boolean(data.fill_color) && (data.fill_color as string).toLowerCase() !== 'none';
    this.id = data.id as number | string;
    this.is_locked = (data.is_locked as boolean) || false;
  }
  center_x: number | string;
  center_y: number | string;
  radius: number | string;
  stroke_color: string;
  stroke_width: number | string;
  stroke_style: string;
  fill_color: boolean;
  id: number | string;
  is_locked: boolean;
  static get fields() {
    return [
      'center_x',
      'center_y',
      'radius',
      'stroke_color',
      'stroke_width',
      'stroke_style',
      'fill_color',
      'id',
      'is_locked',
    ];
  }
}

class EeSymbolArc {
  constructor(data: EasyedaRawData) {
    this.path = parse_svg_path(data.path as string);
    this.helper_dots = data.helper_dots as string;
    this.stroke_color = data.stroke_color as string;
    this.stroke_width = data.stroke_width as number | string;
    this.stroke_style = data.stroke_style as string;
    this.fill_color = Boolean(data.fill_color) && (data.fill_color as string).toLowerCase() !== 'none';
    this.id = data.id as number | string;
    this.is_locked = (data.is_locked as boolean) || false;
  }
  path: SvgPathElement[];
  helper_dots: string;
  stroke_color: string;
  stroke_width: number | string;
  stroke_style: string;
  fill_color: boolean;
  id: number | string;
  is_locked: boolean;
  static get fields() {
    return ['path', 'helper_dots', 'stroke_color', 'stroke_width', 'stroke_style', 'fill_color', 'id', 'is_locked'];
  }
}

class EeSymbolEllipse {
  constructor(data: EasyedaRawData) {
    this.center_x = data.center_x as number | string;
    this.center_y = data.center_y as number | string;
    this.radius_x = data.radius_x as number | string;
    this.radius_y = data.radius_y as number | string;
    this.stroke_color = data.stroke_color as string;
    this.stroke_width = data.stroke_width as number | string;
    this.stroke_style = data.stroke_style as string;
    this.fill_color = Boolean(data.fill_color) && (data.fill_color as string).toLowerCase() !== 'none';
    this.id = data.id as number | string;
    this.is_locked = (data.is_locked as boolean) || false;
  }
  center_x: number | string;
  center_y: number | string;
  radius_x: number | string;
  radius_y: number | string;
  stroke_color: string;
  stroke_width: number | string;
  stroke_style: string;
  fill_color: boolean;
  id: number | string;
  is_locked: boolean;
  static get fields() {
    return [
      'center_x',
      'center_y',
      'radius_x',
      'radius_y',
      'stroke_color',
      'stroke_width',
      'stroke_style',
      'fill_color',
      'id',
      'is_locked',
    ];
  }
}

class EeSymbolPolyline {
  constructor(data: EasyedaRawData) {
    this.points = data.points as string;
    this.stroke_color = data.stroke_color as string;
    this.stroke_width = data.stroke_width as number | string;
    this.stroke_style = data.stroke_style as string;
    this.fill_color = Boolean(data.fill_color) && (data.fill_color as string).toLowerCase() !== 'none';
    this.id = data.id as number | string;
    this.is_locked = (data.is_locked as boolean) || false;
  }
  points: string;
  stroke_color: string;
  stroke_width: number | string;
  stroke_style: string;
  fill_color: boolean;
  id: number | string;
  is_locked: boolean;
  static get fields() {
    return ['points', 'stroke_color', 'stroke_width', 'stroke_style', 'fill_color', 'id', 'is_locked'];
  }
}

class EeSymbolPolygon extends EeSymbolPolyline {
  constructor(data: EasyedaRawData) {
    super(data);
  }
  static get fields() {
    return EeSymbolPolyline.fields;
  }
}

class EeSymbolPath {
  constructor(data: EasyedaRawData) {
    this.paths = data.paths as string;
    this.stroke_color = data.stroke_color as string;
    this.stroke_width = data.stroke_width as number | string;
    this.stroke_style = data.stroke_style as string;
    this.fill_color = Boolean(data.fill_color) && (data.fill_color as string).toLowerCase() !== 'none';
    this.id = data.id as number | string;
    this.is_locked = (data.is_locked as boolean) || false;
  }
  paths: string;
  stroke_color: string;
  stroke_width: number | string;
  stroke_style: string;
  fill_color: boolean;
  id: number | string;
  is_locked: boolean;
  static get fields() {
    return ['paths', 'stroke_color', 'stroke_width', 'stroke_style', 'fill_color', 'id', 'is_locked'];
  }
}

class EeSymbolInfo {
  constructor({
    name = '',
    prefix = '',
    package: pkg = '',
    manufacturer = '',
    datasheet = '',
    lcsc_id = '',
    jlc_id = '',
  }: {
    name?: string;
    prefix?: string;
    package?: string;
    manufacturer?: string;
    datasheet?: string;
    lcsc_id?: string;
    jlc_id?: string;
  } = {}) {
    this.name = name;
    this.prefix = prefix;
    this.package = pkg;
    this.manufacturer = manufacturer;
    this.datasheet = datasheet;
    this.lcsc_id = lcsc_id;
    this.jlc_id = jlc_id;
  }
  name: string;
  prefix: string;
  package: string;
  manufacturer: string;
  datasheet: string;
  lcsc_id: string;
  jlc_id: string;
  static get fields() {
    return ['name', 'prefix', 'package', 'manufacturer', 'datasheet', 'lcsc_id', 'jlc_id'];
  }
}

class EeSymbol {
  constructor({
    info,
    bbox,
    pins = [],
    rectangles = [],
    circles = [],
    arcs = [],
    ellipses = [],
    polylines = [],
    polygons = [],
    paths = [],
  }: {
    info?: EasyedaRawData;
    bbox?: EasyedaRawData;
    pins?: EasyedaRawData[];
    rectangles?: EasyedaRawData[];
    circles?: EasyedaRawData[];
    arcs?: EasyedaRawData[];
    ellipses?: EasyedaRawData[];
    polylines?: EasyedaRawData[];
    polygons?: EasyedaRawData[];
    paths?: EasyedaRawData[];
  } = {}) {
    this.info = new EeSymbolInfo(info!);
    this.bbox = new EeSymbolBbox(bbox! as Record<string, number | string>);
    this.pins = pins.map((p) => new EeSymbolPin(p));
    this.rectangles = rectangles.map((r) => new EeSymbolRectangle(r));
    this.circles = circles.map((c) => new EeSymbolCircle(c));
    this.arcs = arcs.map((a) => new EeSymbolArc(a));
    this.ellipses = ellipses.map((e) => new EeSymbolEllipse(e));
    this.polylines = polylines.map((p) => new EeSymbolPolyline(p));
    this.polygons = polygons.map((p) => new EeSymbolPolygon(p));
    this.paths = paths.map((p) => new EeSymbolPath(p));
  }
  info: EeSymbolInfo;
  bbox: EeSymbolBbox;
  pins: EeSymbolPin[];
  rectangles: EeSymbolRectangle[];
  circles: EeSymbolCircle[];
  arcs: EeSymbolArc[];
  ellipses: EeSymbolEllipse[];
  polylines: EeSymbolPolyline[];
  polygons: EeSymbolPolygon[];
  paths: EeSymbolPath[];
}

function convertToMm(dim: number | string): number {
  return Number(dim) * 10 * 0.0254;
}

class EeFootprintBbox {
  constructor({ x, y }: { x?: number | string; y?: number | string }) {
    this.x = x!;
    this.y = y!;
  }
  x: number | string;
  y: number | string;
  convert_to_mm() {
    this.x = convertToMm(this.x);
    this.y = convertToMm(this.y);
  }
  static get fields() {
    return ['x', 'y'];
  }
}

class EeFootprintPad {
  constructor(data: EasyedaRawData) {
    this.shape = data.shape as string;
    this.center_x = data.center_x as number | string;
    this.center_y = data.center_y as number | string;
    this.width = data.width as number | string;
    this.height = data.height as number | string;
    this.layer_id = data.layer_id as number | string;
    this.net = data.net as number | string;
    this.number = data.number as number | string;
    this.hole_radius = data.hole_radius as number | string;
    this.points = data.points as string;
    this.rotation = (data.rotation as number) || 0.0;
    this.id = data.id as number | string;
    this.hole_length = data.hole_length as number | string;
    this.hole_point = data.hole_point as string;
    this.is_plated = data.is_plated as boolean;
    this.is_locked = (data.is_locked as boolean) || false;
  }
  shape: string;
  center_x: number | string;
  center_y: number | string;
  width: number | string;
  height: number | string;
  layer_id: number | string;
  net: number | string;
  number: number | string;
  hole_radius: number | string;
  points: string;
  rotation: number;
  id: number | string;
  hole_length: number | string;
  hole_point: string;
  is_plated: boolean;
  is_locked: boolean;
  convert_to_mm() {
    this.center_x = convertToMm(this.center_x);
    this.center_y = convertToMm(this.center_y);
    this.width = convertToMm(this.width);
    this.height = convertToMm(this.height);
    this.hole_radius = convertToMm(this.hole_radius);
    this.hole_length = convertToMm(this.hole_length);
  }
  static get fields() {
    return [
      'shape',
      'center_x',
      'center_y',
      'width',
      'height',
      'layer_id',
      'net',
      'number',
      'hole_radius',
      'points',
      'rotation',
      'id',
      'hole_length',
      'hole_point',
      'is_plated',
      'is_locked',
    ];
  }
}

class EeFootprintTrack {
  constructor(data: EasyedaRawData) {
    this.stroke_width = data.stroke_width as number | string;
    this.layer_id = data.layer_id as number | string;
    this.net = data.net as number | string;
    this.points = data.points as string;
    this.id = data.id as number | string;
    this.is_locked = (data.is_locked as boolean) || false;
  }
  stroke_width: number | string;
  layer_id: number | string;
  net: number | string;
  points: string;
  id: number | string;
  is_locked: boolean;
  convert_to_mm() {
    this.stroke_width = convertToMm(this.stroke_width);
  }
  static get fields() {
    return ['stroke_width', 'layer_id', 'net', 'points', 'id', 'is_locked'];
  }
}

class EeFootprintHole {
  constructor(data: EasyedaRawData) {
    this.center_x = data.center_x as number | string;
    this.center_y = data.center_y as number | string;
    this.radius = data.radius as number | string;
    this.id = data.id as number | string;
    this.is_locked = (data.is_locked as boolean) || false;
  }
  center_x: number | string;
  center_y: number | string;
  radius: number | string;
  id: number | string;
  is_locked: boolean;
  convert_to_mm() {
    this.center_x = convertToMm(this.center_x);
    this.center_y = convertToMm(this.center_y);
    this.radius = convertToMm(this.radius);
  }
  static get fields() {
    return ['center_x', 'center_y', 'radius', 'id', 'is_locked'];
  }
}

class EeFootprintVia {
  constructor(data: EasyedaRawData) {
    this.center_x = data.center_x as number | string;
    this.center_y = data.center_y as number | string;
    this.diameter = data.diameter as number | string;
    this.net = data.net as number | string;
    this.radius = data.radius as number | string;
    this.id = data.id as number | string;
    this.is_locked = (data.is_locked as boolean) || false;
  }
  center_x: number | string;
  center_y: number | string;
  diameter: number | string;
  net: number | string;
  radius: number | string;
  id: number | string;
  is_locked: boolean;
  convert_to_mm() {
    this.center_x = convertToMm(this.center_x);
    this.center_y = convertToMm(this.center_y);
    this.radius = convertToMm(this.radius);
    this.diameter = convertToMm(this.diameter);
  }
  static get fields() {
    return ['center_x', 'center_y', 'diameter', 'net', 'radius', 'id', 'is_locked'];
  }
}

class EeFootprintCircle {
  constructor(data: EasyedaRawData) {
    this.cx = data.cx as number | string;
    this.cy = data.cy as number | string;
    this.radius = data.radius as number | string;
    this.stroke_width = data.stroke_width as number | string;
    this.layer_id = data.layer_id as number | string;
    this.id = data.id as number | string;
    this.is_locked = (data.is_locked as boolean) || false;
  }
  cx: number | string;
  cy: number | string;
  radius: number | string;
  stroke_width: number | string;
  layer_id: number | string;
  id: number | string;
  is_locked: boolean;
  convert_to_mm() {
    this.cx = convertToMm(this.cx);
    this.cy = convertToMm(this.cy);
    this.radius = convertToMm(this.radius);
    this.stroke_width = convertToMm(this.stroke_width);
  }
  static get fields() {
    return ['cx', 'cy', 'radius', 'stroke_width', 'layer_id', 'id', 'is_locked'];
  }
}

class EeFootprintRectangle {
  constructor(data: EasyedaRawData) {
    this.x = data.x as number | string;
    this.y = data.y as number | string;
    this.width = data.width as number | string;
    this.height = data.height as number | string;
    this.stroke_width = data.stroke_width as number | string;
    this.id = data.id as number | string;
    this.layer_id = data.layer_id as number | string;
    this.is_locked = data.is_locked as boolean;
  }
  x: number | string;
  y: number | string;
  width: number | string;
  height: number | string;
  stroke_width: number | string;
  id: number | string;
  layer_id: number | string;
  is_locked: boolean;
  convert_to_mm() {
    this.x = convertToMm(this.x);
    this.y = convertToMm(this.y);
    this.width = convertToMm(this.width);
    this.height = convertToMm(this.height);
    this.stroke_width = convertToMm(this.stroke_width);
  }
  static get fields() {
    return ['x', 'y', 'width', 'height', 'stroke_width', 'id', 'layer_id', 'is_locked'];
  }
}

class EeFootprintArc {
  constructor(data: EasyedaRawData) {
    this.stroke_width = data.stroke_width as number | string;
    this.layer_id = data.layer_id as number | string;
    this.net = data.net as number | string;
    this.path = data.path as string;
    this.helper_dots = data.helper_dots as string;
    this.id = data.id as number | string;
    this.is_locked = data.is_locked as boolean;
  }
  stroke_width: number | string;
  layer_id: number | string;
  net: number | string;
  path: string;
  helper_dots: string;
  id: number | string;
  is_locked: boolean;
  static get fields() {
    return ['stroke_width', 'layer_id', 'net', 'path', 'helper_dots', 'id', 'is_locked'];
  }
}

class EeFootprintText {
  constructor(data: EasyedaRawData) {
    this.type = data.type as string;
    this.center_x = data.center_x as number | string;
    this.center_y = data.center_y as number | string;
    this.stroke_width = data.stroke_width as number | string;
    this.rotation = data.rotation as number | string;
    this.miror = data.miror as number | string;
    this.layer_id = data.layer_id as number | string;
    this.net = data.net as number | string;
    this.font_size = data.font_size as number | string;
    this.text = data.text as string;
    this.text_path = data.text_path as string;
    this.is_displayed = data.is_displayed as string;
    this.id = data.id as number | string;
    this.is_locked = data.is_locked as boolean;
  }
  type: string;
  center_x: number | string;
  center_y: number | string;
  stroke_width: number | string;
  rotation: number | string;
  miror: number | string;
  layer_id: number | string;
  net: number | string;
  font_size: number | string;
  text: string;
  text_path: string;
  is_displayed: string;
  id: number | string;
  is_locked: boolean;
  convert_to_mm() {
    this.center_x = convertToMm(this.center_x);
    this.center_y = convertToMm(this.center_y);
    this.stroke_width = convertToMm(this.stroke_width);
    this.font_size = convertToMm(this.font_size);
  }
  static get fields() {
    return [
      'type',
      'center_x',
      'center_y',
      'stroke_width',
      'rotation',
      'miror',
      'layer_id',
      'net',
      'font_size',
      'text',
      'text_path',
      'is_displayed',
      'id',
      'is_locked',
    ];
  }
}

class EeFootprintInfo {
  constructor({
    name,
    fp_type,
    model_3d_name,
  }: {
    name?: number | string;
    fp_type?: number | string;
    model_3d_name?: number | string;
  }) {
    this.name = name!;
    this.fp_type = fp_type!;
    this.model_3d_name = model_3d_name!;
  }
  name: number | string;
  fp_type: number | string;
  model_3d_name: number | string;
  static get fields() {
    return ['name', 'fp_type', 'model_3d_name'];
  }
}

class Ee3dModelBase {
  constructor({ x = 0.0, y = 0.0, z = 0.0 }: { x?: number | string; y?: number | string; z?: number | string } = {}) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  x: number | string;
  y: number | string;
  z: number | string;
  convert_to_mm() {
    this.x = convertToMm(this.x);
    this.y = convertToMm(this.y);
    this.z = convertToMm(this.z);
  }
  static get fields() {
    return ['x', 'y', 'z'];
  }
}

class Ee3dModel {
  constructor({
    name,
    uuid,
    translation,
    rotation,
    raw_obj = null,
    step = null,
  }: {
    name?: string;
    uuid?: string;
    translation?: EasyedaRawData;
    rotation?: EasyedaRawData;
    raw_obj?: string | null;
    step?: string | null;
  }) {
    this.name = name!;
    this.uuid = uuid!;
    this.translation = new Ee3dModelBase(translation! as Record<string, number | string>);
    this.rotation = new Ee3dModelBase(rotation as Record<string, number | string>);
    this.raw_obj = raw_obj;
    this.step = step;
  }
  name: string;
  uuid: string;
  translation: Ee3dModelBase;
  rotation: Ee3dModelBase;
  raw_obj: string | null;
  step: string | null;
  boundingBox?: BoundingBox3d;
  convert_to_mm() {
    this.translation.convert_to_mm();
  }
  static get fields() {
    return ['name', 'uuid', 'translation', 'rotation', 'raw_obj', 'step'];
  }
}

class ee_footprint {
  constructor({
    info,
    bbox,
    model_3d,
    pads = [],
    tracks = [],
    holes = [],
    vias = [],
    circles = [],
    arcs = [],
    rectangles = [],
    texts = [],
  }: {
    info?: EasyedaRawData;
    bbox?: EasyedaRawData;
    model_3d?: EasyedaRawData;
    pads?: EasyedaRawData[];
    tracks?: EasyedaRawData[];
    holes?: EasyedaRawData[];
    vias?: EasyedaRawData[];
    circles?: EasyedaRawData[];
    arcs?: EasyedaRawData[];
    rectangles?: EasyedaRawData[];
    texts?: EasyedaRawData[];
  }) {
    this.info = new EeFootprintInfo(info!);
    this.bbox = new EeFootprintBbox(bbox! as Record<string, number | string>);
    this.model_3d = model_3d ? new Ee3dModel(model_3d) : null;
    this.pads = pads.map((p) => new EeFootprintPad(p));
    this.tracks = tracks.map((t) => new EeFootprintTrack(t));
    this.holes = holes.map((h) => new EeFootprintHole(h));
    this.vias = vias.map((v) => new EeFootprintVia(v));
    this.circles = circles.map((c) => new EeFootprintCircle(c));
    this.arcs = arcs.map((a) => new EeFootprintArc(a));
    this.rectangles = rectangles.map((r) => new EeFootprintRectangle(r));
    this.texts = texts.map((t) => new EeFootprintText(t));
  }
  info: EeFootprintInfo;
  bbox: EeFootprintBbox;
  model_3d: Ee3dModel | null;
  pads: EeFootprintPad[];
  tracks: EeFootprintTrack[];
  holes: EeFootprintHole[];
  vias: EeFootprintVia[];
  circles: EeFootprintCircle[];
  arcs: EeFootprintArc[];
  rectangles: EeFootprintRectangle[];
  texts: EeFootprintText[];
}

export {
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
  convertToMm,
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
};
