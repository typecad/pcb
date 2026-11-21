// Layout view round trip: source → board → source.
//
// One cumulative session of layout-view gestures (moves, a flip, label drags,
// a value edit and a rename, routes, zones, the outline, texts, deletes) is
// planned by the extension's own planLayoutApply on a small project. After
// every apply:
//   1. the project still builds
//   2. the board carries the edit: placements from the board model, labels
//      through the viewer's own label reader (parseBoardLabels, so a label
//      must land where it was dropped), routes / zones / outline / texts
//      through the extension's semantic verifier
//   3. importing the board back proposes nothing: no placement, text, zone,
//      outline, routing, graphics or stackup change, and no position or
//      rotation change to any label the session placed
// and at the end, import → rebuild reaches a fixed point.
//
// Every build runs the project source in-process in a FRESH directory:
// vitest serves a module by path for the whole run (vi.resetModules() does
// not re-read a rewritten file), so rebuilding in place would silently build
// the previous source. vitest.config.mts resolves the project's
// '@typecad/pcb' import to this checkout's toolchain source.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  planLayoutApply,
  type LayoutApplyFile,
  type LayoutApplyInput,
  type LayoutApplyResult,
} from '../layoutApply.js';
import { parsePlacementLiteral } from '../layoutEdits.js';
import { verifyBoardSemantics } from '../semanticVerify.js';
import { parseBoardLabels } from '../../../../@typecad/pcb/src/gerber_viewer/build.js';
import { buildBoardModel } from '../../../../@typecad/pcb/src/cli/typecad/board_model.js';
import { computeAllSourceChanges } from '../../../../@typecad/pcb/src/kicad2typecad/apply_source.js';
import { kicadDataToTypeCAD } from '../../../../@typecad/pcb/src/kicad2typecad/cli.js';
import { KicadIRBuilder } from '../../../../@typecad/pcb/src/kicad2typecad/ir_builder.js';
import { SourceMatcher } from '../../../../@typecad/pcb/src/kicad2typecad/matcher.js';
import { SourceRewriter } from '../../../../@typecad/pcb/src/kicad2typecad/rewriter.js';
import { SExprNode } from '../../../../@typecad/pcb/src/kicad2typecad/sexpr_tree.js';
import { collectTypeScriptFiles } from '../../../../@typecad/pcb/src/kicad2typecad/source_analyzer.js';

const PCB_NAME = 'roundtrip';
const ENTRY = 'board.ts';
const SYNC = '_sync.ts';

// never-placed parts (battery, r1, led), a constructor `pcb:` option on a
// rotated part (r2), a hand-written back-side literal (c1), and a free text
// with its size left to the build's default
const FIXTURE = `import { PCB, Component, Resistor, Capacitor, LED } from '@typecad/pcb';

let typecad = new PCB('${PCB_NAME}');

let battery = new Component({
  footprint: 'Battery:BatteryHolder_Keystone_3008_1x2450',
  symbol: 'Device:Battery_Cell',
  prefix: 'BT',
  value: 'CR2450',
});
let r1 = new Resistor({ value: '150' });
let r2 = new Resistor({ value: '1k', pcb: { x: 20, y: 5, rotation: 90 } });
let c1 = new Capacitor({ value: '100 nF' });
c1.pcb = { x: 25, y: -5, rotation: 270, side: 'back' };
let led = new LED({ value: 'red' });

typecad.named('+BATT').net(battery.pin(1), r1.pin(1), r2.pin(1));
typecad.named('led_a').net(r1.pin(2), led.pin(2));
typecad.named('VMID').net(r2.pin(2), c1.pin(1));
typecad.named('GND').net(led.pin(1), battery.pin(2), c1.pin(2));

typecad.outline(-25, -35, 70, 55);
typecad.text({ text: 'REV A', x: 10, y: 15, layer: 'F.SilkS' });

typecad.create(battery, r1, r2, c1, led);
`;

type Side = 'front' | 'back';
type LabelKind = 'reference' | 'value' | 'fab';
interface Comp {
  reference: string;
  variable?: string;
  side: Side;
  at: { x: number; y: number; rotation: number };
}
/** a label in the layout page's frame (board mm, y down), angle absolute */
interface PageLabel {
  x: number;
  y: number;
  rot: number;
}
interface Ctx {
  by: (ref: string) => Comp;
  label: (ref: string, kind: LabelKind) => PageLabel;
}
type Gesture = Partial<Omit<LayoutApplyInput, 'variableOf' | 'allRefs' | 'boardPlacementOf' | 'syncUri' | 'entryUri'>>;
interface Scenario {
  name: string;
  input: (ctx: Ctx) => Gesture;
}

const prevCwd = process.cwd();
let root = '';
/** the last project directory that built — each scenario starts from it */
let cur = '';
let step = 0;
/** `${variable}.${kind}Layout` of every label the session placed: on import
 *  these must come back with no position or rotation change */
const placedLabels = new Set<string>();

const near = (a: number, b: number, tol = 0.01): boolean => Math.abs(a - b) <= tol;
const normRot = (r: number): number => (((Math.round(r * 10) / 10) % 360) + 360) % 360;
const boardOf = (dir: string): string => path.join(dir, 'build', `${PCB_NAME}.kicad_pcb`);

function newProject(src: Record<string, string>): string {
  const dir = path.join(root, `s${String(step++).padStart(2, '0')}`);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
  for (const [name, text] of Object.entries(src)) if (text) fs.writeFileSync(path.join(dir, 'src', name), text);
  return dir;
}

function readSrc(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fs.readdirSync(path.join(dir, 'src'))) out[f] = fs.readFileSync(path.join(dir, 'src', f), 'utf8');
  return out;
}

/** run fn with console output captured (the build and the importer are chatty) */
async function quietly<T>(fn: () => Promise<T>): Promise<{ error?: unknown; log: string[] }> {
  const log: string[] = [];
  const spies = (['log', 'info', 'warn', 'error'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      log.push(args.map(String).join(' '));
    }),
  );
  try {
    await fn();
    return { log };
  } catch (error) {
    return { error, log };
  } finally {
    for (const s of spies) s.mockRestore();
  }
}

/** Run the project source (what `npm run build` does). Returns null on success, else why it failed. */
async function build(dir: string): Promise<string | null> {
  process.chdir(dir);
  // a fresh module graph per build, like a fresh `npm run build` process
  vi.resetModules();
  const exitHooks = new Set(process.listeners('beforeExit'));
  const r = await quietly(() => import(/* @vite-ignore */ path.join(dir, 'src', ENTRY)));
  // that process would end here: drop the exit hooks this build installed
  // (one per module instance), or they pile up across builds
  for (const l of process.listeners('beforeExit')) if (!exitHooks.has(l)) process.removeListener('beforeExit', l);
  const tail = r.log.slice(-12).join('\n');
  if (r.error !== undefined) return `${r.error instanceof Error ? r.error.stack : String(r.error)}\n${tail}`;
  return fs.existsSync(boardOf(dir)) ? null : `no board written\n${tail}`;
}

function comps(dir: string): Comp[] {
  return buildBoardModel(boardOf(dir)).components.map((c) => ({
    reference: c.reference,
    variable: c.variable,
    side: c.side,
    at: c.at,
  }));
}

function labelOf(dir: string, ref: string, kind: LabelKind): PageLabel | null {
  const l = parseBoardLabels(fs.readFileSync(boardOf(dir), 'utf8'))[ref]?.find((k) => k.kind === kind);
  // parseBoardLabels is in the gerber frame (y up); the page sends y down
  return l ? { x: l.x, y: -l.y, rot: l.rot } : null;
}

/**
 * Everything importing the board back would change. `computeAllSourceChanges`
 * (what check-sync reports) covers zones, outline, routing, the text section,
 * stackup and graphics; placements, free texts and label layouts are the
 * rewriter's.
 */
function importCheck(dir: string, allowMaterialize: boolean): string[] {
  const fails: string[] = [];
  const ir = new KicadIRBuilder().build(SExprNode.parse(fs.readFileSync(boardOf(dir), 'utf8')));
  const sourceRoot = path.join(dir, 'src');
  const sourceFiles = collectTypeScriptFiles(sourceRoot);
  const matchResults = new SourceMatcher(sourceRoot).matchAll(ir.footprints);
  const rewriter = new SourceRewriter();
  for (const [category, result] of Object.entries(computeAllSourceChanges(ir, sourceFiles))) {
    for (const c of result.changes) fails.push(`import would change ${category}: ${c.label}`);
  }
  for (const c of rewriter.computeFootprintChanges(matchResults, sourceFiles))
    fails.push(`import would move: ${c.label}`);
  for (const c of rewriter.computeTextChanges(ir, sourceFiles)) fails.push(`import would rewrite text: ${c.label}`);
  for (const c of rewriter.computeLayoutChanges(matchResults, sourceFiles)) {
    // a label the source never set is MATERIALIZED from the board on the
    // first import (by design, converges once) — but a label this session
    // placed must already match, and after the fixed point nothing may remain
    const moved = c.changedProps.some((p) => p.startsWith('position') || p.startsWith('rotation'));
    if (!allowMaterialize) fails.push(`import still proposes a layout: ${c.label}`);
    else if (moved && placedLabels.has(`${c.variableName}.${c.layoutType}`))
      fails.push(`placed label drifts on import: ${c.label}`);
  }
  return fails;
}

function dryApply(files: LayoutApplyFile[], plan: LayoutApplyResult): Map<string, string> {
  const out = new Map(files.map((f) => [f.uri, f.text]));
  for (const stage of plan.stages) {
    for (const batch of stage) {
      let text = out.get(batch.uri)!;
      for (const e of [...batch.edits].sort((a, b) => b.start - a.start))
        text = text.slice(0, e.start) + e.line + text.slice(e.end);
      out.set(batch.uri, text);
    }
  }
  return out;
}

const ENTRY_URI = 'file:///src/board.ts';
const SYNC_URI = 'file:///src/_sync.ts';

/** Plan one gesture against the current project, build the result, and list everything that went wrong. */
async function apply(s: Scenario): Promise<string[]> {
  const fails: string[] = [];
  const before = comps(cur);
  const by = (list: Comp[]) => (ref: string) => list.find((c) => c.reference === ref)!;
  const from = cur;
  const input = s.input({
    by: by(before),
    label: (ref, kind) => {
      const l = labelOf(from, ref, kind);
      if (!l) throw new Error(`${ref} has no ${kind} label on the board`);
      return l;
    },
  });
  const src = readSrc(cur);
  const files: LayoutApplyFile[] = [
    { uri: ENTRY_URI, text: src[ENTRY] ?? '' },
    { uri: SYNC_URI, text: src[SYNC] ?? '' },
  ];
  const varOf = new Map(before.map((c) => [c.reference, c.variable ?? '']));
  const plan = planLayoutApply(files, {
    moves: [],
    ...input,
    variableOf: (ref) => varOf.get(ref) || undefined,
    allRefs: new Set(before.map((c) => c.reference)),
    boardPlacementOf: (ref) => {
      const c = by(before)(ref);
      return c ? { x: c.at.x, y: c.at.y, rot: c.at.rotation, side: c.side } : undefined;
    },
    syncUri: SYNC_URI,
    entryUri: ENTRY_URI,
  });
  if (plan.skipped.length) fails.push(`planner skipped: ${plan.skipped.join(' | ')}`);
  const planned = dryApply(files, plan);

  const dir = newProject({ [ENTRY]: planned.get(ENTRY_URI)!, [SYNC]: planned.get(SYNC_URI)! });
  const err = await build(dir);
  if (err) return [...fails, `build failed:\n${err}`];
  cur = dir;
  const after = comps(dir);
  const now = by(after);

  // moved parts land where they were dropped, keeping their angle unless the
  // gesture rotated them and their side unless it flipped them
  const moves = input.moves ?? [];
  for (const mv of moves) {
    const c = now(mv.ref);
    const was = by(before)(mv.ref);
    if (!c) {
      fails.push(`${mv.ref} missing after the build`);
      continue;
    }
    if (!near(c.at.x, mv.ax!) || !near(c.at.y, mv.ay!))
      fails.push(`${mv.ref} at ${c.at.x},${c.at.y}, moved to ${mv.ax},${mv.ay}`);
    const rot = normRot(was.at.rotation + (mv.rot ?? 0));
    if (normRot(c.at.rotation) !== rot) fails.push(`${mv.ref} rotation ${c.at.rotation}, expected ${rot}`);
    if (c.side !== (mv.side ?? was.side)) fails.push(`${mv.ref} on the ${c.side}, expected ${mv.side ?? was.side}`);
  }
  // nothing else moves
  const touched = new Set([...moves.map((m) => m.ref), ...(input.renames ?? []).flatMap((r) => [r.ref, r.newRef])]);
  for (const c0 of before) {
    if (touched.has(c0.reference) || (input.partDeletes ?? []).includes(c0.reference)) continue;
    const c = now(c0.reference);
    if (!c) fails.push(`untouched ${c0.reference} vanished`);
    else if (
      !near(c.at.x, c0.at.x) ||
      !near(c.at.y, c0.at.y) ||
      normRot(c.at.rotation) !== normRot(c0.at.rotation) ||
      c.side !== c0.side
    )
      fails.push(
        `untouched ${c0.reference} moved: ${JSON.stringify(c0.at)}/${c0.side} -> ${JSON.stringify(c.at)}/${c.side}`,
      );
  }
  // labels land where they were dropped
  for (const l of input.labels ?? []) {
    const got = labelOf(dir, l.ref, l.kind);
    if (!got) fails.push(`${l.ref} ${l.kind} label not on the board`);
    else if (!near(got.x, l.x, 0.02) || !near(got.y, l.y, 0.02) || normRot(got.rot) !== normRot(l.rot))
      fails.push(
        `${l.ref} ${l.kind} label at (${got.x}, ${got.y}) rot ${got.rot}, dropped at (${l.x}, ${l.y}) rot ${l.rot}`,
      );
  }
  // the board side of routes, zones, outline and texts: the extension's own verifier
  const placements = moves.map((mv) => {
    const v = varOf.get(mv.ref)!;
    const lit =
      parsePlacementLiteral(planned.get(SYNC_URI) ?? '', v) ?? parsePlacementLiteral(planned.get(ENTRY_URI)!, v);
    return { ref: mv.ref, x: lit?.x ?? mv.ax!, y: lit?.y ?? mv.ay!, ...(mv.side ? { side: mv.side } : {}) };
  });
  const report = verifyBoardSemantics(fs.readFileSync(boardOf(dir), 'utf8'), {
    routes: (input.routes ?? []).map((r) => ({
      net: r.net,
      w: r.w,
      pieces: r.pieces,
      vias: r.vias.map((v) => ({ x: v.x, y: v.y })),
    })),
    deletes: (input.deletes ?? []).map((d) => ({ net: d.net, x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, layer: d.layer })),
    placements,
    texts: (input.texts ?? []).map((t) => ({ text: t.text, x: t.x, y: t.y })),
    zones: (input.zones ?? []).map((z) => ({
      kind: z.kind,
      layer: z.layer,
      net: z.net,
      x: z.x,
      y: z.y,
      w: z.w,
      h: z.h,
    })),
    outline: input.outline ? { rect: input.outline.rect } : undefined,
    zoneDeletes: input.zoneDeletes ?? [],
    images: [],
  });
  if (report.misses.length) fails.push(`semantic: ${report.misses.join(' | ')}`);

  for (const l of input.labels ?? []) placedLabels.add(`${varOf.get(l.ref)}.${l.kind}Layout`);
  fails.push(...importCheck(dir, true));
  return fails;
}

const moveBy = (c: Comp, dx: number, dy: number, extra: { rot?: number; side?: Side } = {}) => ({
  ref: c.reference,
  dx,
  dy,
  ax: +(c.at.x + dx).toFixed(3),
  ay: +(c.at.y + dy).toFixed(3),
  ...extra,
});
const dragLabel = (
  ctx: Ctx,
  ref: string,
  kind: LabelKind,
  dx: number,
  dy: number,
  drot = 0,
  style?: { w: number; h: number; thickness: number },
) => {
  const l = ctx.label(ref, kind);
  return {
    ref,
    kind,
    x: +(l.x + dx).toFixed(3),
    y: +(l.y + dy).toFixed(3),
    rot: normRot(l.rot + drot),
    ...(style ? { style } : {}),
  };
};

const SCENARIOS: Scenario[] = [
  {
    // never placed (BT1), constructor `pcb:` option (R2), hand-written back
    // literal (C1), and a move that also rotates (R1)
    name: 'moves parts placed every way, one with a rotation',
    input: ({ by }) => ({
      moves: [
        moveBy(by('BT1'), 1.5, -2),
        moveBy(by('R2'), 2, 1),
        moveBy(by('C1'), -3, 2),
        moveBy(by('R1'), 0, 4, { rot: 90 }),
      ],
    }),
  },
  { name: 'flips the LED to the back', input: ({ by }) => ({ moves: [moveBy(by('D1'), 0, 0, { side: 'back' })] }) },
  {
    name: 'drops a label where it already is',
    input: (ctx) => ({ labels: [dragLabel(ctx, 'BT1', 'reference', 0, 0)] }),
  },
  {
    name: 'drags labels on a front part, a rotated part, a back literal and a flipped part (fab)',
    input: (ctx) => ({
      labels: [
        dragLabel(ctx, 'BT1', 'value', 2, 1),
        dragLabel(ctx, 'R2', 'reference', 1, -0.5),
        dragLabel(ctx, 'C1', 'reference', -1, 1),
        dragLabel(ctx, 'D1', 'fab', 0.5, 0.5),
      ],
    }),
  },
  { name: 'rotates a label 90°', input: (ctx) => ({ labels: [dragLabel(ctx, 'R1', 'reference', 0, 0, 90)] }) },
  {
    name: 'restyles a label',
    input: (ctx) => ({ labels: [dragLabel(ctx, 'C1', 'value', 0, 0, 0, { w: 1.2, h: 1.2, thickness: 0.2 })] }),
  },
  {
    name: 'moves a part whose labels were placed (they follow)',
    input: ({ by }) => ({ moves: [moveBy(by('R2'), -1, -1)] }),
  },
  {
    name: 'edits a value and renames a part',
    input: () => ({ values: [{ ref: 'R1', value: '220' }], renames: [{ ref: 'R2', newRef: 'R10' }] }),
  },
  {
    name: 'routes F.Cu → via → B.Cu, plus a B.Cu leg',
    input: () => ({
      routes: [
        {
          net: '+BATT',
          w: 0.3,
          pieces: [
            {
              layer: 'F.Cu',
              pts: [
                { x: 5, y: 5 },
                { x: 8, y: 5 },
              ],
            },
            {
              layer: 'B.Cu',
              pts: [
                { x: 8, y: 5 },
                { x: 8, y: 9 },
              ],
            },
          ],
          vias: [{ x: 8, y: 5 }],
          from: { ref: 'R1', pin: '1' },
          to: null,
        },
        {
          net: 'GND',
          w: 0.5,
          pieces: [
            {
              layer: 'B.Cu',
              pts: [
                { x: -5, y: 10 },
                { x: -5, y: 14 },
                { x: -2, y: 14 },
              ],
            },
          ],
          vias: [],
          from: { ref: 'BT1', pin: '2' },
          to: null,
        },
      ],
    }),
  },
  {
    name: 'deletes one segment of the GND leg',
    input: () => ({
      deletes: [{ kind: 'segment' as const, net: 'GND', x1: -5, y1: 14, x2: -2, y2: 14, layer: 'B.Cu' }],
    }),
  },
  {
    name: 'draws a GND pour and a keepout',
    input: () => ({
      zones: [
        { kind: 'pour' as const, layer: 'B.Cu', net: 'GND', x: -20, y: -30, w: 20, h: 15 },
        { kind: 'keepout' as const, layer: 'F.Cu', x: 30, y: 10, w: 5, h: 4 },
      ],
    }),
  },
  {
    name: 'moves the pour and deletes the keepout',
    input: () => ({
      zoneEdits: [
        { original: { x: -20, y: -30, w: 20, h: 15, layer: 'B.Cu' }, rect: { x: -18, y: -28, w: 22, h: 16 } },
      ],
      zoneDeletes: [{ x: 30, y: 10, w: 5, h: 4, layer: 'F.Cu' }],
    }),
  },
  {
    name: 'edits the outline',
    input: () => ({ outline: { original: { x: -25, y: -35, w: 70, h: 55 }, rect: { x: -26, y: -36, w: 72, h: 58 } } }),
  },
  {
    name: 'moves, rotates and retexts a free text',
    input: () => ({ texts: [{ text0: 'REV A', x0: 10, y0: 15, text: 'REV B', x: 12, y: 16, rot: 90 }] }),
  },
  { name: 'deletes the free text', input: () => ({ textDeletes: [{ text0: 'REV B', x0: 12, y0: 16 }] }) },
  { name: 'deletes a part', input: () => ({ partDeletes: ['D1'] }) },
];

describe('layout view round trip: source → board → source', { timeout: 120_000 }, () => {
  beforeAll(() => {
    // INSIDE the package (like a real project, the source is executed and its
    // imports must resolve to this workspace)
    root = fs.mkdtempSync(path.join(__dirname, '.roundtrip-'));
  });
  afterAll(() => {
    process.chdir(prevCwd);
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('builds the fixture, and the build imports back clean', async () => {
    const dir = newProject({ [ENTRY]: FIXTURE });
    expect(await build(dir)).toBeNull();
    cur = dir;
    expect(importCheck(dir, true)).toEqual([]);
  });

  for (const s of SCENARIOS) {
    it(s.name, async () => {
      expect(cur, 'the fixture never built').not.toBe('');
      expect(await apply(s)).toEqual([]);
    });
  }

  it('import → rebuild reaches a fixed point: nothing is left to import', async () => {
    expect(cur, 'the fixture never built').not.toBe('');
    process.chdir(cur);
    const r = await quietly(() => kicadDataToTypeCAD(boardOf(cur), { apply: true, auto: true }));
    expect(r.error).toBeUndefined();
    const dir = newProject(readSrc(cur));
    expect(await build(dir)).toBeNull();
    expect(importCheck(dir, false)).toEqual([]);
  });
});
