// Label and placement frames, checked as a ROUND TRIP rather than against
// hand-computed literals: the planner's layout literal, pushed through what
// the build does with it (pcb_footprint applyLayoutToFpText writes x/y/
// rotation verbatim; a back-side part then gets y negated and +180°) and what
// the viewer reads back (gerber_viewer parseBoardLabels: world = part +
// R(-θ)·stored, angle absolute — the frame the page drags in), must land
// exactly where the label was dropped. Found by a source→board→source
// harness: labels on 90°/270° parts landed mirrored through the part, and on
// back-side parts y and the angle came back flipped.
import { describe, expect, it } from 'vitest';
import { applyPlacementEdits, planLabelAssignments, planPlacementEdits, syncLabelStatement, type PartFrame } from '../layoutEdits.js';

/** build + viewer: authored layout literal → where the label shows on the board */
function landed(part: PartFrame, src: { x: number; y: number; rotation: number }): { x: number; y: number; rot: number } {
  const back = part.side === 'back';
  const lx = src.x;
  const ly = back ? -src.y : src.y;
  const lrot = back ? src.rotation + 180 : src.rotation;
  const r = (part.rot * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: part.x + lx * c + ly * s, y: part.y - lx * s + ly * c, rot: ((lrot % 360) + 360) % 360 };
}

function literalOf(stmt: string): { x: number; y: number; rotation: number } {
  const num = (k: string) => Number(new RegExp(`\\b${k}: (-?[\\d.]+)`).exec(stmt)![1]);
  return { x: num('x'), y: num('y'), rotation: num('rotation') };
}

describe('label layout literal round-trips through the build and the viewer', () => {
  const drops = [
    { x: 12.5, y: 7.25, rot: 0 },
    { x: 8, y: 11, rot: 90 },
    { x: 13.1, y: 9.4, rot: 270 },
  ];
  for (const rot of [0, 90, 180, 270, 45]) {
    for (const side of ['front', 'back'] as const) {
      it(`a part at ${rot}° on the ${side}`, () => {
        const part: PartFrame = { x: 10, y: 9, rot, side };
        for (const drop of drops) {
          const stmt = syncLabelStatement(
            { ref: 'R1', variable: 'r1', prop: 'referenceLayout', label: { kind: 'reference', ...drop } },
            part,
          );
          const lit = literalOf(stmt);
          expect(lit.rotation).toBeGreaterThanOrEqual(0); // normalized: -180 vs 180 read as an import drift
          expect(lit.rotation).toBeLessThan(360);
          const got = landed(part, lit);
          expect(got.x).toBeCloseTo(drop.x, 2);
          expect(got.y).toBeCloseTo(drop.y, 2);
          expect(got.rot).toBeCloseTo(drop.rot, 1);
        }
      });
    }
  }

  it('live case: R1 rotated 90° — the label stays where it was dropped', () => {
    const stmt = syncLabelStatement(
      { ref: 'R1', variable: 'r1', prop: 'referenceLayout', label: { kind: 'reference', x: -1.43, y: 4, rot: 180 } },
      { x: 0, y: 4, rot: 90, side: 'front' },
    );
    expect(stmt).toBe('parts.r1.referenceLayout = { x: 0, y: -1.43, rotation: 180 };');
  });
});

describe('fab labels write fabLayout (the field the importer reads)', () => {
  it('a fresh fab label inserts a fabLayout assignment', () => {
    const src = "let led = new LED({ value: 'red' });\nled.pcb = { x: 0, y: 0 };\n";
    const plan = planLabelAssignments(src, [{ ref: 'D1', label: { kind: 'fab', x: 0.5, y: 0.5, rot: 0 } }], () => 'led', () => ({ x: 0, y: 0, rot: 0 }));
    const out = applyPlacementEdits(src, plan.edits);
    expect(out).toContain('led.fabLayout = { x: 0.5, y: 0.5, rotation: 0 };');
  });

  it('a legacy `.fab =` statement is rewritten into fabLayout (no twin)', () => {
    const src = "let led = new LED({ value: 'red' });\nparts.led.fab = { x: 1, y: 1, rotation: 0 };\n";
    const plan = planLabelAssignments(src, [{ ref: 'D1', label: { kind: 'fab', x: 0.5, y: 0.5, rot: 0 } }], () => 'led', () => ({ x: 0, y: 0, rot: 0 }));
    const out = applyPlacementEdits(src, plan.edits);
    expect(out).toContain('parts.led.fabLayout = { x: 0.5, y: 0.5, rotation: 0 }');
    expect(out).not.toMatch(/\.fab\s*=/);
  });
});

describe('a no-literal move keeps the part angle and side it already has', () => {
  // live case: R2 got `rotation: 90` from its constructor `pcb:` option; its
  // first move wrote `parts.r2.pcb = { x, y }` — the assignment replaces the
  // whole placement, so the part silently rotated back to 0°
  const base = (): PartFrame => ({ x: 20, y: 5, rot: 90, side: 'back' });

  it('deferred to the sidecar', () => {
    const plan = planPlacementEdits('let r2 = new Resistor({});\n', [{ ref: 'R2', dx: 2, dy: 1, ax: 22, ay: 6 }], () => 'r2', {
      deferInsert: () => true,
      baseOf: base,
    });
    expect(plan.deferred).toEqual([{ ref: 'R2', variable: 'r2', x: 22, y: 6, rot: 90, side: 'back' }]);
  });

  it('a rotation press adds to it (normalized)', () => {
    const plan = planPlacementEdits('', [{ ref: 'R2', dx: 0, dy: 0, ax: 20, ay: 5, rot: 270 }], () => 'r2', {
      deferInsert: () => true,
      baseOf: base,
    });
    expect(plan.deferred?.[0]?.rot).toBe(0);
  });

  it('inserted after the constructor', () => {
    const src = 'let r2 = new Resistor({});\n';
    const plan = planPlacementEdits(src, [{ ref: 'R2', dx: 2, dy: 1, ax: 22, ay: 6 }], () => 'r2', { baseOf: base });
    expect(applyPlacementEdits(src, plan.edits)).toContain("r2.pcb = { x: 22, y: 6, rotation: 90, side: 'back' };");
  });
});
