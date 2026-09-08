import fs from 'node:fs';
import { parse } from '../../sexpr/index.js';
import { SNode } from '../../sexpr/query.js';
import { decodeCodeMetadata } from '../../kicad2typecad/codec.js';

export interface BoardPad {
  pad: string;
  net: string | null;
  type: string;
  pinType?: string;
  /** Pad center in the footprint's local (unrotated) frame, mm. */
  at: { x: number; y: number };
  /** Copper layers the pad exists on ('*.Cu' expands during analysis). */
  layers: string[];
}

export interface BoardComponent {
  reference: string;
  value: string;
  footprint: string;
  side: 'front' | 'back';
  at: { x: number; y: number; rotation: number };
  /**
   * Footprint bounding box in mm, measured in the footprint's own
   * (unrotated) frame from its fabrication outline — falls back to
   * silkscreen geometry, then to pad extents. Null when the footprint
   * has no measurable geometry at all.
   */
  dimensions: { width: number; height: number } | null;
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
  segments: BoardSegment[];
  /** Copper connectivity analysis; null when the net has no pins. */
  route: NetRoute | null;
}

export interface BoardSegment {
  layer: string;
  width: number;
  length: number;
  start: Pt;
  end: Pt;
}

/** Copper pours and keepout regions parsed from zone nodes. */
export interface BoardZone {
  netCode: number;
  netName: string | null;
  layers: string[];
  keepout: boolean;
  /** Fill requested in the zone declaration (`(fill yes ...)`). */
  filled: boolean;
  fillMode: string | null;
  /** KiCad computed actual fill geometry into the file (`(filled_polygon)`). */
  materialized: boolean;
  bbox: { x: number; y: number; width: number; height: number };
  polygon: Pt[];
}

/**
 * Per-net copper connectivity: which pins are joined by tracks, vias, and
 * pours, and which are still waiting for copper.
 */
export interface NetRoute {
  segments: number;
  /** Total routed track length in mm. */
  length: number;
  layers: string[];
  pinsTotal: number;
  /** Pins in the largest copper island (all pins when fully routed). */
  pinsConnected: number;
  /** Pin groups with no copper path between them; empty when routed. */
  disconnectedGroups: string[][];
  /** True when every pin of the net sits in one copper island. */
  routed: boolean;
  /** True when a zone pour contributes to the connection. */
  pourAssisted: boolean;
}

export interface BoardSummary {
  file: string;
  components: number;
  namedNets: number;
  vias: number;
  zones: number;
  keepouts: number;
  tracks: number;
  unconnectedPads: number;
  board: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

export interface BoardModel {
  file: string;
  components: BoardComponent[];
  nets: BoardNet[];
  zones: BoardZone[];
  summary: BoardSummary;
}

/**
 * Net reference on a pad/via/segment/zone. Two shapes exist: typeCAD writes
 * `(net 1 "GND")`; kicad-cli --save-board reserializes as `(net "GND")`
 * (name inline, no code) or `(net 1)` (bare code). `netCodesByName`
 * resolves resaved names back to their codes.
 */
function netNameOf(parent: SNode, netCodesByName: Map<string, number>): { code: number; name: string | null } | null {
  const net = parent.child('net');
  if (!net) return null;
  if (net.rawAt(2) !== undefined) {
    return { code: net.getNumber(1, -1), name: net.getString(2) };
  }
  const first = net.getString(1) ?? '';
  if (/^-?\d+$/.test(first)) return { code: parseInt(first, 10), name: null };
  if (first !== '') return { code: netCodesByName.get(first) ?? -1, name: first };
  return { code: -1, name: null };
}

function isPowerNetName(name: string): boolean {
  return /^(gnd|ground|gn\d+|vcc|vdd|vss|vbat(t)?|vin|vout|avcc|avdd|avss|\+?-?\d+(\.\d+)?v\d*(_|$|[0-9a-z]))/i.test(
    name.trim(),
  );
}

interface Pt {
  x: number;
  y: number;
}

function nodeChildPoint(node: SNode, name: string): Pt | null {
  const child = node.child(name);
  if (!child) return null;
  return { x: child.getNumber(1, 0), y: child.getNumber(2, 0) };
}

function nodeLayer(node: SNode): string | null {
  return node.child('layer')?.getString(1) ?? null;
}

function bboxSize(points: Pt[]): { width: number; height: number } | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { width: round(Math.max(...xs) - Math.min(...xs)), height: round(Math.max(...ys) - Math.min(...ys)) };
}

/**
 * Footprint bounding box from its own geometry, in the footprint's local
 * (unrotated) frame. Preference: fabrication outline (the physical body),
 * then silkscreen, then any fp_* graphics, then pad extents.
 */
function footprintDimensions(fp: SNode, padNodes: SNode[]): { width: number; height: number } | null {
  const byLayer = new Map<string, Pt[]>();
  const add = (layer: string | null, ...pts: (Pt | null)[]) => {
    if (!layer) return;
    const list = byLayer.get(layer) ?? [];
    for (const p of pts) if (p) list.push(p);
    byLayer.set(layer, list);
  };

  for (const line of fp.children('fp_line'))
    add(nodeLayer(line), nodeChildPoint(line, 'start'), nodeChildPoint(line, 'end'));
  for (const rect of fp.children('fp_rect'))
    add(nodeLayer(rect), nodeChildPoint(rect, 'start'), nodeChildPoint(rect, 'end'));
  for (const poly of fp.children('fp_poly')) {
    const pts = poly.child('pts');
    const layer = nodeLayer(poly);
    if (pts) for (const xy of pts.children('xy')) add(layer, { x: xy.getNumber(1, 0), y: xy.getNumber(2, 0) });
  }
  for (const circle of fp.children('fp_circle')) {
    // KiCad defines a circle by center + a point on the circumference:
    // its bbox is center ± radius in both axes.
    const center = nodeChildPoint(circle, 'center');
    const edge = nodeChildPoint(circle, 'end');
    const layer = nodeLayer(circle);
    if (center && edge) {
      const r = Math.hypot(edge.x - center.x, edge.y - center.y);
      add(layer, { x: center.x - r, y: center.y - r }, { x: center.x + r, y: center.y + r });
    } else {
      add(layer, center, edge);
    }
  }

  for (const layer of ['F.Fab', 'B.Fab', 'F.SilkS', 'B.SilkS']) {
    const size = bboxSize(byLayer.get(layer) ?? []);
    if (size) return size;
  }
  const allGraphics = [...byLayer.values()].flat();
  const graphicsSize = bboxSize(allGraphics);
  if (graphicsSize) return graphicsSize;

  // Last resort: pad extents (pad centers ± half sizes)
  const padPts: Pt[] = [];
  for (const pad of padNodes) {
    const at = pad.child('at');
    const size = pad.child('size');
    if (!at) continue;
    const cx = at.getNumber(1, 0);
    const cy = at.getNumber(2, 0);
    const w = size ? size.getNumber(1, 0) : 0;
    const h = size ? size.getNumber(2, 0) : 0;
    padPts.push({ x: cx - w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy + h / 2 });
  }
  return bboxSize(padPts);
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

    const padNodes = fp.children('pad');
    const pads: BoardPad[] = [];
    for (const pad of padNodes) {
      const net = netNameOf(pad, netCodesByName);
      const pintypeNode = pad.child('pintype');
      const padAt = pad.child('at');
      const layersNode = pad.child('layers');
      const padLayers: string[] = [];
      if (layersNode) {
        for (let i = 1; i < layersNode.length; i++) {
          const l = layersNode.getString(i);
          if (l) padLayers.push(l);
        }
      }
      pads.push({
        pad: pad.getString(1) ?? '',
        type: pad.getString(2) ?? '',
        net: net ? nameFor(net.code, net.name) : null,
        pinType: pintypeNode ? (pintypeNode.getString(1) ?? undefined) : undefined,
        at: { x: padAt?.getNumber(1, 0) ?? 0, y: padAt?.getNumber(2, 0) ?? 0 },
        layers: padLayers,
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
      dimensions: footprintDimensions(fp, padNodes),
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
      n = { code, name: name ?? netNames.get(code) ?? '', pins: [], vias: [], zones: [], segments: [], route: null };
      nets.set(code, n);
    }
    if (!n.name && name) n.name = name;
    return n;
  };

  for (const comp of components) {
    for (const pad of comp.pads) {
      if (pad.net === null) continue;
      // Resaved boards carry inline net names without a global code table,
      // so aggregate by name; the code (when present) only merges entries.
      const code = netCodesByName.get(pad.net) ?? -1;
      netByCode(code, pad.net).pins.push(`${comp.reference}.${pad.pad}`);
    }
  }

  for (const via of root.findAll('via')) {
    const net = netNameOf(via, netCodesByName);
    if (!net) continue;
    const at = via.child('at');
    netByCode(net.code, net.name).vias.push({ x: at?.getNumber(1, 0) ?? 0, y: at?.getNumber(2, 0) ?? 0 });
  }

  const round = (v: number) => Math.round(v * 1000) / 1000;
  const segments = root.findAll('segment');
  for (const seg of segments) {
    const net = netNameOf(seg, netCodesByName);
    // Skip only genuinely net-less segments; resaved inline names carry code -1
    if (!net || (net.code < 0 && net.name === null)) continue;
    const start = nodeChildPoint(seg, 'start');
    const end = nodeChildPoint(seg, 'end');
    if (!start || !end) continue;
    netByCode(net.code, net.name).segments.push({
      layer: seg.child('layer')?.getString(1) ?? '',
      width: seg.child('width')?.getNumber(1, 0) ?? 0,
      length: round(Math.hypot(end.x - start.x, end.y - start.y)),
      start,
      end,
    });
  }

  // Zones: copper pours (net-assigned) and keepouts (net-less)
  const zones: BoardZone[] = [];
  for (const zone of root.findAll('zone')) {
    // Net comes in two shapes: typeCAD writes `(net 1 "GND") (net_name "GND")`,
    // while kicad-cli --save-board reserializes zones as `(net "GND")`.
    const netNode = zone.child('net');
    const netNameNode = zone.child('net_name');
    let code = -1;
    let name = netNameNode?.getString(1) ?? null;
    if (netNode) {
      if (netNode.rawAt(2) !== undefined) {
        // (net <code> "<name>") — original form
        code = netNode.getNumber(1, -1);
        name = name ?? netNode.getString(2);
      } else {
        const first = netNode.getString(1) ?? '';
        if (/^-?\d+$/.test(first)) {
          // (net <code>) — resaved form with a bare code
          code = parseInt(first, 10);
        } else if (first !== '') {
          // (net "<name>") — resaved form with the name inline
          name = name ?? first;
        }
      }
    }
    if (name !== null && name !== '') code = netCodesByName.get(name) ?? code;
    const layersNode = zone.child('layers');
    const layers: string[] = [];
    if (layersNode) {
      for (let i = 1; i < layersNode.length; i++) {
        const l = layersNode.getString(i);
        if (l) layers.push(l);
      }
    }
    // Only the declared outline — filled_polygon pts are clipped fragments
    const polygon: Pt[] = [];
    const declaredPts = zone.child('polygon')?.child('pts');
    if (declaredPts) {
      for (const xy of declaredPts.children('xy')) polygon.push({ x: xy.getNumber(1, 0), y: xy.getNumber(2, 0) });
    }
    const xs = polygon.map((p) => p.x);
    const ys = polygon.map((p) => p.y);
    const fillNode = zone.child('fill');
    const filled = fillNode ? fillNode.getBool(1) === true : false;
    const fillMode = fillNode?.child('mode')?.getString(1) ?? null;
    // Materialized = KiCad actually computed fill geometry into the file
    const materialized = zone.child('filled_polygon') !== null;
    const keepout = zone.child('keepout') !== null || (name === null && code < 0);
    const entry: BoardZone = {
      netCode: code,
      netName: name,
      layers,
      keepout,
      filled,
      fillMode,
      materialized,
      bbox:
        polygon.length > 0
          ? {
              x: round(Math.min(...xs)),
              y: round(Math.min(...ys)),
              width: round(Math.max(...xs) - Math.min(...xs)),
              height: round(Math.max(...ys) - Math.min(...ys)),
            }
          : { x: 0, y: 0, width: 0, height: 0 },
      polygon,
    };
    zones.push(entry);
    if (!keepout && (code >= 0 || name !== null)) netByCode(code >= 0 ? code : -1, name).zones.push({ layers });
  }

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

  // Drop only the unnamed no-net pseudo-net (code 0, ""); named nets from
  // resaved boards legitimately carry code 0 or -1 with inline names.
  const allNets = [...nets.values()].filter((n) => !(n.code === 0 && n.name === ''));
  const viaTotal = allNets.reduce((acc, n) => acc + n.vias.length, 0);
  const unconnectedPads = components.reduce(
    (acc, c) => acc + c.pads.filter((p) => p.net === null && p.type !== 'np_thru_hole').length,
    0,
  );

  // Copper layers observed anywhere on the board (defaults to F/B.Cu)
  const copperLayers = new Set<string>(['F.Cu', 'B.Cu']);
  const isCopper = (l: string) => /^[FB]\.Cu$|^In\d+\.Cu$/.test(l);
  for (const z of zones) for (const l of z.layers) if (isCopper(l)) copperLayers.add(l);
  for (const n of allNets) {
    for (const s of n.segments) if (isCopper(s.layer)) copperLayers.add(s.layer);
  }

  for (const net of allNets) {
    net.route = analyzeNetRouting(net, components, zones, copperLayers);
  }

  return {
    file: pcbPath,
    components,
    nets: allNets,
    zones,
    summary: {
      file: pcbPath,
      components: components.length,
      namedNets: allNets.filter((n) => n.name !== '').length,
      vias: viaTotal,
      zones: zones.filter((z) => !z.keepout).length,
      keepouts: zones.filter((z) => z.keepout).length,
      tracks: segments.length,
      unconnectedPads,
      board,
    },
  };
}

// ─── Copper connectivity analysis ─────────────────────────────────────────────

/** Union-find over `x:y:layer` node keys. */
class UnionFind {
  #parent = new Map<string, string>();

  find(k: string): string {
    let root = this.#parent.get(k) ?? k;
    while (root !== (this.#parent.get(root) ?? root)) root = this.#parent.get(root)!;
    this.#parent.set(k, root);
    return root;
  }

  union(a: string, b: string): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.#parent.set(ra, rb);
    return true;
  }
}

const pointKey = (p: Pt, layer: string) => `${Math.round(p.x * 1e4)}:${Math.round(p.y * 1e4)}:${layer}`;

/** Ray-casting point-in-polygon. */
function pointInPolygon(p: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Pad center transformed from footprint-local coordinates to board space.
 * KiCad y axis points down; positive footprint rotation is CCW on screen.
 * Back-side footprints mirror their children's x coordinates.
 */
function padAbsolutePosition(comp: BoardComponent, pad: BoardPad): Pt {
  const rad = ((comp.at.rotation ?? 0) * Math.PI) / 180;
  let lx = pad.at.x;
  const ly = pad.at.y;
  if (comp.side === 'back') lx = -lx;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: comp.at.x + lx * cos + ly * sin,
    y: comp.at.y - lx * sin + ly * cos,
  };
}

function padCopperLayers(pad: BoardPad, boardCopper: Set<string>): string[] {
  const isThrough =
    pad.type === 'thru_hole' || pad.type === 'connect' || pad.type === 'np_thru_hole' || pad.layers.includes('*.Cu');
  if (isThrough) return [...boardCopper];
  return pad.layers.filter((l) => boardCopper.has(l));
}

/**
 * Builds the copper connectivity graph for one net — pads, vias, track
 * segments, and zone pours — and reports which pins are joined and which
 * still have no copper path between them.
 */
function analyzeNetRouting(
  net: BoardNet,
  components: BoardComponent[],
  zones: BoardZone[],
  boardCopper: Set<string>,
): NetRoute | null {
  interface NetPad {
    pin: string;
    point: Pt;
    layers: string[];
    key0: string;
  }
  const netPads: NetPad[] = [];
  for (const comp of components) {
    for (const pad of comp.pads) {
      if (pad.net !== net.name) continue;
      const point = padAbsolutePosition(comp, pad);
      const layers = padCopperLayers(pad, boardCopper);
      netPads.push({ pin: `${comp.reference}.${pad.pad}`, point, layers, key0: pointKey(point, layers[0] ?? 'F.Cu') });
    }
  }

  const uf = new UnionFind();
  let pourAssisted = false;

  // Pads: a through pad bridges all its layers at its position
  for (const pad of netPads) {
    for (let i = 1; i < pad.layers.length; i++) {
      uf.union(pointKey(pad.point, pad.layers[0]), pointKey(pad.point, pad.layers[i]));
    }
  }

  // Vias bridge their layers (typeCAD places standard through vias)
  for (const via of net.vias) {
    const p = { x: via.x, y: via.y };
    uf.union(pointKey(p, 'F.Cu'), pointKey(p, 'B.Cu'));
  }

  // Segments connect their endpoints on their layer
  for (const seg of net.segments) {
    uf.union(pointKey(seg.start, seg.layer), pointKey(seg.end, seg.layer));
  }

  // Pours: same-net pads, vias, and segment endpoints inside the polygon
  // (on a shared layer) all connect through the copper fill
  for (const zone of zones) {
    if (zone.keepout || zone.netName !== net.name || zone.polygon.length < 3) continue;
    const zoneKey = `pour:${zone.netCode}:${zone.layers.join('+')}`;
    let zoneTouched = false;
    const attach = (p: Pt, layers: string[]) => {
      const shared = layers.filter((l) => zone.layers.includes(l));
      if (shared.length === 0 || !pointInPolygon(p, zone.polygon)) return;
      for (const l of shared) {
        if (uf.union(pointKey(p, l), zoneKey)) zoneTouched = true;
      }
    };
    for (const pad of netPads) attach(pad.point, pad.layers);
    for (const via of net.vias) attach({ x: via.x, y: via.y }, ['F.Cu', 'B.Cu']);
    for (const seg of net.segments) {
      attach(seg.start, [seg.layer]);
      attach(seg.end, [seg.layer]);
    }
    if (zoneTouched) pourAssisted = true;
  }

  // Group pins by copper island
  const groups = new Map<string, string[]>();
  for (const pad of netPads) {
    const root = uf.find(pad.key0);
    const list = groups.get(root) ?? [];
    list.push(pad.pin);
    groups.set(root, list);
  }

  const pinsTotal = netPads.length;
  if (pinsTotal === 0) {
    return {
      segments: net.segments.length,
      length: round3(net.segments.reduce((acc, s) => acc + s.length, 0)),
      layers: [...new Set(net.segments.map((s) => s.layer))],
      pinsTotal: 0,
      pinsConnected: 0,
      disconnectedGroups: [],
      routed: true,
      pourAssisted,
    };
  }

  const sortedGroups = [...groups.values()].map((g) => [...g].sort()).sort((a, b) => b.length - a.length);
  return {
    segments: net.segments.length,
    length: round3(net.segments.reduce((acc, s) => acc + s.length, 0)),
    layers: [...new Set(net.segments.map((s) => s.layer))],
    pinsTotal,
    pinsConnected: sortedGroups[0]?.length ?? 0,
    disconnectedGroups: sortedGroups.slice(1),
    routed: sortedGroups.length <= 1,
    pourAssisted,
  };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

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
