import fs from 'node:fs';
import { parse } from '../../sexpr/index.js';
import { SNode, isSym } from '../../sexpr/query.js';
import { decodeCodeMetadata } from '../../kicad2typecad/codec.js';
import { pointSegDist as pointSegDistance } from '../../pcb/copper_geometry.js';

/**
 * An atom in string position: quoted strings parse as strings, unquoted
 * words as symbols, and unquoted numbers (pad names like `(pad 1 ...)`)
 * as numbers — all must render as text.
 */
function atomString(node: SNode, index: number): string {
  const val = node.rawAt(index);
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (isSym(val)) return val.name;
  return '';
}

interface BoardPad {
  pad: string;
  net: string | null;
  type: string;
  pinType?: string;
  /** Pad center in the footprint's local (unrotated) frame, mm. */
  at: { x: number; y: number };
  /** Pad's own rotation vs the footprint frame, degrees — KiCad stores the
   *  absolute angle (footprint rotation included); it is subtracted here. */
  rotation?: number;
  /** Corner roundness in percent of the lesser side (0 square, 100 round) —
   *  from roundrect_rratio, or 100 for circular pads. */
  roundness?: number;
  /** Pad size in the footprint frame, mm. */
  size: { width: number; height: number };
  /** Copper layers the pad exists on ('*.Cu' expands during analysis). */
  layers: string[];
}

/** Explicit copper layer names plus KiCad's `*.Cu` and `F&B.Cu` wildcards. */
const PAD_COPPER_LAYER = /^([FB]\.Cu|In\d+\.Cu|\*\.Cu|F&B\.Cu)$/;

/**
 * Electrical pads carry copper somewhere. Pads listing only paste/mask
 * layers — the unnamed `*.Paste` squares QFN footprints place over the
 * exposed pad to split its stencil opening — have `(net 0 "")` and no pad
 * name by design: they are board geometry, not connections. A pad with no
 * layers at all is malformed; treat it as electrical so it still surfaces.
 */
export function padCarriesCopper(pad: BoardPad): boolean {
  if (pad.layers.length === 0) return true;
  return pad.layers.some((l) => PAD_COPPER_LAYER.test(l));
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
  /**
   * Center of that same measured bbox in the footprint's local frame,
   * relative to the anchor (the `at` origin) — the physical body center
   * placement files want when the anchor sits elsewhere. Null whenever
   * dimensions is null.
   */
  bodyCenter: { x: number; y: number } | null;
  /** Do-not-populate (KiCad attr or top-level token) — assembly outputs skip it. */
  dnp: boolean;
  /** KiCad's "exclude from position files" attribute. */
  excludeFromPos: boolean;
  /** KiCad's "exclude from BOM" attribute. */
  excludeFromBom: boolean;
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
  /** "file:line" of the declaring `pcb.net(...)` (from the netlist's Code property) */
  source?: string;
  /** "file:line" of the declaring `pcb.route(<net>)` (from the netlist's Route property) */
  routeSource?: string;
}

interface BoardSegment {
  layer: string;
  width: number;
  length: number;
  start: Pt;
  end: Pt;
}

/** Copper pours and keepout regions parsed from zone nodes. */
interface BoardZone {
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
interface NetRoute {
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

interface BoardSummary {
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
  /** The board's aux (drill/place) origin when set — placement exports can rebase onto it. */
  auxOrigin: { x: number; y: number } | null;
  /** Edge.Cuts outline as line segments (arcs flattened, rects expanded),
   *  mm board coordinates. Empty when the board has no outline graphics. */
  outline: { x1: number; y1: number; x2: number; y2: number }[];
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
  // `(net 3)` — a bare number atom. getString() reads only strings/symbols,
  // so without this the token reads as nameless code -1 and the whole
  // segment/via (every router-written one) is dropped from its net.
  const raw = net.rawAt(1);
  if (typeof raw === 'number') return { code: raw, name: null };
  const first = net.getString(1) ?? '';
  if (/^-?\d+$/.test(first)) return { code: parseInt(first, 10), name: null };
  if (first !== '') return { code: netCodesByName.get(first) ?? -1, name: first };
  return { code: -1, name: null };
}

export function isPowerNetName(name: string): boolean {
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

/** Size plus the bbox center (both rounded to µm) — the center is what
 *  placement exports transport through the footprint rotation to get the
 *  body centroid when the anchor is off-center. */
function bboxMeasure(points: Pt[]): {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
} | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    width: round(Math.max(...xs) - minX),
    height: round(Math.max(...ys) - minY),
    centerX: round((Math.max(...xs) + minX) / 2),
    centerY: round((Math.max(...ys) + minY) / 2),
  };
}

/**
 * Footprint bounding box from its own geometry, in the footprint's local
 * (unrotated) frame. Preference: fabrication outline (the physical body),
 * then silkscreen, then any fp_* graphics, then pad extents.
 */
function footprintDimensions(
  fp: SNode,
  padNodes: SNode[],
): { width: number; height: number; centerX: number; centerY: number } | null {
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
    const size = bboxMeasure(byLayer.get(layer) ?? []);
    if (size) return size;
  }
  const allGraphics = [...byLayer.values()].flat();
  const graphicsSize = bboxMeasure(allGraphics);
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
  return bboxMeasure(padPts);
}

/**
 * Footprint assembly flags (dnp, exclude-from-pos/bom) across every shape
 * KiCad has written: modern boards carry `(dnp yes)` as a footprint-level
 * token or `(attr (dnp yes))`; older ones used bare symbols inside
 * `(attr dnp)` / `(attr exclude_from_pos_files)`.
 */
function footprintAssemblyFlags(fp: SNode): { dnp: boolean; excludeFromPos: boolean; excludeFromBom: boolean } {
  const flags = { dnp: false, excludeFromPos: false, excludeFromBom: false };
  const flagValue = (name: string): boolean | null => {
    // atomString covers both quoted ("yes") and bare-symbol (yes) atoms
    // footprint-level token: (dnp yes)
    const own = fp.child(name);
    if (own) {
      const v = atomString(own, 1);
      return v === 'yes' || v === 'true';
    }
    // nested inside (attr ...): (attr (dnp yes)) or legacy (attr dnp)
    const attr = fp.child('attr');
    if (attr) {
      const nested = attr.child(name);
      if (nested) {
        const v = atomString(nested, 1);
        return v === 'yes' || v === 'true';
      }
      for (let i = 1; i < attr.length; i++) {
        if (atomString(attr, i) === name) return true;
      }
    }
    return null;
  };
  for (const [name, key] of [
    ['dnp', 'dnp'],
    ['exclude_from_pos_files', 'excludeFromPos'],
    ['exclude_from_bom', 'excludeFromBom'],
  ] as const) {
    const v = flagValue(name);
    if (v !== null) flags[key] = v;
  }
  return flags;
}

export function isPowerNet(net: BoardNet): boolean {
  if (net.name && isPowerNetName(net.name)) return true;
  // Stitched ground planes: many vias or a zone with no distinctive name.
  return net.vias.length >= 4 || net.zones.length > 0;
}

/**
 * Attach source provenance to nets from the netlist beside the board: the
 * typeCAD serializer stamps `(property "Code" "file:line")` (the declaring
 * pcb.net call) and `(property "Route" "file:line")` (the declaring
 * pcb.route call) on each net. The .kicad_pcb can't carry this — kicad-cli's
 * --save-board resave would strip it — but the netlist is typeCAD's own
 * artifact and never round-tripped. Optional metadata: a missing or stale
 * netlist leaves the sources unset.
 */
function attachNetSources(nets: BoardNet[], pcbPath: string): void {
  const netlistPath = pcbPath.replace(/\.kicad_pcb$/i, '.net');
  let text: string;
  try {
    text = fs.readFileSync(netlistPath, 'utf-8');
  } catch {
    return;
  }
  let root: SNode;
  try {
    root = SNode.from(parse(text) as unknown as never[]);
  } catch {
    return;
  }
  const byName = new Map(nets.map((n) => [n.name, n]));
  // netlist nets nest inside an (nets ...) container under (export ...)
  const container = root.child('nets') ?? root;
  for (const net of container.children('net')) {
    const nameNode = net.child('name');
    const name = nameNode ? atomString(nameNode, 1) : '';
    const target = byName.get(name);
    if (!target) continue;
    for (const prop of net.children('property')) {
      const key = atomString(prop, 1);
      const value = prop.rawAt(2);
      if (typeof value !== 'string') continue;
      if (key === 'Code') target.source = value;
      else if (key === 'Route') target.routeSource = value;
    }
  }
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
    // typeCAD's own serializer and older footprint libraries write KiCad-5
    // style (fp_text reference "...") instead of (property "Reference" ...).
    if (!reference || !value) {
      for (const text of fp.children('fp_text')) {
        const kind = text.getString(1);
        if (kind === 'reference' && !reference) reference = text.getString(2) ?? '';
        else if (kind === 'value' && !value) value = text.getString(2) ?? '';
      }
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
    const flags = footprintAssemblyFlags(fp);
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
      // pad rotation is stored absolute (footprint rotation included);
      // package footprints want the pad's own angle
      const absRot = padAt?.getNumber(3, NaN) ?? NaN;
      const padType = atomString(pad, 2);
      const padShape = atomString(pad, 3);
      const rratio = pad.child('roundrect_rratio')?.getNumber(1, NaN) ?? NaN;
      pads.push({
        pad: atomString(pad, 1),
        type: padType,
        net: net ? nameFor(net.code, net.name) : null,
        pinType: pintypeNode ? (pintypeNode.getString(1) ?? undefined) : undefined,
        at: { x: padAt?.getNumber(1, 0) ?? 0, y: padAt?.getNumber(2, 0) ?? 0 },
        rotation: Number.isFinite(absRot) ? absRot - (atNode?.getNumber(3, 0) ?? 0) : undefined,
        roundness: padShape === 'circle' ? 100 : Number.isFinite(rratio) ? rratio * 100 : undefined,
        size: {
          width: pad.child('size')?.getNumber(1, 0) ?? 0,
          height: pad.child('size')?.getNumber(2, 0) ?? 0,
        },
        layers: padLayers,
      });
    }

    const bbox = footprintDimensions(fp, padNodes);
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
      dimensions: bbox ? { width: bbox.width, height: bbox.height } : null,
      bodyCenter: bbox ? { x: bbox.centerX, y: bbox.centerY } : null,
      dnp: flags.dnp,
      excludeFromPos: flags.excludeFromPos,
      excludeFromBom: flags.excludeFromBom,
      variable,
      source,
      pads,
    });
  }

  // Nets: aggregate pins, vias, zones, tracks. Boards with a global net
  // table aggregate by code; kicad-cli --save-board output carries inline
  // net names with no table, so those aggregate by name instead.
  const nets = new Map<string, BoardNet>();
  const netByCode = (code: number, name: string | null): BoardNet => {
    const key = code >= 0 ? `c${code}` : `n${name ?? ''}`;
    let n = nets.get(key);
    if (!n) {
      n = { code, name: name ?? netNames.get(code) ?? '', pins: [], vias: [], zones: [], segments: [], route: null };
      nets.set(key, n);
    }
    if (!n.name && name) n.name = name;
    return n;
  };

  for (const comp of components) {
    for (const pad of comp.pads) {
      if (pad.net === null) continue;
      // Prefer the code table so resaved inline names still merge with any
      // coded entries; nameless pads already resolved via netNames.
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

  // Board bounds + outline segments from Edge.Cuts graphics. Arcs flatten to
  // ~5° chords so the outline is a plain polyline (what consumers like the
  // OpenPnP profile want); rects contribute their four edges.
  const roundP = (v: number) => Math.round(v * 1000) / 1000;
  const outline: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const addSegment = (a: Pt, b: Pt) =>
    outline.push({ x1: roundP(a.x), y1: roundP(a.y), x2: roundP(b.x), y2: roundP(b.y) });
  const addArc = (start: Pt, mid: Pt | null, end: Pt, angle: number | null): void => {
    let cx: number;
    let cy: number;
    let sweep: number;
    if (mid) {
      const d = 2 * (start.x * (mid.y - end.y) + mid.x * (end.y - start.y) + end.x * (start.y - mid.y));
      if (Math.abs(d) < 1e-9) return; // collinear
      const sq = (p: Pt) => p.x * p.x + p.y * p.y;
      cx = (sq(start) * (mid.y - end.y) + sq(mid) * (end.y - start.y) + sq(end) * (start.y - mid.y)) / d;
      cy = (sq(start) * (end.x - mid.x) + sq(mid) * (start.x - end.x) + sq(end) * (mid.x - start.x)) / d;
      const norm = (x: number) => {
        let v = x;
        while (v < 0) v += 2 * Math.PI;
        while (v >= 2 * Math.PI) v -= 2 * Math.PI;
        return v;
      };
      const a1 = Math.atan2(start.y - cy, start.x - cx);
      const a2 = Math.atan2(end.y - cy, end.x - cx);
      const throughMid = norm(Math.atan2(mid.y - cy, mid.x - cx) - a1);
      const ccw = norm(a2 - a1);
      sweep = throughMid <= ccw ? ccw : ccw - 2 * Math.PI;
    } else if (angle !== null && Math.abs(angle % 360) > 1e-9) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const chord = Math.hypot(dx, dy);
      const absRad = (Math.abs(angle) * Math.PI) / 180;
      const r = chord / (2 * Math.sin(Math.min(absRad, 2 * Math.PI - 1e-9) / 2));
      const h = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
      const mx = (start.x + end.x) / 2;
      const my = (start.y + end.y) / 2;
      const px = -dy / chord;
      const py = dx / chord;
      // KiCad's positive file angle is CCW on screen — negative in the
      // Y-down math frame; pick the center whose sweep matches
      const want = angle > 0 ? -absRad : absRad;
      const sweepOf = (c: Pt) => {
        let dA = Math.atan2(end.y - c.y, end.x - c.x) - Math.atan2(start.y - c.y, start.x - c.x);
        while (dA > Math.PI) dA -= 2 * Math.PI;
        while (dA < -Math.PI) dA += 2 * Math.PI;
        return dA;
      };
      const c1 = { x: mx + px * h, y: my + py * h };
      const c2 = { x: mx - px * h, y: my - py * h };
      const c = Math.abs(sweepOf(c1) - want) <= Math.abs(sweepOf(c2) - want) ? c1 : c2;
      cx = c.x;
      cy = c.y;
      sweep = want;
    } else {
      addSegment(start, end);
      return;
    }
    const r = Math.hypot(start.x - cx, start.y - cy);
    const a1 = Math.atan2(start.y - cy, start.x - cx);
    const steps = Math.max(2, Math.ceil((Math.abs(sweep) * 180) / Math.PI / 5));
    for (let i = 0; i < steps; i++) {
      const b1 = a1 + (sweep * i) / steps;
      const b2 = a1 + (sweep * (i + 1)) / steps;
      addSegment(
        { x: cx + r * Math.cos(b1), y: cy + r * Math.sin(b1) },
        { x: cx + r * Math.cos(b2), y: cy + r * Math.sin(b2) },
      );
    }
  };

  let board: BoardSummary['board'] = null;
  const edgePts: { x: number; y: number }[] = [];
  for (const node of [
    ...root.findAll('gr_line'),
    ...root.findAll('fp_line'),
    ...root.findAll('gr_rect'),
    ...root.findAll('fp_rect'),
    ...root.findAll('gr_arc'),
    ...root.findAll('fp_arc'),
  ]) {
    const layerRaw = node.child('layer')?.rawAt(1);
    if (layerRaw !== 'Edge.Cuts') continue;
    const tag = atomString(node, 0);
    const start = nodeChildPoint(node, 'start');
    const end = nodeChildPoint(node, 'end');
    if (start) edgePts.push(start);
    if (end) edgePts.push(end);
    if (!start || !end) continue;
    if (tag === 'gr_line' || tag === 'fp_line') {
      addSegment(start, end);
    } else if (tag === 'gr_rect' || tag === 'fp_rect') {
      const c2 = { x: end.x, y: start.y };
      const c4 = { x: start.x, y: end.y };
      addSegment(start, c2);
      addSegment(c2, end);
      addSegment(end, c4);
      addSegment(c4, start);
      edgePts.push(c2, c4);
    } else if (tag === 'gr_arc' || tag === 'fp_arc') {
      const mid = nodeChildPoint(node, 'mid');
      const angleRaw = node.child('angle')?.getNumber(1, NaN) ?? NaN;
      addArc(start, mid, end, Number.isFinite(angleRaw) ? angleRaw : null);
    }
  }
  if (edgePts.length > 0) {
    board = {
      minX: Math.min(...edgePts.map((p) => p.x)),
      minY: Math.min(...edgePts.map((p) => p.y)),
      maxX: Math.max(...edgePts.map((p) => p.x)),
      maxY: Math.max(...edgePts.map((p) => p.y)),
    };
  }

  // Drop the unnamed no-net pseudo-nets (code 0 "" and via-only "(net "")");
  // named nets from resaved boards legitimately carry code 0 or -1.
  const allNets = [...nets.values()].filter((n) => n.name !== '' || n.pins.length > 0);
  // Count vias from the source: free (net-less) vias sit in a dropped
  // pseudo-net but still belong in the board totals.
  const viaTotal = root.findAll('via').length;
  const unconnectedPads = components.reduce(
    (acc, c) => acc + c.pads.filter((p) => p.net === null && p.type !== 'np_thru_hole' && padCarriesCopper(p)).length,
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

  attachNetSources(allNets, pcbPath);

  // Aux (drill/place) origin — modern boards put it at the root, older
  // ones inside (setup ...). Placement exports can rebase onto it.
  const auxNode = root.child('aux_origin') ?? root.child('setup')?.child('aux_origin');
  const auxOrigin = auxNode
    ? { x: auxNode.getNumber(1, 0), y: auxNode.getNumber(2, 0) }
    : null;

  return {
    file: pcbPath,
    components,
    nets: allNets,
    zones,
    auxOrigin,
    outline,
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
 *
 * Connectivity is geometric, not coordinate-exact: a track endpoint that
 * lands anywhere on a pad (not just its center), a segment crossing another
 * mid-span, and a via sitting inside a pad's annulus all join their items.
 * This matches what the DRC's copper analysis concludes — the two must
 * never disagree about whether a board is connected.
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
    halfW: number;
    halfH: number;
    rotation: number;
    circle: boolean;
  }
  const CONNECT_TOL_MM = 0.001; // touching counts as connected (matches DRC's 1µm)

  const netPads: NetPad[] = [];
  for (const comp of components) {
    for (const pad of comp.pads) {
      if (pad.net !== net.name) continue;
      const point = padAbsolutePosition(comp, pad);
      const layers = padCopperLayers(pad, boardCopper);
      netPads.push({
        pin: `${comp.reference}.${pad.pad}`,
        point,
        layers,
        key0: pointKey(point, layers[0] ?? 'F.Cu'),
        halfW: pad.size.width / 2,
        halfH: pad.size.height / 2,
        rotation: (pad.rotation ?? 0) + (comp.at.rotation ?? 0),
        circle: (pad.roundness ?? 0) >= 100,
      });
    }
  }

  const uf = new UnionFind();
  let pourAssisted = false;

  /** True when point p lies on the pad's copper (its rectangle or circle, +tol). */
  const pointOnPad = (p: Pt, pad: NetPad): boolean => {
    if (pad.circle) {
      return Math.hypot(p.x - pad.point.x, p.y - pad.point.y) <= Math.max(pad.halfW, pad.halfH) + CONNECT_TOL_MM;
    }
    const rad = (-pad.rotation * Math.PI) / 180;
    const dx = p.x - pad.point.x;
    const dy = p.y - pad.point.y;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
    return Math.abs(lx) <= pad.halfW + CONNECT_TOL_MM && Math.abs(ly) <= pad.halfH + CONNECT_TOL_MM;
  };

  /** True when the pad's center lies on the segment's swept copper (+tol). */
  const padOnSegment = (pad: NetPad, seg: BoardSegment): boolean => {
    return (
      pointSegDistance(pad.point, seg.start, seg.end) <= Math.max(pad.halfW, pad.halfH) + seg.width / 2 + CONNECT_TOL_MM
    );
  };

  // Pads: a through pad bridges all its layers at its position; two pads of
  // the same net whose copper overlaps (a via-in-pad stack, a THT pad under
  // an SMD) connect directly.
  for (let i = 0; i < netPads.length; i++) {
    const pad = netPads[i]!;
    for (let l = 1; l < pad.layers.length; l++) {
      uf.union(pointKey(pad.point, pad.layers[0]!), pointKey(pad.point, pad.layers[l]!));
    }
    for (let j = i + 1; j < netPads.length; j++) {
      const other = netPads[j]!;
      if (!pad.layers.some((l) => other.layers.includes(l))) continue;
      if (pointOnPad(other.point, pad) || pointOnPad(pad.point, other)) {
        uf.union(pad.key0, other.key0);
      }
    }
  }

  // Vias bridge their layers (typeCAD places standard through vias)
  for (const via of net.vias) {
    const p = { x: via.x, y: via.y };
    uf.union(pointKey(p, 'F.Cu'), pointKey(p, 'B.Cu'));
    // A via lands on a pad (via-in-pad) or on a segment's copper → joins it.
    for (const pad of netPads) {
      if (pad.layers.some((l) => l === 'F.Cu' || l === 'B.Cu') && pointOnPad(p, pad)) {
        uf.union(pointKey(p, 'F.Cu'), pad.key0);
      }
    }
    for (const seg of net.segments) {
      if (seg.layer !== 'F.Cu' && seg.layer !== 'B.Cu') continue;
      if (pointSegDistance(p, seg.start, seg.end) <= seg.width / 2 + CONNECT_TOL_MM) {
        uf.union(pointKey(p, 'F.Cu'), pointKey(p, seg.layer));
      }
    }
  }

  // Segments: each segment is itself a copper bridge between its endpoints.
  for (const seg of net.segments) {
    uf.union(pointKey(seg.start, seg.layer), pointKey(seg.end, seg.layer));
  }

  // Segments: endpoints join whatever copper they touch — another segment's
  // endpoint, another segment's span (mid-span tee), or a pad's area.
  for (let i = 0; i < net.segments.length; i++) {
    const a = net.segments[i]!;
    for (const end of [a.start, a.end]) {
      const endKey = pointKey(end, a.layer);
      for (const pad of netPads) {
        if (pad.layers.includes(a.layer) && pointOnPad(end, pad)) {
          uf.union(endKey, pad.key0);
        }
      }
    }
    for (let j = i + 1; j < net.segments.length; j++) {
      const b = net.segments[j]!;
      if (a.layer !== b.layer) continue;
      const keyA = pointKey(a.start, a.layer);
      const keyB = pointKey(b.start, b.layer);
      const touch =
        pointSegDistance(a.start, b.start, b.end) <= b.width / 2 + CONNECT_TOL_MM ||
        pointSegDistance(a.end, b.start, b.end) <= b.width / 2 + CONNECT_TOL_MM ||
        pointSegDistance(b.start, a.start, a.end) <= a.width / 2 + CONNECT_TOL_MM ||
        pointSegDistance(b.end, a.start, a.end) <= a.width / 2 + CONNECT_TOL_MM;
      if (touch) uf.union(keyA, keyB);
    }
    // A pad the segment runs across (not just ends on) also connects.
    for (const pad of netPads) {
      if (pad.layers.includes(a.layer) && padOnSegment(pad, a)) {
        uf.union(pointKey(a.start, a.layer), pad.key0);
      }
    }
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

/** Electrical pads with no net — mounting holes and paste/mask-only apertures excluded. */
export function unconnectedPads(model: BoardModel): { reference: string; pad: string; type: string }[] {
  const out: { reference: string; pad: string; type: string }[] = [];
  for (const c of model.components) {
    for (const p of c.pads) {
      if (p.net === null && p.type !== 'np_thru_hole' && padCarriesCopper(p))
        out.push({ reference: c.reference, pad: p.pad, type: p.type });
    }
  }
  return out;
}

/** Named nets with a single electrical pin — likely forgotten connections. */
export function singlePinNets(model: BoardModel): BoardNet[] {
  return model.nets.filter((n) => n.name !== '' && n.pins.length <= 1);
}
