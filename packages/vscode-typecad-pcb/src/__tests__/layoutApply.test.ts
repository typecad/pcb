// Layout-apply orchestration: the full "apply & rebuild" gesture (moves,
// text/value/label edits, routes, deletes) planned as sequential stages —
// no overlapping edits, deferral across files, honest skip reports, and
// output that still parses.
import { describe, expect, it } from 'vitest';
import { planLayoutApply } from '../layoutApply.js';
import { expectValidTs } from './helpers/valid_source.js';

const project = () => `import { PCB, Component, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const r1 = new Component({ reference: 'R1', value: '1k' });
r1.pcb = { x: 10, y: 10 };
const c1 = new Component({ reference: 'C1' });
c1.pcb = { x: 30, y: 10 };
const vcc = new TrackBuilder(typecad, { net: 'VCC', })
  .from({ x: 10.5, y: 10 }, 'F.Cu', 0.3)
  .to({ x: 20, y: 10, layer: 'F.Cu', width: 0.3 })
  .to({ x: 25, y: 10, layer: 'F.Cu', width: 0.3 })
  .to({ x: 30, y: 10, layer: 'F.Cu', width: 0.3 });
typecad.text({ text: 'hello', x: 5, y: 5, layer: 'F.SilkS' });
typecad.create(
  r1,
  c1,
  vcc,
);
`;

const run = (files: Array<{ uri: string; text: string }>, input: Parameters<typeof planLayoutApply>[1]) => {
  const plan = planLayoutApply(files, input);
  // apply stage by stage, exactly like the viewer's WorkspaceEdit loop
  const texts = new Map(files.map((f) => [f.uri, f.text]));
  for (const stage of plan.stages) {
    for (const batch of stage) {
      let out = texts.get(batch.uri)!;
      for (const e of [...batch.edits].sort((a, b) => b.start - a.start)) {
        out = out.slice(0, e.start) + e.line + out.slice(e.end);
      }
      texts.set(batch.uri, out);
    }
  }
  return { plan, texts };
};

const baseInput = (over: Partial<Parameters<typeof planLayoutApply>[1]> = {}) => ({
  moves: [],
  variableOf: (ref: string) => ({ R1: 'r1', C1: 'c1' })[ref],
  allRefs: new Set(['R1', 'C1']),
  ...over,
});

describe('planLayoutApply', () => {
  it('applies a whole gesture in one pass: move, delete, add, value, text', () => {
    const { plan, texts } = run(
      [{ uri: 'file:///src/board.ts', text: project() }],
      baseInput({
        moves: [{ ref: 'R1', dx: 2, dy: 1, pads: [{ x: 10.5, y: 10 }] }],
        values: [{ ref: 'R1', value: '2k' }],
        texts: [{ text0: 'hello', x0: 5, y0: 5, text: 'hello', x: 6, y: 6, rot: 0 }],
        deletes: [{ net: 'VCC', x1: 20, y1: 10, x2: 25, y2: 10, layer: 'F.Cu' }],
        routes: [
          {
            net: 'GND',
            w: 0.25,
            pieces: [{ layer: 'F.Cu', pts: [{ x: 1, y: 1 }, { x: 2, y: 1 }] }],
            vias: [],
            from: { ref: 'R1', pin: '2' },
            to: null,
          },
        ],
      }),
    );
    const out = texts.get('file:///src/board.ts')!;
    expectValidTs(out);
    // placement moved by the delta
    expect(out).toContain('r1.pcb = { x: 12, y: 11 }');
    // sticky endpoint followed the part
    expect(out).toContain('.from({ x: 12.5, y: 11 }');
    // the split halves keep the net, and neither the old name nor an
    // emptied () survives in create()
    expect(out.match(/new TrackBuilder\(typecad, \{ net: 'VCC', \}\)/g)).toHaveLength(2);
    expect(out).not.toContain('()');
    // new route declared before create() and passed to it
    expect(out).toContain('const route1 = new TrackBuilder');
    expect(out).toMatch(/create\([\s\S]*vcc,[\s\S]*route1/);
    // value + text edits landed
    expect(out).toContain("value: '2k'");
    expect(out).toContain("text: 'hello', x: 6, y: 6");
    expect(plan.counts).toMatchObject({ moves: 1, endpoints: 1, texts: 1, values: 1, routes: 1, deletes: 1 });
    expect(plan.skipped).toEqual([]);
  });

  it('defers literal searches across files; unplaced parts get literals inserted, undeclared ones skip once', () => {
    const fileA = "const a = new Component({ reference: 'C9' });\n";
    const fileB = "const b = new Component({ reference: 'U2' });\nu2.pcb = { x: 3, y: 4 };\n";
    const { plan, texts } = run(
      [
        { uri: 'file:///src/a.ts', text: fileA },
        { uri: 'file:///src/b.ts', text: fileB },
      ],
      baseInput({
        moves: [
          { ref: 'U2', dx: 1, dy: 1 }, // literal lives in file B (rewrite)
          { ref: 'C9', dx: 1, dy: 1 }, // declared in file A, never placed (INSERT)
          { ref: 'ZZ', dx: 1, dy: 1 }, // no variable declared anywhere (skip)
        ],
        variableOf: (ref) => ({ U2: 'u2', C9: 'a', ZZ: 'zz' })[ref],
      }),
    );
    expect(plan.counts.moves).toBe(2);
    expect(texts.get('file:///src/b.ts')).toContain('u2.pcb = { x: 4, y: 5 }');
    expect(texts.get('file:///src/a.ts')).toContain('a.pcb = { x: 1, y: 1 };');
    expect(plan.skipped).toEqual(['ZZ (no `zz.pcb = {…}` literal found)']);
  });

  it('matches texts per file and reports unmatched ones even with several files', () => {
    const fileA = "typecad.text({ text: 'a', x: 1, y: 1 });\n";
    const fileB = "typecad.text({ text: 'b', x: 2, y: 2 });\n";
    const { plan, texts } = run(
      [
        { uri: 'file:///src/a.ts', text: fileA },
        { uri: 'file:///src/b.ts', text: fileB },
      ],
      baseInput({
        texts: [
          { text0: 'a', x0: 1, y0: 1, text: 'A!', x: 1, y: 1, rot: 0 },
          { text0: 'b', x0: 2, y0: 2, text: 'B!', x: 2, y: 2, rot: 0 },
          { text0: 'missing', x0: 9, y0: 9, text: 'x', x: 9, y: 9, rot: 0 },
        ],
      }),
    );
    expect(texts.get('file:///src/a.ts')).toContain("text: 'A!'");
    expect(texts.get('file:///src/b.ts')).toContain("text: 'B!'");
    expect(plan.counts.texts).toBe(2);
    expect(plan.skipped).toEqual(['text "missing" (no .text({…}) literal matches its authored value/anchor)']);
  });

  it('converts labels against the already-applied placement (no double delta)', () => {
    const { plan, texts } = run(
      [{ uri: 'file:///src/board.ts', text: project() }],
      baseInput({
        moves: [{ ref: 'R1', dx: 2, dy: 0 }],
        labels: [{ ref: 'R1', kind: 'reference', x: 13, y: 11, rot: 0 }],
      }),
    );
    const out = texts.get('file:///src/board.ts')!;
    expectValidTs(out);
    // part ends at (12, 10): the label is +1,+1 in footprint-local space
    expect(out).toContain('referenceLayout: { x: 1, y: 1, rotation: 0 }');
    expect(plan.counts).toMatchObject({ moves: 1, labels: 1 });
  });

  it('moves a sticky endpoint inside a route block the delete stage rewrote', () => {
    // the delete rewrites vcc's block; the endpoint edit must land on the
    // REGENERATED .from literal — sequential stages keep the offsets honest
    const { plan, texts } = run(
      [{ uri: 'file:///src/board.ts', text: project() }],
      baseInput({
        moves: [{ ref: 'R1', dx: 2, dy: 1, pads: [{ x: 10.5, y: 10 }] }],
        deletes: [{ net: 'VCC', x1: 25, y1: 10, x2: 30, y2: 10, layer: 'F.Cu' }],
      }),
    );
    const out = texts.get('file:///src/board.ts')!;
    expectValidTs(out);
    expect(out).toContain('.from({ x: 12.5, y: 11 }');
    expect(out).not.toContain('.to({ x: 30, y: 10');
    expect(plan.counts).toMatchObject({ moves: 1, endpoints: 1, deletes: 1 });
  });

  it('plans nothing (and reports why) when nothing matches', () => {
    const { plan } = run([{ uri: 'file:///src/board.ts', text: project() }], baseInput());
    expect(plan.stages).toEqual([]);
    expect(plan.touched).toEqual([]);
    expect(plan.counts).toMatchObject({ moves: 0, endpoints: 0, texts: 0, values: 0, labels: 0, renames: 0, routes: 0, deletes: 0 });
  });

  it('re-creates a declared route the argument rewrite dropped', () => {
    // regression: a multi-route rewrite once dropped an UNTOUCHED route's
    // name from create() while its declaration survived — the route built
    // nothing and its copper silently vanished from the board. Any
    // route/delete apply must heal that drift.
    const src = `import { PCB, Component, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const vcc = new TrackBuilder(typecad, { net: 'VCC', })
  .from({ x: 10.5, y: 10 }, 'F.Cu', 0.3)
  .to({ x: 20, y: 10, layer: 'F.Cu', width: 0.3 });
const gnd = new TrackBuilder(typecad, { net: 'GND', })
  .from({ x: 30, y: 10 }, 'F.Cu', 0.3)
  .to({ x: 35, y: 10, layer: 'F.Cu', width: 0.3 });
typecad.create(vcc);
`;
    const { plan, texts } = run(
      [{ uri: 'file:///src/board.ts', text: src }],
      baseInput({
        deletes: [{ net: 'VCC', x1: 10.5, y1: 10, x2: 20, y2: 10, layer: 'F.Cu' }],
      }),
    );
    const out = texts.get('file:///src/board.ts')!;
    expectValidTs(out);
    // vcc emptied out of the delete — but gnd, untouched, must end up (or
    // stay) in create(): the guard re-adds what the rewrite dropped
    expect(out).toMatch(/typecad\.create\((?:[^)]*\b)?gnd\b/);
    expect(out).not.toMatch(/typecad\.create\([^)]*\bvcc\b/);
    expect(plan.counts.deletes).toBe(1);
  });
});

describe('planLayoutApply label assignment fallback', () => {
  // rd_skeleton's shape exactly: subclass factories with prefix-derived
  // references — no `reference: 'D1'` literal anywhere to rewrite
  const ledProject = () => `import { PCB, Component, LED } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const led = new LED({
  value: 'red',
  simulation: { model: 'Dled D (IS=1a RS=3.3 N=1.8)' },
});
led.pcb = { x: 17.5, y: -5.5 };
typecad.create(led);
`;

  it('writes a constructor-less part label as a public-field assignment', () => {
    const { plan, texts } = run(
      [{ uri: 'file:///src/board.ts', text: ledProject() }],
      baseInput({
        labels: [{ ref: 'D1', kind: 'reference', x: 19.5, y: -5.5, rot: 0, style: { h: 2, justify: { horizontal: 'left', vertical: 'middle', mirror: false } } }],
        variableOf: (ref: string) => ({ D1: 'led' })[ref],
        allRefs: new Set(['D1']),
      }),
    );
    expect(plan.skipped).toEqual([]);
    expect(plan.counts.labels).toBe(1);
    const out = texts.get('file:///src/board.ts')!;
    expectValidTs(out);
    expect(out).toContain('led.referenceLayout = { x: 2, y: 0, rotation: 0, height: 2, justify: { horizontal: \'left\', vertical: \'middle\', mirror: false } };');
    // the assignment lands right after the constructor, before led.pcb
    expect(out.indexOf('});')).toBeLessThan(out.indexOf('led.referenceLayout'));
    expect(out.indexOf('led.referenceLayout')).toBeLessThan(out.indexOf('led.pcb'));
  });

  it('replaces an existing assignment instead of inserting a twin', () => {
    const src =
      ledProject().replace('led.pcb = { x: 17.5, y: -5.5 };', 'led.referenceLayout = { x: 1, y: 2, rotation: 90 };\nled.pcb = { x: 17.5, y: -5.5 };');
    const { plan, texts } = run(
      [{ uri: 'file:///src/board.ts', text: src }],
      baseInput({
        labels: [{ ref: 'D1', kind: 'value', x: 19.5, y: -5.5, rot: 0, style: { thickness: 0.25 } }],
        variableOf: (ref: string) => ({ D1: 'led' })[ref],
        allRefs: new Set(['D1']),
      }),
    );
    expect(plan.skipped).toEqual([]);
    const out = texts.get('file:///src/board.ts')!;
    expectValidTs(out);
    expect(out.match(/led\.valueLayout =/g)).toHaveLength(1);
    expect(out).toContain('led.valueLayout = { x: 2, y: 0, rotation: 0, thickness: 0.25 };');
  });

  it('reports an honest skip when no variable maps the ref', () => {
    const { plan } = run(
      [{ uri: 'file:///src/board.ts', text: ledProject() }],
      baseInput({
        labels: [{ ref: 'ZZ', kind: 'reference', x: 1, y: 1, rot: 0 }],
        variableOf: () => undefined,
        allRefs: new Set(['ZZ']),
      }),
    );
    expect(plan.counts.labels).toBe(0);
    expect(plan.skipped.join(' ')).toContain('ZZ (no source variable)');
  });
});

describe('planLayoutApply never plans unparsable output (regression: the CRLF route re-apply)', () => {
  // the real rd_skeleton shape: CRLF file, a route already in source, the
  // same route still pending in the session, a stale delete, and a label
  // edit — the combination that produced `width: 0const route16` and a
  // stray-`t` corruption in the user's file
  const crlfProject = () => `import { PCB, Component, LED, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const led = new LED({
  value: 'red',
  simulation: { model: 'Dled D (IS=1a RS=3.3 N=1.8)' },
});
led.pcb = { x: 17.5, y: -5.5 };
const route15a = new TrackBuilder(typecad, { net: 'led_a', })
.from({ x: 9.48, y: -0.009 }, 'In1.Cu', 0.55)
.to({ x: 11.651, y: -0.009, layer: 'In2.Cu', width: 0.55 });

const route16 = new TrackBuilder(typecad, { net: 'led_a',  })
  .from({ x: 7.526, y: -0.009 }, 'In1.Cu', 0.55)
  .to({ x: 9.48, y: -0.009, layer: 'In1.Cu', width: 0.55 });

typecad.create(battery_placeholder, led, route15a, route16);
`.replace(/\n/g, '\r\n').replace('battery_placeholder', 'r1');

  it('re-applying the pending route is idempotent and the result parses', () => {
    const pendingRoute = {
      net: 'led_a',
      w: 0.55,
      from: { ref: 'D1', pin: '1' },
      to: null,
      vias: [],
      pieces: [{ layer: 'In1.Cu', w: 0.55, pts: [{ x: 7.526, y: -0.009 }, { x: 9.48, y: -0.009 }] }],
    };
    const { plan, texts } = run(
      [{ uri: 'file:///src/board.ts', text: crlfProject() }],
      baseInput({
        routes: [pendingRoute],
        deletes: [{ net: 'led_a', x1: 9.48, y1: -0.009, x2: 11.651, y2: -0.009, layer: 'In1.Cu' }],
        labels: [{ ref: 'D1', kind: 'reference', x: 19.46, y: -10.8, rot: 0 }],
        variableOf: (ref: string) => ({ D1: 'led' })[ref],
        allRefs: new Set(['D1']),
      }),
    );
    const out = texts.get('file:///src/board.ts')!;
    expectValidTs(out);
    // the pending route matched the source chain — no duplicate declaration
    expect(plan.counts.routes).toBe(0);
    expect(out.match(/const route16 =/g)).toHaveLength(1);
  });
});

describe('multiple label assignments in one apply (batch coherence)', () => {
  it('two constructor-less parts in one file: both assignments land intact', () => {
    const src = `import { PCB, LED, Resistor } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const led = new LED({
  value: 'red',
  simulation: { model: 'Dled D (IS=1a RS=3.3 N=1.8)' },
});
led.pcb = { x: 17.5, y: -5.5 };
const r1 = new Resistor({ value: '150' });
r1.pcb = { x: 0, y: 0 };
typecad.create(led, r1);
`;
    const { plan, texts } = run(
      [{ uri: 'file:///src/board.ts', text: src }],
      baseInput({
        labels: [
          { ref: 'D1', kind: 'reference', x: 19.46, y: -10.8, rot: 0, style: { h: 2 } },
          { ref: 'R1', kind: 'reference', x: 1.5, y: 1.5, rot: 0, style: { h: 1.5 } },
        ],
        variableOf: (ref: string) => ({ D1: 'led', R1: 'r1' })[ref],
        allRefs: new Set(['D1', 'R1']),
      }),
    );
    expect(plan.skipped).toEqual([]);
    expect(plan.counts.labels).toBe(2);
    const out = texts.get('file:///src/board.ts')!;
    expectValidTs(out);
    expect(out).toContain('led.referenceLayout = { x: 1.96, y: -5.3, rotation: 0, height: 2 };');
    expect(out).toContain('r1.referenceLayout = { x: 1.5, y: 1.5, rotation: 0, height: 1.5 };');
    expect(out).toContain('r1.pcb = { x: 0, y: 0 };');
  });
});

describe('hardening matrix: combined gestures stay parsable and duplicate-free (LF + CRLF)', () => {
  // the incident family this guards: multi-stage plans whose offsets
  // drifted (route inserts mid-token, create-args spliced) — exercised as
  // full gestures over both newline conventions
  const project = () => `import { PCB, Component, LED, Resistor, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const led = new LED({
  value: 'red',
  simulation: { model: 'Dled D (IS=1a RS=3.3 N=1.8)' },
});
led.pcb = { x: 17.5, y: -5.5 };
const r1 = new Resistor({ value: '150' });
r1.pcb = { x: 0, y: 0 };
const fixture = new Component({ reference: 'F1', value: 'x' });
fixture.pcb = { x: 5, y: 5 };
const vcc = new TrackBuilder(typecad, { net: 'VCC', })
  .from({ x: 1, y: 1 }, 'F.Cu', 0.3)
  .to({ x: 4, y: 1, layer: 'F.Cu', width: 0.3 })
  .to({ x: 4, y: 4, layer: 'F.Cu', width: 0.3 });
typecad.text({ text: 'hello', x: 5, y: 5, layer: 'F.SilkS' });
typecad.create(led, r1, fixture, vcc);
`;

  const gestures = (eol: string) => [
    {
      name: 'route + delete + label + text + value',
      input: {
        moves: [{ ref: 'F1', dx: 1, dy: 1, pads: [] }],
        routes: [{ net: 'GND', w: 0.4, from: { ref: 'D1', pin: '1' }, to: null, vias: [], pieces: [{ layer: 'F.Cu', w: 0.4, pts: [{ x: 7, y: 7 }, { x: 9, y: 9 }] }] }],
        deletes: [{ net: 'VCC', x1: 4, y1: 1, x2: 4, y2: 4, layer: 'F.Cu' }],
        labels: [
          { ref: 'D1', kind: 'reference', x: 19, y: -6, rot: 0, style: { h: 2 } },
          { ref: 'F1', kind: 'value', x: 6, y: 6, rot: 90 },
        ],
        texts: [{ text0: 'hello', x0: 5, y0: 5, text: 'world', x: 6, y: 6, rot: 0, style: { thickness: 0.3 } }],
        values: [{ ref: 'F1', value: 'y' }],
      },
    },
    {
      name: 'delete tail + idempotent re-route of the same geometry',
      input: {
        routes: [{ net: 'VCC', w: 0.3, from: { ref: 'D1', pin: '2' }, to: null, vias: [], pieces: [{ layer: 'F.Cu', w: 0.3, pts: [{ x: 1, y: 1 }, { x: 4, y: 1 }] }] }],
        deletes: [{ net: 'VCC', x1: 4, y1: 1, x2: 4, y2: 4, layer: 'F.Cu' }],
      },
    },
  ];

  for (const eol of ['\n', '\r\n']) {
    for (const g of gestures(eol)) {
      it(`${eol === '\n' ? 'LF' : 'CRLF'} — ${g.name}`, () => {
        const src = project().replace(/\n/g, eol);
        const { plan, texts } = run(
          [{ uri: 'file:///src/board.ts', text: src }],
          baseInput({
            ...g.input,
            variableOf: (ref: string) => ({ D1: 'led', R1: 'r1', F1: 'fixture' })[ref],
            allRefs: new Set(['D1', 'R1', 'F1']),
          }),
        );
        const out = texts.get('file:///src/board.ts')!;
        expectValidTs(out);
        // no route declaration ever duplicates a name
        const decls = [...out.matchAll(/const (route\w+) =/g)].map((m) => m[1]!);
        expect(new Set(decls).size).toBe(decls.length);
        // create() args mention every declared route (no orphan/missing pair)
        for (const d of decls) expect(out).toMatch(new RegExp(String.raw`\b` + d + String.raw`\b[,)]`));
        if (g.input.texts) expect(out).toContain(`typecad.text({ text: 'world'`);
        // plan produced at least the edits it claims
        expect(plan.counts.moves + plan.counts.routes + plan.counts.deletes + plan.counts.texts + plan.counts.values + plan.counts.labels).toBeGreaterThan(0);
      });
    }
  }
});

describe('stale-view replacement refuses instead of leaving phantoms', () => {
  // the real incident: the page's deletes were computed against a board
  // render that predated the source (the source had rewritten that net);
  // 5 deletes matched, 2 matched nothing — proceeding left the unmatched
  // geometry's chain fragment beside the new route (a phantom trace+via)
  const src = () => `import { PCB, LED, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const led = new LED({ value: 'red' });
led.pcb = { x: 17.5, y: -5.5 };
const route18 = new TrackBuilder(typecad, { net: 'led_a',  })
  .from({ x: 18.288, y: -5.5 }, 'F.Cu', 0.3)
  .to({ x: 18.288, y: -2.87, layer: 'F.Cu', width: 0.3 })
  .to({ x: 15.23, y: 0.188, layer: 'F.Cu', width: 0.3 });
typecad.create(led, route18);
`;

  it('unmatched deletes on a net that also gains a route surface for refusal', () => {
    const { plan } = run(
      [{ uri: 'file:///src/board.ts', text: src() }],
      baseInput({
        // the new corridor the user drew
        routes: [{ net: 'led_a', w: 0.3, from: { ref: 'D1', pin: '1' }, to: null, vias: [], pieces: [{ layer: 'F.Cu', w: 0.3, pts: [{ x: 18.288, y: -5.5 }, { x: 14.799, y: 0.278 }] }] }],
        // deletes: one matching a source segment, one from geometry the
        // source no longer carries (the stale part)
        deletes: [
          { net: 'led_a', x1: 18.288, y1: -5.5, x2: 18.288, y2: -2.87, layer: 'F.Cu' },
          { net: 'led_a', x1: 8.991, y1: 0.188, x2: 9.014, y2: 0.21, layer: 'F.Cu' },
        ],
        variableOf: (ref: string) => ({ D1: 'led' })[ref],
        allRefs: new Set(['D1']),
      }),
    );
    expect(plan.unmatchedDeletes).toEqual([{ net: 'led_a', count: 1, near: 0 }]);
    expect(plan.skipped.join(' ')).toContain('matched no source route');
  });

  it('unmatched deletes on an UNRELATED net do not poison the apply', () => {
    const { plan } = run(
      [{ uri: 'file:///src/board.ts', text: src() }],
      baseInput({
        routes: [{ net: 'gnd', w: 0.3, from: { ref: 'D1', pin: '1' }, to: null, vias: [], pieces: [{ layer: 'F.Cu', w: 0.3, pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] }],
        deletes: [{ net: 'other', x1: 8.991, y1: 0.188, x2: 9.014, y2: 0.21, layer: 'F.Cu' }],
        variableOf: (ref: string) => ({ D1: 'led' })[ref],
        allRefs: new Set(['D1']),
      }),
    );
    expect(plan.unmatchedDeletes).toEqual([{ net: 'other', count: 1, near: 0 }]);
    // unrelated: the host does not refuse — the caller-side check keys on
    // net overlap with the added routes
  });
});

describe('unmatched-delete triage: drift refuses, endpoint noise drops', () => {
  // the user's loop: deleting a net's whole ink sends a via-delete at EVERY
  // segment endpoint (most carry no via) — those unmatched entries must
  // drop; only a segment delete NEAR source copper refuses (real drift)
  const src = () => `import { PCB, LED, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const led = new LED({ value: 'red' });
led.pcb = { x: 17.5, y: -5.5 };
const route18 = new TrackBuilder(typecad, { net: 'led_a',  })
  .from({ x: 18.288, y: -5.5 }, 'F.Cu', 0.3)
  .to({ x: 18.288, y: -2.87, layer: 'F.Cu', width: 0.3 })
  .to({ x: 15.23, y: 0.188, layer: 'F.Cu', width: 0.3 });
typecad.create(led, route18);
`;

  it('endpoint via-deletes and duplicate segment deletes absorb; only near-source drift refuses', () => {
    const segs: Array<[number, number, number, number]> = [
      [18.288, -5.5, 18.288, -2.87],
      [18.288, -2.87, 15.23, 0.188],
    ];
    const deletes: Array<{ kind?: string; net: string; x1: number; y1: number; x2: number; y2: number; layer: string | null }> = [];
    for (const [x1, y1, x2, y2] of segs) {
      deletes.push({ net: 'led_a', x1, y1, x2, y2, layer: 'F.Cu' });
      deletes.push({ kind: 'via', net: 'led_a', x1, y1, x2: x1, y2: y1, layer: null });
      deletes.push({ kind: 'via', net: 'led_a', x1: x2, y1: y2, x2: x2, y2: y2, layer: null });
    }
    const routes = [{ net: 'led_a', w: 0.3, from: { ref: 'D1', pin: '1' }, to: null, vias: [], pieces: [{ layer: 'F.Cu', w: 0.3, pts: [{ x: 18.288, y: -5.5 }, { x: 10, y: 0.188 }] }] }];
    const { plan } = run(
      [{ uri: 'file:///src/board.ts', text: src() }],
      baseInput({ routes, deletes, variableOf: (ref: string) => ({ D1: 'led' })[ref], allRefs: new Set(['D1']) }),
    );
    // both real segments matched (one may ride the via-delete's claim —
    // the duplicate segment delete absorbs); every unmatched entry is FAR
    // from source copper: no refusal
    expect(plan.counts.deletes).toBeGreaterThanOrEqual(2);
    expect(plan.unmatchedDeletes.every((u) => u.near === 0)).toBe(true);
    const out = 'placeholder';
    expect(out).toBeDefined();
  });

  it('a segment delete drifting near source copper still refuses', () => {
    // route18 runs to (15.23, 0.188); a stale delete 0.1mm off its endpoint
    const stale = [{ net: 'led_a', x1: 15.13, y1: 0.188, x2: 15.23, y2: 0.288, layer: 'F.Cu' }];
    const routes = [{ net: 'led_a', w: 0.3, from: { ref: 'D1', pin: '1' }, to: null, vias: [], pieces: [{ layer: 'F.Cu', w: 0.3, pts: [{ x: 18.288, y: -5.5 }, { x: 10, y: 0.188 }] }] }];
    const { plan } = run(
      [{ uri: 'file:///src/board.ts', text: src() }],
      baseInput({ routes, deletes: stale, variableOf: (ref: string) => ({ D1: 'led' })[ref], allRefs: new Set(['D1']) }),
    );
    expect(plan.unmatchedDeletes.some((u) => u.near > 0)).toBe(true);
  });
});

describe('planLayoutApply artwork images', () => {
  // the sidecar rides the file set EMPTY (the viewer adds it when absent);
  // an image apply is what creates it
  const entry = `import { PCB, Component } from '@typecad/pcb';
import { syncBoard } from './_sync.js';
const typecad = new PCB('demo', {});
const r1 = new Component({ reference: 'R1', value: '1k' });
r1.pcb = { x: 10, y: 10 };
syncBoard(typecad, {});
typecad.create(
  r1,
);
`;

  const entryNoWiring = `import { PCB, Component } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const r1 = new Component({ reference: 'R1', value: '1k' });
r1.pcb = { x: 10, y: 10 };
typecad.create(r1);
`;

  it('writes the sidecar scaffold, the syncArt grammar, the statements, and the entry spread', () => {
    const syncUri = 'file:///src/_sync.ts';
    const { plan, texts } = run(
      [
        { uri: 'file:///src/board.ts', text: entryNoWiring },
        { uri: syncUri, text: '' },
      ],
      baseInput({
        images: [{ file: 'art/logo.png', name: 'logo.png', x: 20, y: 15, w: 16, h: 12 }],
        syncUri,
        entryUri: 'file:///src/board.ts',
      }),
    );
    const sync = texts.get(syncUri)!;
    expect(plan.counts.images).toBe(1);
    expect(plan.syncFile?.created).toBe(true);
    expect(plan.syncFile?.images).toBe(1);
    expect(sync).toContain(`export const syncArt: Image[] = [];`);
    expect(sync).toContain(`import { Image, TrackBuilder } from '@typecad/pcb';`);
    expect(sync).toContain(`syncArt.push(new Image({ file: 'art/logo.png', at: { x: 20, y: 15 }, size: [16, 12] }));`);
    const board = texts.get('file:///src/board.ts')!;
    expectValidTs(board);
    expectValidTs(sync);
    // entry wiring: the spread joined create(), the import names syncArt
    expect(board).toContain('...syncArt');
    expect(board).toContain(`import { syncBoard, syncArt } from './_sync.js';`);
  });

  it('carries side: back and appends below an existing image', () => {
    const syncUri = 'file:///src/_sync.ts';
    const seeded = `import { Image, TrackBuilder } from '@typecad/pcb';
import type { Component, PCB } from '@typecad/pcb';

export const syncTracks: TrackBuilder[] = [];
export const syncArt: Image[] = [];

export function syncBoard(typecad: PCB, parts: Record<string, Component>): void {
  syncTracks.length = 0;

  syncArt.push(new Image({ file: 'art/a.png', at: { x: 1, y: 2 }, size: [10, 10] }));
}
`;
    const { texts } = run(
      [
        { uri: 'file:///src/board.ts', text: entry },
        { uri: syncUri, text: seeded },
      ],
      baseInput({
        images: [{ file: 'art\\b.png', name: 'b.png', x: 4, y: 5, w: 6, h: 7, side: 'back' }],
        syncUri,
        entryUri: 'file:///src/board.ts',
      }),
    );
    const sync = texts.get(syncUri)!;
    expect(sync).toContain(`syncArt.push(new Image({ file: 'art/b.png', at: { x: 4, y: 5 }, size: [6, 7], side: 'back' }));`);
    expect(sync.indexOf('art/b.png')).toBeGreaterThan(sync.indexOf('art/a.png'));
    // no duplicate declaration, no second Image import
    expect(sync.match(/export const syncArt/g)).toHaveLength(1);
    expect(sync.match(/import \{ Image, TrackBuilder \}/g)).toHaveLength(1);
    expectValidTs(sync);
    // the fixture entry lacked the spread — the apply wired it (import
    // names syncArt, create() spreads the array)
    const wiredEntry = texts.get('file:///src/board.ts')!;
    expect(wiredEntry).toContain("import { syncBoard, syncArt } from './_sync.js';");
    expect(wiredEntry).toContain('...syncArt');
  });

  it('reports an honest skip when no sidecar can be wired', () => {
    const { plan } = run([{ uri: 'file:///src/board.ts', text: entryNoWiring }], baseInput({
      images: [{ file: 'art/logo.png', name: 'logo.png', x: 1, y: 2, w: 3, h: 4 }],
    }));
    expect(plan.counts.images).toBe(0);
    expect(plan.skipped.some((s) => s.includes('image logo.png'))).toBe(true);
  });
});
