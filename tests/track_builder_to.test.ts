// TrackBuilder.to() accepts both call styles: the object form and the
// positional (pos, layer, width) form matching from().
import { describe, expect, it } from 'vitest';
import { PCB, getPcbState } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';
import { TrackBuilder } from '../src/pcb/pcb_track_builder.js';

function pcbWith(): { pcb: PCB; builder: TrackBuilder } {
  const pcb = new PCB('tb-test', {});
  return { pcb, builder: new TrackBuilder(pcb, { net: 'VCC' }) };
}

describe('TrackBuilder.to call styles', () => {
  it('accepts the positional (pos, layer, width) form — from()-symmetric', () => {
    const { pcb, builder } = pcbWith();
    builder
      .from({ x: 1, y: 1 }, 'F.Cu', 0.3)
      .to({ x: 2, y: 1 }, 'B.Cu', 0.55)
      .to({ x: 3, y: 1 });
    const state = getPcbState(pcb);
    const lines = state.stagedOutlines.flatMap((o) => o.elements).filter((e) => e.type === 'line');
    expect(lines).toHaveLength(2);
    // the positional layer/width actually apply (previously silently ignored)
    const second = lines[1] as { layer: string; strokeWidth: number };
    expect(second.layer).toBe('B.Cu');
    expect(second.strokeWidth).toBeCloseTo(0.55, 3);
    // the third hop carries the CURRENT layer/width forward (there are
    // exactly two .to hops: lines[0] and lines[1])
    expect((lines[1] as { layer: string }).layer).toBe('B.Cu');
  });

  it('still accepts the object form, which wins over the positional args', () => {
    const { pcb, builder } = pcbWith();
    builder
      .from({ x: 0, y: 0 }, 'F.Cu', 0.3)
      .to({ x: 1, y: 0, layer: 'B.Cu', width: 0.4 }, 'F.Cu', 0.9);
    const state = getPcbState(pcb);
    const line = state.stagedOutlines.flatMap((o) => o.elements).find((e) => e.type === 'line') as { layer: string; strokeWidth: number };
    expect(line.layer).toBe('B.Cu');
    expect(line.strokeWidth).toBeCloseTo(0.4, 3);
  });
});

describe('TrackBuilder.from call styles', () => {
  it('accepts the object form: from({x, y, layer, width})', () => {
    const { pcb, builder } = pcbWith();
    builder.from({ x: 1, y: 1, layer: 'B.Cu', width: 0.45 }).to({ x: 2, y: 1 });
    const line = getPcbState(pcb)
      .stagedOutlines.flatMap((o) => o.elements)
      .find((e) => e.type === 'line') as { layer: string; strokeWidth: number };
    expect(line.layer).toBe('B.Cu');
    expect(line.strokeWidth).toBeCloseTo(0.45, 3);
  });
});
