import { describe, expect, it } from 'vitest';
import { applyPlacementEdits, planPlacementEdits } from '../layoutEdits.js';

const source = `import { PCB } from '@typecad/pcb';
const typecad = new PCB('demo');
const r3 = new Component({ reference: 'R3' });
r3.pcb = { x: 59, y: 26 };
const mcu = new Component({ reference: 'U1' });
mcu.pcb = { x: b.center.x, y: b.center.y };
const u2 = new Component({ reference: 'U2' });
u2.pcb = { x: 17, y: 34, rotation: 90 };
`;

describe('planPlacementEdits', () => {
  it('rewrites x/y by the delta, preserving other fields', () => {
    const { edits, skipped } = planPlacementEdits(source, [{ ref: 'U2', dx: 12.5, dy: -5 }], (ref) =>
      ref === 'U2' ? 'u2' : undefined,
    );
    expect(skipped).toEqual([]);
    expect(edits).toHaveLength(1);
    const updated = applyPlacementEdits(source, edits);
    expect(updated).toContain('u2.pcb = { x: 29.5, y: 29, rotation: 90 }');
    expect(updated).toContain('r3.pcb = { x: 59, y: 26 };');
  });

  it('handles negative coordinates and formatting', () => {
    const neg = 'const a = new Component();\na.pcb = { x: -10.25, y: 3 };\n';
    const { edits } = planPlacementEdits(neg, [{ ref: 'A1', dx: -0.5, dy: 0.25 }], () => 'a');
    expect(applyPlacementEdits(neg, edits)).toContain('a.pcb = { x: -10.75, y: 3.25 }');
  });

  it('skips computed placements and unknown refs with reasons', () => {
    const { edits, skipped } = planPlacementEdits(
      source,
      [
        { ref: 'U1', dx: 1, dy: 1 },
        { ref: 'ZZ', dx: 1, dy: 1 },
        { ref: 'NOPE', dx: 1, dy: 1 },
      ],
      (ref) => ({ U1: 'mcu', ZZ: 'zz', NOPE: undefined })[ref],
    );
    expect(edits).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual([
      'placement is computed, not a literal',
      'no `zz.pcb = {…}` literal found',
      'no source variable',
    ]);
  });

  it('applies several edits in one document with stable ranges', () => {
    const { edits } = planPlacementEdits(
      source,
      [
        { ref: 'R3', dx: 0.5, dy: 0.5 },
        { ref: 'U2', dx: -1, dy: 2 },
      ],
      (ref) => ({ R3: 'r3', U2: 'u2' })[ref],
    );
    const updated = applyPlacementEdits(source, edits);
    expect(updated).toContain('r3.pcb = { x: 59.5, y: 26.5 }');
    expect(updated).toContain('u2.pcb = { x: 16, y: 36, rotation: 90 }');
  });

  it('keeps the statement’s trailing semicolon (only the literal is replaced)', () => {
    const { edits } = planPlacementEdits(source, [{ ref: 'R3', dx: 1, dy: 1 }], () => 'r3');
    const updated = applyPlacementEdits(source, edits);
    expect(updated).toMatch(/r3\.pcb = \{ x: 60(\.0+)?, y: 27(\.0+)? \};/);
  });
});
