import fs from 'node:fs';
import { analyzeFile, applyReplacements, findMethodCalls, toPlainValue } from './source_analyzer.js';
import type { MethodCallInfo, Replacement } from './source_analyzer.js';
import {
  PLAIN_CH,
  deriveOutlineCalls,
  graphicCallSource,
  outlineCallSource,
  rectFromPolygon,
  stackupCallSource,
  textCallSource,
  trackBlockSource,
  zoneCallSource,
  zonePropsSource,
} from './display.js';
import type { DerivedOutlineCall } from './display.js';
import { textFuzzyMatch } from './rewriter.js';
import type { KicadBoardGraphicIR, KicadIR, KicadZoneIR, PendingSourceChange } from './types.js';

/**
 * --apply write-back for the elements that used to be display-only: board
 * outline calls, zone/keepout calls, and the whole routing section (track
 * declarations/pushes, standalone vias, and the create() spreads).
 *
 * ## Equality discipline (invariant)
 *
 * Deciding "is the source in sync with the board" must never compare two
 * different representations of the same thing — that is where every phantom
 * diff in this module's history came from (a raw PropertyValue record vs a
 * plain object, `{}` vs `undefined`, a trailing `;` inside vs outside the
 * compared text). The rule: build a normalized view of BOTH sides through
 * the same renderer (zonePropsSource, stackupCallSource, graphicCallSource,
 * trackBlockSource / plainToGraphic) and diff those; render to source text
 * only at the moment of writing. Text and outline use in-place property
 * updates, which the convergence oracle and fuzz tests pin instead.
 *
 * Every compute function returns pre-computed {@link PendingSourceChange}s —
 * literal replacement ranges against the file as analyzed — so all selected
 * changes can go through one descending-order pass per file.
 */

export interface SourceChangeResult {
  changes: PendingSourceChange[];
  notes: string[];
}

const ZONE_METHODS = ['zone', 'keepout'];
const OUTLINE_METHODS = ['outline', 'outlineCircle', 'outlinePolygon', 'cutout', 'cutoutCircle'];

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.0005;
}

/** Props of a call as plain JS values (extractValue leaves nested records). */
function plainProps(call: MethodCallInfo): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(call.props)) out[k] = toPlainValue(v.value);
  return out;
}

function pointsEqual(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => approxEqual(p.x, b[i].x) && approxEqual(p.y, b[i].y));
}

function pointsSource(points: Array<{ x: number; y: number }>): string {
  return `[ ${points.map((p) => `{ x: ${p.x}, y: ${p.y} }`).join(', ')} ]`;
}

/** Read a file for text slicing; null when unreadable. */
function readSource(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// === Zones ===

interface ZoneCallInfo {
  filePath: string;
  call: MethodCallInfo;
}

/**
 * Rebuild a KicadZoneIR-shaped object from a source zone call's props so
 * both sides can be rendered through the same zonePropsSource() emitter —
 * whatever the emitter produces equal is semantically in sync.
 */
function pseudoZoneFromProps(method: string, props: Record<string, unknown>): KicadZoneIR | null {
  let x = num(props['x']);
  let y = num(props['y']);
  let width = num(props['width']);
  let height = num(props['height']);
  // `bounds: { left, top, width, height }` is an accepted zone geometry form
  const bounds = props['bounds'] as Record<string, unknown> | undefined;
  if ((x === undefined || y === undefined || width === undefined || height === undefined) && bounds) {
    const left = num(bounds['left'] ?? bounds['x']);
    const top = num(bounds['top'] ?? bounds['y']);
    const bWidth = num(bounds['width']);
    const bHeight = num(bounds['height']);
    if (left !== undefined && top !== undefined && bWidth !== undefined && bHeight !== undefined) {
      x = x ?? left;
      y = y ?? top;
      width = width ?? bWidth;
      height = height ?? bHeight;
    }
  }
  let polygon: Array<{ x: number; y: number }> | null = null;
  if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
    polygon = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
  } else {
    const points = props['points'];
    if (Array.isArray(points)) {
      polygon = points
        .map((p) => ({ x: num((p as Record<string, unknown>)['x']), y: num((p as Record<string, unknown>)['y']) }))
        .filter((p): p is { x: number; y: number } => p.x !== undefined && p.y !== undefined);
    }
  }
  if (!polygon || polygon.length < 3) return null;

  const layers = props['layers'];
  const restrictions = props['restrictions'];
  const connectPads = props['connectPads'];
  const filledAreasThickness = props['filledAreasThickness'];
  // Fill settings may be grouped under `fill:` (the emitted form) or flat on
  // the options object (a documented API form) — merge both views so either
  // writing style compares equal to the board's parsed fill.
  const groupedFill = (props['fill'] ?? null) as Record<string, unknown> | null;
  const FLAT_FILL_KEYS = [
    'thermalGap',
    'thermalBridgeWidth',
    'islandRemovalMode',
    'islandAreaMin',
    'smoothing',
    'smoothingRadius',
    'hatchThickness',
    'hatchGap',
    'hatchOrientation',
    'arcSegments',
  ] as const;
  const flatFill: Record<string, unknown> = {};
  for (const key of FLAT_FILL_KEYS) {
    if (props[key] !== undefined) flatFill[key] = props[key];
  }
  const fill = groupedFill || Object.keys(flatFill).length > 0 ? { ...flatFill, ...(groupedFill ?? {}) } : undefined;

  const zone: KicadZoneIR = {
    layers: Array.isArray(layers) ? (layers as string[]) : [],
    netName: typeof props['net'] === 'string' ? (props['net'] as string) : null,
    name: typeof props['name'] === 'string' ? (props['name'] as string) : null,
    priority: num(props['priority']) ?? null,
    locked: props['locked'] === true,
    polygon,
  };
  if (restrictions && typeof restrictions === 'object') {
    const r = restrictions as Record<string, unknown>;
    zone.keepout = {
      tracks: r['tracks'] === true,
      vias: r['vias'] === true,
      pads: r['pads'] === true,
      copperpour: r['copperpour'] === true,
      footprints: r['footprints'] === true,
    };
  } else if (method === 'keepout') {
    zone.keepout = { tracks: false, vias: false, pads: false, copperpour: false, footprints: false };
  }
  if (props['placement'] === true) zone.placement = true;
  if (fill && typeof fill === 'object') zone.fill = fill as KicadZoneIR['fill'];
  zone.minThickness = num(props['minThickness']);
  zone.filledAreasThickness = typeof filledAreasThickness === 'boolean' ? filledAreasThickness : undefined;
  zone.connectPads = typeof connectPads === 'string' ? connectPads : undefined;
  zone.clearance = num(props['clearance']);
  zone.hatchStyle = typeof props['hatchStyle'] === 'string' ? (props['hatchStyle'] as string) : undefined;
  zone.hatchPitch = num(props['hatchPitch']);
  return zone;
}

function zoneGeometry(zone: KicadZoneIR): {
  rect: ReturnType<typeof rectFromPolygon>;
  points: Array<{ x: number; y: number }>;
} {
  return { rect: rectFromPolygon(zone.polygon), points: zone.polygon };
}

function zoneFieldDiffs(before: KicadZoneIR, after: KicadZoneIR): string[] {
  const diffs: string[] = [];
  if ((before.netName ?? '') !== (after.netName ?? '')) diffs.push('net');
  if (JSON.stringify(before.layers) !== JSON.stringify(after.layers)) diffs.push('layers');
  const gb = zoneGeometry(before);
  const ga = zoneGeometry(after);
  if (gb.rect && ga.rect) {
    if (
      !approxEqual(gb.rect.x, ga.rect.x) ||
      !approxEqual(gb.rect.y, ga.rect.y) ||
      !approxEqual(gb.rect.width, ga.rect.width) ||
      !approxEqual(gb.rect.height, ga.rect.height)
    ) {
      diffs.push('geometry');
    }
  } else if (!pointsEqual(gb.points, ga.points)) {
    diffs.push('geometry');
  }
  if ((before.keepout ?? null) !== null || (after.keepout ?? null) !== null) {
    if (JSON.stringify(before.keepout ?? null) !== JSON.stringify(after.keepout ?? null)) diffs.push('restrictions');
  }
  if ((before.placement ?? false) !== (after.placement ?? false)) diffs.push('placement');
  // 'solid' is the emit default and never appears in generated code — strip
  // it so parsed board fills converge against what was written back.
  const fillNorm = (f: KicadZoneIR['fill'] | null): unknown => {
    if (!f) return null;
    const { mode, ...rest } = f;
    return mode === 'hatched' ? { mode, ...rest } : rest;
  };
  if (JSON.stringify(fillNorm(before.fill ?? null)) !== JSON.stringify(fillNorm(after.fill ?? null)))
    diffs.push('fill');
  if ((before.name ?? null) !== (after.name ?? null)) diffs.push('name');
  if ((before.priority ?? null) !== (after.priority ?? null)) diffs.push('priority');
  if ((before.locked ?? false) !== (after.locked ?? false)) diffs.push('locked');
  if ((before.minThickness ?? null) !== (after.minThickness ?? null)) diffs.push('minThickness');
  if ((before.connectPads ?? null) !== (after.connectPads ?? null)) diffs.push('connectPads');
  if ((before.clearance ?? null) !== (after.clearance ?? null)) diffs.push('clearance');
  if ((before.filledAreasThickness ?? null) !== (after.filledAreasThickness ?? null))
    diffs.push('filledAreasThickness');
  const hatch = (z: KicadZoneIR) => (z.hatchStyle === 'edge' || z.hatchStyle === undefined ? null : z.hatchStyle);
  if (hatch(before) !== hatch(after)) diffs.push('hatchStyle');
  const pitch = (z: KicadZoneIR) => (z.hatchPitch === 0.508 || z.hatchPitch === undefined ? null : z.hatchPitch);
  if (pitch(before) !== pitch(after)) diffs.push('hatchPitch');
  return diffs;
}

function zoneCenter(zone: KicadZoneIR): { x: number; y: number } {
  const rect = rectFromPolygon(zone.polygon);
  if (rect) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const n = zone.polygon.length || 1;
  return {
    x: zone.polygon.reduce((s, p) => s + p.x, 0) / n,
    y: zone.polygon.reduce((s, p) => s + p.y, 0) / n,
  };
}

export function computeZoneChanges(ir: KicadIR, sourceFiles: string[]): SourceChangeResult {
  const changes: PendingSourceChange[] = [];
  const notes: string[] = [];

  const srcCalls: ZoneCallInfo[] = [];
  for (const filePath of sourceFiles) {
    for (const call of findMethodCalls(filePath, ZONE_METHODS)) srcCalls.push({ filePath, call });
  }

  // Effective kind of an IR zone after emit: keepout restrictions map to
  // typecad.keepout(), everything else to typecad.zone().
  const irKind = (z: KicadZoneIR): string => (z.keepout ? 'keepout' : 'zone');

  interface Pair {
    src: number;
    ir: number;
    netMatch: boolean;
    layersMatch: boolean;
    dist: number;
  }
  const candidates: Pair[] = [];
  srcCalls.forEach((sc, si) => {
    const plain = plainProps(sc.call);
    const center = srcCenter(plain);
    const srcLayers = JSON.stringify(plain['layers'] ?? []);
    ir.zones.forEach((z, zi) => {
      if (sc.call.method !== irKind(z)) return;
      const c = zoneCenter(z);
      const dist = Math.hypot(center.x - c.x, center.y - c.y);
      if (dist > 50) return;
      const net = plain['net'];
      candidates.push({
        src: si,
        ir: zi,
        netMatch: (typeof net === 'string' ? net : '') === (z.netName ?? ''),
        layersMatch: srcLayers === JSON.stringify(z.layers),
        dist,
      });
    });
  });
  candidates.sort(
    (a, b) =>
      (a.netMatch === b.netMatch ? 0 : a.netMatch ? -1 : 1) ||
      (a.layersMatch === b.layersMatch ? 0 : a.layersMatch ? -1 : 1) ||
      a.dist - b.dist,
  );

  const srcMatched = new Set<number>();
  const irMatched = new Set<number>();
  for (const pair of candidates) {
    if (srcMatched.has(pair.src) || irMatched.has(pair.ir)) continue;
    srcMatched.add(pair.src);
    irMatched.add(pair.ir);

    const sc = srcCalls[pair.src];
    const zone = ir.zones[pair.ir];
    const pseudo = pseudoZoneFromProps(sc.call.method, plainProps(sc.call));
    if (!pseudo) {
      changes.push({
        kind: sc.call.method === 'keepout' ? 'keepout' : 'zone',
        filePath: sc.filePath,
        label: `zone (net ${zone.netName ?? '—'}) rewritten from board geometry`,
        changedProps: ['geometry'],
        replacements: [{ range: sc.call.argRanges[0], newValue: `{ ${zonePropsSource(zone, PLAIN_CH)} }` }],
      });
      continue;
    }
    const before = zonePropsSource(pseudo, PLAIN_CH);
    const after = zonePropsSource(zone, PLAIN_CH);
    if (before === after) continue;
    const diffs = zoneFieldDiffs(pseudo, zone);
    changes.push({
      kind: sc.call.method === 'keepout' ? 'keepout' : 'zone',
      filePath: sc.filePath,
      label: `zone (net ${zone.netName ?? '—'})${diffs.length ? ` — ${diffs.join(', ')}` : ''} updated from board`,
      changedProps: diffs,
      replacements: [{ range: sc.call.argRanges[0], newValue: `{ ${after} }` }],
    });
  }

  // Source calls the board no longer has → delete.
  srcCalls.forEach((sc, si) => {
    if (srcMatched.has(si)) return;
    const net = plainProps(sc.call)['net'];
    changes.push({
      kind: sc.call.method === 'keepout' ? 'keepout' : 'zone',
      filePath: sc.filePath,
      label: `zone (net ${typeof net === 'string' ? net : '—'}) removed from board`,
      changedProps: ['removed'],
      replacements: [{ range: sc.call.statementRange, newValue: '' }],
    });
  });

  // New board zones → insert after the last zone-family statement.
  const unmatchedIr = ir.zones.filter((_, zi) => !irMatched.has(zi));
  if (unmatchedIr.length > 0) {
    if (srcCalls.length === 0) {
      notes.push(
        `${unmatchedIr.length} board zone(s) have no typecad.zone()/keepout() call in the source — run without --apply for the code.`,
      );
    } else {
      const last = srcCalls[srcCalls.length - 1];
      let insertText = '';
      for (const zone of unmatchedIr) {
        insertText += `\n${zoneCallSource(zone, PLAIN_CH, last.call.objectName)}`;
      }
      changes.push({
        kind: irKind(unmatchedIr[0]) === 'keepout' ? 'keepout' : 'zone',
        filePath: last.filePath,
        label: `${unmatchedIr.length} new zone(s) from board appended`,
        changedProps: ['new'],
        replacements: [
          { range: { start: last.call.statementRange.end, end: last.call.statementRange.end }, newValue: insertText },
        ],
      });
    }
  }

  return { changes, notes };
}

function srcCenter(props: Record<string, unknown>): { x: number; y: number } {
  let x = num(props['x']);
  let y = num(props['y']);
  const w = num(props['width'] ?? (props['bounds'] as Record<string, unknown> | undefined)?.['width']);
  const h = num(props['height'] ?? (props['bounds'] as Record<string, unknown> | undefined)?.['height']);
  const bounds = props['bounds'] as Record<string, unknown> | undefined;
  if ((x === undefined || y === undefined) && bounds) {
    x = x ?? num(bounds['left'] ?? bounds['x']);
    y = y ?? num(bounds['top'] ?? bounds['y']);
  }
  if (x !== undefined && y !== undefined && w !== undefined && h !== undefined) {
    return { x: x + w / 2, y: y + h / 2 };
  }
  const points = props['points'];
  if (Array.isArray(points) && points.length > 0) {
    const pts = points as Array<Record<string, unknown>>;
    return {
      x: pts.reduce((s, p) => s + (num(p['x']) ?? 0), 0) / pts.length,
      y: pts.reduce((s, p) => s + (num(p['y']) ?? 0), 0) / pts.length,
    };
  }
  return { x: NaN, y: NaN };
}

// === Board outline ===

function outlineArgDiffs(derived: DerivedOutlineCall, call: MethodCallInfo, source: string): Replacement[] {
  const reps: Replacement[] = [];
  const derivedNums = derived.args.filter((a): a is number => typeof a === 'number');
  const srcArgs = call.args;

  // `outline({ left, top, width, height })` — the bounds object form. Replace
  // the whole argument with the numeric list instead of corrupting the
  // object slot with a bare number.
  if (srcArgs.length > 0 && typeof srcArgs[0] === 'object' && srcArgs[0] !== null) {
    reps.push({ range: call.argRanges[0], newValue: derivedNums.join(', ') });
    return reps;
  }

  if (call.method === 'outlinePolygon' || call.method === 'cutout') {
    const derivedPoints = derived.args[0] as Array<{ x: number; y: number }>;
    const srcPoints = (srcArgs[0] as Array<Record<string, unknown>>) ?? [];
    const normalized = srcPoints.map((p) => ({ x: num(p['x']) ?? NaN, y: num(p['y']) ?? NaN }));
    if (!pointsEqual(normalized, derivedPoints)) {
      reps.push({ range: call.argRanges[0], newValue: pointsSource(derivedPoints) });
    }
    return reps;
  }

  // Numeric args: outline(x, y, w, h[, fillet]), outlineCircle(cx, cy, r)
  for (let i = 0; i < Math.min(derivedNums.length, srcArgs.length); i++) {
    const src = typeof srcArgs[i] === 'number' ? (srcArgs[i] as number) : NaN;
    if (!approxEqual(src, derivedNums[i])) {
      reps.push({ range: call.argRanges[i], newValue: String(derivedNums[i]) });
    }
  }
  if (derivedNums.length > srcArgs.length) {
    // fillet radius appeared: append after the last existing argument
    const lastEnd = call.argRanges[srcArgs.length - 1]?.end ?? call.callRange.end - 1;
    reps.push({ range: { start: lastEnd, end: lastEnd }, newValue: `, ${derivedNums[srcArgs.length]}` });
  } else if (derivedNums.length < srcArgs.length) {
    // fillet radius removed: drop the trailing argument and its comma
    const start = call.argRanges[derivedNums.length - 1].end;
    const end = call.argRanges[srcArgs.length - 1].end;
    reps.push({ range: { start, end }, newValue: '' });
  }
  void source;
  return reps;
}

export function computeOutlineChanges(ir: KicadIR, sourceFiles: string[]): SourceChangeResult {
  const changes: PendingSourceChange[] = [];
  const notes: string[] = [];
  const { calls: derived } = deriveOutlineCalls(ir);

  interface SrcOutline {
    filePath: string;
    call: MethodCallInfo;
  }
  const srcCalls: SrcOutline[] = [];
  for (const filePath of sourceFiles) {
    for (const call of findMethodCalls(filePath, OUTLINE_METHODS)) srcCalls.push({ filePath, call });
  }

  for (const method of OUTLINE_METHODS) {
    const derivedOfMethod = derived.filter((d) => d.method === method);
    const srcOfMethod = srcCalls.filter((s) => s.call.method === method);
    const paired = Math.min(derivedOfMethod.length, srcOfMethod.length);

    for (let i = 0; i < paired; i++) {
      const sc = srcOfMethod[i];
      const source = readSource(sc.filePath);
      if (!source) continue;
      const reps = outlineArgDiffs(derivedOfMethod[i], sc.call, source);
      if (reps.length === 0) continue;
      changes.push({
        kind: 'outline',
        filePath: sc.filePath,
        label: `${method}(${sc.call.args.map((a) => (typeof a === 'number' ? a : '…')).join(', ')}) updated from board`,
        changedProps: ['geometry'],
        replacements: reps,
      });
    }

    // New derived calls → insert after the last outline-family statement.
    if (derivedOfMethod.length > srcOfMethod.length && srcCalls.length > 0) {
      const last = srcCalls[srcCalls.length - 1];
      let insertText = '';
      for (let i = srcOfMethod.length; i < derivedOfMethod.length; i++) {
        insertText += `\n${outlineCallSource(derivedOfMethod[i], PLAIN_CH, last.call.objectName)}`;
      }
      changes.push({
        kind: 'outline',
        filePath: last.filePath,
        label: `${derivedOfMethod.length - srcOfMethod.length} new ${method} call(s) from board appended`,
        changedProps: ['new'],
        replacements: [
          { range: { start: last.call.statementRange.end, end: last.call.statementRange.end }, newValue: insertText },
        ],
      });
    }

    // Source calls the board no longer derives → delete.
    for (let i = derivedOfMethod.length; i < srcOfMethod.length; i++) {
      const sc = srcOfMethod[i];
      changes.push({
        kind: 'outline',
        filePath: sc.filePath,
        label: `${method}(...) removed (no longer on Edge.Cuts)`,
        changedProps: ['removed'],
        replacements: [{ range: sc.call.statementRange, newValue: '' }],
      });
    }
  }

  if (derived.length > 0 && srcCalls.length === 0) {
    notes.push('Board outline found but no typecad.outline() call in the source — run without --apply for the code.');
  }

  return { changes, notes };
}

// === Routing section (tracks + standalone vias + create spreads) ===

/** Identifiers that refer to TrackBuilder arrays rather than components. */
function isTrackArrayIdentifier(text: string, trackArrayNames: Set<string>): boolean {
  return trackArrayNames.has(text) || /^track_[A-Za-z0-9_]+$/.test(text) || /^[A-Za-z0-9_]*_Track$/.test(text);
}

function buildCreateArgsSource(
  create: MethodCallInfo,
  source: string,
  variables: string[],
  trackArrayNames: Set<string>,
): string | null {
  const kept: string[] = [];
  create.argRanges.forEach((r, i) => {
    if (create.spread[i]) return;
    const text = source.slice(r.start, r.end).trim();
    // Track arrays were sometimes passed as bare identifiers (create()
    // accepts arrays, and older generated code did exactly that); they must
    // never survive as component arguments, or they dangle once the board's
    // net set changes and the declaration disappears.
    if (isTrackArrayIdentifier(text, trackArrayNames)) return;
    kept.push(text);
  });
  const spreads = variables.map((v) => `...${v}`);
  const hasSpreadArgs = create.spread.some(Boolean);
  // Nothing to do when the board has no track variables and the call has no
  // spreads (or bare array identifiers) to remove; otherwise (deletion case)
  // spreads must be dropped.
  if (spreads.length === 0 && !hasSpreadArgs && kept.length === create.argRanges.length) return null;
  const all = [...kept, ...spreads];

  if (create.argRanges.length === 0) {
    return spreads.join(', ');
  }
  const multiline = source
    .slice(create.argRanges[0].end, create.argRanges[create.argRanges.length - 1].start)
    .includes('\n');
  if (multiline) {
    const second = create.argRanges[1] ?? create.argRanges[0];
    const lineStart = source.lastIndexOf('\n', second.start - 1);
    const indent = lineStart >= 0 ? (source.slice(lineStart + 1, second.start).match(/^\s*/)?.[0] ?? '  ') : '  ';
    // The replacement range spans exactly [first arg, last arg] — no
    // surrounding newlines — so the generated text must not add any, or
    // every apply would insert one more.
    return all.map((a, i) => (i === 0 ? a : indent + a)).join(',\n');
  }
  return all.join(', ');
}

export function computeRoutingChanges(ir: KicadIR, sourceFiles: string[]): SourceChangeResult {
  const changes: PendingSourceChange[] = [];
  const notes: string[] = [];
  const hasSegments = ir.segments.length > 0;
  const { block: desiredBlock, variables } = trackBlockSource(ir);

  // Routing ownership: whichever file already holds track/via statements owns
  // the routing section. Only when NO file does may a fresh section be
  // inserted — and then only into the single file that has a create() call,
  // so other project files with their own create() are never polluted.
  const fileAnalyses = sourceFiles.map((filePath) => ({
    filePath,
    analysis: analyzeFile(filePath),
  }));
  const filesWithRouting = fileAnalyses.filter(
    ({ filePath, analysis }) =>
      analysis !== null &&
      (analysis.trackPushes.length > 0 ||
        analysis.arrayDeclarations.some((d) => analysis.trackPushes.some((p) => p.variableName === d.name)) ||
        findMethodCalls(filePath, ['via']).length > 0),
  );
  const insertCandidates =
    filesWithRouting.length === 0
      ? fileAnalyses.filter(
          ({ filePath, analysis }) => analysis !== null && findMethodCalls(filePath, ['create']).length === 1,
        )
      : [];

  for (const { filePath, analysis } of fileAnalyses) {
    if (!analysis) continue;
    const source = readSource(filePath);
    if (!source) continue;

    const pushedNames = new Set(analysis.trackPushes.map((p) => p.variableName));
    const decls = analysis.arrayDeclarations.filter((d) => pushedNames.has(d.name));
    const viaCalls = findMethodCalls(filePath, ['via']);
    const creates = findMethodCalls(filePath, ['create']);

    const members: Array<{ start: number; end: number; kind: string }> = [
      ...decls.map((d) => ({ start: d.statementRange.start, end: d.statementRange.end, kind: 'decl' })),
      ...analysis.trackPushes.map((p) => ({ start: p.statementRange.start, end: p.statementRange.end, kind: 'push' })),
      ...viaCalls.map((v) => ({ start: v.statementRange.start, end: v.statementRange.end, kind: 'via' })),
    ].sort((a, b) => a.start - b.start);

    const hasRoutingStatements = members.length > 0;
    if (!hasRoutingStatements) {
      if (filesWithRouting.some((f) => f.filePath === filePath)) continue;
      // Fresh insertion: place the whole routing block before create().
      const isOwningInsertTarget = insertCandidates.length === 1 && insertCandidates[0].filePath === filePath;
      if (hasSegments && isOwningInsertTarget) {
        const create = creates[0];
        const changesForFile: Replacement[] = [
          {
            range: { start: create.statementRange.start, end: create.statementRange.start },
            newValue: `${desiredBlock}\n\n`,
          },
        ];
        const argsSource = buildCreateArgsSource(
          create,
          source,
          variables,
          new Set([...variables, ...analysis.arrayDeclarations.map((d) => d.name)]),
        );
        if (argsSource !== null) {
          if (create.argRanges.length === 0) {
            changesForFile.push({
              range: { start: create.callRange.end - 1, end: create.callRange.end - 1 },
              newValue: argsSource,
            });
          } else {
            changesForFile.push({
              range: {
                start: create.argRanges[0].start,
                end: create.argRanges[create.argRanges.length - 1].end,
              },
              newValue: argsSource,
            });
          }
        }
        changes.push({
          kind: 'tracks',
          filePath,
          label: 'routing section inserted from board',
          changedProps: ['new'],
          replacements: changesForFile,
        });
      }
      continue;
    }

    // Safety checks before rewriting the region.
    const unsupported = analysis.trackPushes.filter((p) => p.unsupported);
    if (unsupported.length > 0) {
      notes.push(
        `${unsupported.length} track push(es) use constructs the rewriter does not rebuild (powerInfo, spreads, unknown builder calls) — routing code printed for manual update.`,
      );
      continue;
    }
    let contiguous = true;
    for (let i = 1; i < members.length; i++) {
      const gap = source.slice(members[i - 1].end, members[i].start);
      // Blank lines and // comment lines (the generated "// Net: X" headers)
      // are part of the regenerated block; anything else blocks the rewrite.
      const gapIsComments = gap.split('\n').every((line) => line.trim() === '' || line.trim().startsWith('//'));
      if (!gapIsComments) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) {
      notes.push(
        'Track statements, declarations or via calls are not contiguous (comments or other statements between them) — routing code printed for manual update.',
      );
      continue;
    }

    const region = { start: members[0].start, end: members[members.length - 1].end };
    // Swallow the generated "// Net: X" / "// Unnamed nets" header that sits
    // directly above the first statement, so replacing the region does not
    // leave (and then duplicate) the old leading header.
    for (;;) {
      const lineStart = source.lastIndexOf('\n', region.start - 1) + 1;
      if (source.slice(lineStart, region.start).trim() !== '' || lineStart === 0) break;
      const prevLineEnd = lineStart - 1;
      const prevLineStart = source.lastIndexOf('\n', prevLineEnd - 1) + 1;
      const prevLine = source.slice(prevLineStart, prevLineEnd).trim();
      if (/^\/\/ (Net: |Unnamed nets )/.test(prevLine)) {
        region.start = prevLineStart;
      } else {
        break;
      }
    }
    const currentBlock = source.slice(region.start, region.end);
    const regionDiffers = currentBlock !== desiredBlock;

    // Create-args planning is independent of the region diff: stale track
    // references (bare identifiers from older generated code, or spreads of
    // variables the board no longer declares) must be fixed even when the
    // routing statements themselves are already in sync.
    const trackArrayNames = new Set<string>([...variables, ...analysis.arrayDeclarations.map((d) => d.name)]);
    let argsRep: Replacement | null = null;
    if (creates.length === 1) {
      const create = creates[0];
      const argsSource = buildCreateArgsSource(create, source, variables, trackArrayNames);
      if (argsSource !== null) {
        const argsRange =
          create.argRanges.length === 0
            ? { start: create.callRange.end - 1, end: create.callRange.end - 1 }
            : {
                start: create.argRanges[0].start,
                end: create.argRanges[create.argRanges.length - 1].end,
              };
        const currentArgs = source.slice(argsRange.start, argsRange.end);
        if (currentArgs !== argsSource) {
          argsRep = { range: argsRange, newValue: argsSource };
        }
      }
    }

    if (regionDiffers) {
      if (analysis.trackPushes.length > 0 && creates.length !== 1) {
        notes.push(
          creates.length === 0
            ? 'No typecad.create() call found in the routing file — routing code printed for manual update.'
            : 'Multiple typecad.create() calls found — routing code printed for manual update.',
        );
        continue;
      }

      const reps: Replacement[] = [{ range: region, newValue: desiredBlock }];
      if (argsRep) reps.push(argsRep);
      changes.push({
        kind: 'tracks',
        filePath,
        label:
          desiredBlock === ''
            ? 'routing section removed (board has no tracks or vias)'
            : 'routing section regenerated from board tracks and vias',
        changedProps: ['tracks', 'vias'],
        replacements: reps,
      });
    } else if (argsRep) {
      changes.push({
        kind: 'tracks',
        filePath,
        label: 'typecad.create() track list updated to the board nets',
        changedProps: ['create'],
        replacements: [argsRep],
      });
    }
  }

  if (hasSegments && filesWithRouting.length === 0) {
    if (insertCandidates.length === 0) {
      notes.push(
        'Board has routed tracks but the source has no track section and no typecad.create() call — code printed for manual insertion.',
      );
    } else if (insertCandidates.length > 1) {
      notes.push(
        'Multiple source files have a typecad.create() call — the routing section was not inserted automatically; code printed for manual insertion.',
      );
    }
  }

  return { changes, notes };
}

// === Text section (insert board text missing from source, drop stale calls) ===

interface SourceTextRef {
  filePath: string;
  call: MethodCallInfo;
  text: string;
}

/**
 * Pair source `typecad.text()` calls with board text elements (exact match
 * first, then the same fuzzy rule the position updater uses — each pair
 * consumes one board text so duplicates pair up in order). Board texts left
 * unpaired are inserted into the source; source calls left unpaired are
 * deleted — together this makes board text round-trip instead of only
 * updating calls that already exist.
 */
export function computeTextSectionChanges(ir: KicadIR, sourceFiles: string[]): SourceChangeResult {
  const changes: PendingSourceChange[] = [];
  const notes: string[] = [];
  if (ir.textElements.length === 0 && sourceFiles.length === 0) return { changes, notes };

  const sourceCalls: SourceTextRef[] = [];
  for (const filePath of sourceFiles) {
    for (const call of findMethodCalls(filePath, ['text'])) {
      const text = call.props['text']?.value;
      if (typeof text === 'string') sourceCalls.push({ filePath, call, text });
    }
  }
  if (sourceCalls.length === 0 && ir.textElements.length === 0) return { changes, notes };

  const boardTexts = [...ir.textElements];
  const boardPaired = new Set<number>();
  const srcPaired = new Set<number>();
  const pair = (match: (a: string, b: string) => boolean) => {
    for (let si = 0; si < sourceCalls.length; si++) {
      if (srcPaired.has(si)) continue;
      for (let bi = 0; bi < boardTexts.length; bi++) {
        if (boardPaired.has(bi)) continue;
        if (match(sourceCalls[si].text, boardTexts[bi].text)) {
          srcPaired.add(si);
          boardPaired.add(bi);
          break;
        }
      }
    }
  };
  pair((a, b) => a === b);
  pair(textFuzzyMatch);

  // Insert unpaired board texts.
  const inserts = boardTexts.filter((_, bi) => !boardPaired.has(bi));
  if (inserts.length > 0) {
    const target = chooseTextInsertTarget(sourceFiles, sourceCalls);
    if (!target) {
      notes.push(
        `${inserts.length} board text element(s) have no typecad.text() call and no suitable insertion point in the source — code printed for manual insertion.`,
      );
    } else {
      const { filePath, anchor, position } = target;
      const source = readSource(filePath);
      if (!source) {
        notes.push(`Cannot read ${filePath} to insert board text — code printed for manual insertion.`);
      } else {
        const indent = lineIndentAt(source, position);
        let value = '';
        for (const t of inserts) {
          value += `${textCallSource(t, PLAIN_CH, anchor.objectName)}
${indent}`;
        }
        changes.push({
          kind: 'text',
          filePath,
          label:
            inserts.length === 1
              ? `text ${JSON.stringify(inserts[0].text)} inserted from board`
              : `${inserts.length} board text element(s) inserted from board`,
          changedProps: ['new'],
          replacements: [{ range: { start: position, end: position }, newValue: value }],
        });
      }
    }
  }

  // Delete source calls whose text is not on the board at all.
  for (let si = 0; si < sourceCalls.length; si++) {
    if (srcPaired.has(si)) continue;
    const ref = sourceCalls[si];
    changes.push({
      kind: 'text',
      filePath: ref.filePath,
      label: `text ${JSON.stringify(ref.text)} removed (not on board)`,
      changedProps: ['removed'],
      replacements: [{ range: statementLineRange(readSource(ref.filePath), ref.call.statementRange), newValue: '' }],
    });
  }

  return { changes, notes };
}

/** Where new text calls go: after the last existing call, else before zone/outline, else before create(). */
function chooseTextInsertTarget(
  sourceFiles: string[],
  sourceCalls: SourceTextRef[],
): { filePath: string; anchor: MethodCallInfo; position: number } | null {
  const candidates: Array<{ filePath: string; anchor: MethodCallInfo; position: number }> = [];

  // After the last text() call of the file that has the most of them.
  const byFileTexts = new Map<string, SourceTextRef[]>();
  for (const ref of sourceCalls) {
    if (!byFileTexts.has(ref.filePath)) byFileTexts.set(ref.filePath, []);
    byFileTexts.get(ref.filePath)!.push(ref);
  }
  const textFile = [...byFileTexts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (textFile) {
    const last = textFile[1][textFile[1].length - 1];
    candidates.push({ filePath: last.filePath, anchor: last.call, position: last.call.statementRange.end });
  }

  // Before the first zone/outline-family call of the file with the most of them.
  const ZONE_FAM = ['zone', 'keepout', 'outline', 'outlineCircle', 'outlinePolygon', 'cutout', 'cutoutCircle'];
  let bestGeo: { filePath: string; call: MethodCallInfo } | null = null;
  for (const filePath of sourceFiles) {
    const calls = findMethodCalls(filePath, ZONE_FAM);
    if (calls.length > (bestGeo ? findMethodCalls(bestGeo.filePath, ZONE_FAM).length : 0)) {
      bestGeo = { filePath, call: calls[0] };
    }
  }
  if (bestGeo) {
    const lineStart = readSource(bestGeo.filePath)!.lastIndexOf('\n', bestGeo.call.statementRange.start - 1) + 1;
    candidates.push({ filePath: bestGeo.filePath, anchor: bestGeo.call, position: lineStart });
  }

  // Before the create() call.
  for (const filePath of sourceFiles) {
    const create = findMethodCalls(filePath, ['create'])[0];
    if (create) {
      candidates.push({ filePath, anchor: create, position: create.statementRange.start });
      break;
    }
  }

  return candidates[0] ?? null;
}

function lineIndentAt(source: string, position: number): string {
  const lineStart = source.lastIndexOf('\n', position - 1) + 1;
  return source.slice(lineStart, position).match(/^\s*/)?.[0] ?? '';
}

/** Extend a statement range over its trailing newline (and leading indent) so deletion leaves no blank line. */
function statementLineRange(
  source: string | null,
  range: { start: number; end: number },
): { start: number; end: number } {
  if (!source) return range;
  let start = range.start;
  let end = range.end;
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  if (source.slice(lineStart, start).trim() === '') start = lineStart;
  if (source[end] === '\n') end += 1;
  else if (source.slice(end).startsWith('\r\n')) end += 2;
  return { start, end };
}

// === Stackup (layer count + per-layer detail) ===

/**
 * Sync the `typecad.stackup(...)` call with the board's stackup: layer
 * count and the per-layer detail object (thickness/material/epsilon_r/
 * loss_tangent/color) are regenerated from the parsed stackup whenever the
 * call is missing them or they differ. Inserted before the first
 * zone/outline call when the source has none.
 */
export function computeStackupChanges(ir: KicadIR, sourceFiles: string[]): SourceChangeResult {
  const changes: PendingSourceChange[] = [];
  const notes: string[] = [];
  const stackup = ir.stackup;
  if (!stackup || stackup.copperLayerCount < 2) return { changes, notes };

  // The call range excludes the statement's trailing semicolon; the compare
  // text must too, or the update never converges. Fresh inserts use the full
  // statement (with terminator).
  const desiredStatement = stackupCallSource(stackup, PLAIN_CH);
  const desired = desiredStatement.replace(/;$/, '');

  let best: { filePath: string; call: MethodCallInfo } | null = null;
  for (const filePath of sourceFiles) {
    for (const call of findMethodCalls(filePath, ['stackup'])) {
      if (!best) best = { filePath, call };
    }
  }

  if (!best) {
    // Insert before the first zone/outline-family call, else before create().
    const anchor = findInsertAnchor(sourceFiles);
    if (!anchor) {
      notes.push(
        `Board stackup (${stackup.copperLayerCount} copper layers) found but the source has no typecad.stackup() call — code printed for manual insertion.`,
      );
      return { changes, notes };
    }
    const source = readSource(anchor.filePath);
    if (!source) return { changes, notes };
    const lineStart = source.lastIndexOf('\n', anchor.call.statementRange.start - 1) + 1;
    changes.push({
      kind: 'stackup',
      filePath: anchor.filePath,
      label: `stackup(${stackup.copperLayerCount} layers) inserted from board`,
      changedProps: ['new'],
      replacements: [{ range: { start: lineStart, end: lineStart }, newValue: `${desiredStatement}\n` }],
    });
    return { changes, notes };
  }

  const source = readSource(best.filePath);
  if (!source) return { changes, notes };
  const currentText = source.slice(best.call.callRange.start, best.call.callRange.end);
  if (currentText === desired) return { changes, notes };

  changes.push({
    kind: 'stackup',
    filePath: best.filePath,
    label: `stackup call updated from board (${stackup.copperLayerCount} layers, layer detail)`,
    changedProps: ['stackup'],
    replacements: [{ range: best.call.callRange, newValue: desired }],
  });
  return { changes, notes };
}

// === Board graphics (silk/user layer shapes) ===

const GRAPHIC_METHODS = ['line', 'circle', 'rect', 'arc', 'poly'];

function graphicCenter(g: KicadBoardGraphicIR): { x: number; y: number } {
  if (g.kind === 'circle' && g.center) return g.center;
  if (g.start && g.end) return { x: (g.start.x + g.end.x) / 2, y: (g.start.y + g.end.y) / 2 };
  if (g.points && g.points.length > 0) {
    return {
      x: g.points.reduce((s, p) => s + p.x, 0) / g.points.length,
      y: g.points.reduce((s, p) => s + p.y, 0) / g.points.length,
    };
  }
  return { x: NaN, y: NaN };
}

/** Same shape, byte-for-byte call text — the emit/diff contract for graphics. */
function graphicsEqual(a: KicadBoardGraphicIR, b: KicadBoardGraphicIR): boolean {
  return graphicCallSource(a) === graphicCallSource(b);
}

/**
 * Sync `typecad.line()/circle()/rect()/arc()/poly()` calls with board
 * graphics on silk/user layers: geometry diffs regenerate the call,
 * graphics removed on the board delete their call, new ones are appended
 * after the last graphic (or before the first zone-family call).
 */
export function computeGraphicsChanges(ir: KicadIR, sourceFiles: string[]): SourceChangeResult {
  const changes: PendingSourceChange[] = [];
  const notes: string[] = [];

  interface GraphicCall {
    filePath: string;
    call: MethodCallInfo;
  }
  const srcCalls: GraphicCall[] = [];
  for (const filePath of sourceFiles) {
    for (const call of findMethodCalls(filePath, GRAPHIC_METHODS)) srcCalls.push({ filePath, call });
  }
  if (ir.boardGraphics.length === 0 && srcCalls.length === 0) return { changes, notes };

  const boardGraphics = ir.boardGraphics.filter((g) => Number.isFinite(graphicCenter(g).x));

  // Greedy pairing: same layer, nearest center.
  interface Pair {
    src: number;
    ir: number;
    dist: number;
  }
  const candidates: Pair[] = [];
  srcCalls.forEach((sc, si) => {
    const layer = sc.call.props['layer']?.value;
    boardGraphics.forEach((g, gi) => {
      if (layer !== g.layer) return;
      const c = graphicCenter(g);
      const center = plainToGraphic(sc.call, sc.call.method as KicadBoardGraphicIR['kind']);
      const sc2 = graphicCenter(center);
      if (!Number.isFinite(sc2.x)) return;
      const dist = Math.hypot(sc2.x - c.x, sc2.y - c.y);
      if (dist <= 20) candidates.push({ src: si, ir: gi, dist });
    });
  });
  candidates.sort((a, b) => a.dist - b.dist);
  const srcMatched = new Set<number>();
  const irMatched = new Set<number>();
  for (const pair of candidates) {
    if (srcMatched.has(pair.src) || irMatched.has(pair.ir)) continue;
    srcMatched.add(pair.src);
    irMatched.add(pair.ir);
    const sc = srcCalls[pair.src];
    const g = boardGraphics[pair.ir];
    if (!graphicsEqual(plainToGraphic(sc.call, g.kind), g)) {
      changes.push({
        kind: 'graphics',
        filePath: sc.filePath,
        label: `${g.kind} on ${g.layer} updated from board`,
        changedProps: ['geometry'],
        replacements: [{ range: sc.call.argRanges[0], newValue: graphicArgsSource(g) }],
      });
    }
  }

  // Source calls whose graphic is gone from the board → delete.
  srcCalls.forEach((sc, si) => {
    if (srcMatched.has(si)) return;
    changes.push({
      kind: 'graphics',
      filePath: sc.filePath,
      label: `${sc.call.method} on ${String(sc.call.props['layer']?.value ?? '?')} removed (not on board)`,
      changedProps: ['removed'],
      replacements: [{ range: statementLineRange(readSource(sc.filePath), sc.call.statementRange), newValue: '' }],
    });
  });

  // New board graphics → append after the last graphic call, else before the
  // first zone-family call.
  const inserts = boardGraphics.filter((_, gi) => !irMatched.has(gi));
  if (inserts.length > 0) {
    const lastGraphic = srcCalls[srcCalls.length - 1];
    const anchor = lastGraphic ?? findInsertAnchor(sourceFiles);
    if (!anchor) {
      notes.push(
        `${inserts.length} board graphic(s) have no typecad line/rect/circle/arc/poly call and no suitable insertion point — code printed for manual insertion.`,
      );
    } else {
      const source = readSource(anchor.filePath);
      if (source) {
        const nl = '\n';
        const position = lastGraphic ? anchor.call.statementRange.end : anchor.call.statementRange.start;
        const indent = lineIndentAt(source, position);
        let value = '';
        for (const g of inserts) {
          if (lastGraphic) {
            value += `${nl}${indent}${graphicCallSource(g, PLAIN_CH, anchor.call.objectName)}`;
          } else {
            value += `${graphicCallSource(g, PLAIN_CH, anchor.call.objectName)}${nl}${indent}`;
          }
        }
        changes.push({
          kind: 'graphics',
          filePath: anchor.filePath,
          label: `${inserts.length} board graphic(s) inserted from board`,
          changedProps: ['new'],
          replacements: [{ range: { start: position, end: position }, newValue: value }],
        });
      }
    }
  }

  return { changes, notes };
}

/** Rebuild a KicadBoardGraphicIR view of an existing graphic call for byte comparison. */
function plainToGraphic(call: MethodCallInfo, kind: KicadBoardGraphicIR['kind']): KicadBoardGraphicIR {
  const plain = plainProps(call);
  const point = (v: unknown) => {
    const p = v as { x?: unknown; y?: unknown } | undefined;
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : undefined;
  };
  const layer = typeof plain['layer'] === 'string' ? plain['layer'] : '';
  const width = num(plain['width']);
  const fill = plain['fill'] === true ? true : undefined;
  switch (kind) {
    case 'line':
      return { kind, layer, width, start: point(plain['start']), end: point(plain['end']) };
    case 'rect':
      return { kind, layer, width, fill, start: point(plain['start']), end: point(plain['end']) };
    case 'circle': {
      const center = point(plain['center']);
      // typeCAD stores circles as center+radius; KiCad as center+end. The
      // emit path derives radius from center→end, so the parsed view must
      // reconstruct an end point from the radius for the byte comparison.
      const radius = num(plain['radius']) ?? 0;
      const end = center ? { x: center.x + radius, y: center.y } : undefined;
      return { kind, layer, width, fill, center, end };
    }
    case 'arc':
      return { kind, layer, width, start: point(plain['start']), mid: point(plain['mid']), end: point(plain['end']) };
    case 'poly':
      return {
        kind,
        layer,
        width,
        fill,
        points: Array.isArray(plain['points']) ? (plain['points'] as { x: number; y: number }[]) : [],
      };
  }
}

/** Argument object literal of a graphic call (no `typecad.line(` wrapper). */
function graphicArgsSource(g: KicadBoardGraphicIR): string {
  const source = graphicCallSource(g);
  const open = source.indexOf('(');
  const close = source.lastIndexOf(');');
  return source.slice(open + 1, close);
}

/** First zone/outline-family statement across the files — the insertion anchor for board-level calls. */
function findInsertAnchor(sourceFiles: string[]): { filePath: string; call: MethodCallInfo } | null {
  const ZONE_FAM = ['zone', 'keepout', 'outline', 'outlineCircle', 'outlinePolygon', 'cutout', 'cutoutCircle'];
  let best: { filePath: string; call: MethodCallInfo } | null = null;
  for (const filePath of sourceFiles) {
    for (const call of findMethodCalls(filePath, ZONE_FAM)) {
      if (!best || call.statementRange.start < best.call.statementRange.start) {
        best = { filePath, call };
      }
    }
  }
  return best;
}

/** All write-back categories, for the convergence oracle and dry-run output. */
export interface AllSourceChanges {
  zone: SourceChangeResult;
  outline: SourceChangeResult;
  routing: SourceChangeResult;
  textSection: SourceChangeResult;
  stackup: SourceChangeResult;
  graphics: SourceChangeResult;
}

export function computeAllSourceChanges(ir: KicadIR, sourceFiles: string[]): AllSourceChanges {
  return {
    zone: computeZoneChanges(ir, sourceFiles),
    outline: computeOutlineChanges(ir, sourceFiles),
    routing: computeRoutingChanges(ir, sourceFiles),
    textSection: computeTextSectionChanges(ir, sourceFiles),
    stackup: computeStackupChanges(ir, sourceFiles),
    graphics: computeGraphicsChanges(ir, sourceFiles),
  };
}

// === Apply ===

/** Apply every selected change in one descending-order pass per file. */
export function applySourceChanges(changes: PendingSourceChange[]): { filesModified: number; changesApplied: number } {
  const byFile: Record<string, Replacement[]> = {};
  for (const change of changes) {
    if (!byFile[change.filePath]) byFile[change.filePath] = [];
    byFile[change.filePath].push(...change.replacements);
  }

  let filesModified = 0;
  for (const [filePath, reps] of Object.entries(byFile)) {
    if (reps.length === 0) continue;
    if (applyReplacements(filePath, reps)) filesModified++;
  }
  return { filesModified, changesApplied: changes.length };
}
