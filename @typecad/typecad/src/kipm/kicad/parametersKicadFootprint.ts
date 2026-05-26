export const KI_MODULE_INFO = "(module {package_lib}:{package_name} (layer F.Cu) (tedit {edit})\n";
export const KI_DESCRIPTION = `\t(descr "{datasheet_link}, generated with easyeda2kicad.py on {date}")\n`;
export const KI_TAGS_INFO = `\t(tags "{tag}")\n`;
export const KI_FP_TYPE = "\t(attr {component_type})\n";
export const KI_REFERENCE = `\t(fp_text reference REF** (at {pos_x} {pos_y}) (layer F.SilkS)
\t\t(effects (font (size 1 1) (thickness 0.15)))
\t)\n`;
export const KI_PACKAGE_VALUE = `\t(fp_text value {package_name} (at {pos_x} {pos_y}) (layer F.Fab)
\t\t(effects (font (size 1 1) (thickness 0.15)))
\t)\n`;
export const KI_FAB_REF = `\t(fp_text user %R (at 0 0) (layer F.Fab)
\t\t(effects (font (size 1 1) (thickness 0.15)))
\t)\n`;
export const KI_END_FILE = ")";

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
    "ELLIPSE": "circle",
    "RECT": "rect",
    "OVAL": "oval",
    "POLYGON": "custom",
};

export const KI_PAD_LAYER: Record<number, string> = {
    1: "F.Cu F.Paste F.Mask",
    2: "B.Cu B.Paste B.Mask",
    3: "F.SilkS",
    11: "*.Cu *.Paste *.Mask",
    13: "F.Fab",
    15: "Dwgs.User",
};

export const KI_PAD_LAYER_THT: Record<number, string> = {
    1: "F.Cu F.Mask",
    2: "B.Cu B.Mask",
    3: "F.SilkS",
    11: "*.Cu *.Mask",
    13: "F.Fab",
    15: "Dwgs.User",
};

export const KI_LAYERS: Record<number, string> = {
    1: "F.Cu",
    2: "B.Cu",
    3: "F.SilkS",
    4: "B.SilkS",
    5: "F.Paste",
    6: "B.Paste",
    7: "F.Mask",
    8: "B.Mask",
    10: "Edge.Cuts",
    11: "Edge.Cuts",
    12: "Cmts.User",
    13: "F.Fab",
    14: "B.Fab",
    15: "Dwgs.User",
    101: "F.Fab",
};

function roundFloatValues(obj: Record<string, any>) {
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (typeof obj[key] === "number") {
                obj[key] = Math.round(obj[key] * 100) / 100;
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
    drill: any;
    orientation: number;
    polygon: any;

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
                }: Record<string, any>) {
        this.type = type;
        this.shape = shape;
        this.pos_x = pos_x;
        this.pos_y = pos_y;
        this.width = width;
        this.height = height;
        this.layers = layers;
        this.number = number;
        this.drill = drill;
        this.orientation = orientation;
        this.polygon = polygon;
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

    constructor({
                    points_start_x = [],
                    points_start_y = [],
                    points_end_x = [],
                    points_end_y = [],
                    stroke_width = 0,
                    layers = "",
                }: Record<string, any> = {}) {
        this.points_start_x = points_start_x;
        this.points_start_y = points_start_y;
        this.points_end_x = points_end_x;
        this.points_end_y = points_end_y;
        this.stroke_width = stroke_width;
        this.layers = layers;
    }
}

export class KiFootprintHole {
    pos_x: number;
    pos_y: number;
    size: number;

    constructor({ pos_x, pos_y, size }: Record<string, any>) {
        this.pos_x = pos_x;
        this.pos_y = pos_y;
        this.size = size;
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

    constructor({ cx, cy, end_x, end_y, layers, stroke_width }: Record<string, any>) {
        this.cx = cx;
        this.cy = cy;
        this.end_x = end_x;
        this.end_y = end_y;
        this.layers = layers;
        this.stroke_width = stroke_width;
        roundFloatValues(this);
    }
}

export class KiFootprintRectangle extends KiFootprintTrack {
    constructor(options: Record<string, any> = {}) {
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

    constructor({ start_x, start_y, end_x, end_y, angle, layers, stroke_width }: Record<string, any>) {
        this.start_x = start_x;
        this.start_y = start_y;
        this.end_x = end_x;
        this.end_y = end_y;
        this.angle = angle;
        this.layers = layers;
        this.stroke_width = stroke_width;
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
                max_y: centerY + totalRadius
            };
        }

        const dx = this.end_x - this.start_x;
        const dy = this.end_y - this.start_y;
        const angleRad = (this.angle / 10) * Math.PI / 180;

        const chord = Math.sqrt(dx * dx + dy * dy);
        const radius = chord / (2 * Math.sin(angleRad / 2));

        const points: number[][] = [
            [this.start_x, this.start_y],
            [this.end_x, this.end_y]
        ];

        let minX = Math.min(...points.map(p => p[0]));
        let maxX = Math.max(...points.map(p => p[0]));
        let minY = Math.min(...points.map(p => p[1]));
        let maxY = Math.max(...points.map(p => p[1]));

        return {
            min_x: minX,
            max_x: maxX,
            min_y: minY,
            max_y: maxY
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

    constructor({
                    pos_x,
                    pos_y,
                    orientation,
                    text,
                    layers,
                    font_size,
                    thickness,
                    display,
                    mirror,
                }: Record<string, any>) {
        this.pos_x = pos_x;
        this.pos_y = pos_y;
        this.orientation = orientation;
        this.text = text;
        this.layers = layers;
        this.font_size = font_size;
        this.thickness = thickness;
        this.display = display;
        this.mirror = mirror;
        roundFloatValues(this);
    }
}

export class KiFootprintVia {
    pos_x: number;
    pos_y: number;
    size: number;
    diameter: number;

    constructor({ pos_x, pos_y, size, diameter }: Record<string, any>) {
        this.pos_x = pos_x;
        this.pos_y = pos_y;
        this.size = size;
        this.diameter = diameter;
        roundFloatValues(this);
    }
}

export class KiFootprintSolidRegion {
    name: string;

    constructor({ name = "" }: Record<string, any> = {}) {
        this.name = name;
    }
}

export class KiFootprintCopperArea {
    name: string;

    constructor({ name = "" }: Record<string, any> = {}) {
        this.name = name;
    }
}

export class KiFootprintInfo {
    name: string;
    fp_type: string;

    constructor({ name, fp_type }: Record<string, any>) {
        this.name = name;
        this.fp_type = fp_type;
    }
}

export class Ki3dModelBase {
    x: number;
    y: number;
    z: number;

    constructor({ x = 0.0, y = 0.0, z = 0.0 }: Record<string, any> = {}) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

export class Ki3dModel {
    name: string;
    translation: any;
    rotation: any;
    raw_wrl: any;

    constructor({ name, translation, rotation, raw_wrl = null }: Record<string, any>) {
        this.name = name;
        this.translation = translation;
        this.rotation = rotation;
        this.raw_wrl = raw_wrl;
    }
}

export class KiFootprint {
    info: any;
    model_3d: any;
    pads: any[];
    tracks: any[];
    vias: any[];
    holes: any[];
    circles: any[];
    arcs: any[];
    rectangles: any[];
    texts: any[];
    solid_regions: any[];
    copper_areas: any[];

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
                }: Record<string, any> = {}) {
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
