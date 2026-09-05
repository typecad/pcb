import fs from 'fs';

const { acos, cos, sin, sqrt, PI } = Math;

import {
  ee_footprint,
  convertToMm,
  Ee3dModel,
  EeFootprintPad,
  EeFootprintTrack,
  EeFootprintHole,
  EeFootprintVia,
  EeFootprintCircle,
  EeFootprintRectangle,
  EeFootprintArc,
  EeFootprintText,
} from '../easyeda/parametersEasyeda.js';

import logger from '../../utils/logging.js';
import {
  KiFootprintInfo,
  Ki3dModel,
  Ki3dModelBase,
  KiFootprint,
  KiFootprintPad,
  KiFootprintTrack,
  KiFootprintHole,
  KiFootprintVia,
  KiFootprintCircle,
  KiFootprintRectangle,
  KiFootprintArc,
  KiFootprintText,
  KI_MODULE_INFO,
  KI_FP_TYPE,
  KI_REFERENCE,
  KI_PACKAGE_VALUE,
  KI_FAB_REF,
  KI_LINE,
  KI_PAD,
  KI_HOLE,
  KI_VIA,
  KI_CIRCLE,
  KI_ARC,
  KI_TEXT,
  KI_MODEL_3D,
  KI_END_FILE,
  KI_RECT,
  KI_PAD_SHAPE,
  KI_PAD_LAYER,
  KI_PAD_LAYER_THT,
  KI_LAYERS,
} from './parametersKicadFootprint.js';

function pyStr(num: number) {
  let s = num.toString();
  if (isFinite(num) && !s.includes('.')) {
    s += '.0';
  }
  return s;
}

function formatTemplate(template: string, data: object) {
  const record = data as Record<string, unknown>;
  return template.replace(/{(\w+)(:[^}]+)?}/g, (match, key, formatSpec) => {
    const raw = record[key];
    if (raw === undefined) return match;
    if (formatSpec) {
      const num = Number(raw);
      if (!isNaN(num)) {
        const m = formatSpec.match(/\.([0-9]+)f/);
        if (m) {
          const decimals = parseInt(m[1], 10);
          const isNegZero = 1 / num === -Infinity;
          let formatted = num.toFixed(decimals);
          if (isNegZero && !formatted.startsWith('-')) {
            formatted = '-' + formatted;
          }
          return formatted;
        }
      }
    }
    return String(raw);
  });
}

function toRadians(n: number) {
  return (n / 180.0) * PI;
}

function toDegrees(n: number) {
  return (n / PI) * 180.0;
}

function computeArc(
  start_x: number,
  start_y: number,
  radius_x: number,
  radius_y: number,
  angle: number,
  large_arc_flag: boolean,
  sweep_flag: boolean,
  end_x: number,
  end_y: number,
) {
  const dx2 = (start_x - end_x) / 2.0;
  const dy2 = (start_y - end_y) / 2.0;

  angle = toRadians(angle % 360.0);
  const cos_angle = cos(angle);
  const sin_angle = sin(angle);

  const x1 = cos_angle * dx2 + sin_angle * dy2;
  const y1 = -sin_angle * dx2 + cos_angle * dy2;

  radius_x = Math.abs(radius_x);
  radius_y = Math.abs(radius_y);
  let Pradius_x = radius_x * radius_x;
  let Pradius_y = radius_y * radius_y;
  const Px1 = x1 * x1;
  const Py1 = y1 * y1;

  const radiiCheck = Pradius_x !== 0 && Pradius_y !== 0 ? Px1 / Pradius_x + Py1 / Pradius_y : 0;
  if (radiiCheck > 1) {
    const factor = sqrt(radiiCheck);
    radius_x = factor * radius_x;
    radius_y = factor * radius_y;
    Pradius_x = radius_x * radius_x;
    Pradius_y = radius_y * radius_y;
  }

  const sign = large_arc_flag === sweep_flag ? -1 : 1;
  let sq = 0;
  if (Pradius_x * Py1 + Pradius_y * Px1 > 0) {
    sq = (Pradius_x * Pradius_y - Pradius_x * Py1 - Pradius_y * Px1) / (Pradius_x * Py1 + Pradius_y * Px1);
  }
  sq = Math.max(sq, 0);
  const coef = sign * sqrt(sq);
  const cx1 = coef * ((radius_x * y1) / radius_y);
  const cy1 = radius_x !== 0 ? coef * -((radius_y * x1) / radius_x) : 0;

  const sx2 = (start_x + end_x) / 2.0;
  const sy2 = (start_y + end_y) / 2.0;
  const cx = sx2 + (cos_angle * cx1 - sin_angle * cy1);
  const cy = sy2 + (sin_angle * cx1 + cos_angle * cy1);

  const ux = radius_x !== 0 ? (x1 - cx1) / radius_x : 0;
  const uy = radius_y !== 0 ? (y1 - cy1) / radius_y : 0;
  const vx = radius_x !== 0 ? (-x1 - cx1) / radius_x : 0;
  const vy = radius_y !== 0 ? (-y1 - cy1) / radius_y : 0;

  const n = sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
  const p = ux * vx + uy * vy;
  const sign2 = ux * vy - uy * vx < 0 ? -1 : 1;
  let angle_extent;
  if (n !== 0) {
    const ratio = p / n;
    if (Math.abs(ratio) < 1) {
      angle_extent = toDegrees(sign2 * acos(ratio));
    } else {
      angle_extent = 360 + 359;
    }
  } else {
    angle_extent = 360 + 359;
  }
  if (!sweep_flag && angle_extent > 0) {
    angle_extent -= 360;
  } else if (sweep_flag && angle_extent < 0) {
    angle_extent += 360;
  }

  const angleExtent_sign = angle_extent < 0 ? 1 : -1;
  angle_extent = (Math.abs(angle_extent) % 360) * angleExtent_sign;

  return [cx, cy, angle_extent];
}

function fpToKi(dim: number | string): number {
  const n = Number(dim);
  if (dim !== '' && dim !== null && !isNaN(n)) {
    return parseFloat((n * 10 * 0.0254).toFixed(2));
  }
  return 0;
}

function drillToKi(hole_radius: number, hole_length: number | string, pad_height: number, pad_width: number): string {
  const hl = Number(hole_length);
  if (hole_radius > 0 && hl !== 0 && !isNaN(hl)) {
    const max_distance_hole = Math.max(hole_radius * 2, hl);
    const pos_0 = pad_height - max_distance_hole;
    const pos_90 = pad_width - max_distance_hole;
    const max_distance = Math.max(pos_0, pos_90);

    if (max_distance === pos_0) {
      return `(drill oval ${hole_radius * 2} ${hl})`;
    } else {
      return `(drill oval ${hl} ${hole_radius * 2})`;
    }
  }
  if (hole_radius > 0) {
    return `(drill ${2 * hole_radius})`;
  }
  return '';
}

function angleToKi(rotation: number | string): number {
  const r = Number(rotation);
  if (!isNaN(r)) {
    return r > 180 ? -(360 - r) : r;
  }
  return 0;
}

function rotate(x: number, y: number, degrees: number) {
  const radians = (degrees / 180) * 2 * PI;
  const new_x = x * cos(radians) - y * sin(radians);
  const new_y = x * sin(radians) + y * cos(radians);
  return [new_x, new_y];
}

class ExporterFootprintKicad {
  model_3d: Ee3dModel | null;
  input: ee_footprint;
  translation: Ki3dModelBase;
  output!: KiFootprint;

  constructor(footprint: ee_footprint, model_3d: Ee3dModel | null, translation: Ki3dModelBase) {
    this.model_3d = model_3d;
    this.input = footprint;
    this.translation = translation;
    if (!(this.input instanceof ee_footprint)) {
      logger.error('Unsupported conversion');
    } else {
      this.generateKicadFootprint();
    }
  }

  generateKicadFootprint() {
    this.input.bbox.convert_to_mm();

    const fields = [
      this.input.pads,
      this.input.tracks,
      this.input.holes,
      this.input.vias,
      this.input.circles,
      this.input.rectangles,
      this.input.texts,
    ];
    fields.forEach((fieldArray) => {
      fieldArray.forEach((field: { convert_to_mm?: () => void }) => {
        if (typeof field.convert_to_mm === 'function') {
          field.convert_to_mm();
        }
      });
    });

    const bboxX = Number(this.input.bbox.x);
    const bboxY = Number(this.input.bbox.y);

    const infoData = this.input.info || { name: 'unknown', fp_type: 'tht' };
    const ki_info = new KiFootprintInfo({
      name: infoData.name,
      fp_type: infoData.fp_type,
    });

    let ki_3d_model_info = null;
    if (this.model_3d !== null && this.model_3d !== undefined) {
      this.model_3d.convert_to_mm();

      if (!(this.translation as unknown as Record<string, unknown>).fixedZHere) {
        (this.translation as unknown as Record<string, unknown>).fixedZHere = true;
        this.translation.z += parseFloat(Number(this.model_3d.translation.z).toFixed(2));
      }
      ki_3d_model_info = new Ki3dModel({
        name: this.model_3d.name,
        translation: this.translation,
        rotation: new Ki3dModelBase({
          x: (360 - Number(this.model_3d.rotation.x)) % 360,
          y: (360 - Number(this.model_3d.rotation.y)) % 360,
          z: (360 - Number(this.model_3d.rotation.z)) % 360,
        }),
        raw_wrl: null,
      });
    }

    this.output = new KiFootprint({
      info: ki_info,
      model_3d: ki_3d_model_info,
    });

    this.input.pads.forEach((ee_pad: EeFootprintPad) => {
      const holeRadius = Number(ee_pad.hole_radius);
      const layerId = Number(ee_pad.layer_id);
      const padCx = Number(ee_pad.center_x);
      const padCy = Number(ee_pad.center_y);
      const padW = Number(ee_pad.width);
      const padH = Number(ee_pad.height);
      const ki_pad = new KiFootprintPad({
        type: holeRadius > 0 ? 'thru_hole' : 'smd',
        shape: KI_PAD_SHAPE.hasOwnProperty(ee_pad.shape) ? KI_PAD_SHAPE[ee_pad.shape] : 'custom',
        pos_x: padCx - bboxX,
        pos_y: padCy - bboxY,
        width: Math.max(padW, 0.01),
        height: Math.max(padH, 0.01),
        layers: (holeRadius <= 0 ? KI_PAD_LAYER : KI_PAD_LAYER_THT)[layerId] || '',
        number: ee_pad.number,
        drill: 0.0,
        orientation: angleToKi(ee_pad.rotation),
        polygon: '',
      });

      ki_pad.drill = drillToKi(holeRadius, ee_pad.hole_length, ki_pad.height, ki_pad.width);
      if (String(ki_pad.number).includes('(') && String(ki_pad.number).includes(')')) {
        const match = String(ki_pad.number).match(/\(([^)]+)\)/);
        if (match) {
          ki_pad.number = match[1];
        }
      }

      if (ki_pad.shape === 'custom') {
        const point_list = ee_pad.points.split(' ').map(fpToKi);
        if (point_list.length <= 0) {
          logger.warn(`PAD ${ee_pad.id} is a polygon, but has no points defined`);
        } else {
          ki_pad.width = 0.005;
          ki_pad.height = 0.005;
          ki_pad.orientation = 0;
          let path = '';
          for (let i = 0; i < point_list.length; i += 2) {
            const x_val = parseFloat((point_list[i] - bboxX - ki_pad.pos_x).toFixed(2));
            const y_val = parseFloat((point_list[i + 1] - bboxY - ki_pad.pos_y).toFixed(2));
            path += `(xy ${x_val} ${y_val})`;
          }
          ki_pad.polygon = `\n\t\t(primitives \n\t\t\t(gr_poly \n\t\t\t\t(pts ${path}\n\t\t\t\t) \n\t\t\t\t(width 0.1) \n\t\t\t)\n\t\t)\n\t`;
        }
      }

      this.output.pads.push(ki_pad);
    });

    this.input.tracks.forEach((ee_track: EeFootprintTrack) => {
      const trackLayerId = Number(ee_track.layer_id);
      const ki_track = new KiFootprintTrack({
        layers: KI_PAD_LAYER.hasOwnProperty(trackLayerId) ? KI_PAD_LAYER[trackLayerId] : 'F.Fab',
        stroke_width: Math.max(Number(ee_track.stroke_width), 0.01),
      });

      const point_list = ee_track.points.split(' ').map(fpToKi);
      for (let i = 0; i < point_list.length - 3; i += 2) {
        ki_track.points_start_x.push(parseFloat((point_list[i] - bboxX).toFixed(2)));
        ki_track.points_start_y.push(parseFloat((point_list[i + 1] - bboxY).toFixed(2)));
        ki_track.points_end_x.push(parseFloat((point_list[i + 2] - bboxX).toFixed(2)));
        ki_track.points_end_y.push(parseFloat((point_list[i + 3] - bboxY).toFixed(2)));
      }

      this.output.tracks.push(ki_track);
    });

    this.input.holes.forEach((ee_hole: EeFootprintHole) => {
      const ki_hole = new KiFootprintHole({
        pos_x: Number(ee_hole.center_x) - bboxX,
        pos_y: Number(ee_hole.center_y) - bboxY,
        size: Number(ee_hole.radius) * 2,
      });
      this.output.holes.push(ki_hole);
    });

    this.input.vias.forEach((ee_via: EeFootprintVia) => {
      const ki_via = new KiFootprintVia({
        pos_x: Number(ee_via.center_x) - bboxX,
        pos_y: Number(ee_via.center_y) - bboxY,
        size: Number(ee_via.radius) * 2,
        diameter: Number(ee_via.diameter),
      });
      this.output.vias.push(ki_via);
    });

    this.input.circles.forEach((ee_circle: EeFootprintCircle) => {
      const circleLayerId = Number(ee_circle.layer_id);
      const ki_circle = new KiFootprintCircle({
        cx: Number(ee_circle.cx) - bboxX,
        cy: Number(ee_circle.cy) - bboxY,
        end_x: 0.0,
        end_y: 0.0,
        layers: KI_LAYERS.hasOwnProperty(circleLayerId) ? KI_LAYERS[circleLayerId] : 'F.Fab',
        stroke_width: Math.max(Number(ee_circle.stroke_width), 0.01),
      });
      ki_circle.end_x = ki_circle.cx + Number(ee_circle.radius);
      ki_circle.end_y = ki_circle.cy;
      this.output.circles.push(ki_circle);
    });

    this.input.rectangles.forEach((ee_rectangle: EeFootprintRectangle) => {
      const rectLayerId = Number(ee_rectangle.layer_id);
      const ki_rectangle = new KiFootprintRectangle({
        layers: KI_PAD_LAYER.hasOwnProperty(rectLayerId) ? KI_PAD_LAYER[rectLayerId] : 'F.Fab',
        stroke_width: Math.max(Number(ee_rectangle.stroke_width), 0.01),
      });
      const start_x = Number(ee_rectangle.x) - bboxX;
      const start_y = Number(ee_rectangle.y) - bboxY;
      const width = Number(ee_rectangle.width);
      const height = Number(ee_rectangle.height);

      ki_rectangle.points_start_x = [start_x, start_x + width, start_x + width, start_x];
      ki_rectangle.points_start_y = [start_y, start_y, start_y + height, start_y + height];
      ki_rectangle.points_end_x = [start_x + width, start_x + width, start_x, start_x];
      ki_rectangle.points_end_y = [start_y, start_y + height, start_y + height, start_y];

      this.output.rectangles.push(ki_rectangle);
    });

    this.input.arcs.forEach((ee_arc: EeFootprintArc) => {
      const arcLayerId = Number(ee_arc.layer_id);
      const arc_path = ee_arc.path.replace(/,/g, ' ').replace('M ', 'M').replace('A ', 'A');

      const mIndex = arc_path.indexOf('A');
      const startCoords = arc_path.substring(1, mIndex).trim().split(' ');
      const start_x = fpToKi(startCoords[0]) - bboxX;
      const start_y = fpToKi(startCoords[1]) - bboxY;

      const arcParameters = arc_path
        .substring(mIndex + 1)
        .replace(/  /g, ' ')
        .trim();
      const parts = arcParameters.split(' ');
      const [svg_rx, svg_ry, x_axis_rotation, large_arc, sweep, end_x_str, end_y_str] = parts;
      const [rx, ry] = rotate(fpToKi(svg_rx), fpToKi(svg_ry), 0);
      const end_x = fpToKi(end_x_str) - bboxX;
      const end_y = fpToKi(end_y_str) - bboxY;
      let cx = 0.0,
        cy = 0.0,
        extent = 0.0;
      if (ry !== 0) {
        [cx, cy, extent] = computeArc(
          start_x,
          start_y,
          rx,
          ry,
          parseFloat(x_axis_rotation),
          large_arc === '1',
          sweep === '1',
          end_x,
          end_y,
        );
      }
      const ki_arc = new KiFootprintArc({
        start_x: cx,
        start_y: cy,
        end_x: end_x,
        end_y: end_y,
        angle: extent,
        layers: KI_LAYERS.hasOwnProperty(arcLayerId) ? KI_LAYERS[arcLayerId] : 'F.Fab',
        stroke_width: Math.max(fpToKi(ee_arc.stroke_width), 0.01),
      });
      this.output.arcs.push(ki_arc);
    });

    this.input.texts.forEach((ee_text: EeFootprintText) => {
      const textLayerId = Number(ee_text.layer_id);
      const ki_text = new KiFootprintText({
        pos_x: Number(ee_text.center_x) - bboxX,
        pos_y: Number(ee_text.center_y) - bboxY,
        orientation: angleToKi(ee_text.rotation),
        text: ee_text.text,
        layers: KI_LAYERS.hasOwnProperty(textLayerId) ? KI_LAYERS[textLayerId] : 'F.Fab',
        font_size: Math.max(Number(ee_text.font_size), 1),
        thickness: Math.max(Number(ee_text.stroke_width), 0.01),
        display: ee_text.is_displayed === 'hide' ? ' hide' : '',
        mirror: '',
      });
      if (ee_text.type === 'N') {
        ki_text.layers = ki_text.layers.replace('.SilkS', '.Fab');
      }
      ki_text.mirror = ki_text.layers.startsWith('B') ? ' mirror' : '';
      this.output.texts.push(ki_text);
    });
  }

  getKiFootprint() {
    return this.output;
  }

  getContent(model_3d_path = '${KIPRJMOD}') {
    const ki = this.output;
    if (!ki.info) return '';

    let ki_lib = '';

    ki_lib += formatTemplate(KI_MODULE_INFO, {
      package_lib: 'easyeda2kicad',
      package_name: ki.info.name,
      edit: '5DC5F6A4',
    });

    if (ki.info.fp_type) {
      ki_lib += formatTemplate(KI_FP_TYPE, {
        component_type: ki.info.fp_type === 'smd' ? 'smd' : 'through_hole',
      });
    }

    const y_values = ki.pads.map((pad: KiFootprintPad) => pad.pos_y);
    const y_low = Math.min(...y_values);
    const y_high = Math.max(...y_values);

    ki_lib += formatTemplate(KI_REFERENCE, { pos_x: '0', pos_y: pyStr(y_low - 4) });

    ki_lib += formatTemplate(KI_PACKAGE_VALUE, {
      package_name: ki.info.name,
      pos_x: '0',
      pos_y: pyStr(y_high + 4),
    });
    ki_lib += KI_FAB_REF;

    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    let xPts: number[] = [];
    let yPts: number[] = [];

    const combinedTracks = ki.tracks.concat(ki.rectangles);
    combinedTracks.forEach((track: KiFootprintTrack) => {
      for (let i = 0; i < track.points_start_x.length; i++) {
        ki_lib += formatTemplate(KI_LINE, {
          start_x: track.points_start_x[i],
          start_y: track.points_start_y[i],
          end_x: track.points_end_x[i],
          end_y: track.points_end_y[i],
          layers: track.layers,
          stroke_width: track.stroke_width,
        });
      }
      xPts = xPts.concat(track.points_start_x.concat(track.points_end_x));
      yPts = yPts.concat(track.points_start_y.concat(track.points_end_y));
    });

    ki.pads.forEach((pad: KiFootprintPad) => {
      ki_lib += formatTemplate(KI_PAD, pad);
      xPts.push(pad.pos_x + pad.width / 2);
      xPts.push(pad.pos_x - pad.width / 2);
      yPts.push(pad.pos_y + pad.height / 2);
      yPts.push(pad.pos_y - pad.height / 2);
    });

    ki.holes.forEach((hole: KiFootprintHole) => {
      ki_lib += formatTemplate(KI_HOLE, hole);

      const halfSize = hole.size / 2;
      xPts.push(hole.pos_x + halfSize);
      xPts.push(hole.pos_x - halfSize);
      yPts.push(hole.pos_y + halfSize);
      yPts.push(hole.pos_y - halfSize);
    });

    ki.vias.forEach((via: KiFootprintVia) => {
      ki_lib += formatTemplate(KI_VIA, via);

      const halfSize = via.size / 2;
      xPts.push(via.pos_x + halfSize);
      xPts.push(via.pos_x - halfSize);
      yPts.push(via.pos_y + halfSize);
      yPts.push(via.pos_y - halfSize);
    });

    ki.circles.forEach((circle: KiFootprintCircle) => {
      ki_lib += formatTemplate(KI_CIRCLE, circle);

      const radius = circle.cx - circle.end_x;

      if (radius > 1) {
        xPts.push(circle.cx + radius);
        xPts.push(circle.cx - radius);
        yPts.push(circle.cy + radius);
        yPts.push(circle.cy - radius);
      }
    });

    ki.arcs.forEach((arc: KiFootprintArc) => {
      ki_lib += formatTemplate(KI_ARC, arc);

      const bbox = arc.getBoundingBox();

      if (bbox.max_x - bbox.min_x > 2 && bbox.max_y - bbox.min_y > 2) {
        xPts.push(bbox.max_x);
        xPts.push(bbox.min_x);
        yPts.push(bbox.max_y);
        yPts.push(bbox.min_y);
      }
    });

    ki.texts.forEach((text: KiFootprintText) => {
      ki_lib += formatTemplate(KI_TEXT, text);
    });

    for (const p of xPts) {
      if (+p > maxX) {
        maxX = +p;
      }
      if (+p < minX) {
        minX = +p;
      }
    }
    for (const p of yPts) {
      if (+p > maxY) {
        maxY = +p;
      }
      if (+p < minY) {
        minY = +p;
      }
    }

    const hasFiniteMaxMinValues = isFinite(minY) && isFinite(minX) && isFinite(maxY) && isFinite(maxX);

    if (ki.model_3d !== null && ki.model_3d !== undefined && ki.model_3d.rotation) {
      ki_lib += formatTemplate(KI_MODEL_3D, {
        file_3d: `/${model_3d_path}/${ki.model_3d.name}.wrl`,
        pos_x: this.translation.x + (hasFiniteMaxMinValues ? (minX + maxX) / 2 : 0),
        pos_y: this.translation.y - (hasFiniteMaxMinValues ? (minY + maxY) / 2 : 0),
        pos_z: this.translation.z,
        rot_x: ki.model_3d.rotation.x,
        rot_y: ki.model_3d.rotation.y,
        rot_z: ki.model_3d.rotation.z,
      });
    }

    if (hasFiniteMaxMinValues) {
      const margin = 0.5;
      ki_lib += formatTemplate(KI_RECT, {
        start_x: minX - margin,
        start_y: minY - margin,
        end_x: maxX + margin,
        end_y: maxY + margin,
        layers: 'F.CrtYd',
        stroke_width: '0.05',
      });
    }

    ki_lib += KI_END_FILE;

    return ki_lib;
  }

  export(footprint_full_path: string, model_3d_path: string) {
    const content = this.getContent(model_3d_path);
    fs.writeFileSync(footprint_full_path, content, { encoding: 'utf8' });
  }
}

export { computeArc, ExporterFootprintKicad };
