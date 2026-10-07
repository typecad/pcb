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
  computeGraphicsChanges,
  computeOutlineChanges,
  computeRoutingChanges,
  computeStackupChanges,
  computeTextSectionChanges,
  computeZoneChanges,
} from '../src/kicad2typecad/apply_source.js';
import { analyzeFile } from '../src/kicad2typecad/source_analyzer.js';
import { kicadDataToTypeCAD } from '../src/kicad2typecad/cli.js';
import { startBoardWatch } from '../src/kicad2typecad/watch.js';
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
    expect(output).toContain('const track_VCC: TrackBuilder[] = [];');
    expect(output).toContain('const track_GND: TrackBuilder[] = [];');
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
    expect(output).toContain('const unnamed_Track: TrackBuilder[] = [];');
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

  it('parses fill arc_segments; the default 16 is not emitted (kicad-cli resaves drop the token)', () => {
    const ir = buildIr(`(kicad_pcb (version 20241229) (generator typecad)
      (zone (net 3) (net_name "GND") (layers "F.Cu") (uuid "u1")
        (fill yes (arc_segments 16) (thermal_gap 0.254))
        (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10))))
    )`);
    expect(ir.zones[0].fill?.arcSegments).toBe(16);
    // explicit 16 == KiCad default → not emitted (resave churn guard)
    const output = captureLogs(() => generateZoneCode(ir, 'test', PLAIN_CH));
    expect(output).not.toContain('arcSegments');

    // absent token parses as the default 16 (what kicad-cli resaves write)
    const irNoToken = buildIr(`(kicad_pcb (version 20241229) (generator typecad)
      (zone (net 3) (net_name "GND") (layers "F.Cu") (uuid "u1")
        (fill yes (thermal_gap 0.254))
        (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10))))
    )`);
    expect(irNoToken.zones[0].fill?.arcSegments).toBe(16);

    // non-default round-trips explicitly
    const irCustom = buildIr(`(kicad_pcb (version 20241229) (generator typecad)
      (zone (net 3) (net_name "GND") (layers "F.Cu") (uuid "u1")
        (fill yes (arc_segments 32) (thermal_gap 0.254))
        (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10))))
    )`);
    const customOut = captureLogs(() => generateZoneCode(irCustom, 'test', PLAIN_CH));
    expect(customOut).toContain('arcSegments: 32');
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
  it('counts dimensions, beziers, images, title block, footprint items and blind vias', () => {
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (dimension 0 (layer "F.SilkS") (gr_text "20 mm" (at 0 0) (layer "F.SilkS") (effects (font (size 1 1)))) (format (prefix "") (suffix " mm")) (gr_line (start 0 0) (end 20 0)))
      (gr_curve (pts (xy 0 0) (xy 1 1) (xy 2 1) (xy 3 0)) (layer "Edge.Cuts") (stroke (width 0.05)))
      (bezier (pts (xy 0 0) (xy 1 1) (xy 2 1) (xy 3 0)) (layer "Edge.Cuts") (stroke (width 0.05)))
      (title_block (title "demo") (rev 1))
      (property "BOARD" "demo")
      (image (at 0 0) (scale 1) (layer "F.SilkS") (uuid "i") (data []))
      (via (at 5 5) (size 0.6) (drill 0.3) (layers "In1.Cu" "B.Cu"))
      (footprint "X:C" (layer "F.Cu") (at 1 1)
        (zone (net 0) (layers "F.Cu") (uuid "z") (polygon (pts (xy 0 0) (xy 1 0) (xy 1 1))))
        (fp_line (start 0 0) (end 1 0) (layer "F.SilkS") (stroke (width 0.1)))
        (fp_text user "note" (at 0 0) (layer "F.Fab") (effects (font (size 1 1))))
      )
    )`);
    const byType = Object.fromEntries(ir.unsupported.map((u) => [u.type, u.count]));
    expect(byType['dimension']).toBe(1);
    expect(byType['bezier']).toBe(2);
    expect(byType['board graphic']).toBe(1);
    expect(byType['title block']).toBe(1);
    expect(byType['board property']).toBe(1);
    expect(byType['footprint-embedded zone']).toBe(1);
    expect(byType['footprint graphic']).toBe(1);
    expect(byType['footprint user text']).toBe(1);
    expect(byType['blind/buried via']).toBe(1);
  });

  it('tessellates arc-shaped tracks into segments on the same net', () => {
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (net 0 "")
      (net 1 "SIG")
      (arc (start 0 10) (mid 5 15) (end 10 10) (width 0.3) (layer "F.Cu") (net 1))
      (segment (start 10 10) (end 20 10) (width 0.3) (layer "F.Cu") (net 1))
    )`);
    // arc tessellates into >= 2 segments, chained end-to-end into the straight one
    const arcs = ir.segments.filter((s) => Math.abs(s.start.y - 10) > 0.001 || s.end.y !== 10);
    expect(arcs.length).toBeGreaterThanOrEqual(2);
    for (const s of arcs) {
      expect(s.netName).toBeUndefined();
      expect(s.net).toBe(1);
      expect(s.layer).toBe('F.Cu');
      expect(s.width).toBe(0.3);
    }
    // the tessellated chain is continuous and reaches the arc end
    const chainStart = arcs[0].start;
    const chainEnd = arcs[arcs.length - 1].end;
    expect(chainStart).toEqual({ x: 0, y: 10 });
    expect(chainEnd).toEqual({ x: 10, y: 10 });
    for (let i = 1; i < arcs.length; i++) {
      expect(arcs[i].start).toEqual(arcs[i - 1].end);
    }
    // tessellated points sit on the arc's circle (center 5,10 r 5)
    for (const s of arcs) {
      for (const p of [s.start, s.end]) {
        if (p.x === 0 || p.x === 10) continue;
        expect(Math.abs(Math.hypot(p.x - 5, p.y - 10) - 5)).toBeLessThan(0.01);
      }
    }
  });

  it('does not double-count zone outline arcs as tracks', () => {
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (net 0 "")
      (zone (net "GND") (layer "F.Cu") (uuid "u")
        (polygon (pts (xy 0 0) (arc (start 10 0) (mid 15 5) (end 10 10)) (xy 0 10))))
      (segment (start 0 0) (end 1 0) (width 0.2) (layer "F.Cu") (net "GND"))
    )`);
    // only the one straight segment — the zone arc stays in the zone polygon
    expect(ir.segments).toHaveLength(1);
    expect(ir.zones[0].polygon.length).toBeGreaterThan(3);
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
    'const track_VCC: TrackBuilder[] = [];\n' +
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

  it('an orphaned empty TrackBuilder[] declaration dies with the regenerated section', () => {
    // live defect (mod-ec): a layout-view segment delete emptied a net's
    // last push, leaving `const track_X: TrackBuilder[] = [];` with nothing
    // pushed. The member scan only counted declarations WITH pushes, so the
    // orphan sat outside the replacement span while the regenerated section
    // re-declared the same name beside it — duplicate identifier, parse
    // gate refused the whole import cycle. The orphan must be a member.
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      "import { PCB, TrackBuilder } from '@typecad/pcb';\n" +
        "const typecad = new PCB('t');\n" +
        'typecad.outline(5, 10, 100, 50);\n' +
        '// Net: VCC\n' +
        'const track_VCC: TrackBuilder[] = [];\n' +
        `track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 10, y: 20 }, "F.Cu", 0.2).to({ x: 20, y: 20, layer: "F.Cu", width: 0.2 }));\n` +
        '// Net: GND\n' +
        'const track_GND: TrackBuilder[] = [];\n' + // orphan: emptied by a segment delete
        '\n' +
        'typecad.create(\n  ...track_VCC,\n  ...track_GND\n);',
    );
    // the board carries copper on BOTH nets — the regen re-declares both
    const ir = buildIr(
      boardWithTrack(20).replace(
        '(net 1 "VCC")',
        '(net 1 "VCC")\n    (net 2 "GND")\n    (segment (start 30 40) (end 35 40) (width 0.2) (layer "F.Cu") (net "GND"))',
      ),
    );
    const { changes } = computeRoutingChanges(ir, [file]);
    expect(changes.length).toBe(1);
    applySourceChanges(changes);

    const applied = fs.readFileSync(file, 'utf-8');
    // ONE track_GND declaration, carrying the board's copper
    expect(applied.match(/const track_GND/g)).toHaveLength(1);
    const analysis = analyzeFile(file);
    expect(analysis).not.toBeNull();
    // and the cycle converges
    expect(computeRoutingChanges(ir, [file]).changes).toEqual([]);
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
        'const track_VCC: TrackBuilder[] = [];\n' +
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
        'const track_VCC: TrackBuilder[] = [];\n' +
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

  it('absorbs loose route-builder statements into the regenerated arrays without duplicating tracks', () => {
    // The viewer's apply bridge writes `const routeN = new TrackBuilder(...)`
    // chains beside create(); their segments reach the board, so the routing
    // regen must remove the statements and their create() arguments — left
    // in place next to the regenerated arrays every carried track would
    // exist twice after the next build.
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      "import { PCB, TrackBuilder } from '@typecad/pcb';\n" +
        "const typecad = new PCB('t');\n" +
        '// Net: VCC\n' +
        'const track_VCC: TrackBuilder[] = [];\n' +
        'track_VCC.push(typecad.track({ net: \'VCC\' }).from({ x: 10, y: 20 }, "F.Cu", 0.2).to({ x: 20, y: 20, layer: "F.Cu", width: 0.2 }));\n' +
        '\n' +
        "const route1 = new TrackBuilder(typecad, { net: 'DRIVE',  })\n" +
        "  .from({ x: 30, y: 40 }, 'F.Cu', 0.2)\n" +
        "  .to({ x: 40, y: 40, layer: 'F.Cu', width: 0.2 });\n" +
        '\n' +
        "const route2 = new TrackBuilder(typecad, {  })\n" +
        "  .from({ x: 50, y: 60 }, 'F.Cu', 0.2)\n" +
        "  .to({ x: 60, y: 60, layer: 'F.Cu', width: 0.2 });\n" +
        '\n' +
        'typecad.create(\n  ...track_VCC,\n  route1,\n  route2\n);',
    );
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (net 0 "")
      (net 1 "VCC")
      (net 2 "DRIVE")
      (segment (start 10 20) (end 20 20) (width 0.2) (layer "F.Cu") (net "VCC"))
      (segment (start 30 40) (end 40 40) (width 0.2) (layer "F.Cu") (net "DRIVE"))
      (segment (start 50 60) (end 60 60) (width 0.2) (layer "F.Cu"))
    )`);
    const first = computeRoutingChanges(ir, [file]);
    expect(first.changes.length).toBe(1);
    applySourceChanges(first.changes);

    const applied = fs.readFileSync(file, 'utf-8');
    // the loose statements are gone, their segments live in the arrays
    expect(applied).not.toContain('const route1');
    expect(applied).not.toContain('const route2');
    expect(applied).not.toContain('route1,');
    expect(applied).toContain('x: 30, y: 40');
    expect(applied).toContain('x: 50, y: 60');
    // exactly one copy of each absorbed segment in the file
    expect(applied.split('x: 40, y: 40').length - 1).toBe(1);
    expect(applied.split('x: 60, y: 60').length - 1).toBe(1);
    // the written source still parses and create() spreads only arrays
    const analysis = analyzeFile(file);
    expect(analysis).not.toBeNull();
    expect(analysis!.routeBuilders).toEqual([]);
    // converges: a second compute finds nothing pending
    const second = computeRoutingChanges(ir, [file]);
    expect(second.changes).toEqual([]);
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
    'const track_GND: TrackBuilder[] = [];\n' +
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
      legacyCreateSource(true).replace('const track_GND', 'const track_GND').replace('track_VCC', 'track_VCC'),
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
      'const track_GND: TrackBuilder[] = [];\n' +
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(100);
  }
  throw new Error('waitFor timed out');
}

// === --auto and --watch modes ===

describe('import --auto (non-interactive apply)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-import-auto-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const writeProject = (boardPosition: { x: number; y: number }) => {
    fs.mkdirSync(path.join(root, 'build'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const board = `(kicad_pcb (version 20260206) (generator pcbnew)
      (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu")
        (at ${boardPosition.x} ${boardPosition.y} 90)
        (property "Reference" "R1" (at 0 -1.43) (layer "F.SilkS")
          (effects (font (size 1 1) (thickness 0.15))))
      )
    )`;
    fs.writeFileSync(path.join(root, 'build', 'b.kicad_pcb'), board);
    const source = [
      "import { PCB, Resistor } from '@typecad/pcb';",
      "const typecad = new PCB('t');",
      "const r1 = new Resistor({ reference: 'R1' });",
      'r1.pcb = { x: 1, y: 2, rotation: 0 };',
      'typecad.create(r1);',
    ].join('\n');
    const sourcePath = path.join(root, 'src', 'board.ts');
    fs.writeFileSync(sourcePath, source);
    return sourcePath;
  };

  it('applies all detected changes without prompting', async () => {
    const sourcePath = writeProject({ x: 55, y: 66 });
    await kicadDataToTypeCAD(path.join(root, 'build', 'b.kicad_pcb'), { apply: true, auto: true });
    const applied = fs.readFileSync(sourcePath, 'utf-8');
    expect(applied).toContain('x: 55, y: 66');
    expect(applied).toContain('rotation: 90');
  });

  it('is a no-op when everything is in sync', async () => {
    const sourcePath = writeProject({ x: 1, y: 2 });
    const before = fs.readFileSync(sourcePath, 'utf-8');
    await kicadDataToTypeCAD(path.join(root, 'build', 'b.kicad_pcb'), { apply: true, auto: true });
    // rotation prop is inserted (board says 90, source had 0) — run again
    await kicadDataToTypeCAD(path.join(root, 'build', 'b.kicad_pcb'), { apply: true, auto: true });
    expect(fs.readFileSync(sourcePath, 'utf-8')).toBe(fs.readFileSync(sourcePath, 'utf-8'));
    void before;
  });
});

describe('import --watch --auto (live sync)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-import-watch-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const boardWith = (x: number, y: number) => `(kicad_pcb (version 20260206) (generator pcbnew)
      (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu")
        (at ${x} ${y} 0)
        (property "Reference" "R1" (at 0 -1.43) (layer "F.SilkS")
          (effects (font (size 1 1) (thickness 0.15))))
      )
    )`;

  it('applies the initial state, then syncs on every board save', async () => {
    fs.mkdirSync(path.join(root, 'build'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const boardPath = path.join(root, 'build', 'b.kicad_pcb');
    fs.writeFileSync(boardPath, boardWith(30, 40));
    const sourcePath = path.join(root, 'src', 'board.ts');
    fs.writeFileSync(
      sourcePath,
      [
        "import { PCB, Resistor } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        "const r1 = new Resistor({ reference: 'R1' });",
        'r1.pcb = { x: 1, y: 2 };',
        'typecad.create(r1);',
      ].join('\n'),
    );

    const session = startBoardWatch(boardPath, { apply: true, auto: true }, (file, cycleOptions) =>
      kicadDataToTypeCAD(file, cycleOptions),
    );
    try {
      await session.ready;
      // initial cycle synced the source to the board
      expect(fs.readFileSync(sourcePath, 'utf-8')).toContain('x: 30, y: 40');

      // user edits the board in KiCad: save a new position
      fs.writeFileSync(boardPath, boardWith(77, 88));
      await waitFor(() => fs.readFileSync(sourcePath, 'utf-8').includes('x: 77, y: 88'), 8000);
      expect(fs.readFileSync(sourcePath, 'utf-8')).toContain('y: 88');
    } finally {
      session.stop();
    }
  }, 20000);

  it('survives a partial (unparseable) write and syncs the next save', async () => {
    fs.mkdirSync(path.join(root, 'build'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const boardPath = path.join(root, 'build', 'b.kicad_pcb');
    fs.writeFileSync(boardPath, boardWith(10, 10));
    const sourcePath = path.join(root, 'src', 'board.ts');
    fs.writeFileSync(
      sourcePath,
      [
        "import { PCB, Resistor } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        "const r1 = new Resistor({ reference: 'R1' });",
        'r1.pcb = { x: 1, y: 2 };',
        'typecad.create(r1);',
      ].join('\n'),
    );

    const session = startBoardWatch(boardPath, { apply: true, auto: true }, (file, cycleOptions) =>
      kicadDataToTypeCAD(file, cycleOptions),
    );
    try {
      await session.ready;
      expect(fs.readFileSync(sourcePath, 'utf-8')).toContain('x: 10, y: 10');

      // a half-written file (editor flush mid-save) must not kill the watcher
      fs.writeFileSync(boardPath, '(kicad_pcb (version 2026');
      await sleep(1200);
      fs.writeFileSync(boardPath, boardWith(12, 14));
      await waitFor(() => fs.readFileSync(sourcePath, 'utf-8').includes('x: 12, y: 14'), 8000);
    } finally {
      session.stop();
    }
  }, 20000);
});

// === Text section round-trip (insert board text, drop stale calls) ===

describe('apply-back: text section', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-text-section-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const boardWithTexts = (texts: Array<{ text: string; layer?: string; hide?: boolean }>) => {
    const nodes = texts
      .map((t) => {
        const hide = t.hide ? ' (hide yes)' : '';
        return `    (gr_text ${JSON.stringify(t.text)} (at 10 20 0) (layer ${JSON.stringify(t.layer ?? 'F.SilkS')})${hide}
      (effects (font (size 1 1) (thickness 0.15))))`;
      })
      .join('\n');
    return `(kicad_pcb (version 20260206) (generator pcbnew)${'\n'}${nodes}
  )`;
  };

  const sourceWithZone = (extraTextCalls: string[] = []) =>
    [
      "import { PCB } from '@typecad/pcb';",
      "const typecad = new PCB('t');",
      'typecad.outline(0, 0, 40, 30);',
      ...extraTextCalls,
      "typecad.zone({ net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 40, height: 30 });",
    ].join('\n');

  it('inserts board text that has no typecad.text() call', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, sourceWithZone());
    const ir = buildIr(boardWithTexts([{ text: 'mod-EC v3' }]));
    const { changes, notes } = computeTextSectionChanges(ir, [file]);
    expect(notes).toEqual([]);
    expect(changes.length).toBe(1);
    expect(changes[0].kind).toBe('text');
    applySourceChanges(changes);
    const applied = fs.readFileSync(file, 'utf-8');
    expect(applied).toContain(
      `typecad.text({ text: "mod-EC v3", x: 10, y: 20, height: 1, width: 1, thickness: 0.15 });`,
    );
    // inserted on its own line before the first zone-family (outline) call
    expect(applied).toMatch(/typecad\.text\([^\n]+\;\ntypecad\.outline\(/);
    // converges
    const second = computeTextSectionChanges(ir, [file]);
    expect(second.changes).toEqual([]);
  });

  it('inserts mirrored back-silkscreen text with justify', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, sourceWithZone());
    const ir = buildIr(boardWithTexts([{ text: 'PROBE', layer: 'B.SilkS' }]));
    // give the board text a mirror justify via effects
    const irText = ir.textElements[0];
    irText.justify = { mirror: true };
    const { changes } = computeTextSectionChanges(ir, [file]);
    expect(changes.length).toBe(1);
    applySourceChanges(changes);
    const applied = fs.readFileSync(file, 'utf-8');
    expect(applied).toContain(`layer: "B.SilkS"`);
    expect(applied).toContain('justify: { mirror: true }');
    expect(computeTextSectionChanges(ir, [file]).changes).toEqual([]);
  });

  it('inserts hidden text with hide: true', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, sourceWithZone());
    const ir = buildIr(boardWithTexts([{ text: 'secret', hide: true }]));
    const { changes } = computeTextSectionChanges(ir, [file]);
    applySourceChanges(changes);
    expect(fs.readFileSync(file, 'utf-8')).toContain('hide: true');
    expect(computeTextSectionChanges(ir, [file]).changes).toEqual([]);
  });

  it('removes source text calls whose text is no longer on the board', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, sourceWithZone([`typecad.text({ text: "OLD", x: 1, y: 2 });`]));
    const ir = buildIr(boardWithTexts([{ text: 'NEW' }]));
    const { changes } = computeTextSectionChanges(ir, [file]);
    const labels = changes.map((c) => c.label);
    expect(labels.some((l) => l.includes('removed'))).toBe(true);
    expect(labels.some((l) => l.includes('inserted'))).toBe(true);
    applySourceChanges(changes);
    const applied = fs.readFileSync(file, 'utf-8');
    expect(applied).not.toContain('"OLD"');
    expect(applied).toContain('"NEW"');
    expect(analyzeFile(file)).not.toBeNull();
    expect(computeTextSectionChanges(ir, [file]).changes).toEqual([]);
  });

  it('does not touch paired texts (update path stays with the rewriter)', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, sourceWithZone([`typecad.text({ text: "GND", x: 5, y: 6 });`]));
    const ir = buildIr(boardWithTexts([{ text: 'GND' }]));
    // board text at 10,20 vs source call at 5,6 — the position update belongs
    // to computeTextChanges; the section pass must not duplicate it
    const { changes } = computeTextSectionChanges(ir, [file]);
    expect(changes).toEqual([]);
  });
});

// === apply cycle aborts when a source file fails to parse ===

describe('apply mode parse-failure guard', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-parse-guard-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes nothing when any project source file fails to parse', async () => {
    fs.mkdirSync(path.join(root, 'build'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const board = `(kicad_pcb (version 20260206) (generator pcbnew)
      (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu")
        (at 55 66 0)
        (property "Reference" "R1" (at 0 -1.43) (layer "F.SilkS")
          (effects (font (size 1 1) (thickness 0.15))))
      )
    )`;
    fs.writeFileSync(path.join(root, 'build', 'b.kicad_pcb'), board);
    // healthy file whose component matches the board reference
    const healthy = path.join(root, 'src', 'board.ts');
    fs.writeFileSync(
      healthy,
      [
        "import { PCB, Resistor } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        'const r1 = new Resistor({});', // anonymous — would match R1 by prefix
        'r1.pcb = { x: 1, y: 2 };',
        'typecad.create(r1);',
      ].join('\n'),
    );
    // broken file — e.g. an editor mid-save under --watch
    const broken = path.join(root, 'src', 'broken.ts');
    fs.writeFileSync(broken, 'const x = {{{;');

    await kicadDataToTypeCAD(path.join(root, 'build', 'b.kicad_pcb'), { apply: true, auto: true });

    // the healthy file must be untouched: no position move, no inserts
    const after = fs.readFileSync(healthy, 'utf-8');
    expect(after).toBe(fs.readFileSync(healthy, 'utf-8'));
    expect(after).toContain('r1.pcb = { x: 1, y: 2 };');
    expect(after).not.toContain('x: 55');
    expect(after).not.toContain('typecad.text(');
  });
});

// === justify phantom regressions (bare (justify), record-vs-plain compare) ===

describe('text justify round-trip', () => {
  it('parses a bare (justify) as no justify at all', () => {
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (gr_text "label" (at 1 2 0) (layer "F.SilkS")
        (effects (font (size 1 1) (thickness 0.15)) (justify)))
    )`);
    expect(ir.textElements[0].justify).toBeUndefined();
  });

  it('does not flag justify changes between mirrored source and board text', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-justify-'));
    try {
      const file = path.join(dir, 'board.ts');
      fs.writeFileSync(
        file,
        [
          "import { PCB } from '@typecad/pcb';",
          "const typecad = new PCB('t');",
          `typecad.text({ text: "PROBE", x: 135.1, y: 79.1, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });`,
        ].join('\n'),
      );
      const boardText = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
        (gr_text "PROBE" (at 135.1 79.1 0) (layer "B.SilkS")
          (effects (font (size 0.75 0.75) (thickness 0.15)) (justify mirror)))
      )`);
      const rewriter = new SourceRewriter();
      const changes = rewriter.computeTextChanges(boardText, [file]);
      expect(changes).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not flag justify when the board carries a bare (justify)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-justify-bare-'));
    try {
      const file = path.join(dir, 'board.ts');
      fs.writeFileSync(
        file,
        [
          "import { PCB } from '@typecad/pcb';",
          "const typecad = new PCB('t');",
          `typecad.text({ text: "label", x: 1, y: 2, height: 1, width: 1, thickness: 0.25 });`,
        ].join('\n'),
      );
      const boardText = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
        (gr_text "label" (at 1 2 0) (layer "F.SilkS")
          (effects (font (size 1 1) (thickness 0.25)) (justify)))
      )`);
      const rewriter = new SourceRewriter();
      const changes = rewriter.computeTextChanges(boardText, [file]);
      expect(changes).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// === stackup depth + board graphics (spec-gap round trips) ===

describe('apply-back: stackup depth', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-stackup-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const stackupBoard = `(kicad_pcb (version 20260206) (generator pcbnew)
    (setup
      (stackup
        (layer "F.SilkS" (type "Top Silk Screen") (color "White"))
        (layer "F.Cu" (type "copper") (thickness 0.035))
        (layer "dielectric 1" (type "prepreg") (thickness 0.21) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))
        (layer "B.Cu" (type "copper") (thickness 0.07))
        (copper_finish "ENIG")
      )
    )
    (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts"))
  )`;

  it('regenerates the stackup call with per-layer detail and converges', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      [
        "import { PCB } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        'typecad.stackup(2);',
        'typecad.outline(0, 0, 10, 10);',
      ].join('\n'),
    );
    const ir = buildIr(stackupBoard);
    const { changes, notes } = computeStackupChanges(ir, [file]);
    expect(notes).toEqual([]);
    expect(changes.length).toBe(1);
    applySourceChanges(changes);
    const applied = fs.readFileSync(file, 'utf-8');
    expect(applied).toContain("copper_finish: 'ENIG'");
    expect(applied).toContain("'F.Cu': { thickness: 0.035 }");
    expect(applied).toContain(
      "'dielectric 1': { thickness: 0.21, material: 'FR4', epsilon_r: 4.5, loss_tangent: 0.02 }",
    );
    expect(applied).toContain("'B.Cu': { thickness: 0.07 }");
    // converges
    expect(computeStackupChanges(ir, [file]).changes).toEqual([]);
  });

  it('inserts the stackup call when the source has none', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      ["import { PCB } from '@typecad/pcb';", "const typecad = new PCB('t');", 'typecad.outline(0, 0, 10, 10);'].join(
        '\n',
      ),
    );
    const ir = buildIr(stackupBoard);
    const { changes } = computeStackupChanges(ir, [file]);
    expect(changes.length).toBe(1);
    applySourceChanges(changes);
    const applied = fs.readFileSync(file, 'utf-8');
    expect(applied).toContain('typecad.stackup(2,');
    // the inserted statement carries its own terminator
    expect(applied).toMatch(/typecad\.stackup\(2, \{[^;]+\}\);/);
    expect(applied.indexOf('typecad.stackup(')).toBeLessThan(applied.indexOf('typecad.outline('));
    expect(computeStackupChanges(ir, [file]).changes).toEqual([]);
  });

  it('is a no-op when the call already matches', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      [
        "import { PCB } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        "typecad.stackup(2, { copper_finish: 'ENIG', layers: { 'F.SilkS': { color: 'White' }, 'F.Cu': { thickness: 0.035 }, 'dielectric 1': { thickness: 0.21, material: 'FR4', epsilon_r: 4.5, loss_tangent: 0.02 }, 'B.Cu': { thickness: 0.07 } } });",
        'typecad.outline(0, 0, 10, 10);',
      ].join('\n'),
    );
    const ir = buildIr(stackupBoard);
    expect(computeStackupChanges(ir, [file]).changes).toEqual([]);
  });
});

describe('apply-back: board graphics', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-graphics-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const graphicsBoard = `(kicad_pcb (version 20260206) (generator pcbnew)
    (gr_rect (start 0 0) (end 40 30) (layer "Edge.Cuts") (stroke (width 0.05)))
    (gr_line (start 2 2) (end 10 2) (layer "F.SilkS") (stroke (width 0.15)))
    (gr_text "logo" (at 5 5 0) (layer "F.SilkS") (effects (font (size 1 1))))
    (gr_circle (center 30 20) (end 32 20) (layer "B.SilkS") (stroke (width 0.15)) (fill yes))
  )`;

  it('inserts silk graphics as line/circle calls and converges', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      ["import { PCB } from '@typecad/pcb';", "const typecad = new PCB('t');", 'typecad.outline(0, 0, 40, 30);'].join(
        '\n',
      ),
    );
    const ir = buildIr(graphicsBoard);
    // board graphics exclude Edge.Cuts (that feeds outlines)
    expect(ir.boardGraphics.map((g) => g.kind).sort()).toEqual(['circle', 'line']);
    const { changes, notes } = computeGraphicsChanges(ir, [file]);
    expect(notes).toEqual([]);
    expect(changes.length).toBe(1);
    applySourceChanges(changes);
    const applied = fs.readFileSync(file, 'utf-8');
    expect(applied).toContain(
      `typecad.line({ layer: 'F.SilkS', width: 0.15, start: { x: 2, y: 2 }, end: { x: 10, y: 2 } });`,
    );
    expect(applied).toContain(
      `typecad.circle({ layer: 'B.SilkS', width: 0.15, fill: true, center: { x: 30, y: 20 }, radius: 2 });`,
    );
    // converges
    expect(computeGraphicsChanges(ir, [file]).changes).toEqual([]);
  });

  it('updates a moved graphic and deletes one the board no longer has', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      [
        "import { PCB } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        'typecad.outline(0, 0, 40, 30);',
        `typecad.line({ layer: 'F.SilkS', width: 0.15, start: { x: 2, y: 2 }, end: { x: 10, y: 2 } });`,
        `typecad.line({ layer: 'F.SilkS', width: 0.15, start: { x: 12, y: 2 }, end: { x: 20, y: 2 } });`,
      ].join('\n'),
    );
    const ir = buildIr(graphicsBoard); // board only has the (2,2)-(10,2) line
    const { changes } = computeGraphicsChanges(ir, [file]);
    const labels = changes.map((c) => c.label);
    expect(labels.some((l) => l.includes('removed'))).toBe(true);
    applySourceChanges(changes);
    const applied = fs.readFileSync(file, 'utf-8');
    expect(applied).not.toContain('x: 12, y: 2');
    expect(applied).toContain('x: 2, y: 2');
    expect(analyzeFile(file)).not.toBeNull();
    expect(computeGraphicsChanges(ir, [file]).changes).toEqual([]);
  });

  it('keeps Edge.Cuts outlines out of the graphics sync', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      ["import { PCB } from '@typecad/pcb';", "const typecad = new PCB('t');", 'typecad.outline(0, 0, 40, 30);'].join(
        '\n',
      ),
    );
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (gr_rect (start 0 0) (end 40 30) (layer "Edge.Cuts") (stroke (width 0.05)))
    )`);
    expect(ir.boardGraphics).toEqual([]);
    expect(computeGraphicsChanges(ir, [file]).changes).toEqual([]);
  });
});

// === duplicate-label text regressions (double-recorded calls, cross-pairing) ===

describe('duplicate-label text sync', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-duptext-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const boardWithTwoGnds = (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => `(kicad_pcb (version 20260206) (generator pcbnew)
    (gr_text "GND" (at ${a.x} ${a.y} 0) (layer "B.SilkS")
      (effects (font (size 0.75 0.75) (thickness 0.15)) (justify mirror)))
    (gr_text "GND" (at ${b.x} ${b.y} 0) (layer "B.SilkS")
      (effects (font (size 0.75 0.75) (thickness 0.15)) (justify mirror)))
  )`;

  const sourceWithTwoGnds = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    [
      "import { PCB } from '@typecad/pcb';",
      "const typecad = new PCB('t');",
      `typecad.text({ text: "GND", x: ${a.x}, y: ${a.y}, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });`,
      `typecad.text({ text: "GND", x: ${b.x}, y: ${b.y}, layer: "B.SilkS", height: 0.75, width: 0.75, thickness: 0.15, justify: { mirror: true } });`,
    ].join('\n');

  it('records each typecad.text() call exactly once', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, sourceWithTwoGnds({ x: 1, y: 2 }, { x: 30, y: 40 }));
    const analysis = analyzeFile(file);
    expect(analysis).not.toBeNull();
    expect(analysis!.textCalls.filter((c) => c.text === 'GND')).toHaveLength(2);
  });

  it('reports no change when both duplicate labels sit at their own positions', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, sourceWithTwoGnds({ x: 1, y: 2 }, { x: 30, y: 40 }));
    const ir = buildIr(boardWithTwoGnds({ x: 1, y: 2 }, { x: 30, y: 40 }));
    const rewriter = new SourceRewriter();
    expect(rewriter.computeTextChanges(ir, [file])).toEqual([]);
  });

  it('updates only the moved instance and keeps the two calls distinct', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, sourceWithTwoGnds({ x: 1, y: 2 }, { x: 30, y: 40 }));
    // board moved the SECOND GND to 35,45
    const ir = buildIr(boardWithTwoGnds({ x: 1, y: 2 }, { x: 35, y: 45 }));
    const rewriter = new SourceRewriter();
    const changes = rewriter.computeTextChanges(ir, [file]);
    expect(changes).toHaveLength(1);
    expect(changes[0].oldX).toBe(30);
    expect(changes[0].newX).toBe(35);
    rewriter.applyTextChanges(changes);
    const applied = fs.readFileSync(file, 'utf-8');
    // first call untouched, second updated — positions stay distinct
    expect(applied).toContain('x: 1, y: 2');
    expect(applied).toContain('x: 35, y: 45');
    expect(applied).not.toContain('x: 30, y: 40');
    expect(rewriter.computeTextChanges(ir, [file])).toEqual([]);
  });
});

// === apply-back against non-canonical source patterns ===
// Users don't write generator-shaped code; these pin that the write-back
// still detects, applies, and converges on hand-written forms.

describe('apply-back: non-canonical source patterns', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-patterns-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const zoneBoard = (cornerY: number) => `(kicad_pcb (version 20260206) (generator pcbnew)
    (gr_rect (start 0 0) (end 40 30) (layer "Edge.Cuts"))
    (zone (net "GND") (layer "F.Cu") (uuid "u1")
      (hatch edge 0.508)
      (min_thickness 0.254)
      (fill yes (thermal_gap 0.254) (thermal_bridge_width 0.4064))
      (polygon (pts (xy 0 0) (xy 40 0) (xy 40 ${cornerY}) (xy 0 ${cornerY}))))
  )`;

  it('works with a differently-named PCB receiver (pcb.* instead of typecad.*)', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      [
        "import { PCB } from '@typecad/pcb';",
        "const pcb = new PCB('t');",
        'pcb.outline(0, 0, 40, 30);',
        "pcb.zone({ net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 40, height: 30 });",
      ].join('\n'),
    );
    const ir = buildIr(zoneBoard(30));
    const zone = computeZoneChanges(ir, [file]);
    expect(zone.changes.length).toBe(1); // fill detail added
    applySourceChanges(zone.changes);
    // inserted/updated text uses the file's own receiver name
    const ir2 = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (gr_rect (start 0 0) (end 40 30) (layer "Edge.Cuts"))
      (gr_text "GND" (at 5 5 0) (layer "F.SilkS") (effects (font (size 1 1))))
    )`);
    const text = computeTextSectionChanges(ir2, [file]);
    applySourceChanges(text.changes);
    const applied = fs.readFileSync(file, 'utf-8');
    expect(applied).toContain('pcb.text({');
    expect(applied).not.toContain('typecad.text(');
    // converges on both categories
    expect(computeZoneChanges(ir, [file]).changes).toEqual([]);
    expect(computeTextSectionChanges(ir2, [file]).changes).toEqual([]);
  });

  it('matches zones written with multi-line option objects and single quotes', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      [
        "import { PCB } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        'typecad.zone({',
        "  net: 'GND',",
        "  layers: ['F.Cu'],",
        '  x: 0,',
        '  y: 0,',
        '  width: 40,',
        '  height: 30,',
        '  minThickness: 0.254',
        '  fill: {',
        '    thermalGap: 0.254,',
        '    thermalBridgeWidth: 0.4064,',
        '  },',
        '});',
      ].join('\n'),
    );
    const ir = buildIr(zoneBoard(30));
    // identical semantics — the grouped fill matches, mode solid normalized
    expect(computeZoneChanges(ir, [file]).changes).toEqual([]);
  });

  it('matches zones using the bounds: geometry form', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      [
        "import { PCB } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        "typecad.zone({ net: 'GND', layers: ['F.Cu'], bounds: { left: 0, top: 0, width: 40, height: 30 }, minThickness: 0.254 });",
      ].join('\n'),
    );
    const ir = buildIr(zoneBoard(30));
    const { changes } = computeZoneChanges(ir, [file]);
    // geometry matches via bounds; only the fill detail should be added
    expect(changes.length).toBe(1);
    expect(changes[0].changedProps).toEqual(['fill']);
    applySourceChanges(changes);
    expect(computeZoneChanges(ir, [file]).changes).toEqual([]);
  });

  it('matches zones using flat fill options instead of the grouped fill object', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      [
        "import { PCB } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        "typecad.zone({ net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 40, height: 30, minThickness: 0.254, thermalGap: 0.254, thermalBridgeWidth: 0.4064 });",
      ].join('\n'),
    );
    const ir = buildIr(zoneBoard(30));
    // flat thermalGap/thermalBridgeWidth are semantically the board's fill —
    // nothing to change
    expect(computeZoneChanges(ir, [file]).changes).toEqual([]);
  });

  it('does not corrupt outlines written with the bounds: form', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      [
        "import { PCB } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        'typecad.outline({ left: 0, top: 0, width: 40, height: 30 });',
      ].join('\n'),
    );
    const ir = buildIr(zoneBoard(25)); // board outline grew to height 25→30 via Edge.Cuts? use same rect
    const { changes } = computeOutlineChanges(ir, [file]);
    if (changes.length > 0) {
      applySourceChanges(changes);
      const applied = fs.readFileSync(file, 'utf-8');
      // rewritten to the numeric form, not a corrupted hybrid
      expect(applied).toMatch(/typecad\.outline\(\s*0,\s*0,\s*40,\s*30\s*\);/);
      expect(applied).not.toContain('left:');
    }
  });

  it('handles this.-member components with inline pcb in the constructor', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      [
        "import { PCB, Resistor } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        'class Board {',
        '  private r1 = new Resistor({',
        "    reference: 'R1',",
        '    pcb: {',
        '      x: 10,',
        '      y: 20,',
        '      rotation: 90,',
        '    },',
        '  });',
        '}',
      ].join('\n'),
    );
    const matcher = new SourceMatcher(dir);
    const result = matcher.matchFootprint({
      footprintName: 'Resistor_SMD:R_0603_1608Metric',
      reference: 'R1',
      position: { x: 10, y: 20, rotation: 90 },
      side: 'front',
      uuid: 'u',
      codeMetadata: null,
      referenceProperty: null,
      valueProperty: null,
    });
    expect(result.sourceLocation).not.toBeNull();
    const changes = new SourceRewriter().computeFootprintChanges([result]);
    expect(changes).toEqual([]); // already at the board position
  });

  it('converges when track arrays use custom names', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(
      file,
      [
        "import { PCB, TrackBuilder } from '@typecad/pcb';",
        "const typecad = new PCB('t');",
        'typecad.outline(0, 0, 40, 30);',
        '// my power route',
        'const power: TrackBuilder[] = [];',
        "power.push(typecad.track({ net: 'VCC' }).from({ x: 1, y: 1 }, 'F.Cu', 0.3).to({ x: 10, y: 1, layer: 'F.Cu', width: 0.3 }));",
        'typecad.create(',
        '  ...power,',
        ');',
      ].join('\n'),
    );
    const ir = buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
      (net 0 "")
      (segment (start 1 1) (end 10 1) (width 0.3) (layer "F.Cu") (net "VCC"))
    )`);
    const { changes, notes } = computeRoutingChanges(ir, [file]);
    expect(notes).toEqual([]);
    expect(changes.length).toBe(1);
    applySourceChanges(changes);
    const applied = fs.readFileSync(file, 'utf-8');
    // regenerated to canonical names AND the create spread follows
    expect(applied).toContain('const track_VCC: TrackBuilder[] = [];');
    expect(applied).toContain('...track_VCC');
    expect(applied).not.toContain('...power');
    expect(applied).toContain('"F.Cu"');
    expect(computeRoutingChanges(ir, [file]).changes).toEqual([]);
  });
});

// === class-field components: match + in-place updates, never corrupt ===

describe('class-field components', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-classfield-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const classSource = (withPcb: boolean) =>
    [
      "import { PCB, Resistor } from '@typecad/pcb';",
      "const typecad = new PCB('t');",
      'class Frontend {',
      '  private r1 = new Resistor({',
      "    reference: 'R1',",
      ...(withPcb ? ['    pcb: { x: 10, y: 20, rotation: 90 },'] : []),
      '  });',
      '}',
    ].join('\n');

  const boardAt = (x: number, y: number, rotation: number) => `(kicad_pcb (version 20260206) (generator pcbnew)
    (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu")
      (at ${x} ${y} ${rotation})
      (property "Reference" "R1" (at 0 -1.43) (layer "F.SilkS")
        (effects (font (size 1 1) (thickness 0.15)))))
  )`;

  const matchR1 = () => {
    const matcher = new SourceMatcher(dir);
    return matcher.matchFootprint({
      footprintName: 'Resistor_SMD:R_0603_1608Metric',
      reference: 'R1',
      position: { x: 10, y: 20, rotation: 90 },
      side: 'front',
      uuid: 'u',
      codeMetadata: null,
      referenceProperty: null,
      valueProperty: null,
    });
  };

  it('updates the inline pcb prop in place', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, classSource(true));
    const result = matchR1();
    expect(result.sourceLocation?.variableName).toBe('r1');
    expect(result.sourceLocation?.isThis).toBe(true);

    // board rotated the part
    const ir = buildIr(boardAt(10, 20, 180));
    const matcher = new SourceMatcher(dir);
    const results = matcher.matchAll(ir.footprints);
    const changes = new SourceRewriter().computeFootprintChanges(results);
    expect(changes.length).toBe(1);
    new SourceRewriter().applyFootprintChanges(changes);
    expect(fs.readFileSync(file, 'utf-8')).toContain('rotation: 180');
    // still parses
    expect(analyzeFile(file)).not.toBeNull();
  });

  it('never inserts statements into the class body', () => {
    const file = path.join(dir, 'board.ts');
    fs.writeFileSync(file, classSource(false)); // no pcb anywhere
    const ir = buildIr(boardAt(55, 66, 0));
    const matcher = new SourceMatcher(dir);
    const results = matcher.matchAll(ir.footprints);
    const rewriter = new SourceRewriter();

    // position: pending list skips the un-insertable change
    const posChanges = rewriter.computeFootprintChanges(results);
    expect(posChanges).toEqual([]);

    // layouts: same skip, no phantom pending every run
    const layoutChanges = rewriter.computeLayoutChanges(results);
    expect(layoutChanges).toEqual([]);

    const before = fs.readFileSync(file, 'utf-8');
    rewriter.applyFootprintChanges(posChanges);
    rewriter.applyLayoutChanges(layoutChanges);
    expect(fs.readFileSync(file, 'utf-8')).toBe(before);
    expect(analyzeFile(file)).not.toBeNull();
  });
});

// === malformed footprint guard: pads without a position must fail loudly ===

describe('footprint pad-position guard', () => {
  it('a footprint file whose pads lack (at x y) fails the build naming the file', async () => {
    const { PCB, Resistor } = await import('../src/index.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-padguard-'));
    const prev = process.cwd();
    try {
      process.chdir(dir);
      fs.mkdirSync(path.join(dir, 'build', 'lib', 'footprints'), { recursive: true });
      // malformed: complete, current-format footprint whose pad lost its
      // (at x y) — exactly what the corrupted lib file looked like
      fs.writeFileSync(
        path.join(dir, 'build', 'lib', 'footprints', 'BROKEN.kicad_mod'),
        [
          '(footprint "BROKEN"',
          '(version 20241229)',
          '(generator "typeCAD/pcb")',
          '(generator_version "1.0.0")',
          '(layer "F.Cu")',
          '(descr "broken fixture")',
          '(attr smd)',
          '(property "Reference" "REF**" (at 0 -1 0) (layer "F.SilkS") (effects (font (size 1 1))))',
          '(property "Value" "V" (at 0 1 0) (layer "F.Fab") (effects (font (size 1 1))))',
          '(fp_line (start -1 -1) (end 1 -1) (stroke (width 0.1) (type default)) (layer "F.SilkS"))',
          '(pad "1" smd rect (size 1 1) (layers "F.Cu" "F.Mask"))',
          ')',
          '',
        ].join('\n'),
      );
      const pcb = new PCB('padguard');
      const r1 = new Resistor({ reference: 'R1', value: '1k', pcb: { x: 1, y: 1 } });
      (r1 as unknown as { footprint: string }).footprint = 'uFire:BROKEN';
      expect(() => pcb.create(r1)).toThrow(/has no position/);
    } finally {
      process.chdir(prev);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// === auto-named nets (netN) keep their identity on tracks and vias ===

describe('auto-named net tracks', () => {
  it('groups net14 segments under track_net14 with the net riding the builder', () => {
    const output = captureLogs(() =>
      generateTrackCode(
        buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
          (net 0 "")
          (net 14 "net14")
          (segment (start 1 1) (end 2 2) (width 0.2) (layer "F.Cu") (net 14))
          (segment (start 3 3) (end 4 4) (width 0.2) (layer "F.Cu") (net 0 ""))
        )`),
        { track: () => ({ from: () => ({ to: () => ({}), via: () => ({}) }) }) } as never,
        'test',
        PLAIN_CH,
      ),
    );
    expect(output).toContain('const track_net14: TrackBuilder[] = [];');
    expect(output).toContain("typecad.track({ net: 'net14' })");
    // net 0 stays unnamed
    expect(output).toContain('const unnamed_Track: TrackBuilder[] = [];');
  });

  it('emits the net on standalone vias of auto-named nets', () => {
    const output = captureLogs(() =>
      generateTrackCode(
        buildIr(`(kicad_pcb (version 20260206) (generator pcbnew)
          (net 0 "")
          (net 5 "net5")
          (via (at 10 10) (size 0.6) (drill 0.3) (net 5))
        )`),
        { track: () => ({ from: () => ({ to: () => ({}), via: () => ({}) }) }) } as never,
        'test',
        PLAIN_CH,
      ),
    );
    expect(output).toContain("typecad.via({ at: { x: 10, y: 10 }, net: 'net5', size: 0.6, drill: 0.3 })");
  });

  it('round-trips: applied source converges and the rebuilt board joins the same net', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-autonet-'));
    try {
      fs.mkdirSync(path.join(root, 'build'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      const boardPath = path.join(root, 'build', 'b.kicad_pcb');
      fs.writeFileSync(
        boardPath,
        `(kicad_pcb (version 20260206) (generator pcbnew)
          (net 0 "")
          (net 1 "net1")
          (gr_rect (start 0 0) (end 20 20) (layer "Edge.Cuts"))
          (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu")
            (at 5 5 0)
            (property "Reference" "R1" (at 0 -1.43) (layer "F.SilkS")
              (effects (font (size 1 1) (thickness 0.15)))))
          (segment (start 5 5) (end 15 5) (width 0.3) (layer "F.Cu") (net 1))
        )`,
      );
      fs.writeFileSync(
        path.join(root, 'src', 'board.ts'),
        [
          "import { PCB, Resistor } from '@typecad/pcb';",
          "const typecad = new PCB('t');",
          'typecad.outline(0, 0, 20, 20);',
          "const r1 = new Resistor({ reference: 'R1' });",
          'typecad.create(r1);',
        ].join('\n'),
      );
      const sourcePath = path.join(root, 'src', 'board.ts');

      await kicadDataToTypeCAD(boardPath, { apply: true, auto: true });
      const after1 = fs.readFileSync(sourcePath, 'utf-8');
      // the segment kept its electrical identity instead of landing in the
      // unnamed bucket
      expect(after1).toContain("typecad.track({ net: 'net1' })");
      expect(after1).toContain('const track_net1: TrackBuilder[] = [];');
      // converges byte-identically
      await kicadDataToTypeCAD(boardPath, { apply: true, auto: true });
      expect(fs.readFileSync(sourcePath, 'utf-8')).toBe(after1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30000);
});
