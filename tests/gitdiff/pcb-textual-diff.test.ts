import { describe, it, expect } from 'vitest';
import { computeTextualDiff } from '../../src/gitdiff/core/pcb-textual-diff.js';

const basePcb = `(kicad_pcb (version 20240123) (generator "pcbnew")
  (footprint "LED_SMD:LED_0805" (layer "F.Cu") (uuid "fp001")
    (property "Reference" "LED1")
    (property "Value" "Red LED")
    (at 10 20 0)
    (layer "F.Cu")
  )
  (segment (start 0 0) (end 10 0) (width 0.25) (layer "F.Cu") (net 1) (uuid "seg001"))
  (via (at 5 5) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1) (uuid "via001"))
)`;

function withAddedFootprint(pcb: string): string {
  return pcb.replace(
    '(uuid "fp001")',
    '(uuid "fp001")\n    (footprint "Resistor_SMD:R_0805" (layer "B.Cu") (uuid "fp002")\n      (property "Reference" "R1")\n      (property "Value" "10k")\n      (at 30 40 0)\n      (layer "B.Cu")\n    )',
  );
}

function withRemovedFootprint(): string {
  return `(kicad_pcb (version 20240123) (generator "pcbnew")
  (segment (start 0 0) (end 10 0) (width 0.25) (layer "F.Cu") (net 1) (uuid "seg001"))
  (via (at 5 5) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1) (uuid "via001"))
)`;
}

function withModifiedSegment(pcb: string): string {
  return pcb.replace('(end 10 0)', '(end 20 0)');
}

function withAddedVia(pcb: string): string {
  return pcb + '\n  (via (at 15 15) (size 0.5) (drill 0.25) (layers "F.Cu" "B.Cu") (net 2) (uuid "via002"))\n';
}

describe('computeTextualDiff', () => {
  it('returns no differences for identical content', () => {
    const result = computeTextualDiff(basePcb, basePcb);
    expect(result.changes).toHaveLength(0);
    expect(result.summary).toBe('No differences found');
  });

  it('detects added footprints', () => {
    const modified = withAddedFootprint(basePcb);
    const result = computeTextualDiff(basePcb, modified);
    const added = result.changes.filter((c) => c.type === 'added' && c.category === 'component');
    expect(added.length).toBeGreaterThan(0);
    expect(added[0].ref).toBe('R1');
  });

  it('detects removed footprints', () => {
    const result = computeTextualDiff(basePcb, withRemovedFootprint());
    const removed = result.changes.filter((c) => c.type === 'removed' && c.category === 'component');
    expect(removed.length).toBeGreaterThan(0);
    expect(result.summary).toContain('removed');
  });

  it('detects modified segments', () => {
    const modified = withModifiedSegment(basePcb);
    const result = computeTextualDiff(basePcb, modified);
    const modifiedChanges = result.changes.filter((c) => c.type === 'modified' && c.category === 'track');
    expect(modifiedChanges.length).toBeGreaterThan(0);
  });

  it('detects added vias', () => {
    const modified = withAddedVia(basePcb);
    const result = computeTextualDiff(basePcb, modified);
    const added = result.changes.filter((c) => c.type === 'added' && c.category === 'via');
    expect(added.length).toBeGreaterThan(0);
  });

  it('returns correct summary with counts', () => {
    const modified = withAddedFootprint(basePcb);
    const result = computeTextualDiff(basePcb, modified);
    expect(result.summary).toContain('added');
    expect(result.changes.filter((c) => c.type === 'added').length).toBeGreaterThan(0);
  });

  it('generates human-readable descriptions for footprints', () => {
    const modified = withAddedFootprint(basePcb);
    const result = computeTextualDiff(basePcb, modified);
    const added = result.changes.filter((c) => c.type === 'added');
    expect(added[0].description).toContain('R1');
    expect(added[0].description).toContain('added');
  });

  it('handles malformed PCB content gracefully', () => {
    const result = computeTextualDiff('(unclosed (list', '(incomplete');
    expect(result.changes).toHaveLength(0);
    expect(result.summary).toBe('Unable to parse PCB files');
  });
});
