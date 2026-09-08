import { parse, SNode, isList, type SExpr } from '../../sexpr/index.js';

export interface ChangeDescription {
  type: 'added' | 'removed' | 'modified';
  category: 'component' | 'track' | 'via' | 'zone' | 'text' | 'graphic' | 'setup';
  description: string;
  ref?: string;
  layer?: string;
  x?: number;
  y?: number;
  highlightRadius?: number;
  highlightW?: number;
  highlightH?: number;
}

export interface TextualDiff {
  changes: ChangeDescription[];
  summary: string;
}

interface FootprintData {
  uuid: string;
  ref: string;
  value: string;
  footprintName: string;
  layer: string;
  x: number;
  y: number;
  rotation: number;
  localMinX: number;
  localMinY: number;
  localMaxX: number;
  localMaxY: number;
}

interface SegmentData {
  uuid: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  width: number;
  layer: string;
  net: string;
}

interface ViaData {
  uuid: string;
  x: number;
  y: number;
  size: number;
  drill: number;
  layers: string;
  net: string;
}

function collectFootprintLocalBBox(fp: SNode): { minX: number; minY: number; maxX: number; maxY: number } {
  const coords: number[] = [];
  for (const node of fp.findAll('fp_line')) {
    const start = node.child('start');
    const end = node.child('end');
    if (start) {
      coords.push(start.getNumber(1) || 0, start.getNumber(2) || 0);
    }
    if (end) {
      coords.push(end.getNumber(1) || 0, end.getNumber(2) || 0);
    }
  }
  for (const node of fp.findAll('fp_rect')) {
    const start = node.child('start');
    const end = node.child('end');
    if (start) {
      coords.push(start.getNumber(1) || 0, start.getNumber(2) || 0);
    }
    if (end) {
      coords.push(end.getNumber(1) || 0, end.getNumber(2) || 0);
    }
  }
  for (const node of fp.findAll('fp_circle')) {
    const center = node.child('center');
    const end = node.child('end');
    if (center) {
      coords.push(center.getNumber(1) || 0, center.getNumber(2) || 0);
    }
    if (end) {
      coords.push(end.getNumber(1) || 0, end.getNumber(2) || 0);
    }
  }
  for (const node of fp.findAll('fp_arc')) {
    const start = node.child('start');
    const mid = node.child('mid');
    const end = node.child('end');
    if (start) {
      coords.push(start.getNumber(1) || 0, start.getNumber(2) || 0);
    }
    if (mid) {
      coords.push(mid.getNumber(1) || 0, mid.getNumber(2) || 0);
    }
    if (end) {
      coords.push(end.getNumber(1) || 0, end.getNumber(2) || 0);
    }
  }
  for (const node of fp.findAll('fp_poly')) {
    const pts = node.child('pts');
    if (pts) {
      for (const xy of pts.findAll('xy')) {
        coords.push(xy.getNumber(1) || 0, xy.getNumber(2) || 0);
      }
    }
  }
  for (const node of fp.findAll('pad')) {
    const at = node.child('at');
    if (at) {
      coords.push(at.getNumber(1) || 0, at.getNumber(2) || 0);
    }
  }
  for (const node of fp.findAll('fp_text')) {
    const at = node.child('at');
    if (at) {
      coords.push(at.getNumber(1) || 0, at.getNumber(2) || 0);
    }
  }
  if (coords.length < 2) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < coords.length; i += 2) {
    if (coords[i] < minX) minX = coords[i];
    if (coords[i] > maxX) maxX = coords[i];
    if (coords[i + 1] < minY) minY = coords[i + 1];
    if (coords[i + 1] > maxY) maxY = coords[i + 1];
  }
  return { minX, minY, maxX, maxY };
}

function extractFootprints(tree: SNode): Map<string, FootprintData> {
  const map = new Map<string, FootprintData>();
  for (const fp of tree.findAll('footprint')) {
    const uuid = fp.child('uuid')?.stringValue || '';
    if (!uuid) continue;

    let ref = '';
    let value = '';
    for (const prop of fp.children('property')) {
      const propName = prop.getString(1);
      if (propName === 'Reference') ref = prop.getString(2) || '';
      if (propName === 'Value') value = prop.getString(2) || '';
    }

    const atNode = fp.child('at');
    const bbox = collectFootprintLocalBBox(fp);
    const fpRef = ref || '(no ref)';
    map.set(uuid, {
      uuid,
      ref,
      value,
      footprintName: fp.getString(1) || '',
      layer: fp.child('layer')?.stringValue || '',
      x: atNode?.getNumber(1) || 0,
      y: atNode?.getNumber(2) || 0,
      rotation: atNode?.getNumber(3, 0) || 0,
      localMinX: bbox.minX,
      localMinY: bbox.minY,
      localMaxX: bbox.maxX,
      localMaxY: bbox.maxY,
    });
  }
  return map;
}

function extractSegments(tree: SNode): Map<string, SegmentData> {
  const map = new Map<string, SegmentData>();
  for (const seg of tree.findAll('segment')) {
    const uuid = seg.child('uuid')?.stringValue || '';
    if (!uuid) continue;

    const start = seg.child('start');
    const end = seg.child('end');
    map.set(uuid, {
      uuid,
      startX: start?.getNumber(1) || 0,
      startY: start?.getNumber(2) || 0,
      endX: end?.getNumber(1) || 0,
      endY: end?.getNumber(2) || 0,
      width: seg.child('width')?.getNumber(1) || 0,
      layer: seg.child('layer')?.stringValue || '',
      net: seg.child('net')?.stringValue || '',
    });
  }
  return map;
}

function extractVias(tree: SNode): Map<string, ViaData> {
  const map = new Map<string, ViaData>();
  for (const via of tree.findAll('via')) {
    const uuid = via.child('uuid')?.stringValue || '';
    if (!uuid) continue;

    const atNode = via.child('at');
    const layersStr = via.child('layers')?.joinedStringValue || '';
    map.set(uuid, {
      uuid,
      x: atNode?.getNumber(1) || 0,
      y: atNode?.getNumber(2) || 0,
      size: via.child('size')?.getNumber(1) || 0,
      drill: via.child('drill')?.getNumber(1) || 0,
      layers: layersStr.replace(/\s+/g, ' \u2194 '),
      net: via.child('net')?.stringValue || '',
    });
  }
  return map;
}

function fmt(x: number, y: number): string {
  return `(${x}, ${y})`;
}

function netLabel(net: string): string {
  return net ? `net: ${net}` : 'unassigned';
}

function footprintCenterAndRadius(fp: FootprintData): { cx: number; cy: number; radius: number; w: number; h: number } {
  const cx = fp.x + (fp.localMinX + fp.localMaxX) / 2;
  const cy = fp.y + (fp.localMinY + fp.localMaxY) / 2;
  const dx = (fp.localMaxX - fp.localMinX) / 2;
  const dy = (fp.localMaxY - fp.localMinY) / 2;
  const radius = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
  const w = fp.localMaxX - fp.localMinX;
  const h = fp.localMaxY - fp.localMinY;
  return { cx, cy, radius, w, h };
}

function compareFootprints(
  orig: Map<string, FootprintData>,
  mod: Map<string, FootprintData>,
  changes: ChangeDescription[],
) {
  for (const [uuid, fp] of mod) {
    if (!orig.has(uuid)) {
      const { cx, cy, radius, w, h } = footprintCenterAndRadius(fp);
      changes.push({
        type: 'added',
        category: 'component',
        description: `${fp.ref} added (${fp.value}, ${fp.layer})`,
        ref: fp.ref,
        layer: fp.layer,
        x: cx,
        y: cy,
        highlightRadius: radius,
        highlightW: w,
        highlightH: h,
      });
    }
  }
  for (const [uuid, fp] of orig) {
    if (!mod.has(uuid)) {
      const { cx, cy, radius, w, h } = footprintCenterAndRadius(fp);
      changes.push({
        type: 'removed',
        category: 'component',
        description: `${fp.ref} removed (${fp.value})`,
        ref: fp.ref,
        layer: fp.layer,
        x: cx,
        y: cy,
        highlightRadius: radius,
        highlightW: w,
        highlightH: h,
      });
    }
  }
  for (const [uuid, m] of mod) {
    const o = orig.get(uuid);
    if (!o) continue;

    const parts: string[] = [];
    if (o.x !== m.x || o.y !== m.y || o.rotation !== m.rotation) {
      if (o.rotation !== m.rotation) {
        parts.push(
          `moved ${fmt(o.x, o.y)} \u2192 ${fmt(m.x, m.y)}, rotated ${o.rotation}\u00B0 \u2192 ${m.rotation}\u00B0`,
        );
      } else {
        parts.push(`moved ${fmt(o.x, o.y)} \u2192 ${fmt(m.x, m.y)}`);
      }
    }
    if (o.layer !== m.layer) parts.push(`layer ${o.layer} \u2192 ${m.layer}`);
    if (o.value !== m.value) parts.push(`value "${o.value}" \u2192 "${m.value}"`);

    if (parts.length > 0) {
      const { cx, cy, radius, w, h } = footprintCenterAndRadius(m);
      changes.push({
        type: 'modified',
        category: 'component',
        description: `${m.ref} ${parts.join(', ')}`,
        ref: m.ref,
        layer: m.layer,
        x: cx,
        y: cy,
        highlightRadius: radius,
        highlightW: w,
        highlightH: h,
      });
    }
  }
}

function compareSegments(orig: Map<string, SegmentData>, mod: Map<string, SegmentData>, changes: ChangeDescription[]) {
  for (const [uuid, seg] of mod) {
    if (!orig.has(uuid)) {
      const dx = seg.endX - seg.startX;
      const dy = seg.endY - seg.startY;
      const length = Math.max(Math.sqrt(dx * dx + dy * dy), 0.1);
      changes.push({
        type: 'added',
        category: 'track',
        description: `Track added on ${seg.layer} ${fmt(seg.startX, seg.startY)} \u2192 ${fmt(seg.endX, seg.endY)} (${netLabel(seg.net)})`,
        layer: seg.layer,
        x: (seg.startX + seg.endX) / 2,
        y: (seg.startY + seg.endY) / 2,
        highlightRadius: length / 2,
        highlightW: Math.abs(dx) || 0.1,
        highlightH: Math.abs(dy) || 0.1,
      });
    }
  }
  for (const [uuid, seg] of orig) {
    if (!mod.has(uuid)) {
      const dx = seg.endX - seg.startX;
      const dy = seg.endY - seg.startY;
      const length = Math.max(Math.sqrt(dx * dx + dy * dy), 0.1);
      changes.push({
        type: 'removed',
        category: 'track',
        description: `Track removed on ${seg.layer} ${fmt(seg.startX, seg.startY)} \u2192 ${fmt(seg.endX, seg.endY)} (${netLabel(seg.net)})`,
        layer: seg.layer,
        x: (seg.startX + seg.endX) / 2,
        y: (seg.startY + seg.endY) / 2,
        highlightRadius: length / 2,
        highlightW: Math.abs(dx) || 0.1,
        highlightH: Math.abs(dy) || 0.1,
      });
    }
  }
  for (const [uuid, m] of mod) {
    const o = orig.get(uuid);
    if (!o) continue;

    const parts: string[] = [];
    if (o.startX !== m.startX || o.startY !== m.startY)
      parts.push(`start ${fmt(o.startX, o.startY)} \u2192 ${fmt(m.startX, m.startY)}`);
    if (o.endX !== m.endX || o.endY !== m.endY) parts.push(`end ${fmt(o.endX, o.endY)} \u2192 ${fmt(m.endX, m.endY)}`);
    if (o.width !== m.width) parts.push(`width ${o.width} \u2192 ${m.width}`);
    if (o.layer !== m.layer) parts.push(`layer ${o.layer} \u2192 ${m.layer}`);
    if (o.net !== m.net) parts.push(`net "${o.net || 'unassigned'}" \u2192 "${m.net || 'unassigned'}"`);

    if (parts.length > 0) {
      const dx = m.endX - m.startX;
      const dy = m.endY - m.startY;
      const length = Math.max(Math.sqrt(dx * dx + dy * dy), 0.1);
      changes.push({
        type: 'modified',
        category: 'track',
        description: `Track modified on ${m.layer} (${parts.join(', ')})`,
        layer: m.layer,
        x: (m.startX + m.endX) / 2,
        y: (m.startY + m.endY) / 2,
        highlightRadius: length / 2,
        highlightW: Math.abs(dx) || 0.1,
        highlightH: Math.abs(dy) || 0.1,
      });
    }
  }
}

function compareVias(orig: Map<string, ViaData>, mod: Map<string, ViaData>, changes: ChangeDescription[]) {
  for (const [uuid, via] of mod) {
    if (!orig.has(uuid)) {
      const s = Math.max(via.size, 0.5);
      changes.push({
        type: 'added',
        category: 'via',
        description: `Via added at ${fmt(via.x, via.y)} (${via.layers}, ${netLabel(via.net)})`,
        layer: via.layers,
        x: via.x,
        y: via.y,
        highlightRadius: s / 2,
        highlightW: s,
        highlightH: s,
      });
    }
  }
  for (const [uuid, via] of orig) {
    if (!mod.has(uuid)) {
      const s = Math.max(via.size, 0.5);
      changes.push({
        type: 'removed',
        category: 'via',
        description: `Via removed at ${fmt(via.x, via.y)} (${via.layers})`,
        layer: via.layers,
        x: via.x,
        y: via.y,
        highlightRadius: s / 2,
        highlightW: s,
        highlightH: s,
      });
    }
  }
  for (const [uuid, m] of mod) {
    const o = orig.get(uuid);
    if (!o) continue;

    const parts: string[] = [];
    if (o.x !== m.x || o.y !== m.y) parts.push(`moved ${fmt(o.x, o.y)} \u2192 ${fmt(m.x, m.y)}`);
    if (o.size !== m.size) parts.push(`size ${o.size} \u2192 ${m.size}`);
    if (o.drill !== m.drill) parts.push(`drill ${o.drill} \u2192 ${m.drill}`);
    if (o.net !== m.net) parts.push(`net "${o.net || 'unassigned'}" \u2192 "${m.net || 'unassigned'}"`);

    if (parts.length > 0) {
      const s = Math.max(m.size, 0.5);
      changes.push({
        type: 'modified',
        category: 'via',
        description: `Via modified at ${fmt(m.x, m.y)} (${parts.join(', ')})`,
        layer: m.layers,
        x: m.x,
        y: m.y,
        highlightRadius: s / 2,
        highlightW: s,
        highlightH: s,
      });
    }
  }
}

export interface NetInfo {
  name: string;
  segments: SegmentData[];
  vias: ViaData[];
  refs: string[];
}

export interface NetDiffEntry {
  name: string;
  type: 'added' | 'removed' | 'modified';
  origSegments: number;
  modSegments: number;
  origVias: number;
  modVias: number;
  origRefs: string[];
  modRefs: string[];
  details: string[];
}

export interface NetlistDiff {
  nets: NetDiffEntry[];
  summary: string;
}

function buildNetNameMap(tree: SNode): Map<number, string> {
  const map = new Map<number, string>();
  for (const netNode of tree.findAll('net')) {
    const num = netNode.getNumber(1);
    const name = netNode.getString(2);
    if (num >= 0 && name) map.set(num, name);
  }
  return map;
}

function resolveNetName(netChild: SNode | null, nameMap: Map<number, string>): string {
  if (!netChild) return 'unassigned';
  const sv = netChild.stringValue;
  if (sv !== null) return sv;
  const num = netChild.getNumber(1);
  if (num !== 0) {
    const name = nameMap.get(num);
    if (name) return name;
    return String(num);
  }
  return 'unassigned';
}

function extractNets(tree: SNode, nameMap: Map<number, string>): Map<string, NetInfo> {
  const nets = new Map<string, NetInfo>();

  function ensureNet(name: string): NetInfo {
    if (!nets.has(name)) nets.set(name, { name, segments: [], vias: [], refs: [] });
    return nets.get(name)!;
  }

  for (const seg of tree.findAll('segment')) {
    const net = resolveNetName(seg.child('net'), nameMap);
    const n = ensureNet(net);
    const uuid = seg.child('uuid')?.stringValue || '';
    const start = seg.child('start');
    const end = seg.child('end');
    n.segments.push({
      uuid,
      startX: start?.getNumber(1) || 0,
      startY: start?.getNumber(2) || 0,
      endX: end?.getNumber(1) || 0,
      endY: end?.getNumber(2) || 0,
      width: seg.child('width')?.getNumber(1) || 0,
      layer: seg.child('layer')?.stringValue || '',
      net,
    });
  }

  for (const via of tree.findAll('via')) {
    const net = resolveNetName(via.child('net'), nameMap);
    const n = ensureNet(net);
    const atNode = via.child('at');
    const layersStr = via.child('layers')?.joinedStringValue || '';
    n.vias.push({
      uuid: via.child('uuid')?.stringValue || '',
      x: atNode?.getNumber(1) || 0,
      y: atNode?.getNumber(2) || 0,
      size: via.child('size')?.getNumber(1) || 0,
      drill: via.child('drill')?.getNumber(1) || 0,
      layers: layersStr,
      net,
    });
  }

  for (const fp of tree.findAll('footprint')) {
    for (const pad of fp.children('pad')) {
      const net = resolveNetName(pad.child('net'), nameMap);
      if (net === 'unassigned') continue;
      const n = ensureNet(net);
      let ref = '';
      for (const prop of fp.children('property')) {
        if (prop.getString(1) === 'Reference') {
          ref = prop.getString(2) || '';
          break;
        }
      }
      const padNum = pad.getString(1) || '';
      n.refs.push(`${ref}-${padNum}`);
    }
  }

  for (const [num, name] of nameMap) {
    ensureNet(name);
  }

  return nets;
}

export function computeNetlistDiff(originalContent: string, modifiedContent: string): NetlistDiff {
  let origParsed: SExpr, modParsed: SExpr;
  try {
    origParsed = parse(originalContent);
    modParsed = parse(modifiedContent);
  } catch {
    return { nets: [], summary: 'Unable to parse PCB files' };
  }
  if (!isList(origParsed) || !isList(modParsed)) {
    return { nets: [], summary: 'Unable to parse PCB files' };
  }

  const origTree = SNode.from(origParsed);
  const modTree = SNode.from(modParsed);

  const origNameMap = buildNetNameMap(origTree);
  const modNameMap = buildNetNameMap(modTree);

  const origNets = extractNets(origTree, origNameMap);
  const modNets = extractNets(modTree, modNameMap);

  const allNetNames = new Set([...origNets.keys(), ...modNets.keys()]);
  const entries: NetDiffEntry[] = [];

  const renames = new Map<string, string>();
  for (const [num, origName] of origNameMap) {
    const modName = modNameMap.get(num);
    if (modName && modName !== origName) {
      renames.set(origName, modName);
    }
  }

  const renamedOrigNames = new Set(renames.keys());
  const renamedModNames = new Set(renames.values());

  for (const name of allNetNames) {
    if (renamedOrigNames.has(name) || renamedModNames.has(name)) continue;

    const orig = origNets.get(name);
    const mod = modNets.get(name);

    if (!orig) {
      const m = mod!;
      entries.push({
        name,
        type: 'added',
        origSegments: 0,
        modSegments: m.segments.length,
        origVias: 0,
        modVias: m.vias.length,
        origRefs: [],
        modRefs: m.refs,
        details: [`Added net with ${m.segments.length} track(s), ${m.vias.length} via(s)`],
      });
    } else if (!mod) {
      entries.push({
        name,
        type: 'removed',
        origSegments: orig.segments.length,
        modSegments: 0,
        origVias: orig.vias.length,
        modVias: 0,
        origRefs: orig.refs,
        modRefs: [],
        details: [`Removed net (had ${orig.segments.length} track(s), ${orig.vias.length} via(s))`],
      });
    } else {
      const details: string[] = [];
      if (orig.segments.length !== mod.segments.length) {
        details.push(`Tracks: ${orig.segments.length} → ${mod.segments.length}`);
      }
      if (orig.vias.length !== mod.vias.length) {
        details.push(`Vias: ${orig.vias.length} → ${mod.vias.length}`);
      }
      const origLayers = new Set(orig.segments.map((s) => s.layer));
      const modLayers = new Set(mod.segments.map((s) => s.layer));
      const addedLayers = [...modLayers].filter((l) => !origLayers.has(l));
      const removedLayers = [...origLayers].filter((l) => !modLayers.has(l));
      if (addedLayers.length > 0) details.push(`Layers added: ${addedLayers.join(', ')}`);
      if (removedLayers.length > 0) details.push(`Layers removed: ${removedLayers.join(', ')}`);

      const addedRefs = mod.refs.filter((r) => !orig.refs.includes(r));
      const removedRefs = orig.refs.filter((r) => !mod.refs.includes(r));
      if (removedRefs.length > 0) details.push(`Pads removed: ${removedRefs.join(', ')}`);
      if (addedRefs.length > 0) details.push(`Pads added: ${addedRefs.join(', ')}`);

      if (details.length === 0) continue;

      entries.push({
        name,
        type: 'modified',
        origSegments: orig.segments.length,
        modSegments: mod.segments.length,
        origVias: orig.vias.length,
        modVias: mod.vias.length,
        origRefs: orig.refs,
        modRefs: mod.refs,
        details,
      });
    }
  }

  for (const [origName, modName] of renames) {
    const orig = origNets.get(origName);
    const mod = modNets.get(modName);
    if (!orig && !mod) continue;
    const details: string[] = [`Renamed from "${origName}" to "${modName}"`];
    const oSeg = orig?.segments.length || 0;
    const mSeg = mod?.segments.length || 0;
    const oVia = orig?.vias.length || 0;
    const mVia = mod?.vias.length || 0;
    if (oSeg !== mSeg) details.push(`Tracks: ${oSeg} → ${mSeg}`);
    if (oVia !== mVia) details.push(`Vias: ${oVia} → ${mVia}`);
    const addedRefs = (mod?.refs || []).filter((r) => !(orig?.refs || []).includes(r));
    const removedRefs = (orig?.refs || []).filter((r) => !(mod?.refs || []).includes(r));
    if (removedRefs.length > 0) details.push(`Pads removed: ${removedRefs.join(', ')}`);
    if (addedRefs.length > 0) details.push(`Pads added: ${addedRefs.join(', ')}`);
    entries.push({
      name: `${origName} → ${modName}`,
      type: 'modified',
      origSegments: oSeg,
      modSegments: mSeg,
      origVias: oVia,
      modVias: mVia,
      origRefs: orig?.refs || [],
      modRefs: mod?.refs || [],
      details,
    });
  }

  const added = entries.filter((e) => e.type === 'added').length;
  const removed = entries.filter((e) => e.type === 'removed').length;
  const modified = entries.filter((e) => e.type === 'modified').length;
  const parts: string[] = [];
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  if (modified) parts.push(`${modified} modified`);
  const summary =
    entries.length === 0
      ? 'No netlist differences'
      : `${entries.length} net change${entries.length !== 1 ? 's' : ''}: ${parts.join(', ')}`;

  return { nets: entries, summary };
}

export interface BomEntry {
  ref: string;
  value: string;
  footprint: string;
  layer: string;
  x: number;
  y: number;
  rotation: number;
}

export interface BomDiffEntry {
  ref: string;
  value: string;
  footprint: string;
  layer: string;
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  changes: string[];
  orig?: BomEntry;
  mod?: BomEntry;
}

export interface BomDiff {
  components: BomDiffEntry[];
  added: BomDiffEntry[];
  removed: BomDiffEntry[];
  modified: BomDiffEntry[];
  unchanged: BomDiffEntry[];
  summary: string;
}

function extractAllFootprints(tree: SNode): Map<string, BomEntry> {
  const map = new Map<string, BomEntry>();
  for (const fp of tree.findAll('footprint')) {
    const uuid = fp.child('uuid')?.stringValue || '';
    if (!uuid) continue;
    let ref = '',
      value = '';
    for (const prop of fp.children('property')) {
      const propName = prop.getString(1);
      if (propName === 'Reference') ref = prop.getString(2) || '';
      if (propName === 'Value') value = prop.getString(2) || '';
    }
    const atNode = fp.child('at');
    map.set(uuid, {
      ref,
      value,
      footprint: fp.getString(1) || '',
      layer: fp.child('layer')?.stringValue || '',
      x: atNode?.getNumber(1) || 0,
      y: atNode?.getNumber(2) || 0,
      rotation: atNode?.getNumber(3, 0) || 0,
    });
  }
  return map;
}

export function computeBomDiff(originalContent: string, modifiedContent: string): BomDiff {
  let origParsed: SExpr, modParsed: SExpr;
  try {
    origParsed = parse(originalContent);
    modParsed = parse(modifiedContent);
  } catch {
    return {
      components: [],
      added: [],
      removed: [],
      modified: [],
      unchanged: [],
      summary: 'Unable to parse PCB files',
    };
  }
  if (!isList(origParsed) || !isList(modParsed)) {
    return {
      components: [],
      added: [],
      removed: [],
      modified: [],
      unchanged: [],
      summary: 'Unable to parse PCB files',
    };
  }

  const orig = extractAllFootprints(SNode.from(origParsed));
  const mod = extractAllFootprints(SNode.from(modParsed));
  const allUuids = new Set([...orig.keys(), ...mod.keys()]);

  const entries: BomDiffEntry[] = [];
  const added: BomDiffEntry[] = [];
  const removed: BomDiffEntry[] = [];
  const modified: BomDiffEntry[] = [];
  const unchanged: BomDiffEntry[] = [];

  for (const uuid of allUuids) {
    const o = orig.get(uuid);
    const m = mod.get(uuid);

    if (!o) {
      const e: BomDiffEntry = {
        ref: m!.ref,
        value: m!.value,
        footprint: m!.footprint,
        layer: m!.layer,
        type: 'added',
        changes: ['Component added'],
        mod: m,
      };
      entries.push(e);
      added.push(e);
    } else if (!m) {
      const e: BomDiffEntry = {
        ref: o.ref,
        value: o.value,
        footprint: o.footprint,
        layer: o.layer,
        type: 'removed',
        changes: ['Component removed'],
        orig: o,
      };
      entries.push(e);
      removed.push(e);
    } else {
      const changes: string[] = [];
      if (o.ref !== m.ref) changes.push(`Ref: ${o.ref} → ${m.ref}`);
      if (o.value !== m.value) changes.push(`Value: "${o.value}" → "${m.value}"`);
      if (o.footprint !== m.footprint) changes.push(`Footprint: ${o.footprint} → ${m.footprint}`);
      if (o.layer !== m.layer) changes.push(`Layer: ${o.layer} → ${m.layer}`);
      if (o.x !== m.x || o.y !== m.y || o.rotation !== m.rotation) {
        const posChanges: string[] = [];
        if (o.x !== m.x || o.y !== m.y)
          posChanges.push(`(${o.x.toFixed(2)}, ${o.y.toFixed(2)}) → (${m.x.toFixed(2)}, ${m.y.toFixed(2)})`);
        if (o.rotation !== m.rotation) posChanges.push(`rot ${o.rotation}° → ${m.rotation}°`);
        changes.push(`Position: ${posChanges.join(', ')}`);
      }

      const type = changes.length > 0 ? ('modified' as const) : ('unchanged' as const);
      const e: BomDiffEntry = {
        ref: m.ref,
        value: m.value,
        footprint: m.footprint,
        layer: m.layer,
        type,
        changes,
        orig: o,
        mod: m,
      };
      entries.push(e);
      if (type === 'modified') modified.push(e);
      else unchanged.push(e);
    }
  }

  const total = entries.length;
  const a = added.length,
    r = removed.length,
    modCount = modified.length,
    unmod = unchanged.length;
  const parts: string[] = [];
  if (a) parts.push(`${a} added`);
  if (r) parts.push(`${r} removed`);
  if (modCount) parts.push(`${modCount} modified`);
  if (unmod) parts.push(`${unmod} unchanged`);
  const summary = `${total} component${total !== 1 ? 's' : ''}: ${parts.join(', ')}`;

  return { components: entries, added, removed, modified, unchanged, summary };
}

export interface PcbBBox {
  minX: number;
  minY: number;
}

function collectAtCoords(tree: SNode): number[] {
  const coords: number[] = [];
  for (const node of tree.findAll('footprint')) {
    const at = node.child('at');
    if (at) {
      coords.push(at.getNumber(1) || 0, at.getNumber(2) || 0);
    }
  }
  for (const node of tree.findAll('segment')) {
    const start = node.child('start');
    const end = node.child('end');
    if (start) {
      coords.push(start.getNumber(1) || 0, start.getNumber(2) || 0);
    }
    if (end) {
      coords.push(end.getNumber(1) || 0, end.getNumber(2) || 0);
    }
  }
  for (const node of tree.findAll('via')) {
    const at = node.child('at');
    if (at) {
      coords.push(at.getNumber(1) || 0, at.getNumber(2) || 0);
    }
  }
  for (const node of tree.findAll('gr_text')) {
    const at = node.child('at');
    if (at) {
      coords.push(at.getNumber(1) || 0, at.getNumber(2) || 0);
    }
  }
  for (const node of tree.findAll('gr_line')) {
    const start = node.child('start');
    const end = node.child('end');
    if (start) {
      coords.push(start.getNumber(1) || 0, start.getNumber(2) || 0);
    }
    if (end) {
      coords.push(end.getNumber(1) || 0, end.getNumber(2) || 0);
    }
  }
  for (const node of tree.findAll('gr_arc')) {
    const start = node.child('start');
    const mid = node.child('mid');
    const end = node.child('end');
    if (start) {
      coords.push(start.getNumber(1) || 0, start.getNumber(2) || 0);
    }
    if (mid) {
      coords.push(mid.getNumber(1) || 0, mid.getNumber(2) || 0);
    }
    if (end) {
      coords.push(end.getNumber(1) || 0, end.getNumber(2) || 0);
    }
  }
  for (const node of tree.findAll('gr_circle')) {
    const center = node.child('center');
    const end = node.child('end');
    if (center) {
      coords.push(center.getNumber(1) || 0, center.getNumber(2) || 0);
    }
    if (end) {
      coords.push(end.getNumber(1) || 0, end.getNumber(2) || 0);
    }
  }
  for (const node of tree.findAll('dimension')) {
    const features = node.child('features');
    if (features) {
      for (const bar of features.findAll('feature_segments')) {
        const start = bar.child('start');
        const end = bar.child('end');
        if (start) {
          coords.push(start.getNumber(1) || 0, start.getNumber(2) || 0);
        }
        if (end) {
          coords.push(end.getNumber(1) || 0, end.getNumber(2) || 0);
        }
      }
    }
  }
  for (const node of tree.findAll('gr_rect')) {
    const start = node.child('start');
    const end = node.child('end');
    if (start) {
      coords.push(start.getNumber(1) || 0, start.getNumber(2) || 0);
    }
    if (end) {
      coords.push(end.getNumber(1) || 0, end.getNumber(2) || 0);
    }
  }
  for (const node of tree.findAll('gr_poly')) {
    const pts = node.child('pts');
    if (pts) {
      for (const xy of pts.findAll('xy')) {
        coords.push(xy.getNumber(1) || 0, xy.getNumber(2) || 0);
      }
    }
  }
  return coords;
}

export function computePcbBBox(content: string): PcbBBox | null {
  try {
    const parsed = parse(content);
    if (!isList(parsed)) return null;
    const tree = SNode.from(parsed);
    const coords = collectAtCoords(tree);
    if (coords.length < 2) return null;
    let minX = Infinity,
      minY = Infinity;
    for (let i = 0; i < coords.length; i += 2) {
      if (coords[i] < minX) minX = coords[i];
      if (coords[i + 1] < minY) minY = coords[i + 1];
    }
    return { minX, minY };
  } catch {
    return null;
  }
}

export function computeTextualDiff(originalContent: string, modifiedContent: string): TextualDiff {
  let origParsed: SExpr;
  let modParsed: SExpr;
  try {
    origParsed = parse(originalContent);
    modParsed = parse(modifiedContent);
  } catch {
    return { changes: [], summary: 'Unable to parse PCB files' };
  }

  if (!isList(origParsed) || !isList(modParsed)) {
    return { changes: [], summary: 'Unable to parse PCB files' };
  }

  const origTree = SNode.from(origParsed);
  const modTree = SNode.from(modParsed);

  const changes: ChangeDescription[] = [];

  compareFootprints(extractFootprints(origTree), extractFootprints(modTree), changes);
  compareSegments(extractSegments(origTree), extractSegments(modTree), changes);
  compareVias(extractVias(origTree), extractVias(modTree), changes);

  const added = changes.filter((c) => c.type === 'added').length;
  const removed = changes.filter((c) => c.type === 'removed').length;
  const modified = changes.filter((c) => c.type === 'modified').length;

  let summary: string;
  if (changes.length === 0) {
    summary = 'No differences found';
  } else {
    const detailParts: string[] = [];
    if (added) detailParts.push(`${added} added`);
    if (removed) detailParts.push(`${removed} removed`);
    if (modified) detailParts.push(`${modified} modified`);
    summary = `${changes.length} change${changes.length !== 1 ? 's' : ''}: ${detailParts.join(', ')}`;
  }

  return { changes, summary };
}
