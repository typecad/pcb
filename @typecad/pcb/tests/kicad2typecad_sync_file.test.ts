/**
 * _sync.ts sidecar support on the import side: the grammar module, the
 * analyzer's view of `parts.x.pcb` overrides and collect lines, the
 * rewriter's project-wide assignment search (sidecar-first), and the
 * routing regen in the sidecar's loose routeN dialect.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SExprNode } from '../src/kicad2typecad/sexpr_tree.js';
import { KicadIRBuilder } from '../src/kicad2typecad/ir_builder.js';
import { SourceRewriter } from '../src/kicad2typecad/rewriter.js';
import { analyzeFile } from '../src/kicad2typecad/source_analyzer.js';
import { computeRoutingChanges, applySourceChanges } from '../src/kicad2typecad/apply_source.js';
import {
  SYNC_FILE_NAME,
  isSyncFileText,
  planSyncEntryEdits,
  renderSyncFile,
  syncFunctionBodyRange,
} from '../src/kicad2typecad/sync_file.js';
import type { KicadIR, KicadFootprintIR, MatchResult } from '../src/kicad2typecad/types.js';

function buildIr(pcb: string): KicadIR {
  return new KicadIRBuilder().build(SExprNode.parse(pcb));
}

function makeFootprint(overrides: Partial<KicadFootprintIR> = {}): KicadFootprintIR {
  return {
    footprintName: 'Resistor_SMD:R_0603_1608Metric',
    reference: 'R1',
    position: { x: 10, y: 20, rotation: 0 },
    side: 'front',
    uuid: 'uuid-1',
    codeMetadata: null,
    referenceProperty: null,
    valueProperty: null,
    ...overrides,
  };
}

const SYNC_BODY_ROUTE = (endX: number) =>
  renderSyncFile({
    routes: [
      [
        `  const route1 = new TrackBuilder(typecad, { net: 'VCC',  })`,
        `    .from({ x: 10, y: 20 }, 'F.Cu', 0.2)`,
        `    .to({ x: ${endX}, y: 20, layer: 'F.Cu', width: 0.2 })`,
        `    .to({ x: ${endX}, y: 30, layer: 'F.Cu', width: 0.2 });`,
        `  syncTracks.push(route1);`,
      ].join('\n'),
    ],
  });

const ENTRY_WITH_SPREAD = [
  "import { PCB, TrackBuilder } from '@typecad/pcb';",
  "import { syncBoard, syncTracks } from './_sync.js';",
  '',
  "const typecad = new PCB('t');",
  'typecad.outline(5, 10, 100, 50);',
  'syncBoard(typecad, {});',
  'typecad.create(',
  '  ...syncTracks',
  ');',
].join('\n');

describe('sync file grammar', () => {
  it('renders a canonical scaffold that round-trips through detection', () => {
    const text = renderSyncFile({});
    expect(isSyncFileText(text)).toBe(true);
    expect(syncFunctionBodyRange(text)).not.toBeNull();
    expect(text).toContain('export const syncTracks: TrackBuilder[] = [];');
  });

  it('plans entry integration idempotently', () => {
    const base = "import { PCB } from '@typecad/pcb';\nconst typecad = new PCB('t');\ntypecad.create();\n";
    const first = planSyncEntryEdits(base, ['r1'], true);
    let text = base;
    for (const e of [...first.edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expect(text).toContain("import { syncBoard, syncTracks } from './_sync.js';");
    expect(text).toContain('syncBoard(typecad, { r1 });');
    expect(text).toContain('typecad.create(...syncTracks);');
    expect(planSyncEntryEdits(text, ['r1'], true).edits).toEqual([]);
  });
});

describe('source analyzer: sidecar shapes', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-sync-analyze-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads parts.r1.pcb as r1\'s pcb assignment and collect lines as identifier pushes', () => {
    const file = path.join(dir, SYNC_FILE_NAME);
    fs.writeFileSync(file, SYNC_BODY_ROUTE(20));
    const analysis = analyzeFile(file)!;
    expect(analysis).not.toBeNull();
    // placements ride the parts map — none in this fixture
    expect(analysis.pcbAssignments).toHaveLength(0);
    expect(analysis.routeBuilders.map((r) => r.name)).toEqual(['route1']);
    expect(analysis.identifierPushes).toEqual([
      expect.objectContaining({ objectName: 'syncTracks', argName: 'route1' }),
    ]);
  });

  it('parses a placement override into pcbAssignments under the bare variable name', () => {
    const file = path.join(dir, SYNC_FILE_NAME);
    fs.writeFileSync(
      file,
      renderSyncFile({ placements: ['  parts.r1.pcb = { x: 5, y: 10, rotation: 90 };'] }),
    );
    const analysis = analyzeFile(file)!;
    const assignment = analysis.pcbAssignments.find((p) => p.variableName === 'r1');
    expect(assignment).toBeDefined();
    expect(assignment!.props['x']?.value).toBe(5);
    expect(assignment!.props['y']?.value).toBe(10);
    expect(assignment!.props['rotation']?.value).toBe(90);
  });
});

describe('rewriter: sidecar overrides win the update', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-sync-rewrite-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const matchFor = (file: string, position: { x: number; y: number; rotation: number }): MatchResult => ({
    irFootprint: makeFootprint({ position }),
    sourceLocation: { filePath: file, variableName: 'r1', isThis: false },
    matchConfidence: 'uuid',
  });

  it('updates parts.r1.pcb in the sidecar and leaves the constructor untouched', () => {
    const boardFile = path.join(dir, 'board.ts');
    const syncFile = path.join(dir, SYNC_FILE_NAME);
    fs.writeFileSync(
      boardFile,
      "import { Component } from '@typecad/pcb';\nconst r1 = new Component({ reference: 'R1', footprint: 'R_0603' });\n",
    );
    fs.writeFileSync(syncFile, renderSyncFile({ placements: ['  parts.r1.pcb = { x: 5, y: 10 };'] }));
    const before = fs.readFileSync(boardFile, 'utf8');

    const rewriter = new SourceRewriter();
    const changes = rewriter.computeFootprintChanges(
      [matchFor(boardFile, { x: 42, y: 24, rotation: 0 })],
      [boardFile, syncFile],
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]!.assignmentFilePath).toBe(syncFile);

    rewriter.applyFootprintChanges(changes);
    expect(fs.readFileSync(boardFile, 'utf8')).toBe(before);
    const applied = fs.readFileSync(syncFile, 'utf8');
    expect(applied).toContain('parts.r1.pcb = { x: 42, y: 24');
    expect(applied).not.toContain('x: 5, y: 10');
  });

  it('updates a sidecar label layout the same way', () => {
    const boardFile = path.join(dir, 'board.ts');
    const syncFile = path.join(dir, SYNC_FILE_NAME);
    fs.writeFileSync(
      boardFile,
      "import { Component } from '@typecad/pcb';\nconst r1 = new Component({ reference: 'R1' });\n",
    );
    fs.writeFileSync(
      syncFile,
      renderSyncFile({
        placements: ['  parts.r1.pcb = { x: 5, y: 10 };'],
      }),
    );
    // a valueLayout override in the sidecar
    fs.appendFileSync(
      syncFile,
      '',
    );
    const syncText = fs
      .readFileSync(syncFile, 'utf8')
      .replace(
        '  parts.r1.pcb = { x: 5, y: 10 };',
        "  parts.r1.pcb = { x: 5, y: 10 };\n  parts.r1.valueLayout = { x: 0, y: 1, rotation: 0 };",
      );
    fs.writeFileSync(syncFile, syncText);

    const rewriter = new SourceRewriter();
    const fp = makeFootprint({
      position: { x: 5, y: 10, rotation: 0 },
      valueLayout: { x: 0, y: 9, rotation: 0 },
    });
    const changes = rewriter.computeLayoutChanges(
      [{ irFootprint: fp, sourceLocation: { filePath: boardFile, variableName: 'r1', isThis: false }, matchConfidence: 'uuid' }],
      [boardFile, syncFile],
    );
    const valueChange = changes.find((c) => c.layoutType === 'valueLayout');
    expect(valueChange).toBeDefined();
    expect(valueChange!.assignmentFilePath).toBe(syncFile);
    rewriter.applyLayoutChanges(changes);
    expect(fs.readFileSync(syncFile, 'utf8')).toContain('y: 9');
  });

  it('never searches past the sidecar and the constructor file — a same-named variable in another module is a different component', () => {
    const boardFile = path.join(dir, 'board.ts');
    const otherFile = path.join(dir, 'other.ts');
    fs.writeFileSync(
      boardFile,
      "import { Component } from '@typecad/pcb';\nconst r1 = new Component({ reference: 'R1', footprint: 'R_0603', pcb: { x: 5, y: 10 } });\n",
    );
    // a DIFFERENT r1 in a different module — must not capture board.ts's update
    fs.writeFileSync(
      otherFile,
      "import { Component } from '@typecad/pcb';\nconst r1 = new Component({ reference: 'R1' });\nr1.pcb = { x: 99, y: 99 };\n",
    );
    const before = fs.readFileSync(otherFile, 'utf8');

    const rewriter = new SourceRewriter();
    const changes = rewriter.computeFootprintChanges(
      [matchFor(boardFile, { x: 42, y: 24, rotation: 0 })],
      [boardFile, otherFile],
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]!.assignmentFilePath).toBeUndefined();

    const result = rewriter.applyFootprintChanges(changes);
    expect(result.changesApplied).toBe(1);
    expect(result.dropped).toEqual([]);
    expect(fs.readFileSync(boardFile, 'utf8')).toContain('pcb: { x: 42, y: 24');
    expect(fs.readFileSync(otherFile, 'utf8')).toBe(before);
  });

  it('reports a cross-file change whose target statement is gone instead of counting it applied', () => {
    const boardFile = path.join(dir, 'board.ts');
    const syncFile = path.join(dir, SYNC_FILE_NAME);
    fs.writeFileSync(
      boardFile,
      "import { Component } from '@typecad/pcb';\nconst r1 = new Component({ reference: 'R1' });\n",
    );
    // the sidecar the change was computed against no longer carries the
    // assignment (the file drifted between compute and apply)
    fs.writeFileSync(syncFile, renderSyncFile({}));

    const rewriter = new SourceRewriter();
    const result = rewriter.applyFootprintChanges([
      {
        filePath: boardFile,
        variableName: 'r1',
        prefix: '',
        oldX: 5,
        oldY: 10,
        oldRotation: 0,
        oldSide: null,
        newX: 42,
        newY: 24,
        newRotation: 0,
        newSide: 'front',
        label: 'r1  board.ts:2  pcb: (5, 10) → (42, 24)',
        assignmentFilePath: syncFile,
      },
    ]);
    expect(result.changesApplied).toBe(0);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]).toContain('r1');
    expect(result.dropped[0]).toContain('no matching statement found');
    // nothing was written anywhere
    expect(fs.readFileSync(syncFile, 'utf8')).toBe(renderSyncFile({}));
  });
});

describe('apply-back: sidecar routing regen', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-sync-route-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const boardWithTrack = (endX: number) => `(kicad_pcb (version 20260206) (generator pcbnew)
    (net 0 "")
    (net 1 "VCC")
    (segment (start 10 20) (end ${endX} 20) (width 0.2) (layer "F.Cu") (net "VCC"))
    (segment (start ${endX} 20) (end ${endX} 30) (width 0.2) (layer "F.Cu") (net "VCC"))
  )`;

  it('regenerates sidecar routes in the loose dialect without a local create(), and converges', () => {
    const entry = path.join(dir, 'board.ts');
    const sync = path.join(dir, SYNC_FILE_NAME);
    fs.writeFileSync(entry, ENTRY_WITH_SPREAD);
    fs.writeFileSync(sync, SYNC_BODY_ROUTE(20));

    const ir = buildIr(boardWithTrack(25));
    const first = computeRoutingChanges(ir, [entry, sync]);
    expect(first.notes).toEqual([]);
    const routeChanges = first.changes.filter((c) => c.kind === 'tracks');
    expect(routeChanges).toHaveLength(1);
    expect(routeChanges[0]!.filePath).toBe(sync);
    applySourceChanges(routeChanges);

    const applied = fs.readFileSync(sync, 'utf8');
    expect(applied).toContain('x: 25, y: 20');
    expect(applied).toContain("net: 'VCC'");
    expect(applied).toContain('syncTracks.push(route1);');
    // the sidecar still parses, and the collect line is intact
    const analysis = analyzeFile(sync)!;
    expect(analysis.routeBuilders.map((r) => r.name)).toEqual(['route1']);
    expect(analysis.identifierPushes).toHaveLength(1);

    const second = computeRoutingChanges(ir, [entry, sync]);
    expect(second.changes).toEqual([]);
  });

  it('empties the sidecar routing when the board has no tracks', () => {
    const entry = path.join(dir, 'board.ts');
    const sync = path.join(dir, SYNC_FILE_NAME);
    fs.writeFileSync(entry, ENTRY_WITH_SPREAD);
    fs.writeFileSync(sync, SYNC_BODY_ROUTE(20));

    const ir = buildIr('(kicad_pcb (version 20260206) (generator pcbnew)\n(net 0 "")\n)');
    const { changes, notes } = computeRoutingChanges(ir, [entry, sync]);
    expect(notes).toEqual([]);
    applySourceChanges(changes);
    const applied = fs.readFileSync(sync, 'utf8');
    expect(applied).not.toContain('route1');
    expect(applied).not.toContain('syncTracks.push');
    expect(applied).toContain('syncTracks.length = 0;');
  });
});

describe('apply-back: routing ownership consolidation', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-sync-owner-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const boardWithTrack = (endX: number, doubled = false) => `(kicad_pcb (version 20260206) (generator pcbnew)
    (net 0 "")
    (net 1 "VCC")
    (segment (start 10 20) (end ${endX} 20) (width 0.2) (layer "F.Cu") (net "VCC"))${doubled ? `\n    (segment (start 10 20) (end ${endX} 20) (width 0.3) (layer "F.Cu") (net "VCC"))` : ''}
  )`;

  const entryWithArrays = (endX: number) =>
    "import { PCB, TrackBuilder } from '@typecad/pcb';\n" +
    "import { syncBoard, syncTracks } from './_sync.js';\n" +
    "const typecad = new PCB('t');\n" +
    'typecad.outline(5, 10, 100, 50);\n' +
    '// Net: VCC\n' +
    'const track_VCC: TrackBuilder[] = [];\n' +
    `track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 10, y: 20 }, "F.Cu", 0.2).to({ x: ${endX}, y: 20, layer: "F.Cu", width: 0.2 }));\n` +
    'syncBoard(typecad, {});\n' +
    'typecad.create(\n  ...track_VCC,\n  ...syncTracks\n);';

  it('empties the sidecar when the create() file also owns routing — one truth per board', () => {
    const entry = path.join(dir, 'board.ts');
    const sync = path.join(dir, SYNC_FILE_NAME);
    fs.writeFileSync(entry, entryWithArrays(20));
    // the sidecar duplicates the same copper at the old width (the drift)
    fs.writeFileSync(
      sync,
      renderSyncFile({
        routes: [
          [
            `  const route1 = new TrackBuilder(typecad, { net: 'VCC',  })`,
            `  .from({ x: 10, y: 20 }, 'F.Cu', 0.3)`,
            `  .to({ x: 20, y: 20, layer: 'F.Cu', width: 0.3 });`,
            `  syncTracks.push(route1);`,
          ].join('\n'),
        ],
      }),
    );

    const ir = buildIr(boardWithTrack(20));
    const first = computeRoutingChanges(ir, [entry, sync]);
    expect(first.notes).toEqual([]);
    const sidecarChanges = first.changes.filter((c) => c.filePath === sync);
    expect(sidecarChanges).toHaveLength(1);
    expect(sidecarChanges[0]!.label).toContain('absorbed into board.ts');
    applySourceChanges(first.changes);

    const emptied = fs.readFileSync(sync, 'utf8');
    expect(emptied).not.toContain('route1');
    expect(emptied).not.toContain('syncTracks.push');
    expect(emptied).toContain('syncTracks.length = 0;');
    // the entry keeps its arrays; the now-orphaned ...syncTracks spread
    // leaves create() with them (the layout view re-adds it on its next
    // route insert)
    const entryAfter = fs.readFileSync(entry, 'utf8');
    expect(entryAfter).toContain('track_VCC.push');
    expect(entryAfter).toContain('...track_VCC');
    expect(entryAfter).not.toContain('...syncTracks');

    // and it converges: one owner left, nothing pending
    const second = computeRoutingChanges(ir, [entry, sync]);
    expect(second.changes).toEqual([]);
  });

  it('collapses a doubled board (same copper at two widths) to the first copy', () => {
    const entry = path.join(dir, 'board.ts');
    const sync = path.join(dir, SYNC_FILE_NAME);
    fs.writeFileSync(entry, entryWithArrays(20));
    fs.writeFileSync(sync, renderSyncFile({}));

    // the built board carried each segment twice — 0.2 (entry) and 0.3 (sidecar)
    const ir = buildIr(boardWithTrack(20, true));
    const first = computeRoutingChanges(ir, [entry, sync]);
    applySourceChanges(first.changes);
    const applied = fs.readFileSync(entry, 'utf8');
    expect(applied.match(/track_VCC\.push/g)).toHaveLength(1);
    expect(applied).toContain('width: 0.2');
    expect(applied).not.toContain('width: 0.3');
    const second = computeRoutingChanges(ir, [entry, sync]);
    expect(second.changes).toEqual([]);
  });

  it('skips absorption when the owner cannot be regenerated — copper is never deleted without a replacement', () => {
    const entry = path.join(dir, 'board.ts');
    const sync = path.join(dir, SYNC_FILE_NAME);
    // TWO create() calls and a stale routing section: the owner's
    // regeneration is refused (manual update), so absorbing the sidecar
    // would delete copper nothing replaces
    fs.writeFileSync(entry, entryWithArrays(25) + '\ntypecad.create();\n');
    const syncBefore = renderSyncFile({
      routes: [
        [
          `  const route1 = new TrackBuilder(typecad, { net: 'VCC',  })`,
          `  .from({ x: 10, y: 20 }, 'F.Cu', 0.3)`,
          `  .to({ x: 20, y: 20, layer: 'F.Cu', width: 0.3 });`,
          `  syncTracks.push(route1);`,
        ].join('\n'),
      ],
    });
    fs.writeFileSync(sync, syncBefore);

    const ir = buildIr(boardWithTrack(20));
    const first = computeRoutingChanges(ir, [entry, sync]);
    // the owner's refusal is reported…
    expect(first.notes.some((n) => n.includes('Multiple typecad.create() calls found'))).toBe(true);
    // …and the absorption it would have justified is skipped, loudly
    expect(first.notes.some((n) => n.includes('Routing consolidation skipped'))).toBe(true);
    expect(first.changes.filter((c) => c.filePath === sync)).toEqual([]);

    applySourceChanges(first.changes);
    // the non-owner's copper survived untouched
    expect(fs.readFileSync(sync, 'utf8')).toBe(syncBefore);
  });
});
