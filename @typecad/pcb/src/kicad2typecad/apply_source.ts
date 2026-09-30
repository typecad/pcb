import fs from 'node:fs';
import { analyzeFile, applyReplacements, findMethodCalls, toPlainValue } from './source_analyzer.js';
import type { MethodCallInfo, PropertyValue, Replacement } from './source_analyzer.js';
import {
  PLAIN_CH,
  deriveOutlineCalls,
  outlineCallSource,
  rectFromPolygon,
  trackBlockSource,
  zoneCallSource,
  zonePropsSource,
} from './display.js';
import type { DerivedOutlineCall } from './display.js';
import type { KicadIR, KicadZoneIR, PendingSourceChange } from './types.js';

/**
 * --apply write-back for the elements that used to be display-only: board
 * outline calls, zone/keepout calls, and the whole routing section (track
 * declarations/pushes, standalone vias, and the create() spreads).
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

function propValue(props: Record<string, PropertyValue>, key: string): unknown {
  return props[key]?.value;
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
  const x = num(props['x']);
  const y = num(props['y']);
  const width = num(props['width']);
  const height = num(props['height']);
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
  const fill = props['fill'];
  const connectPads = props['connectPads'];
  const filledAreasThickness = props['filledAreasThickness'];

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

function zoneGeometry(zone: KicadZoneIR): { rect: ReturnType<typeof rectFromPolygon>; points: Array<{ x: number; y: number }> } {
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
  if (JSON.stringify(fillNorm(before.fill ?? null)) !== JSON.stringify(fillNorm(after.fill ?? null))) diffs.push('fill');
  if ((before.name ?? null) !== (after.name ?? null)) diffs.push('name');
  if ((before.priority ?? null) !== (after.priority ?? null)) diffs.push('priority');
  if ((before.locked ?? false) !== (after.locked ?? false)) diffs.push('locked');
  if ((before.minThickness ?? null) !== (after.minThickness ?? null)) diffs.push('minThickness');
  if ((before.connectPads ?? null) !== (after.connectPads ?? null)) diffs.push('connectPads');
  if ((before.clearance ?? null) !== (after.clearance ?? null)) diffs.push('clearance');
  if ((before.filledAreasThickness ?? null) !== (after.filledAreasThickness ?? null)) diffs.push('filledAreasThickness');
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
        replacements: [{ range: { start: last.call.statementRange.end, end: last.call.statementRange.end }, newValue: insertText }],
      });
    }
  }

  return { changes, notes };
}

function srcCenter(props: Record<string, unknown>): { x: number; y: number } {
  const x = num(props['x']);
  const y = num(props['y']);
  const w = num(props['width']);
  const h = num(props['height']);
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

function outlineArgDiffs(
  derived: DerivedOutlineCall,
  call: MethodCallInfo,
  source: string,
): Replacement[] {
  const reps: Replacement[] = [];
  const derivedNums = derived.args.filter((a): a is number => typeof a === 'number');
  const srcArgs = call.args;

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

function buildCreateArgsSource(create: MethodCallInfo, source: string, variables: string[]): string | null {
  if (variables.length === 0) return null;
  const kept: string[] = [];
  create.argRanges.forEach((r, i) => {
    if (!create.spread[i]) kept.push(source.slice(r.start, r.end).trim());
  });
  const spreads = variables.map((v) => `...${v}`);
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
    const indent = lineStart >= 0 ? source.slice(lineStart + 1, second.start).match(/^\s*/)?.[0] ?? '  ' : '  ';
    return `\n${all.map((a) => indent + a).join(',\n')}\n`;
  }
  return ` ${all.join(', ')} `;
}

export function computeRoutingChanges(ir: KicadIR, sourceFiles: string[]): SourceChangeResult {
  const changes: PendingSourceChange[] = [];
  const notes: string[] = [];
  const hasSegments = ir.segments.length > 0;
  const hasVias = ir.vias.length > 0;
  if (!hasSegments && !hasVias) {
    // Board has no routing; still allow deleting stale source routing below.
  }
  const { block: desiredBlock, variables } = trackBlockSource(ir);

  for (const filePath of sourceFiles) {
    const analysis = analyzeFile(filePath);
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
      // Fresh insertion: place the whole routing block before create().
      if (hasSegments && creates.length === 1) {
        const create = creates[0];
        const changesForFile: Replacement[] = [
          { range: { start: create.statementRange.start, end: create.statementRange.start }, newValue: `${desiredBlock}\n\n` },
        ];
        const argsSource = buildCreateArgsSource(create, source, variables);
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
      } else if (hasSegments) {
        notes.push('Board has routed tracks but the source has no track section and no typecad.create() call — code printed for manual insertion.');
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
      const gapIsComments = gap
        .split('\n')
        .every((line) => line.trim() === '' || line.trim().startsWith('//'));
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
    if (currentBlock !== desiredBlock) {
      if (analysis.trackPushes.length > 0 && creates.length !== 1) {
        notes.push(
          creates.length === 0
            ? 'No typecad.create() call found in the routing file — routing code printed for manual update.'
            : 'Multiple typecad.create() calls found — routing code printed for manual update.',
        );
        continue;
      }

      const reps: Replacement[] = [{ range: region, newValue: desiredBlock }];
      if (creates.length === 1 && variables.length > 0) {
        const create = creates[0];
        const argsSource = buildCreateArgsSource(create, source, variables);
        if (argsSource !== null) {
          if (create.argRanges.length === 0) {
            reps.push({
              range: { start: create.callRange.end - 1, end: create.callRange.end - 1 },
              newValue: argsSource,
            });
          } else {
            const currentArgs = source.slice(
              create.argRanges[0].start,
              create.argRanges[create.argRanges.length - 1].end,
            );
            if (currentArgs !== argsSource) {
              reps.push({
                range: {
                  start: create.argRanges[0].start,
                  end: create.argRanges[create.argRanges.length - 1].end,
                },
                newValue: argsSource,
              });
            }
          }
        }
      }
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
    }
  }

  return { changes, notes };
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
