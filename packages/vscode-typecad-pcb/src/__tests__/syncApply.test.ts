// End-to-end planLayoutApply coverage for the _sync.ts sidecar: auto-inserts
// (placements, labels, routes) land in the machine-owned file, entry wiring
// is idempotent, deletes maintain the collect lines, and the legacy in-place
// behaviors still hold when the sidecar cannot be used.
import { describe, expect, it } from 'vitest';
import { planLayoutApply, type LayoutApplyResult } from '../layoutApply.js';
import type { RouteInput } from '../routeEdits.js';

const ENTRY_URI = 'file:///hw/src/board.ts';
const SYNC_URI = 'file:///hw/src/_sync.ts';
const OTHER_URI = 'file:///hw/src/parts.ts';

function entryFile(...extra: string[]): string {
  return [
    "import { PCB, Component, Connector } from '@typecad/pcb';",
    '',
    "const typecad = new PCB('demo', { layers: 2 });",
    "const j1 = new Connector({ reference: 'J1', number: 6, footprint: 'CastellatedHeader-2.54x6' });",
    ...extra,
    'typecad.create(j1);',
  ].join('\n');
}

function planOf(files: Array<{ uri: string; text: string }>, input: Partial<Parameters<typeof planLayoutApply>[1]>) {
  return planLayoutApply(files, {
    moves: [],
    variableOf: (ref) => (ref === 'J1' ? 'j1' : ref === 'C1' ? 'c1' : undefined),
    allRefs: new Set(['J1', 'C1']),
    syncUri: SYNC_URI,
    entryUri: ENTRY_URI,
    ...input,
  });
}

/** Compose a plan's stages exactly like the viewer's dry-run applier. */
function applyPlan(files: Array<{ uri: string; text: string }>, plan: LayoutApplyResult): Map<string, string> {
  const dry = new Map(files.map((f) => [f.uri, f.text]));
  for (const stage of plan.stages) {
    for (const batch of stage) {
      let out = dry.get(batch.uri)!;
      for (const e of [...batch.edits].sort((a, b) => b.start - a.start)) {
        out = out.slice(0, e.start) + e.line + out.slice(e.end);
      }
      dry.set(batch.uri, out);
    }
  }
  return dry;
}

const routeVcc: RouteInput = {
  net: 'VCC',
  w: 0.3,
  pieces: [{ layer: 'F.Cu', pts: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }],
  vias: [],
  from: { ref: 'J1', pin: '1' },
  to: null,
};

describe('layout apply → _sync.ts sidecar', () => {
  it('writes a first placement into a created sidecar and wires the entry file', () => {
    const files = [{ uri: ENTRY_URI, text: entryFile() }, { uri: SYNC_URI, text: '' }];
    const plan = planOf(files, { moves: [{ ref: 'J1', dx: 10, dy: 5, ax: 130, ay: 85 }] });
    expect(plan.skipped).toEqual([]);
    expect(plan.syncFile).toEqual({ created: true, placements: 1, labels: 0, routes: 0, zones: 0, images: 0 });
    expect(plan.counts.moves).toBe(1);
    const out = applyPlan(files, plan);
    const sync = out.get(SYNC_URI)!;
    expect(sync).toContain('export function syncBoard(typecad: PCB, parts: Record<string, Component>): void {');
    expect(sync).toContain('parts.j1.pcb = { x: 130, y: 85 };');
    const entry = out.get(ENTRY_URI)!;
    expect(entry).toContain("import { syncBoard } from './_sync.js';");
    expect(entry).toContain('syncBoard(typecad, { j1 });\ntypecad.create(j1);');
  });

  it('a flip with no literal writes side into the sidecar placement', () => {
    const files = [{ uri: ENTRY_URI, text: entryFile() }, { uri: SYNC_URI, text: '' }];
    const plan = planOf(files, { moves: [{ ref: 'J1', dx: 0, dy: 0, ax: 130, ay: 85, side: 'back' }] });
    expect(plan.skipped).toEqual([]);
    expect(plan.counts.moves).toBe(1);
    const out = applyPlan(files, plan);
    expect(out.get(SYNC_URI)!).toContain("parts.j1.pcb = { x: 130, y: 85, side: 'back' };");
  });

  it('a flip rewrites an existing sidecar placement in place', () => {
    const files = [
      { uri: ENTRY_URI, text: entryFile().replace('typecad.create(j1);', 'syncBoard(typecad, { j1 });\ntypecad.create(j1);') },
      {
        uri: SYNC_URI,
        text: [
          '// banner',
          "import { TrackBuilder } from '@typecad/pcb';",
          'export const syncTracks: TrackBuilder[] = [];',
          'export function syncBoard(typecad: PCB, parts: Record<string, Component>): void {',
          '  syncTracks.length = 0;',
          '  parts.j1.pcb = { x: 130, y: 85 };',
          '}',
        ].join('\n'),
      },
    ];
    const plan = planOf(files, { moves: [{ ref: 'J1', dx: 0, dy: 0, side: 'back' }] });
    expect(plan.skipped).toEqual([]);
    const out = applyPlan(files, plan);
    const sync = out.get(SYNC_URI)!;
    expect(sync.match(/parts\.j1\.pcb\s*=/g)).toHaveLength(1);
    expect(sync).toContain("parts.j1.pcb = { x: 130, y: 85, side: 'back' };");
  });

  it('zones land as typecad.zone() / typecad.keepout() calls in the sidecar', () => {
    const files = [{ uri: ENTRY_URI, text: entryFile() }, { uri: SYNC_URI, text: '' }];
    const plan = planOf(files, {
      zones: [
        { kind: 'pour', layer: 'F.Cu', net: 'GND', x: 1, y: 2, w: 10, h: 5 },
        { kind: 'pour', layer: 'B.Cu', x: 0, y: 0, w: 20, h: 15 },
        { kind: 'keepout', layer: 'F.Cu', x: 3, y: 3, w: 2, h: 2 },
      ],
    });
    expect(plan.skipped).toEqual([]);
    expect(plan.counts.zones).toBe(3);
    const out = applyPlan(files, plan);
    const sync = out.get(SYNC_URI)!;
    // pours out-rank existing zones: ascending priorities (the fill-clearance ordering)
    expect(sync).toContain("typecad.zone({ net: 'GND', layers: ['F.Cu'], x: 1, y: 2, width: 10, height: 5, priority: 1 });");
    expect(sync).toContain("typecad.zone({ layers: ['B.Cu'], x: 0, y: 0, width: 20, height: 15, priority: 2 });");
    expect(sync).toContain("typecad.keepout({ layers: ['F.Cu'], x: 3, y: 3, width: 2, height: 2 });");
    // the entry file learned the syncBoard() call even with no placements
    expect(out.get(ENTRY_URI)!).toContain('syncBoard(typecad, {});');
  });

  it('new pours out-rank existing zones (KiCad fill clearance ordering)', () => {
    // a GND plane literal at priority 3 already in source; two new pours
    // must land at priorities 4 and 5 — a pour inside a plane at equal
    // priority 0 loses the fill to the plane entirely
    const files = [
      {
        uri: ENTRY_URI,
        text: entryFile().replace(
          'typecad.create(j1);',
          "typecad.zone({ net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 50, height: 40, priority: 3 });\ntypecad.create(j1);",
        ),
      },
      { uri: SYNC_URI, text: '' },
    ];
    const plan = planLayoutApply(files, {
      moves: [],
      variableOf: (ref) => (ref === 'J1' ? 'j1' : undefined),
      allRefs: new Set(['J1']),
      syncUri: SYNC_URI,
      entryUri: ENTRY_URI,
      zones: [
        { kind: 'pour', layer: 'F.Cu', net: 'VCC', x: 10, y: 10, w: 5, h: 5 },
        { kind: 'pour', layer: 'F.Cu', net: 'VCC', x: 20, y: 10, w: 5, h: 5 },
        { kind: 'keepout', layer: 'F.Cu', x: 30, y: 10, w: 5, h: 5 },
      ],
    });
    expect(plan.skipped).toEqual([]);
    const out = applyPlan(files, plan);
    const sync = out.get(SYNC_URI)!;
    expect(sync).toContain('priority: 4');
    expect(sync).toContain('priority: 5');
    expect(sync).not.toContain('priority: 6'); // keepouts carry none
  });

  it('zones skip with a reason when the sidecar cannot be wired', () => {
    // no syncUri in the plan input → zones have nowhere to go
    const files = [{ uri: ENTRY_URI, text: entryFile() }];
    const plan = planLayoutApply(files, {
      moves: [],
      variableOf: () => undefined,
      allRefs: new Set(['J1']),
      zones: [{ kind: 'pour', layer: 'F.Cu', net: 'GND', x: 1, y: 2, w: 3, h: 4 }],
    });
    expect(plan.counts.zones).toBe(0);
    expect(plan.skipped.join(' ')).toContain('needs the _sync.ts sidecar');
  });

  it('updates an existing sidecar placement in place — no duplicate statements', () => {
    const files = [
      { uri: ENTRY_URI, text: entryFile().replace('typecad.create(j1);', 'syncBoard(typecad, { j1 });\ntypecad.create(j1);') },
      {
        uri: SYNC_URI,
        text: [
          '// banner',
          "import { TrackBuilder } from '@typecad/pcb';",
          'export const syncTracks: TrackBuilder[] = [];',
          'export function syncBoard(typecad: PCB, parts: Record<string, Component>): void {',
          '  syncTracks.length = 0;',
          '  parts.j1.pcb = { x: 130, y: 85 };',
          '}',
        ].join('\n'),
      },
    ];
    const plan = planOf(files, { moves: [{ ref: 'J1', dx: 2, dy: -1 }] });
    expect(plan.skipped).toEqual([]);
    // an in-place rewrite of an existing sidecar literal is not new sidecar
    // activity — the summary reports inserts only
    expect(plan.syncFile).toBeNull();
    const out = applyPlan(files, plan);
    const sync = out.get(SYNC_URI)!;
    expect(sync.match(/parts\.j1\.pcb\s*=/g)).toHaveLength(1);
    expect(sync).toContain('parts.j1.pcb = { x: 132, y: 84 };');
  });

  it('adds routes to the sidecar and spreads syncTracks in create()', () => {
    const files = [{ uri: ENTRY_URI, text: entryFile() }, { uri: SYNC_URI, text: '' }];
    const plan = planOf(files, { routes: [routeVcc] });
    expect(plan.skipped).toEqual([]);
    expect(plan.counts.routes).toBe(1);
    expect(plan.syncFile).toEqual({ created: true, placements: 0, labels: 0, routes: 1, zones: 0, images: 0 });
    const out = applyPlan(files, plan);
    const sync = out.get(SYNC_URI)!;
    expect(sync).toContain("const route1 = new TrackBuilder(typecad, { net: 'VCC',  })");
    expect(sync).toContain(".from({ x: 1, y: 2 }, 'F.Cu', 0.3)");
    expect(sync).toContain(".to({ x: 3, y: 4, layer: 'F.Cu', width: 0.3 });");
    expect(sync).toContain('syncTracks.push(route1);');
    const entry = out.get(ENTRY_URI)!;
    expect(entry).toContain("import { syncBoard, syncTracks } from './_sync.js';");
    expect(entry).toContain('typecad.create(j1, ...syncTracks);');
    expect(entry).toContain('syncBoard(typecad, {});');
  });

  it('re-planning the same route is idempotent (byte-identical guard)', () => {
    const files = [{ uri: ENTRY_URI, text: entryFile() }, { uri: SYNC_URI, text: '' }];
    const first = planOf(files, { routes: [routeVcc] });
    const once = applyPlan(files, first);
    const files2 = [
      { uri: ENTRY_URI, text: once.get(ENTRY_URI)! },
      { uri: SYNC_URI, text: once.get(SYNC_URI)! },
    ];
    const second = planOf(files2, { routes: [routeVcc] });
    expect(second.counts.routes).toBe(0);
    expect(second.skipped.some((s) => s.includes('identical route already in source'))).toBe(true);
    expect(applyPlan(files2, second).get(SYNC_URI)).toBe(once.get(SYNC_URI));
  });

  it('deleting a whole sidecar route removes its collect line too', () => {
    const files = [{ uri: ENTRY_URI, text: entryFile() }, { uri: SYNC_URI, text: '' }];
    const first = planOf(files, { routes: [routeVcc] });
    const once = applyPlan(files, first);
    const files2 = [
      { uri: ENTRY_URI, text: once.get(ENTRY_URI)! },
      { uri: SYNC_URI, text: once.get(SYNC_URI)! },
    ];
    const plan = planOf(files2, {
      deletes: [{ kind: 'segment', net: 'VCC', x1: 1, y1: 2, x2: 3, y2: 4, layer: 'F.Cu' }],
    });
    expect(plan.counts.deletes).toBe(1);
    const out = applyPlan(files2, plan);
    const sync = out.get(SYNC_URI)!;
    expect(sync).not.toContain('route1');
    expect(sync).not.toContain('syncTracks.push');
    expect(sync).toContain('syncTracks.length = 0;');
    // the entry keeps its spread — an empty array spreads to nothing
    expect(out.get(ENTRY_URI)).toContain('...syncTracks');
  });

  it('splitting a sidecar route gives the new half its own collect line', () => {
    const threeSegs: RouteInput = {
      ...routeVcc,
      pieces: [{ layer: 'F.Cu', pts: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 4 }, { x: 7, y: 4 }] }],
    };
    const files = [{ uri: ENTRY_URI, text: entryFile() }, { uri: SYNC_URI, text: '' }];
    const first = planOf(files, { routes: [threeSegs] });
    const once = applyPlan(files, first);
    const files2 = [
      { uri: ENTRY_URI, text: once.get(ENTRY_URI)! },
      { uri: SYNC_URI, text: once.get(SYNC_URI)! },
    ];
    // the MIDDLE segment dies: the route splits into two builders with a
    // real gap, and the second half needs its own collect line
    const plan = planOf(files2, {
      deletes: [{ kind: 'segment', net: 'VCC', x1: 3, y1: 4, x2: 5, y2: 4, layer: 'F.Cu' }],
    });
    const out = applyPlan(files2, plan);
    const sync = out.get(SYNC_URI)!;
    // regenerated heads re-emit the parsed options verbatim-trimmed
    expect(sync).toContain('const route1 = new TrackBuilder(typecad, { net: \'VCC\', })');
    expect(sync).toContain('.to({ x: 3, y: 4, layer: \'F.Cu\', width: 0.3 });');
    expect(sync).toContain('syncTracks.push(route1);');
    expect(sync).toContain('const route1a = new TrackBuilder(typecad, { net: \'VCC\', })');
    expect(sync).toContain('.from({ x: 5, y: 4 }, \'F.Cu\', 0.3)');
    expect(sync).toContain('.to({ x: 7, y: 4, layer: \'F.Cu\', width: 0.3 });');
    expect(sync).toContain('syncTracks.push(route1a);');
  });

  it('falls back to the legacy after-constructor insert when the variable is not in the entry', () => {
    const other = [
      "import { Capacitor } from '@typecad/pcb';",
      "const c1 = new Capacitor({ reference: 'C1', footprint: 'C_0603', value: '100nF' });",
    ].join('\n');
    const files = [
      { uri: ENTRY_URI, text: entryFile() },
      { uri: OTHER_URI, text: other },
      { uri: SYNC_URI, text: '' },
    ];
    const plan = planOf(files, { moves: [{ ref: 'C1', dx: 3, dy: 3, ax: 10, ay: 10 }] });
    expect(plan.syncFile).toBeNull();
    expect(plan.counts.moves).toBe(1);
    const out = applyPlan(files, plan);
    expect(out.get(OTHER_URI)).toContain("c1.pcb = { x: 10, y: 10 };");
    expect(out.get(SYNC_URI)).toBe('');
  });

  it('refuses to hijack a _sync.ts that is not a typeCAD sync file', () => {
    const files = [{ uri: ENTRY_URI, text: entryFile() }, { uri: SYNC_URI, text: 'const bogus = 1;\n' }];
    const plan = planOf(files, { moves: [{ ref: 'J1', dx: 1, dy: 1, ax: 5, ay: 5 }] });
    // the move still applies via the legacy in-place insert…
    expect(plan.counts.moves).toBe(1);
    const out = applyPlan(files, plan);
    expect(out.get(ENTRY_URI)).toContain('j1.pcb = { x: 5, y: 5 };');
    // …and the foreign file is untouched
    expect(out.get(SYNC_URI)).toBe('const bogus = 1;\n');
    expect(plan.skipped.some((s) => s.includes('not a typeCAD sync file'))).toBe(true);
  });

  it('label inserts ride the sidecar with footprint-local coordinates', () => {
    const files = [{ uri: ENTRY_URI, text: entryFile() }, { uri: SYNC_URI, text: '' }];
    const plan = planOf(files, {
      moves: [{ ref: 'J1', dx: 0, dy: 0, ax: 130, ay: 85 }],
      labels: [{ ref: 'J1', kind: 'value', x: 130, y: 88.5, rot: 0 }],
    });
    expect(plan.skipped).toEqual([]);
    const out = applyPlan(files, plan);
    const sync = out.get(SYNC_URI)!;
    expect(sync).toContain('parts.j1.pcb = { x: 130, y: 85 };');
    expect(sync).toMatch(/parts\.j1\.valueLayout = \{ x: 0, y: 3\.5, rotation: 0 \};/);
    expect(out.get(ENTRY_URI)).toContain('syncBoard(typecad, { j1 });');
  });

  it('deletes a part from source when the layout view deletes it', () => {
    const entryText = [
      "import { PCB, Component, Connector } from '@typecad/pcb';",
      "import { syncBoard, syncTracks } from './_sync.js';",
      '',
      "const typecad = new PCB('demo');",
      "const j1 = new Connector({ reference: 'J1', number: 6, footprint: 'CastellatedHeader-2.54x6' });",
      "const c1 = new Component({ reference: 'C1', value: '1uF' });",
      "typecad.named('VCC').net(j1.pin(1), c1.pin(1));",
      'syncBoard(typecad, { j1, c1 });',
      'typecad.create(j1, c1);',
    ].join('\n');
    const syncText = [
      '// scaffold', // replaced below
    ].join('\n');
    const files = [
      { uri: ENTRY_URI, text: entryText },
      { uri: SYNC_URI, text: syncText.replace('// scaffold', 'export function syncBoard(typecad: PCB, parts: Record<string, Component>): void {\n  syncTracks.length = 0;\n  parts.c1.pcb = { x: 2, y: 3 };\n  parts.j1.pcb = { x: 9, y: 9 };\n}') },
    ];
    // a pending move for the doomed part must not fight the deletion
    const plan = planOf(files, { moves: [{ ref: 'J1', dx: 5, dy: 5 }], partDeletes: ['J1'] });
    expect(plan.skipped).toEqual([]);
    expect(plan.counts.partDeletes).toBe(1);
    const out = applyPlan(files, plan);
    const entry = out.get(ENTRY_URI)!;
    expect(entry).not.toContain('j1');
    expect(entry).toContain('typecad.create(c1);');
    expect(entry).toContain('typecad.named(\'VCC\').net(c1.pin(1));');
    expect(entry).toContain('syncBoard(typecad, { c1 });');
    expect(out.get(SYNC_URI)).not.toContain('parts.j1');
    expect(out.get(SYNC_URI)).toContain('parts.c1.pcb');
  });

  it('refuses a part deletion that would leave a dangling reference', () => {
    const entryText = [
      "import { PCB, Component } from '@typecad/pcb';",
      "const typecad = new PCB('demo');",
      "const c1 = new Component({ reference: 'C1' });",
      'report(c1);',
      'typecad.create(c1);',
    ].join('\n');
    const files = [{ uri: ENTRY_URI, text: entryText }];
    const plan = planOf(files, { partDeletes: ['C1'] });
    expect(plan.counts.partDeletes).toBe(0);
    expect(plan.skipped.some((s) => s.includes('still referenced'))).toBe(true);
    expect(applyPlan(files, plan).get(ENTRY_URI)).toBe(entryText);
  });

  it('skips a part deletion with no source variable, and ambiguous ones', () => {
    const files = [
      { uri: ENTRY_URI, text: entryFile() },
      { uri: OTHER_URI, text: entryFile().replace('J1', 'J1').replace("reference: 'J1'", "reference: 'J9'") },
    ];
    const plan = planOf(files, { partDeletes: ['NOPE'] });
    expect(plan.counts.partDeletes).toBe(0);
    expect(plan.skipped.some((s) => s.includes('no source variable'))).toBe(true);
  });
});
