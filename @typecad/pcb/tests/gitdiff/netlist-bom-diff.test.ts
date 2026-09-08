import { describe, it, expect } from 'vitest';
import { computeNetlistDiff, computeBomDiff } from '../../src/gitdiff/core/pcb-textual-diff.js';

const basePcb = `(kicad_pcb (version 20240123) (generator "pcbnew")
  (footprint "LED_SMD:LED_0805" (layer "F.Cu") (uuid "fp001")
    (property "Reference" "LED1")
    (property "Value" "Red LED")
    (at 10 20 0)
    (layer "F.Cu")
  )
  (footprint "Resistor_SMD:R_0805" (layer "B.Cu") (uuid "fp002")
    (property "Reference" "R1")
    (property "Value" "10k")
    (at 30 40 0)
    (layer "B.Cu")
  )
  (segment (start 0 0) (end 10 0) (width 0.25) (layer "F.Cu") (net 1) (uuid "seg001"))
  (segment (start 10 0) (end 20 0) (width 0.25) (layer "F.Cu") (net 1) (uuid "seg002"))
  (via (at 5 5) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1) (uuid "via001"))
  (segment (start 0 10) (end 10 10) (width 0.25) (layer "B.Cu") (net 2) (uuid "seg003"))
)`;

describe('computeNetlistDiff', () => {
  it('returns no differences for identical content', () => {
    const result = computeNetlistDiff(basePcb, basePcb);
    expect(result.nets).toHaveLength(0);
    expect(result.summary).toBe('No netlist differences');
  });

  it('detects added net', () => {
    const modified =
      basePcb + '\n  (segment (start 0 0) (end 5 0) (width 0.25) (layer "F.Cu") (net 3) (uuid "seg004"))\n';
    const result = computeNetlistDiff(basePcb, modified);
    const added = result.nets.filter((n) => n.type === 'added');
    expect(added.length).toBe(1);
    expect(added[0].name).toBe('3');
  });

  it('detects removed net', () => {
    const modified = `(kicad_pcb (version 20240123) (generator "pcbnew")
  (footprint "LED_SMD:LED_0805" (layer "F.Cu") (uuid "fp001")
    (property "Reference" "LED1")
    (property "Value" "Red LED")
    (at 10 20 0)
    (layer "F.Cu")
  )
  (footprint "Resistor_SMD:R_0805" (layer "B.Cu") (uuid "fp002")
    (property "Reference" "R1")
    (property "Value" "10k")
    (at 30 40 0)
    (layer "B.Cu")
  )
  (segment (start 0 0) (end 10 0) (width 0.25) (layer "F.Cu") (net 1) (uuid "seg001"))
  (segment (start 10 0) (end 20 0) (width 0.25) (layer "F.Cu") (net 1) (uuid "seg002"))
  (via (at 5 5) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1) (uuid "via001"))
)`;
    const result = computeNetlistDiff(basePcb, modified);
    const removed = result.nets.filter((n) => n.type === 'removed');
    expect(removed.length).toBe(1);
    expect(removed[0].name).toBe('2');
  });

  it('detects modified net (track count change)', () => {
    const modified = basePcb.replace(
      /\)\s*$/,
      '\n  (segment (start 5 0) (end 15 0) (width 0.25) (layer "F.Cu") (net 1) (uuid "seg004"))\n)',
    );
    const result = computeNetlistDiff(basePcb, modified);
    const modifiedNets = result.nets.filter((n) => n.type === 'modified' && n.name === '1');
    expect(modifiedNets.length).toBe(1);
    expect(modifiedNets[0].modSegments - modifiedNets[0].origSegments).toBe(1);
  });

  it('handles unparseable content gracefully', () => {
    const result = computeNetlistDiff('(unclosed (list', '(incomplete');
    expect(result.nets).toHaveLength(0);
    expect(result.summary).toBe('Unable to parse PCB files');
  });

  it('detects pad net assignment changes', () => {
    const orig = `(kicad_pcb (version 20240123) (generator "pcbnew")
  (net 256 "256HZ")
  (net 10 "OSC_OUT")
  (footprint "Resistor_SMD:R_0805" (layer "F.Cu") (uuid "fp001")
    (property "Reference" "R1")
    (property "Value" "10k")
    (at 0 0 0)
    (layer "F.Cu")
    (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 256 "256HZ"))
    (pad "2" smd rect (at 2 0) (size 1 1) (layers "F.Cu") (net 10 "OSC_OUT"))
  )
)`;
    const mod = `(kicad_pcb (version 20240123) (generator "pcbnew")
  (net 256 "256HZ")
  (net 10 "OSC_OUT")
  (footprint "Resistor_SMD:R_0805" (layer "F.Cu") (uuid "fp001")
    (property "Reference" "R1")
    (property "Value" "10k")
    (at 0 0 0)
    (layer "F.Cu")
    (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 10 "OSC_OUT"))
    (pad "2" smd rect (at 2 0) (size 1 1) (layers "F.Cu") (net 10 "OSC_OUT"))
  )
)`;
    const result = computeNetlistDiff(orig, mod);
    const changed = result.nets.filter((n) => n.type === 'modified');
    expect(changed.length).toBe(2);
    const osc = changed.find((n) => n.name === 'OSC_OUT');
    expect(osc).toBeDefined();
    expect(osc!.origRefs).toContain('R1-2');
    expect(osc!.modRefs).toContain('R1-1');
    expect(osc!.modRefs).toContain('R1-2');
    const hz = changed.find((n) => n.name === '256HZ');
    expect(hz).toBeDefined();
    expect(hz!.origRefs).toContain('R1-1');
    expect(hz!.modRefs).toEqual([]);
  });

  it('detects net rename via top-level declarations', () => {
    const orig = `(kicad_pcb (version 20240123) (generator "pcbnew")
  (net 256 "256HZ")
  (segment (start 0 0) (end 10 0) (width 0.25) (layer "F.Cu") (net 256) (uuid "seg001"))
)`;
    const mod = `(kicad_pcb (version 20240123) (generator "pcbnew")
  (net 256 "OSC_OUT")
  (segment (start 0 0) (end 10 0) (width 0.25) (layer "F.Cu") (net 256) (uuid "seg001"))
)`;
    const result = computeNetlistDiff(orig, mod);
    const renamed = result.nets.filter((n) => n.type === 'modified' && n.name.includes('→'));
    expect(renamed.length).toBe(1);
    expect(renamed[0].name).toContain('256HZ');
    expect(renamed[0].name).toContain('OSC_OUT');
  });
});

describe('computeBomDiff', () => {
  it('returns no differences for identical content', () => {
    const result = computeBomDiff(basePcb, basePcb);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
    expect(result.unchanged).toHaveLength(2);
  });

  it('detects added component', () => {
    const modified = basePcb.replace(
      '(uuid "fp002")',
      '(uuid "fp002")\n  (footprint "Capacitor_SMD:C_0805" (layer "F.Cu") (uuid "fp003")\n    (property "Reference" "C1")\n    (property "Value" "100nF")\n    (at 50 60 0)\n    (layer "F.Cu")\n  )',
    );
    const result = computeBomDiff(basePcb, modified);
    expect(result.added.length).toBe(1);
    expect(result.added[0].ref).toBe('C1');
  });

  it('detects removed component', () => {
    const modified = basePcb.replace(/\n\s+\(footprint "Resistor_SMD:R_0805".*?\)\s*\)/s, '');
    const result = computeBomDiff(basePcb, modified);
    expect(result.removed.length).toBe(1);
    expect(result.removed[0].ref).toBe('R1');
  });

  it('detects modified component (value change)', () => {
    const modified = basePcb.replace('"10k"', '"4.7k"');
    const result = computeBomDiff(basePcb, modified);
    expect(result.modified.length).toBe(1);
    expect(result.modified[0].ref).toBe('R1');
    expect(result.modified[0].changes.some((c) => c.includes('4.7k'))).toBe(true);
  });

  it('detects modified component (position change)', () => {
    const modified = basePcb.replace('(at 30 40 0)', '(at 35 45 90)');
    const result = computeBomDiff(basePcb, modified);
    expect(result.modified.length).toBe(1);
    expect(result.modified[0].ref).toBe('R1');
    expect(result.modified[0].changes.some((c) => c.includes('Position'))).toBe(true);
  });

  it('returns correct summary counts', () => {
    const modified = basePcb.replace(
      '(uuid "fp002")',
      '(uuid "fp002")\n  (footprint "Capacitor_SMD:C_0805" (layer "F.Cu") (uuid "fp003")\n    (property "Reference" "C1")\n    (property "Value" "100nF")\n    (at 50 60 0)\n    (layer "F.Cu")\n  )',
    );
    const result = computeBomDiff(basePcb, modified);
    expect(result.summary).toContain('3');
    expect(result.summary).toContain('added');
  });

  it('handles unparseable content gracefully', () => {
    const result = computeBomDiff('(unclosed (list', '(incomplete');
    expect(result.components).toHaveLength(0);
    expect(result.summary).toBe('Unable to parse PCB files');
  });
});
