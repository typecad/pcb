import fs from 'node:fs';
import { parse } from '../../sexpr/index.js';
import { SNode } from '../../sexpr/query.js';
import { decodeCodeMetadata } from '../../kicad2typecad/codec.js';

export interface BoardPad {
  pad: string;
  net: string | null;
  type: string;
  pinType?: string;
}

export interface BoardComponent {
  reference: string;
  value: string;
  footprint: string;
  side: 'front' | 'back';
  at: { x: number; y: number; rotation: number };
  /** Source variable name recovered from the "Code" property, when present. */
  variable?: string;
  /** Source file:line recovered from the "Code" property, when present. */
  source?: string;
  pads: BoardPad[];
}

export interface BoardNet {
  code: number;
  name: string;
  pins: string[];
  vias: { x: number; y: number }[];
  zones: { layers: string[] }[];
}

export interface BoardSummary {
  file: string;
  components: number;
  namedNets: number;
  vias: number;
  zones: number;
  tracks: number;
  unconnectedPads: number;
  board: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

export interface BoardModel {
  file: string;
  components: BoardComponent[];
  nets: BoardNet[];
  summary: BoardSummary;
}

function netNameOf(parent: SNode): { code: number; name: string | null } | null {
  const net = parent.child('net');
  if (!net) return null;
  const code = net.getNumber(1, -1);
  return { code, name: net.getString(2) };
}

function isPowerNetName(name: string): boolean {
  return /^(gnd|ground|gn\d+|vcc|vdd|vss|vbat(t)?|vin|vout|avcc|avdd|avss|\+?-?\d+(\.\d+)?v\d*(_|$|[0-9a-z]))/i.test(
    name.trim(),
  );
}

export function isPowerNet(net: BoardNet): boolean {
  if (net.name && isPowerNetName(net.name)) return true;
  // Stitched ground planes: many vias or a zone with no distinctive name.
  return net.vias.length >= 4 || net.zones.length > 0;
}

/** Parse a .kicad_pcb file into a plain, JSON-ready board model. */
export function buildBoardModel(pcbPath: string): BoardModel {
  const text = fs.readFileSync(pcbPath, 'utf-8');
  const rootRaw = parse(text);
  const root = SNode.from(rootRaw as unknown as never[]);

  // net code -> name (code 0 / "" is "no net")
  const netNames = new Map<number, string>();
  const netCodesByName = new Map<string, number>();
  for (const net of root.children('net')) {
    const code = net.getNumber(1, 0);
    const rawName = net.rawAt(2);
    const name = typeof rawName === 'string' ? rawName : '';
    netNames.set(code, name);
    if (name !== '') netCodesByName.set(name, code);
  }
  const nameFor = (code: number, inline: string | null): string | null => {
    if (inline && inline !== '') return inline;
    const mapped = netNames.get(code);
    return mapped && mapped !== '' ? mapped : null;
  };

  // Components
  const components: BoardComponent[] = [];
  for (const fp of root.findAll('footprint')) {
    const libRaw = fp.rawAt(1);
    const footprint = typeof libRaw === 'string' ? libRaw : (fp.getString(1) ?? '');

    let reference = '';
    let value = '';
    let codeProp: string | null = null;
    for (const prop of fp.children('property')) {
      const key = prop.rawAt(1);
      const val = prop.rawAt(2);
      if (key === 'Reference' && typeof val === 'string') reference = val;
      else if (key === 'Value' && typeof val === 'string') value = val;
      else if (key === 'Code' && typeof val === 'string') codeProp = val;
    }

    const atNode = fp.child('at');
    const layerNode = fp.child('layer');
    const layerRaw = layerNode?.rawAt(1);
    const side: 'front' | 'back' = typeof layerRaw === 'string' && layerRaw.startsWith('B.') ? 'back' : 'front';

    let variable: string | undefined;
    let source: string | undefined;
    if (codeProp) {
      const meta = decodeCodeMetadata(codeProp);
      if (meta) {
        if (meta.n) variable = meta.n;
        if (meta.f) source = meta.l !== undefined ? `${meta.f}:${meta.l}` : meta.f;
      }
    }

    const pads: BoardPad[] = [];
    for (const pad of fp.children('pad')) {
      const net = netNameOf(pad);
      const pintypeNode = pad.child('pintype');
      pads.push({
        pad: pad.getString(1) ?? '',
        type: pad.getString(2) ?? '',
        net: net ? nameFor(net.code, net.name) : null,
        pinType: pintypeNode ? (pintypeNode.getString(1) ?? undefined) : undefined,
      });
    }

    components.push({
      reference,
      value,
      footprint,
      side,
      at: {
        x: atNode?.getNumber(1, 0) ?? 0,
        y: atNode?.getNumber(2, 0) ?? 0,
        rotation: atNode?.getNumber(3, 0) ?? 0,
      },
      variable,
      source,
      pads,
    });
  }

  // Nets: aggregate pins, vias, zones, tracks
  const nets = new Map<number, BoardNet>();
  const netByCode = (code: number, name: string | null): BoardNet => {
    let n = nets.get(code);
    if (!n) {
      n = { code, name: name ?? netNames.get(code) ?? '', pins: [], vias: [], zones: [] };
      nets.set(code, n);
    }
    if (!n.name && name) n.name = name;
    return n;
  };

  for (const comp of components) {
    for (const pad of comp.pads) {
      if (pad.net === null) continue;
      const code = netCodesByName.get(pad.net) ?? 0;
      netByCode(code, pad.net).pins.push(`${comp.reference}.${pad.pad}`);
    }
  }

  for (const via of root.findAll('via')) {
    const net = netNameOf(via);
    if (!net) continue;
    const at = via.child('at');
    netByCode(net.code, net.name).vias.push({ x: at?.getNumber(1, 0) ?? 0, y: at?.getNumber(2, 0) ?? 0 });
  }

  for (const zone of root.findAll('zone')) {
    const netCodeNode = zone.child('net');
    const netNameNode = zone.child('net_name');
    const code = netCodeNode?.getNumber(1, -1) ?? -1;
    const rawName = netNameNode?.rawAt(1);
    const name = typeof rawName === 'string' ? rawName : null;
    const layersNode = zone.child('layers');
    const layers: string[] = [];
    if (layersNode) {
      for (let i = 1; i < layersNode.length; i++) {
        const l = layersNode.rawAt(i);
        if (typeof l === 'string') layers.push(l);
      }
    }
    if (code >= 0) netByCode(code, name).zones.push({ layers });
  }

  const trackCount = root.findAll('segment').length;

  // Board bounds from Edge.Cuts graphics
  let board: BoardSummary['board'] = null;
  const edgePts: { x: number; y: number }[] = [];
  for (const line of [...root.findAll('gr_line'), ...root.findAll('fp_line')]) {
    const layerRaw = line.child('layer')?.rawAt(1);
    if (layerRaw !== 'Edge.Cuts') continue;
    const start = line.child('start');
    const end = line.child('end');
    if (start) edgePts.push({ x: start.getNumber(1, 0), y: start.getNumber(2, 0) });
    if (end) edgePts.push({ x: end.getNumber(1, 0), y: end.getNumber(2, 0) });
  }
  if (edgePts.length > 0) {
    board = {
      minX: Math.min(...edgePts.map((p) => p.x)),
      minY: Math.min(...edgePts.map((p) => p.y)),
      maxX: Math.max(...edgePts.map((p) => p.x)),
      maxY: Math.max(...edgePts.map((p) => p.y)),
    };
  }

  const allNets = [...nets.values()].filter((n) => n.code !== 0);
  const viaTotal = allNets.reduce((acc, n) => acc + n.vias.length, 0);
  const unconnectedPads = components.reduce(
    (acc, c) => acc + c.pads.filter((p) => p.net === null && p.type !== 'np_thru_hole').length,
    0,
  );

  return {
    file: pcbPath,
    components,
    nets: allNets,
    summary: {
      file: pcbPath,
      components: components.length,
      namedNets: allNets.filter((n) => n.name !== '').length,
      vias: viaTotal,
      zones: allNets.reduce((acc, n) => acc + n.zones.length, 0),
      tracks: trackCount,
      unconnectedPads,
      board,
    },
  };
}

export function findNet(model: BoardModel, name: string): BoardNet | undefined {
  const lower = name.toLowerCase();
  return model.nets.find((n) => n.name.toLowerCase() === lower);
}

export function findComponent(model: BoardModel, ref: string): BoardComponent | undefined {
  const upper = ref.toUpperCase();
  return model.components.find((c) => c.reference.toUpperCase() === upper);
}

/** Electrical pads with no net, excluding intentionally unconnected mounting holes. */
export function unconnectedPads(model: BoardModel): { reference: string; pad: string; type: string }[] {
  const out: { reference: string; pad: string; type: string }[] = [];
  for (const c of model.components) {
    for (const p of c.pads) {
      if (p.net === null && p.type !== 'np_thru_hole') out.push({ reference: c.reference, pad: p.pad, type: p.type });
    }
  }
  return out;
}

/** Named nets with a single electrical pin — likely forgotten connections. */
export function singlePinNets(model: BoardModel): BoardNet[] {
  return model.nets.filter((n) => n.name !== '' && n.pins.length <= 1);
}
