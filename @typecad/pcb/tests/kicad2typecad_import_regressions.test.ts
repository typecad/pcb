import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SExprNode } from '../src/kicad2typecad/sexpr_tree.js';
import { KicadIRBuilder } from '../src/kicad2typecad/ir_builder.js';
import { SourceMatcher } from '../src/kicad2typecad/matcher.js';
import { SourceRewriter } from '../src/kicad2typecad/rewriter.js';
import {
  generateTrackCode,
  generateTextCode,
  generateZoneCode,
  type ChalkHelpers,
} from '../src/kicad2typecad/display.js';
import {
  applySourceChanges,
  computeOutlineChanges,
  computeRoutingChanges,
  computeZoneChanges,
} from '../src/kicad2typecad/apply_source.js';
import { analyzeFile } from '../src/kicad2typecad/source_analyzer.js';
import logger from '../src/utils/logging.js';
import type { KicadIR } from '../src/kicad2typecad/types.js';
import type { PCB } from '../src/pcb/pcb.js';

/**
 * Regression coverage for the import audit: every fix here corresponds to a
 * defect observed against a real board (rd_skeleton demo, KiCad 9 writer +
 * kicad-cli resave forms).
 */

const PLAIN_CH: ChalkHelpers = {
  chKey: (s: string) => s,
  chProp: (s: string) => s,
  chStr: (s: string) => s,
  chNum: (n: number) => String(n),
  chPunc: (s: string) => s,
  chVar: (s: string) => s,
};

function buildIr(pcb: string): KicadIR {
  return new KicadIRBuilder().build(SExprNode.parse(pcb));
}

function captureLogs(fn: () => void): string {
  const calls: string[] = [];
  const spies = ['log', 'info', 'warn', 'error'].map((m) =>
    vi.spyOn(logger, m as 'log').mockImplementation((...args: unknown[]) => {
      calls.push(args.join(' '));
    }),
  );
  try {
    fn();
  } finally {
    spies.forEach((s) => s.mockRestore());
  }
  return calls.join('\n');
}

/** Minimal PCB stand-in: only track() is exercised by generateTrackCode. */
function trackPcbStub() {
  const builder = {
    from: vi.fn().mockReturnThis(),
    to: vi.fn().mockReturnThis(),
    via: vi.fn().mockReturnThis(),
  };
  const track = vi.fn(() => builder);
  return { pcb: { track } as unknown as PCB, track };
}

// === Segments and vias keep their net names ===

describe('net identity through import', () => {
  const inlineBoard = `(kicad_pcb (version 20260206) (generator pcbnew)
    (segment (start 1 2) (end 3 4) (width 0.2) (layer "F.Cu") (net "VCC"))
    (segment (start 3 4) (end 5 6) (width 0.2) (layer "F.Cu") (net "VCC"))
    (segment (start 5 6) (end 7 8) (width 0.2) (layer "F.Cu") (net "GND"))
    (via (at 7 8) (size 0.6) (drill 0.3) (net "GND"))
    (via (at 1 2) (size 0.6) (drill 0.3) (net "VCC"))
  )`;

  it('parses inline (net "NAME") on segments and vias', () => {
    const ir = buildIr(inlineBoard);
    expect(ir.segments.map((s) => s.netName)).toEqual(['VCC', 'VCC', 'GND']);
    expect(ir.vias.map((v) => v.netName).sort()).toEqual(['GND', 'VCC']);
  });

  it('still resolves numeric nets through the net table', () => {
    const ir = buildIr(`(kicad_pcb (version 20241229) (generator typecad)
      (net 1 "VCC")
      (segment (start 1 2) (end 3 4) (width 0.2) (layer "F.Cu") (net 1))
      (via (at 1 2) (size 0.6) (drill 0.3) (net 1))
    )`);
    expect(ir.segments[0].net).toBe(1);
    expect(ir.segments[0].netName).toBeUndefined();
    const output = captureLogs(() => generateTrackCode(ir, trackPcbStub().pcb, 'test', PLAIN_CH));
    expect(output).toContain('// Net: VCC');
    expect(output).toContain("typecad.track({ net: 'VCC' })");
  });

  it('groups tracks under net-named variables and attaches same-net vias', () => {
    const ir = buildIr(inlineBoard);
    const stub = trackPcbStub();
    const output = captureLogs(() => generateTrackCode(ir, stub.pcb, 'test', PLAIN_CH));
    expect(output).toContain('let track_VCC: TrackBuilder[] = [];');
    expect(output).toContain('let track_GND: TrackBuilder[] = [];');
    expect(output).toContain("typecad.track({ net: 'VCC' })");
    expect(output).toContain("typecad.track({ net: 'GND' })");
    // the VCC via (at 1 2) ends the first chain; the GND via ends the GND chain
    expect(output.match(/\.via\(/g)?.length).toBe(2);
    expect(output).not.toContain('unnamed_Track');
  });

  it('emits the net on standalone vias', () => {
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (via (at 10 10) (size 0.6) (drill 0.3) (net "GND"))
    )`);
    const output = captureLogs(() => generateTrackCode(ir, trackPcbStub().pcb, 'test', PLAIN_CH));
    expect(output).toContain("typecad.via({ at: { x: 10, y: 10 }, net: 'GND', size: 0.6, drill: 0.3 })");
  });

  it('keeps truly unnamed segments in the unnamed group', () => {
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (segment (start 1 2) (end 3 4) (width 0.2) (layer "F.Cu"))
    )`);
    const output = captureLogs(() => generateTrackCode(ir, trackPcbStub().pcb, 'test', PLAIN_CH));
    expect(output).toContain('let unnamed_Track: TrackBuilder[] = [];');
    expect(output).toContain('typecad.track().from(');
  });
});

// === Zones ===

describe('zone layer forms', () => {
  it('parses the singular (layer ...) form kicad-cli writes for single-layer zones', () => {
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (zone (net "GND") (layer "F.Cu") (uuid "u1")
        (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10))))
    )`);
    expect(ir.zones[0].layers).toEqual(['F.Cu']);
    const output = captureLogs(() => generateZoneCode(ir, 'test', PLAIN_CH));
    expect(output).toContain("layers: ['F.Cu']");
  });

  it('still parses the plural (layers ...) form', () => {
    const ir = buildIr(`(kicad_pcb (version 20241229) (generator typecad)
      (zone (net 3) (net_name "GND") (layers "F.Cu" "B.Cu") (uuid "u1")
        (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10))))
    )`);
    expect(ir.zones[0].layers).toEqual(['F.Cu', 'B.Cu']);
  });

  it('expands *.Cu against the stackup copper count', () => {
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (setup (stackup (layer "F.Cu" (type copper)) (layer "In1.Cu" (type copper)) (layer "In2.Cu" (type copper)) (layer "B.Cu" (type copper))))
      (zone (net "GND") (layers *.Cu) (uuid "u1")
        (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10))))
    )`);
    expect(ir.zones[0].layers).toEqual(['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']);
  });

  it('expands *.Cu to two layers without a stackup', () => {
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (zone (net "GND") (layers *.Cu) (uuid "u1")
        (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10))))
    )`);
    expect(ir.zones[0].layers).toEqual(['F.Cu', 'B.Cu']);
  });

  it('tessellates arc segments inside the zone outline', () => {
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (zone (net "GND") (layers "F.Cu") (uuid "u1")
        (polygon (pts
          (xy 0 0)
          (arc (start 10 0) (mid 15 5) (end 10 10))
          (xy 0 10))))
    )`);
    const pts = ir.zones[0].polygon;
    expect(pts.length).toBeGreaterThan(4);
    // every tessellated point sits on the arc's circumcircle (center 10,5 r 5)
    for (const p of pts) {
      if (p.x === 0) continue;
      const d = Math.hypot(p.x - 10, p.y - 5);
      expect(Math.abs(d - 5)).toBeLessThan(0.01);
    }
    // the outline endpoints survive
    expect(pts.some((p) => Math.abs(p.x - 10) < 0.01 && Math.abs(p.y - 10) < 0.01)).toBe(true);
    expect(pts.some((p) => p.x === 0 && p.y === 10)).toBe(true);
  });

  it('parses and emits fill arc_segments', () => {
    const ir = buildIr(`(kicad_pcb (version 20241229) (generator typecad)
      (zone (net 3) (net_name "GND") (layers "F.Cu") (uuid "u1")
        (fill yes (arc_segments 16) (thermal_gap 0.254))
        (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10))))
    )`);
    expect(ir.zones[0].fill?.arcSegments).toBe(16);
    const output = captureLogs(() => generateZoneCode(ir, 'test', PLAIN_CH));
    expect(output).toContain('arcSegments: 16');
  });
});

// === Hidden text ===

describe('hidden text handling', () => {
  it('parses the (hide yes) list form on gr_text', () => {
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (gr_text "secret" (at 5 5 0) (layer "F.SilkS") (hide yes)
        (effects (font (size 1 1) (thickness 0.15))))
      (gr_text "visible" (at 5 8 0) (layer "F.SilkS")
        (effects (font (size 1 1) (thickness 0.15))))
    )`);
    expect(ir.textElements.find((t) => t.text === 'secret')?.hide).toBe(true);
    expect(ir.textElements.find((t) => t.text === 'visible')?.hide ?? false).toBe(false);
  });

  it('emits hide: true for hidden text', () => {
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (gr_text "secret" (at 5 5 0) (layer "F.SilkS") (hide yes)
        (effects (font (size 1 1) (thickness 0.15))))
    )`);
    const output = captureLogs(() => generateTextCode(ir, 'test', PLAIN_CH));
    expect(output).toContain('hide: true');
  });
});

// === Unsupported element reporting ===

describe('unsupported element reporting', () => {
  it('counts dimensions, bezier curves and footprint-embedded zones', () => {
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (dimension 0 (layer "F.SilkS") (gr_text "20 mm" (at 0 0) (layer "F.SilkS") (effects (font (size 1 1)))) (format (prefix "") (suffix " mm")) (gr_line (start 0 0) (end 20 0)))
      (gr_curve (pts (xy 0 0) (xy 1 1) (xy 2 1) (xy 3 0)) (layer "Edge.Cuts") (stroke (width 0.05)))
      (footprint "X:C" (layer "F.Cu") (at 1 1)
        (zone (net 0) (layers "F.Cu") (uuid "z") (polygon (pts (xy 0 0) (xy 1 0) (xy 1 1))))
      )
    )`);
    const byType = Object.fromEntries(ir.unsupported.map((u) => [u.type, u.count]));
    expect(byType['dimension']).toBe(1);
    expect(byType['gr_curve']).toBe(1);
    expect(byType['footprint-embedded zone']).toBe(1);
  });

  it('reports nothing for a clean board', () => {
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts"))
    )`);
    expect(ir.unsupported).toEqual([]);
  });
});

// === Matcher ===

describe('source matcher regressions', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-import-regress-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (name: string, content: string) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content);
    return p;
  };

  it('matches passives by exact reference when no footprint prop exists', () => {
    write(
      'board.ts',
      `
      import { Resistor } from '@typecad/pcb';
      const r5 = new Resistor({ reference: 'R5', value: '1k', pcb: { x: 1, y: 2 } });
    `,
    );
    const matcher = new SourceMatcher(dir);
    const result = matcher.matchFootprint({
      footprintName: 'Resistor_SMD:R_0603_1608Metric',
      reference: 'R5',
      position: { x: 1, y: 2, rotation: 0 },
      side: 'front',
      uuid: 'u',
      codeMetadata: null,
      referenceProperty: null,
      valueProperty: null,
    });
    expect(result.matchConfidence).toBe('variable-fallback');
    expect(result.sourceLocation?.variableName).toBe('r5');
  });

  it('finds the variable in another file when the Code property path is stale', () => {
    write(
      'renamed.ts',
      `
      import { Component } from '@typecad/pcb';
      const u1 = new Component({ reference: 'U1', footprint: 'X:Y', pcb: { x: 1, y: 2 } });
    `,
    );
    const matcher = new SourceMatcher(dir);
    const result = matcher.matchFootprint({
      footprintName: 'X:Y',
      reference: 'U1',
      position: { x: 1, y: 2, rotation: 0 },
      side: 'front',
      uuid: 'u',
      codeMetadata: { v: 1, u: '', n: 'u1', f: 'src/old-name.ts', l: 3 },
      referenceProperty: null,
      valueProperty: null,
    });
    expect(result.sourceLocation?.filePath).toContain('renamed.ts');
    expect(result.sourceLocation?.variableName).toBe('u1');
  });

  it('does not bind two anonymous components to the same source declaration', () => {
    write(
      'board.ts',
      `
      import { Component } from '@typecad/pcb';
      const a = new Component({ footprint: 'X:Y' });
      const b = new Component({ footprint: 'X:Y' });
    `,
    );
    const matcher = new SourceMatcher(dir);
    const mk = (reference: string) => ({
      footprintName: 'X:Y',
      reference,
      position: { x: 1, y: 1, rotation: 0 },
      side: 'front' as const,
      uuid: 'u',
      codeMetadata: null,
      referenceProperty: null,
      valueProperty: null,
    });
    const first = matcher.matchFootprint(mk('R5'));
    const second = matcher.matchFootprint(mk('R6'));
    expect(first.sourceLocation?.variableName).toBe('a');
    expect(second.sourceLocation?.variableName).toBe('b');
  });
});

// === Rewriter ===

describe('rewriter regressions', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-import-rewriter-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (name: string, content: string) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content);
    return p;
  };

  const fpAt = (x: number, y: number, rotation: number) => ({
    footprintName: 'Resistor_SMD:R_0603_1608Metric',
    reference: 'R1',
    position: { x, y, rotation },
    side: 'front' as const,
    uuid: 'u',
    codeMetadata: null,
    referenceProperty: null,
    valueProperty: null,
  });

  it('reports no change when the source omits rotation and the board is at 0', () => {
    const file = write(
      'board.ts',
      `
      const r1 = new Resistor({ reference: 'R1' });
      r1.pcb = { x: 10, y: 20 };
    `,
    );
    const matcher = new SourceMatcher(dir);
    const results = matcher.matchAll([fpAt(10, 20, 0)]);
    expect(results[0].sourceLocation).not.toBeNull();
    expect(new SourceRewriter().computeFootprintChanges(results)).toEqual([]);
  });

  it('inserts rotation when the board rotated and the source prop is missing', () => {
    const file = write(
      'board.ts',
      `
      const r1 = new Resistor({ reference: 'R1' });
      r1.pcb = { x: 10, y: 20 };
    `,
    );
    const matcher = new SourceMatcher(dir);
    const results = matcher.matchAll([fpAt(10, 20, 90)]);
    const changes = new SourceRewriter().computeFootprintChanges(results);
    expect(changes.length).toBe(1);
    new SourceRewriter().applyFootprintChanges(changes);
    const updated = fs.readFileSync(file, 'utf-8');
    expect(updated).toContain('r1.pcb = { x: 10, y: 20, rotation: 90 };');
  });

  it('treats -90 and 270 as the same rotation', () => {
    const file = write(
      'board.ts',
      `
      const r1 = new Resistor({ reference: 'R1' });
      r1.pcb = { x: 10, y: 20, rotation: -90 };
    `,
    );
    const matcher = new SourceMatcher(dir);
    const results = matcher.matchAll([fpAt(10, 20, 270)]);
    expect(new SourceRewriter().computeFootprintChanges(results)).toEqual([]);
    // and flags a real rotation difference in the same setup
    const results2 = matcher.matchAll([fpAt(10, 20, 180)]);
    const changes = new SourceRewriter().computeFootprintChanges(results2);
    expect(changes.length).toBe(1);
    expect(changes[0].newRotation).toBe(180);
  });

  it('rewrites in place when the rotation prop exists', () => {
    const file = write(
      'board.ts',
      `
      const r1 = new Resistor({ reference: 'R1' });
      r1.pcb = { x: 10, y: 20, rotation: 0 };
    `,
    );
    const matcher = new SourceMatcher(dir);
    const results = matcher.matchAll([fpAt(10, 20, 180)]);
    const changes = new SourceRewriter().computeFootprintChanges(results);
    expect(changes.length).toBe(1);
    new SourceRewriter().applyFootprintChanges(changes);
    expect(fs.readFileSync(file, 'utf-8')).toContain('r1.pcb = { x: 10, y: 20, rotation: 180 };');
  });
});

// === --apply write-back for outline / zones / routing ===

describe('apply-back: outline', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-apply-outline-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const boardWithOutline = (start: string, end: string) => `(kicad_pcb (version 20241229) (generator typecad)
    (gr_line (start ${start} 78) (end ${end} 78) (layer "Edge.Cuts"))
    (gr_line (start ${end} 78) (end ${end} 93) (layer "Edge.Cuts"))
    (gr_line (start ${end} 93) (end ${start} 93) (layer "Edge.Cuts"))
    (gr_line (start ${start} 93) (end ${start} 78) (layer "Edge.Cuts"))
  )`;

  it('updates outline args when the board outline grows', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      "import { PCB } from '@typecad/pcb';\nconst typecad = new PCB('t');\ntypecad.outline(130, 78, 25, 15);\n",
    );
    const ir = buildIr(boardWithOutline('130', '157'));
    const { changes, notes } = computeOutlineChanges(ir, [file]);
    expect(notes).toEqual([]);
    expect(changes.length).toBe(1);
    expect(changes[0].changedProps).toContain('geometry');
    applySourceChanges(changes);
    expect(fs.readFileSync(file, 'utf-8')).toContain('typecad.outline(130, 78, 27, 15);');
  });

  it('reports no change when outline matches', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      "import { PCB } from '@typecad/pcb';\nconst typecad = new PCB('t');\ntypecad.outline(130, 78, 25, 15);\n",
    );
    const ir = buildIr(boardWithOutline('130', '155'));
    const { changes } = computeOutlineChanges(ir, [file]);
    expect(changes).toEqual([]);
  });
});

describe('apply-back: zones', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-apply-zone-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const boardWithZone = (cornerY: number) => `(kicad_pcb (version 20241229) (generator typecad)
    (zone (net 3) (net_name "GND") (layer "F.Cu") (uuid "u1")
      (hatch edge 0.508)
      (min_thickness 0.254)
      (fill yes (thermal_gap 0.254) (thermal_bridge_width 0.4064))
      (polygon (pts (xy 130 78) (xy 155 78) (xy 155 ${cornerY}) (xy 130 ${cornerY}))))
  )`;

  it('rewrites a moved zone and converges (fill mode solid normalized)', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      "import { PCB } from '@typecad/pcb';\n" +
        "const typecad = new PCB('t');\n" +
        "typecad.zone({ net: 'GND', layers: ['F.Cu'], x: 130, y: 78, width: 25, height: 15 });\n",
    );
    const ir = buildIr(boardWithZone(93));
    const first = computeZoneChanges(ir, [file]);
    // fill present on the board but not in source → one change
    expect(first.changes.length).toBe(1);
    applySourceChanges(first.changes);
    const applied = fs.readFileSync(file, 'utf-8');
    expect(applied).toContain("net: 'GND'");
    expect(applied).toContain('fill:');
    // second compute must be clean — no churn
    const second = computeZoneChanges(ir, [file]);
    expect(second.changes).toEqual([]);
  });

  it('detects a moved zone corner as geometry', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      "import { PCB } from '@typecad/pcb';\n" +
        "const typecad = new PCB('t');\n" +
        "typecad.zone({ net: 'GND', layers: ['F.Cu'], x: 130, y: 78, width: 25, height: 15, fill: { thermalGap: 0.254, thermalBridgeWidth: 0.4064 } });\n",
    );
    const ir = buildIr(boardWithZone(91)); // south edge moved up 2mm
    const { changes } = computeZoneChanges(ir, [file]);
    expect(changes.length).toBe(1);
    expect(changes[0].changedProps).toContain('geometry');
    applySourceChanges(changes);
    // (130,78)-(155,91) is still an axis-aligned rect, so the rect form is kept
    expect(fs.readFileSync(file, 'utf-8')).toContain('height: 13');
  });

  it('removes zones the board no longer has and appends new ones', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      "import { PCB } from '@typecad/pcb';\n" +
        "const typecad = new PCB('t');\n" +
        "typecad.zone({ net: 'OLD', layers: ['F.Cu'], x: 0, y: 0, width: 5, height: 5 });\n",
    );
    const ir = buildIr(boardWithZone(93));
    const { changes } = computeZoneChanges(ir, [file]);
    const kinds = changes.map((c) => c.changedProps[0]);
    expect(kinds).toContain('removed');
    expect(kinds).toContain('new');
    applySourceChanges(changes);
    const applied = fs.readFileSync(file, 'utf-8');
    expect(applied).not.toContain('OLD');
    expect(applied).toContain("net: 'GND'");
  });
});

describe('apply-back: routing section', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-apply-route-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const boardWithTrack = (endX: number) => `(kicad_pcb (version 20260206) (generator pcbnew)
    (net 0 "")
    (net 1 "VCC")
    (segment (start 10 20) (end ${endX} 20) (width 0.2) (layer "F.Cu") (net "VCC"))
    (segment (start ${endX} 20) (end ${endX} 30) (width 0.2) (layer "F.Cu") (net "VCC"))
    (via (at ${endX} 30) (size 0.6) (drill 0.3) (net "VCC"))
  )`;

  const sourceWithTrack = (endX: number) =>
    "import { PCB, TrackBuilder } from '@typecad/pcb';\n" +
    "const typecad = new PCB('t');\n" +
    'typecad.outline(5, 10, 100, 50);\n' +
    '// Net: VCC\n' +
    'let track_VCC: TrackBuilder[] = [];\n' +
    `track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 10, y: 20 }, "F.Cu", 0.2).to({ x: ${endX}, y: 20, layer: "F.Cu", width: 0.2 }).to({ x: ${endX}, y: 30, layer: "F.Cu", width: 0.2 }).via({ size: 0.6, drill: 0.3 }));\n` +
    '\n' +
    'typecad.create(\n  ...track_VCC\n);';

  it('regenerates the routing section when a trace is rerouted, and converges', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, sourceWithTrack(20));
    const ir = buildIr(boardWithTrack(25));
    const first = computeRoutingChanges(ir, [file]);
    expect(first.changes.length).toBe(1);
    expect(first.notes).toEqual([]);
    applySourceChanges(first.changes);

    const applied = fs.readFileSync(file, 'utf-8');
    expect(applied).toContain('x: 25, y: 20');
    // track region re-parses and create still spreads the arrays
    const analysis = analyzeFile(file);
    expect(analysis).not.toBeNull();
    expect(analysis!.trackPushes.length).toBe(1);
    expect(analysis!.methodCalls.find((m) => m.method === 'create')?.spread).toEqual([true]);

    // second compute must be clean
    const second = computeRoutingChanges(ir, [file]);
    expect(second.changes).toEqual([]);
  });

  it('reports no change when routing is in sync', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, sourceWithTrack(20));
    const ir = buildIr(boardWithTrack(20));
    const { changes, notes } = computeRoutingChanges(ir, [file]);
    expect(changes).toEqual([]);
    expect(notes).toEqual([]);
  });

  it('skips rewrite (with a note) when pushes use unsupported constructs', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      "import { PCB, TrackBuilder } from '@typecad/pcb';\n" +
        "const typecad = new PCB('t');\n" +
        'let track_VCC: TrackBuilder[] = [];\n' +
        `track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 10, y: 20 }, "F.Cu", 0.2).powerInfo({ current: 0.5 }).to({ x: 20, y: 20, layer: "F.Cu", width: 0.2 }));\n` +
        'typecad.create(\n  ...track_VCC\n);',
    );
    const ir = buildIr(boardWithTrack(25));
    const { changes, notes } = computeRoutingChanges(ir, [file]);
    expect(changes).toEqual([]);
    expect(notes.length).toBe(1);
    expect(notes[0]).toContain('does not rebuild');
  });

  it('skips rewrite (with a note) when routing statements are not contiguous', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      "import { PCB, TrackBuilder } from '@typecad/pcb';\n" +
        "const typecad = new PCB('t');\n" +
        'let track_VCC: TrackBuilder[] = [];\n' +
        `track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 10, y: 20 }, "F.Cu", 0.2).to({ x: 20, y: 20, layer: "F.Cu", width: 0.2 }));\n` +
        'const notARoute = 42;\n' +
        `track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 30, y: 20 }, "F.Cu", 0.2).to({ x: 40, y: 20, layer: "F.Cu", width: 0.2 }));\n` +
        'typecad.create(\n  ...track_VCC\n);',
    );
    const ir = buildIr(boardWithTrack(25));
    const { changes, notes } = computeRoutingChanges(ir, [file]);
    expect(changes).toEqual([]);
    expect(notes.length).toBe(1);
    expect(notes[0]).toContain('not contiguous');
    expect(fs.readFileSync(file, 'utf-8')).toContain('const notARoute = 42;');
  });

  it('never inserts routing into a second file that merely has a create()', () => {
    const boardFile = path.join(dir, 'board.ts');
    fs.writeFileSync(boardFile, sourceWithTrack(20));
    const otherFile = path.join(dir, 'other.ts');
    const otherSource = "import { PCB } from '@typecad/pcb';\n" + "const pcb = new PCB('other');\n" + 'pcb.create();\n';
    fs.writeFileSync(otherFile, otherSource);
    const ir = buildIr(boardWithTrack(25));
    const { changes } = computeRoutingChanges(ir, [boardFile, otherFile]);
    applySourceChanges(changes);
    // the file without routing statements stays untouched
    expect(fs.readFileSync(otherFile, 'utf-8')).toBe(otherSource);
    // and the owning file got the update
    expect(fs.readFileSync(boardFile, 'utf-8')).toContain('x: 25, y: 20');
  });

  it('deletes the routing section when the board has no tracks left', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, sourceWithTrack(20));
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew) (net 0 ""))`);
    const { changes } = computeRoutingChanges(ir, [file]);
    expect(changes.length).toBe(1);
    expect(changes[0].changedProps).toContain('tracks');
    applySourceChanges(changes);
    const applied = fs.readFileSync(file, 'utf-8');
    expect(applied).not.toContain('track_VCC.push');
    expect(applied).not.toContain('...track_VCC');
    expect(analyzeFile(file)).not.toBeNull();
  });
});

// === create() track list regressions (bare identifiers, convergence) ===

describe('apply-back: create() track list', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-create-args-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A board whose VCC routing was deleted in KiCad (net gone from tracks). */
  const boardWithoutVcc = `(kicad_pcb (version 20260206) (generator pcbnew)
    (net 0 "")
    (net 1 "GND")
    (segment (start 10 20) (end 20 20) (width 0.2) (layer "F.Cu") (net "GND"))
    (via (at 20 20) (size 0.6) (drill 0.3) (net "GND"))
  )`;

  /** Older generated code passed track arrays as bare identifiers, not spreads. */
  const legacyCreateSource = (extraComponent: boolean) =>
    "import { PCB, TrackBuilder } from '@typecad/pcb';\n" +
    "const typecad = new PCB('t');\n" +
    (extraComponent ? "const u1 = new Component({ reference: 'U1' });\n" : '') +
    '// Net: GND\n' +
    'let track_GND: TrackBuilder[] = [];\n' +
    'track_GND.push(typecad.track({ net: \'GND\' }).from({ x: 10, y: 20 }, "F.Cu", 0.2).to({ x: 20, y: 20, layer: "F.Cu", width: 0.2 }).via({ size: 0.6, drill: 0.3 }));\n' +
    '\n' +
    'typecad.create(\n' +
    '  u1,\n' +
    '  track_VCC,\n' +
    '  track_GND\n' +
    ');';

  it('drops bare track-array identifiers the board no longer declares', () => {
    const file = path.join(dir, 'board.ts');
    // source declares track_GND but create also references track_VCC —
    // a declaration that no longer exists anywhere
    fs.writeFileSync(
      file,
      legacyCreateSource(true).replace('let track_GND', 'let track_GND').replace('track_VCC', 'track_VCC'),
    );
    const ir = buildIr(boardWithoutVcc);
    const { changes, notes } = computeRoutingChanges(ir, [file]);
    expect(notes).toEqual([]);
    const createChange = changes.find((c) => c.changedProps.includes('create'));
    expect(createChange).toBeDefined();
    applySourceChanges(changes);
    const applied = fs.readFileSync(file, 'utf-8');
    // the dangling bare identifier is gone, components kept, spread written
    expect(applied).not.toMatch(/^\s*track_VCC,?$/m);
    expect(applied).toContain('u1,');
    expect(applied).toContain('...track_GND');
    // and it parses
    expect(analyzeFile(file)).not.toBeNull();
  });

  it('converges: applying the create-args change twice does not grow newlines', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, legacyCreateSource(false));
    const ir = buildIr(boardWithoutVcc);
    const first = computeRoutingChanges(ir, [file]);
    applySourceChanges(first.changes);
    const once = fs.readFileSync(file, 'utf-8');
    const second = computeRoutingChanges(ir, [file]);
    expect(second.changes).toEqual([]);
    applySourceChanges(second.changes);
    expect(fs.readFileSync(file, 'utf-8')).toBe(once);
  });

  it('fires the create-args fix even when the routing region is already in sync', () => {
    const file = path.join(dir, 'board.ts');
    // Write the routing region exactly as the generator would, but keep a
    // stale bare identifier in create().
    const ir = buildIr(boardWithoutVcc);
    const good =
      "import { PCB, TrackBuilder } from '@typecad/pcb';\n" +
      "const typecad = new PCB('t');\n" +
      '// Net: GND\n' +
      'let track_GND: TrackBuilder[] = [];\n' +
      'track_GND.push(typecad.track({ net: \'GND\' }).from({ x: 10, y: 20 }, "F.Cu", 0.2).to({ x: 20, y: 20, layer: "F.Cu", width: 0.2 }).via({ size: 0.6, drill: 0.3 }));\n' +
      '\n' +
      'typecad.create(\n  track_VCC,\n  ...track_GND\n);';
    fs.writeFileSync(file, good);
    const { changes } = computeRoutingChanges(ir, [file]);
    expect(changes.length).toBe(1);
    expect(changes[0].changedProps).toEqual(['create']);
    applySourceChanges(changes);
    const applied = fs.readFileSync(file, 'utf-8');
    expect(applied).not.toContain('track_VCC');
    expect(computeRoutingChanges(ir, [file]).changes).toEqual([]);
  });
});
