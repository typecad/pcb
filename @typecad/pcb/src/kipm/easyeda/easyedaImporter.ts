interface Vertex3d {
  x: number;
  y: number;
  z: number;
}

interface EasyedaCadData {
  dataStr: {
    head: { c_para: Record<string, string | undefined>; x: string; y: string };
    shape: string[];
  };
  lcsc?: { url: string; number: string };
}

interface EasyedaDataStr {
  head: { x: string; y: string };
  shape: string[];
}

interface Easyeda3dModelAttrs {
  title: string;
  uuid: string;
  c_origin: string;
  z: string;
  c_rotation: string;
  c_width: number;
  c_height: number;
}

function parseObjVertices(objText: string) {
  const vertices: Vertex3d[] = [];
  for (const line of objText.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('v ')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 4) {
        vertices.push({ x: parseFloat(parts[1]), y: parseFloat(parts[2]), z: parseFloat(parts[3]) });
      }
    }
  }
  return vertices;
}

import logger from '../../utils/logging.js';
import type { EasyedaRawData } from '../types.js';
import type LcscComponent from '../LcscComponent.js';
import { EasyedaApi } from './easyedaApi.js';
import { mat4, vec3, quat, toRadian } from './transform.js';
import easyeda_handlers from '../helpers/easyeda_handlers.js';
import zip from '../helpers/zip.js';
import {
  EeSymbol,
  EeSymbolInfo,
  EeSymbolBbox,
  EeFootprintInfo,
  EeFootprintBbox,
  EeFootprintPad,
  EeFootprintTrack,
  EeFootprintHole,
  EeFootprintVia,
  EeFootprintCircle,
  EeFootprintRectangle,
  EeFootprintArc,
  EeFootprintText,
  Ee3dModel,
  Ee3dModelBase,
  ee_footprint,
} from './parametersEasyeda.js';

class EasyedaSymbolImporter {
  input: EasyedaCadData;
  output: EeSymbol;

  constructor(easyedaCpCadData: EasyedaCadData) {
    this.input = easyedaCpCadData;
    this.output = this.extract_easyeda_data(easyedaCpCadData, easyedaCpCadData.dataStr.head.c_para);
  }

  getSymbol() {
    return this.output;
  }

  extract_easyeda_data(ee_data: EasyedaCadData, ee_data_info: Record<string, string | undefined>) {
    const new_ee_symbol = new EeSymbol({
      info: {
        name: ee_data_info['name'],
        prefix: ee_data_info['pre'],
        package: ee_data_info['package'] || undefined,
        manufacturer: ee_data_info['BOM_Manufacturer'] || undefined,
        datasheet: ee_data.lcsc ? ee_data.lcsc.url : undefined,
        lcsc_id: ee_data.lcsc ? ee_data.lcsc.number : undefined,
        jlc_id: ee_data_info['BOM_JLCPCB Part Class'] || undefined,
      },
      bbox: new EeSymbolBbox({
        x: parseFloat(ee_data.dataStr.head.x),
        y: parseFloat(ee_data.dataStr.head.y),
      }) as unknown as EasyedaRawData,
    });

    ee_data.dataStr.shape.forEach((line: string) => {
      const designator = line.split('~')[0];
      if (easyeda_handlers.hasOwnProperty(designator)) {
        easyeda_handlers[designator](line, new_ee_symbol);
      } else {
        logger.warn(`Unknown symbol designator: ${designator}`);
      }
    });

    return new_ee_symbol;
  }
}

class EasyedaFootprintImporter {
  input: EasyedaCadData;
  output!: ee_footprint;

  constructor(easyedaCpCadData: EasyedaCadData) {
    this.input = easyedaCpCadData;
  }

  getFootprint() {
    return this.output;
  }

  async extract_easyeda_data(
    ee_data_str: EasyedaDataStr,
    ee_data_info: Record<string, string | undefined>,
    is_smd: boolean,
  ) {
    const new_ee_footprint = new ee_footprint({
      info: {
        name: ee_data_info['package'],
        fp_type: is_smd ? 'smd' : 'tht',
        model_3d_name: ee_data_info['3DModel'] || undefined,
      },
      bbox: new EeFootprintBbox({
        x: parseFloat(ee_data_str.head.x),
        y: parseFloat(ee_data_str.head.y),
      }) as unknown as EasyedaRawData,
      model_3d: undefined,
    });

    ee_data_str.shape.forEach((line: string) => {
      const ee_designator = line.split('~')[0];
      const ee_fields = line.split('~').slice(1);
      if (ee_designator === 'PAD') {
        const data = zip(EeFootprintPad.fields, ee_fields.slice(0, 18));
        new_ee_footprint.pads.push(new EeFootprintPad(data));
      } else if (ee_designator === 'TRACK') {
        const data = zip(EeFootprintTrack.fields, ee_fields);
        new_ee_footprint.tracks.push(new EeFootprintTrack(data));
      } else if (ee_designator === 'HOLE') {
        const data = zip(EeFootprintHole.fields, ee_fields);
        new_ee_footprint.holes.push(new EeFootprintHole(data));
      } else if (ee_designator === 'VIA') {
        const data = zip(EeFootprintVia.fields, ee_fields);
        new_ee_footprint.vias.push(new EeFootprintVia(data));
      } else if (ee_designator === 'CIRCLE') {
        const data = zip(EeFootprintCircle.fields, ee_fields);
        new_ee_footprint.circles.push(new EeFootprintCircle(data));
      } else if (ee_designator === 'ARC') {
        const data = zip(EeFootprintArc.fields, ee_fields);
        new_ee_footprint.arcs.push(new EeFootprintArc(data));
      } else if (ee_designator === 'RECT') {
        const data = zip(EeFootprintRectangle.fields, ee_fields);
        new_ee_footprint.rectangles.push(new EeFootprintRectangle(data));
      } else if (ee_designator === 'TEXT') {
        const data = zip(EeFootprintText.fields, ee_fields);
        new_ee_footprint.texts.push(new EeFootprintText(data));
      } else if (ee_designator === 'SVGNODE') {
      } else if (ee_designator === 'SOLIDREGION') {
      } else {
        logger.warn(`Unknown footprint designator: ${ee_designator}`);
      }
    });

    return new_ee_footprint;
  }
}

class Easyeda3dModelImporter {
  lcscComponent: LcscComponent;
  downloadRaw3dModel: boolean;

  constructor(lcscComponent: LcscComponent) {
    this.lcscComponent = lcscComponent;
    this.downloadRaw3dModel = true;
  }

  async create_3d_model() {
    const model_3d_info = this.lcscComponent.get3DModelInfo();
    if (model_3d_info) {
      const model_3d = this.parse_3d_model_info(model_3d_info);
      if (this.downloadRaw3dModel) {
        const rawObj = this.lcscComponent.get3dRawObj();
        model_3d.raw_obj = rawObj;
        model_3d.step = this.lcscComponent.get3dStep();

        if (rawObj) {
          const transformMatrix = mat4.create();

          const options = {
            id: model_3d_info.uuid,
            z: model_3d_info.z,
            rx: model_3d_info.c_rotation.split(',')[0],
            ry: model_3d_info.c_rotation.split(',')[1],
            rz: model_3d_info.c_rotation.split(',')[2],
            width: model_3d_info.c_width,
            height: model_3d_info.c_height,
          };
          const vertices = parseObjVertices(rawObj);
          const boundingBox = vertices.reduce(
            (
              acc: { maxX: number; maxY: number; maxZ: number; minX: number; minY: number; minZ: number },
              vertex: Vertex3d,
            ) => ({
              maxX: Math.max(acc.maxX, vertex.x),
              maxY: Math.max(acc.maxY, vertex.y),
              maxZ: Math.max(acc.maxZ, vertex.z),
              minX: Math.min(acc.minX, vertex.x),
              minY: Math.min(acc.minY, vertex.y),
              minZ: Math.min(acc.minZ, vertex.z),
            }),
            {
              maxX: -Infinity,
              maxY: -Infinity,
              maxZ: -Infinity,
              minX: Infinity,
              minY: Infinity,
              minZ: Infinity,
            },
          );

          model_3d.boundingBox = boundingBox;

          const centerX = (boundingBox.maxX + boundingBox.minX) / 2,
            centerY = (boundingBox.maxY + boundingBox.minY) / 2,
            bottomZ = boundingBox.minZ;

          const translationMatrix = mat4.create();
          mat4.translate(translationMatrix, translationMatrix, vec3.fromValues(-centerX, -centerY, -bottomZ));

          const rotationZ = toRadian(options.rz);
          const rotationX = toRadian(options.rx);
          const rotationY = toRadian(options.ry);

          const rotationMatrix = mat4.create();
          mat4.rotateZ(rotationMatrix, rotationMatrix, rotationZ);
          mat4.rotateX(rotationMatrix, rotationMatrix, rotationX);
          mat4.rotateY(rotationMatrix, rotationMatrix, rotationY);
          mat4.multiply(transformMatrix, rotationMatrix, translationMatrix);

          const scaleX = options.width / (boundingBox.maxX - boundingBox.minX);
          const scaleY = options.height / (boundingBox.maxY - boundingBox.minY);
          const uniformScale = Math.min(scaleX, scaleY);

          mat4.scale(transformMatrix, transformMatrix, vec3.fromValues(uniformScale, uniformScale, uniformScale));

          const translation = vec3.create();
          const rotation = quat.create();
          const scale = vec3.create();

          mat4.getTranslation(translation, transformMatrix);
          mat4.getRotation(rotation, transformMatrix);
          mat4.getScaling(scale, transformMatrix);

          function quatToEuler(q: number[]) {
            const x = q[0],
              y = q[1],
              z = q[2],
              w = q[3];
            const rotX = (Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)) * 180) / Math.PI;
            const rotY = (Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x)))) * 180) / Math.PI;
            const rotZ = (Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * 180) / Math.PI;
            return {
              x: ((rotX % 360) + 360) % 360,
              y: ((rotY % 360) + 360) % 360,
              z: ((rotZ % 360) + 360) % 360,
            };
          }

          const rotationDegrees = quatToEuler(rotation);

          rotationDegrees.x = ((rotationDegrees.x % 360) + 360) % 360;
          rotationDegrees.y = ((rotationDegrees.y % 360) + 360) % 360;
          rotationDegrees.z = ((rotationDegrees.z % 360) + 360) % 360;

          this.lcscComponent.translation.x += +translation[0].toFixed(2);
          this.lcscComponent.translation.y += +translation[1].toFixed(2);
          this.lcscComponent.translation.z += +translation[2].toFixed(2);
        } else {
          logger.warn(`Skipping 3D model parsing for uuid:${model_3d_info.uuid} because data is missing.`);
        }
      }

      return model_3d;
    }

    logger.warn('No 3D model available for this component');

    return null;
  }

  get_3d_model_info(ee_data: string[]) {
    for (const line of ee_data) {
      const ee_designator = line.split('~')[0];
      if (ee_designator === 'SVGNODE') {
        const raw_json = line.split('~').slice(1)[0];
        return JSON.parse(raw_json).attrs;
      }
    }
    return {};
  }

  parse_3d_model_info(info: Easyeda3dModelAttrs) {
    return new Ee3dModel({
      name: info.title,
      uuid: info.uuid,
      translation: new Ee3dModelBase({
        x: info.c_origin.split(',')[0],
        y: info.c_origin.split(',')[1],
        z: info.z,
      }) as unknown as EasyedaRawData,
      rotation: new Ee3dModelBase(zip(Ee3dModelBase.fields, info.c_rotation.split(','))) as unknown as EasyedaRawData,
    });
  }
}

export { EasyedaSymbolImporter, EasyedaFootprintImporter, Easyeda3dModelImporter };
