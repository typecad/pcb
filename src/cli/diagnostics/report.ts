import type { BoardComponent, BoardModel, BoardNet } from '../typecad/board_model.js';
import { isPowerNetName } from '../typecad/board_model.js';
import type { NetlistModel } from './netlist_model.js';
import type { KiCadCheckResult } from '../typecad/pipeline.js';

/**
 * Assembles the full diagnostics report: the logical view (netlist: BOM,
 * nets, pin types, DNC), the physical view (board model: placement, copper
 * connectivity, zones), ERC/DRC step results, and derived electrical
 * findings — everything the markdown and JSON renderers consume.
 */

export interface DiagnosticsMetadata {
  generatedAt: string;
  tool: string;
  version: string;
  entry?: string;
  boardFile?: string;
  schematicFile?: string;
  netlistFile?: string;
}

export interface BomEntry {
  reference: string;
  value: string;
  footprint: string;
  mpn?: string;
  datasheet?: string;
  description?: string;
  padCount?: number;
  netCount: number;
  side?: 'front' | 'back';
  variable?: string;
  source?: string;
}

export interface PinMapEntry {
  pin: string;
  pintype: string;
  net: string | null;
  dnc: boolean;
}

export interface ComponentPinMap {
  reference: string;
  value: string;
  pins: PinMapEntry[];
}

export interface NetPin {
  reference: string;
  pin: string;
  pintype: string;
}

export interface NetEntry {
  name: string;
  code: number;
  power: boolean;
  pins: NetPin[];
  /** Copper connectivity from the board model; null when no board data. */
  routed: boolean | null;
  pinsConnected?: number;
  pinsTotal?: number;
  lengthMm?: number;
  layers?: string[];
  vias?: number;
  pourAssisted?: boolean;
  disconnectedGroups?: string[][];
}

export type FindingSeverity = 'error' | 'warning' | 'info';

export interface Finding {
  severity: FindingSeverity;
  check: string;
  message: string;
  net?: string;
}

export interface ZoneEntry {
  net: string | null;
  keepout: boolean;
  layers: string[];
  filled: boolean;
  materialized: boolean;
  fillMode: string | null;
  bbox: { x: number; y: number; width: number; height: number };
}

export interface ClusterEntry {
  members: string[];
  nets: string[];
}

export interface DiagnosticsSummary {
  components: number;
  vias: number;
  nets: number;
  powerNets: number;
  pins: number;
  connectedPins: number;
  unconnectedPins: number;
  dncPins: number;
  routedNets: number;
  unroutedNets: number;
  unknownRoutingNets: number;
  totalRoutedLengthMm: number;
  boardOutlineMm: { width: number; height: number } | null;
  copperLayers: string[];
  zones: number;
  keepouts: number;
}

export type CheckStep = KiCadCheckResult | { ran: false; passed: boolean; reason: string };

export interface DiagnosticsReport {
  metadata: DiagnosticsMetadata;
  summary: DiagnosticsSummary;
  components: BomEntry[];
  nets: NetEntry[];
  pinMap: ComponentPinMap[];
  unconnected: {
    pads: { reference: string; pad: string; type: string }[];
    singlePinNets: string[];
    dncPins: { reference: string; pin: string; net: string }[];
  };
  clusters: ClusterEntry[];
  electrical: Finding[];
  erc: CheckStep;
  drc: CheckStep;
  zones: ZoneEntry[];
}

export interface DiagnosticsInput {
  netlist: NetlistModel | null;
  board: BoardModel | null;
  erc: CheckStep;
  drc: CheckStep;
  metadata: Omit<DiagnosticsMetadata, 'generatedAt' | 'tool' | 'version'> & { tool?: string; version?: string };
}

const DRIVER_TYPES = new Set(['output', 'power_out']);
const INPUT_TYPES = new Set(['input', 'power_in']);
const NEUTRAL_TYPES = new Set([
  'passive',
  'bidirectional',
  'tri_state',
  'open_collector',
  'open_emitter',
  'unspecified',
  'free',
]);

const isDncNode = (node: NetPin) => node.pintype === 'no_connect';

/** A net membership record during pin-map assembly. */
interface LogicalPin {
  reference: string;
  pin: string;
  pintype: string;
  net: string;
}

export function buildDiagnosticsReport(input: DiagnosticsInput): DiagnosticsReport {
  const { netlist, board } = input;
  const boardByName = new Map<string, BoardNet>();
  if (board) for (const net of board.nets) boardByName.set(net.name.toLowerCase(), net);

  // ── Logical nets: netlist pins, or board pads when no netlist exists ──────
  const nets: NetEntry[] = [];
  if (netlist) {
    for (const net of netlist.nets) {
      const physical = boardByName.get(net.name.toLowerCase());
      nets.push(toNetEntry(net.code, net.name, net.nodes, physical));
    }
  } else if (board) {
    for (const net of board.nets) {
      if (net.name === '') continue;
      nets.push(
        toNetEntry(
          net.code,
          net.name,
          net.pins.map((pin) => {
            const [reference, pad] = splitPinRef(pin);
            return { reference, pin: pad, pintype: pintypeForPad(board, reference, pad) };
          }),
          net,
        ),
      );
    }
  }

  // ── Components (BOM) ──────────────────────────────────────────────────────
  const boardComps = new Map<string, BoardComponent>();
  if (board) for (const comp of board.components) boardComps.set(comp.reference.toUpperCase(), comp);
  const netCountByRef = new Map<string, number>();
  for (const net of nets) {
    for (const ref of new Set(net.pins.filter((p) => !isDncNode(p)).map((p) => p.reference))) {
      netCountByRef.set(ref, (netCountByRef.get(ref) ?? 0) + 1);
    }
  }

  const components: BomEntry[] = [];
  const seenRefs = new Set<string>();
  if (netlist) {
    for (const comp of netlist.components) {
      if (comp.isVia) continue;
      const boardComp = boardComps.get(comp.reference.toUpperCase());
      seenRefs.add(comp.reference.toUpperCase());
      components.push({
        reference: comp.reference,
        value: comp.value,
        footprint: comp.footprint,
        mpn: comp.fields['MPN'] || undefined,
        datasheet: comp.fields['Datasheet'] || undefined,
        description: comp.fields['Description'] || undefined,
        padCount: boardComp?.pads.length,
        netCount: netCountByRef.get(comp.reference) ?? 0,
        side: boardComp?.side,
        variable: boardComp?.variable,
        source: boardComp?.source,
      });
    }
  }
  if (board) {
    // Board-only components (e.g. imported boards with no netlist)
    for (const comp of board.components) {
      if (seenRefs.has(comp.reference.toUpperCase())) continue;
      if (!comp.footprint && /^V\d+$/.test(comp.reference)) continue;
      components.push({
        reference: comp.reference,
        value: comp.value,
        footprint: comp.footprint,
        padCount: comp.pads.length,
        netCount: netCountByRef.get(comp.reference) ?? 0,
        side: comp.side,
        variable: comp.variable,
        source: comp.source,
      });
    }
  }
  components.sort((a, b) => a.reference.localeCompare(b.reference, undefined, { numeric: true }));

  const nonViaRefs = new Set(components.map((c) => c.reference.toUpperCase()));

  // ── Per-component pin map: board pads (full pad list) + netlist pintypes ──
  const pinMap: ComponentPinMap[] = [];
  const logicalPinsByRef = new Map<string, Map<string, LogicalPin>>();
  for (const net of nets) {
    for (const pin of net.pins) {
      let byPin = logicalPinsByRef.get(pin.reference);
      if (!byPin) {
        byPin = new Map();
        logicalPinsByRef.set(pin.reference, byPin);
      }
      byPin.set(pin.pin, { reference: pin.reference, pin: pin.pin, pintype: pin.pintype, net: net.name });
    }
  }

  const boardCompList = board ? [...board.components] : [];
  const mappedBoardRefs = new Set<string>();
  for (const comp of boardCompList) {
    if (!nonViaRefs.has(comp.reference.toUpperCase())) continue;
    mappedBoardRefs.add(comp.reference.toUpperCase());
    const logical = logicalPinsByRef.get(comp.reference);
    const pins: PinMapEntry[] = comp.pads.map((pad) => {
      const netPin = logical?.get(pad.pad);
      const pintype = netPin?.pintype ?? pad.pinType ?? 'unspecified';
      return {
        pin: pad.pad,
        pintype,
        // The netlist is authoritative for the logical view; a pad missing
        // from every net is unconnected (mounting holes excluded upstream).
        net: netPin?.net ?? null,
        dnc: netPin ? isDncNode(netPin) : pintype === 'no_connect',
      };
    });
    pinMap.push({ reference: comp.reference, value: comp.value, pins });
  }
  // Components with no board footprint (boardless/netlist-only reports)
  for (const comp of components) {
    if (mappedBoardRefs.has(comp.reference.toUpperCase())) continue;
    const logical = logicalPinsByRef.get(comp.reference);
    if (!logical) continue;
    pinMap.push({
      reference: comp.reference,
      value: comp.value,
      pins: [...logical.values()].map((p) => ({ pin: p.pin, pintype: p.pintype, net: p.net, dnc: isDncNode(p) })),
    });
  }
  pinMap.sort((a, b) => a.reference.localeCompare(b.reference, undefined, { numeric: true }));

  // ── Unconnected / DNC ─────────────────────────────────────────────────────
  const pads: { reference: string; pad: string; type: string }[] = [];
  if (board) {
    for (const comp of board.components) {
      for (const pad of comp.pads) {
        if (pad.net === null && pad.type !== 'np_thru_hole') pads.push({ reference: comp.reference, pad: pad.pad, type: pad.type });
      }
    }
  }
  const dncPins: { reference: string; pin: string; net: string }[] = [];
  for (const net of nets) {
    for (const pin of net.pins) {
      if (isDncNode(pin)) dncPins.push({ reference: pin.reference, pin: pin.pin, net: net.name });
    }
  }
  const singlePinNets = nets
    .filter((net) => net.name !== '' && net.pins.filter((p) => !isDncNode(p)).length === 1)
    .map((n) => n.name);

  // ── Connectivity clusters: components joined by shared nets ───────────────
  const clusters = buildClusters(nets, nonViaRefs);

  // ── Electrical findings (ERC-lite from pin types) ─────────────────────────
  const electrical: Finding[] = [];
  for (const net of nets) {
    const active = net.pins.filter((p) => !isDncNode(p));
    if (active.length === 0) continue;
    const label = (p: NetPin) => `${p.reference}.${p.pin}`;
    const drivers = active.filter((p) => DRIVER_TYPES.has(p.pintype));
    const inputs = active.filter((p) => INPUT_TYPES.has(p.pintype));
    const neutrals = active.filter((p) => NEUTRAL_TYPES.has(p.pintype));

    if (drivers.length > 1) {
      electrical.push({
        severity: 'error',
        check: 'conflicting-drivers',
        message: `${drivers.length} outputs on one net: ${drivers.map(label).join(', ')}`,
        net: net.name,
      });
    }
    // Power rails are fed globally (PWR_FLAG territory) — skip the driver check.
    if (!net.power && inputs.length > 0 && drivers.length === 0 && neutrals.length === 0) {
      electrical.push({
        severity: 'warning',
        check: 'undriven-input',
        message: `${inputs.map(label).join(', ')} input${inputs.length > 1 ? 's' : ''} not driven by any output`,
        net: net.name,
      });
    }
    if (net.name !== '' && active.length === 1) {
      electrical.push({
        severity: 'warning',
        check: 'single-pin-net',
        message: `net has a single pin (${label(active[0]!)}) — likely a forgotten connection`,
        net: net.name,
      });
    }
  }
  for (const dnc of dncPins) {
    electrical.push({
      severity: 'info',
      check: 'no-connect',
      message: `${dnc.reference}.${dnc.pin} intentionally left unconnected`,
      net: dnc.net,
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  let pins = 0;
  let connectedPins = 0;
  let dncCount = 0;
  for (const comp of pinMap) {
    for (const pin of comp.pins) {
      pins++;
      if (pin.dnc) dncCount++;
      else if (pin.net !== null) connectedPins++;
    }
  }
  const routedNets = nets.filter((n) => n.routed === true);
  const unroutedNets = nets.filter((n) => n.routed === false);
  const zones = board?.zones ?? [];

  const summary: DiagnosticsSummary = {
    components: components.length,
    vias: netlist ? netlist.components.filter((c) => c.isVia).length : (board?.summary.vias ?? 0),
    nets: nets.length,
    powerNets: nets.filter((n) => n.power).length,
    pins,
    connectedPins,
    unconnectedPins: pads.length,
    dncPins: dncCount,
    routedNets: routedNets.length,
    unroutedNets: unroutedNets.length,
    unknownRoutingNets: nets.length - routedNets.length - unroutedNets.length,
    totalRoutedLengthMm: nets.reduce((acc, n) => acc + (n.lengthMm ?? 0), 0),
    boardOutlineMm:
      board?.summary.board && board.summary.board.maxX > board.summary.board.minX
        ? {
            width: round3(board.summary.board.maxX - board.summary.board.minX),
            height: round3(board.summary.board.maxY - board.summary.board.minY),
          }
        : null,
    copperLayers: board ? copperLayersOf(board) : [],
    zones: zones.filter((z) => !z.keepout).length,
    keepouts: zones.filter((z) => z.keepout).length,
  };

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      tool: input.metadata.tool ?? 'typecad-pcb',
      version: input.metadata.version ?? '0.0.0',
      ...stripUndefined(input.metadata, ['tool', 'version'] as const),
    },
    summary,
    components,
    nets: [...nets].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    pinMap,
    unconnected: { pads, singlePinNets, dncPins },
    clusters,
    electrical,
    erc: input.erc,
    drc: input.drc,
    zones: zones.map((z) => ({
      net: z.netName,
      keepout: z.keepout,
      layers: z.layers,
      filled: z.filled,
      materialized: z.materialized,
      fillMode: z.fillMode,
      bbox: z.bbox,
    })),
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────

function toNetEntry(code: number, name: string, pins: NetPin[], physical: BoardNet | undefined): NetEntry {
  return {
    name,
    code,
    power: isPowerNetName(name),
    pins,
    routed: physical?.route ? physical.route.routed : null,
    pinsConnected: physical?.route?.pinsConnected,
    pinsTotal: physical?.route?.pinsTotal,
    lengthMm: physical?.route?.length,
    layers: physical?.route?.layers,
    vias: physical?.vias.length,
    pourAssisted: physical?.route?.pourAssisted,
    disconnectedGroups: physical?.route?.disconnectedGroups,
  };
}

function splitPinRef(pin: string): [string, string] {
  const idx = pin.lastIndexOf('.');
  return idx === -1 ? [pin, ''] : [pin.slice(0, idx), pin.slice(idx + 1)];
}

function pintypeForPad(board: BoardModel, reference: string, pad: string): string {
  const comp = board.components.find((c) => c.reference.toUpperCase() === reference.toUpperCase());
  return comp?.pads.find((p) => p.pad === pad)?.pinType ?? 'unspecified';
}

function buildClusters(nets: NetEntry[], nonViaRefs: Set<string>): ClusterEntry[] {
  const adjacency = new Map<string, Set<string>>();
  const netsOf = new Map<string, string[]>();
  const addNode = (ref: string) => {
    if (!adjacency.has(ref)) adjacency.set(ref, new Set());
  };
  for (const net of nets) {
    const members = [...new Set(net.pins.filter((p) => !isDncNode(p)).map((p) => p.reference))].filter((ref) =>
      nonViaRefs.has(ref.toUpperCase()),
    );
    if (members.length < 2) continue;
    for (const ref of members) {
      addNode(ref);
      const list = netsOf.get(ref) ?? [];
      list.push(net.name);
      netsOf.set(ref, list);
      for (const other of members) {
        if (other !== ref) adjacency.get(ref)!.add(other);
      }
    }
  }

  const visited = new Set<string>();
  const clusters: ClusterEntry[] = [];
  for (const start of [...adjacency.keys()].sort()) {
    if (visited.has(start)) continue;
    const members: string[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const ref = queue.shift()!;
      members.push(ref);
      for (const next of adjacency.get(ref) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    members.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    clusters.push({
      members,
      nets: [...new Set(members.flatMap((m) => netsOf.get(m) ?? []))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    });
  }
  clusters.sort((a, b) => b.members.length - a.members.length || a.members[0]!.localeCompare(b.members[0]!));
  return clusters;
}

function copperLayersOf(board: BoardModel): string[] {
  const layers = new Set<string>();
  for (const zone of board.zones) for (const l of zone.layers) if (/^[FB]\.Cu$|^In\d+\.Cu$/.test(l)) layers.add(l);
  for (const net of board.nets) for (const s of net.segments) if (/^[FB]\.Cu$|^In\d+\.Cu$/.test(s.layer)) layers.add(s.layer);
  return [...layers].sort();
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function stripUndefined<T extends object, K extends keyof T>(obj: T, drop: readonly K[]): Omit<T, K> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (drop.includes(key as K)) continue;
    if (value !== undefined) out[key] = value;
  }
  return out as Omit<T, K>;
}
