import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { PCB } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';

import { teardropWedge, resolveTeardrops } from '../src/pcb/pcb_teardrops.js';

const buildDir = './build';

class Connector extends Component {
  constructor() {
    super('Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical');
  }
}
class Resistor extends Component {
  constructor() {
    super('Resistor_SMD:R_0603_1608Metric');
  }
}

describe('pcb.arc()', () => {
  const boardName = 'arc_test';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
  });
  afterEach(() => {
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName}.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });

  it('writes a gr_arc with the three given points', () => {
    const pcb = new PCB(boardName);
    pcb.arc({
      start: { x: 10, y: 10 },
      mid: { x: 10 + 5 * Math.cos(Math.PI / 4), y: 10 + 5 * Math.sin(Math.PI / 4) },
      end: { x: 15, y: 10 },
      layer: 'F.SilkS',
      width: 0.15,
    });
    pcb.create();

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(board).toContain('gr_arc');
    expect(board).toMatch(/\(start 10 10\)/);
    expect(board).toMatch(/\(end 15 10\)/);
    expect(board).toContain('(layer "F.SilkS")');
  });

  it('rejects identical start/mid/end without creating anything', () => {
    const pcb = new PCB(boardName);
    pcb.arc({ start: { x: 1, y: 1 }, mid: { x: 1, y: 1 }, end: { x: 1, y: 1 }, layer: 'F.SilkS' });
    pcb.create();
    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(board).not.toContain('gr_arc');
  });
});

describe('teardropWedge geometry', () => {
  const center = { x: 0, y: 0 };
  const dir = { x: 1, y: 0 }; // track leaving along +x
  const opts = { padRadiusMm: 0.3, trackWidthMm: 0.2, lengthMm: 1.0, shape: 'round' as const };

  it('round shape produces two segments per side converging at the tip', () => {
    const segs = teardropWedge(center, dir, opts);
    expect(segs).toHaveLength(4);
    const tips = segs.map((s) => s.end);
    // both sides converge at the same tip; length clamps to 2 x pad radius = 0.6
    expect(tips.filter((t) => Math.abs(t.x - 0.6) < 1e-9 && Math.abs(t.y) < 1e-9)).toHaveLength(2);
    // base points sit on the pad edge, above and below the track
    const bases = segs.map((s) => s.start);
    expect(bases.some((b) => Math.abs(b.y - 0.3) < 1e-9)).toBe(true);
    expect(bases.some((b) => Math.abs(b.y + 0.3) < 1e-9)).toBe(true);
  });

  it('rect shape produces one segment per side', () => {
    const segs = teardropWedge(center, dir, { ...opts, shape: 'rect' });
    expect(segs).toHaveLength(2);
  });

  it('clamps the wedge length to roughly the pad diameter', () => {
    const segs = teardropWedge(center, dir, { ...opts, lengthMm: 10 });
    const tipX = Math.max(...segs.map((s) => Math.max(s.start.x, s.end.x)));
    expect(tipX).toBeLessThanOrEqual(0.6 + 1e-9); // 2 * padRadius
  });
});

describe('pcb.teardrops()', () => {
  const boardName = 'teardrop_test';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
  });
  afterEach(() => {
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName}.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });

  it('defaults to disabled and resolves options when called', () => {
    const pcb = new PCB(boardName);
    expect(pcb.teardropConfig.enabled).toBe(false);
    pcb.teardrops({ maxLength: 0.8, shape: 'rect' });
    expect(pcb.teardropConfig.enabled).toBe(true);
    expect(pcb.teardropConfig.maxLength).toBe(0.8);
    expect(pcb.teardropConfig.shape).toBe('rect');
    expect(resolveTeardrops(undefined).enabled).toBe(true);
  });

  it('writes teardrop settings to the .kicad_pro', () => {
    const pcb = new PCB(boardName);
    pcb.teardrops();
    pcb.create();
    const pro = JSON.parse(fs.readFileSync(`${buildDir}/${boardName}.kicad_pro`, 'utf8'));
    const ds = pro.board.design_settings;
    expect(ds.teardrop_options[0].td_onvia).toBe(true);
    expect(ds.teardrop_parameters).toHaveLength(3);
    expect(ds.teardrop_parameters[0].td_target_name).toBe('td_round_shape');
    expect(ds.teardrop_parameters[0].td_maxlen).toBe(1.0);
  });

  it('writes no teardrop settings when not opted in', () => {
    const pcb = new PCB(boardName);
    pcb.create();
    const pro = JSON.parse(fs.readFileSync(`${buildDir}/${boardName}.kicad_pro`, 'utf8'));
    expect(pro.board.design_settings.teardrop_options).toBeUndefined();
  });

  it('generates wedge geometry at router vias', { timeout: 120_000 }, async () => {
    const build = (withTeardrops: boolean) => {
      const pcb = new PCB(boardName + (withTeardrops ? '_td' : '_n'), { layers: 4 });
      pcb.outline(0, 0, 40, 30);
      const r1 = new Resistor();
      const r2 = new Resistor();
      r1.pcb.x = 10;
      r1.pcb.y = 10;
      r1.pcb.rotation = 0;
      r2.pcb.x = 28;
      r2.pcb.y = 12;
      r2.pcb.rotation = 0;
      pcb.add(r1, r2);
      const net = pcb.net(r1.pin(1), r2.pin(1));
      if (withTeardrops) pcb.teardrops();
      // SMD-to-SMD across layers forces two vias
      const result = pcb.route(net, { layers: ['In1.Cu'], gridResolution: 0.1, heuristicWeight: 2 });
      pcb.waitForPendingAutoroutes();
      pcb.create(r1, r2);
      const board = fs.readFileSync(`${buildDir}/${boardName}${withTeardrops ? '_td' : '_n'}.kicad_pcb`, 'utf8');
      const segments = (board.match(/\(segment/g) ?? []).length;
      for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
        try {
          fs.rmSync(`${buildDir}/${boardName}${withTeardrops ? '_td' : '_n'}.${ext}`);
        } catch {
          /* ignore */
        }
      }
      return { success: result.success, segments };
    };

    const plain = build(false);
    const withTd = build(true);
    expect(plain.success).toBe(true);
    expect(withTd.success).toBe(true);
    // 2 vias × 2 junctions × 2 sides × 2 segments (round shape) = 16 extra
    expect(withTd.segments).toBeGreaterThan(plain.segments);
    expect(withTd.segments - plain.segments).toBeGreaterThanOrEqual(8);
  });
});

describe('pcb.stitch()', () => {
  const boardName = 'stitch_test';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
  });
  afterEach(() => {
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName}.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });

  it('stitches a net across the board, avoiding existing copper', () => {
    const pcb = new PCB(boardName, { layers: 4 });
    pcb.outline(0, 0, 40, 30);
    pcb.plane('GND', 'In2.Cu');

    const c1 = new Connector();
    const c2 = new Connector();
    c1.pcb.x = 10;
    c1.pcb.y = 10;
    c2.pcb.x = 28;
    c2.pcb.y = 10;
    pcb.add(c1, c2);
    const gnd = pcb.named('GND').net(c1.pin(2), c2.pin(2));
    const signal = pcb.net(c1.pin(1), c2.pin(1));
    pcb.route(signal, { gridResolution: 0.1, heuristicWeight: 2 });
    pcb.waitForPendingAutoroutes();

    pcb.stitch('GND', { pitch: 2.0 });
    pcb.create(c1, c2);

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    const viaCount = (board.match(/\(via\s+\(at/g) ?? []).length;
    expect(viaCount).toBeGreaterThan(0);
  });

  it('same-net pours do not block, but tracks and pads do reduce the count', () => {
    const pcb = new PCB(boardName, { layers: 4 });
    pcb.outline(0, 0, 40, 30);
    pcb.plane('GND', 'In2.Cu');
    // a GND pour covering the whole top layer: same net, must not block
    pcb.zone({ net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 40, height: 30 });
    const c1 = new Connector();
    c1.pcb.x = 20;
    c1.pcb.y = 15;
    pcb.add(c1);
    pcb.named('GND').net(c1.pin(2));
    pcb.create(c1);

    pcb.stitch('GND', { pitch: 2.0, area: { x: 2, y: 2, width: 36, height: 26 } });
    pcb.create(c1);
    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    const viaCount = (board.match(/\(via\s+\(at/g) ?? []).length;
    // a 2mm grid over 36x26 ≈ 19 × 14 = 266 candidates; the through-hole
    // connector pads block only a handful
    expect(viaCount).toBeGreaterThan(250);
  });

  it('validates inputs', () => {
    const pcb = new PCB(boardName, { layers: 4 });
    pcb.outline(0, 0, 40, 30);
    expect(() => pcb.stitch('GND', { layers: ['In9.Cu'] })).toThrow(RangeError);
    expect(() => pcb.stitch('GND', { pitch: 0 })).toThrow(RangeError);
    expect(() => pcb.stitch('')).toThrow(RangeError);

    // no outline yet: declaration is fine, create() surfaces the error
    const bare = new PCB(boardName + '_b');
    expect(() => bare.stitch('GND')).not.toThrow();
    expect(() => bare.create()).toThrow(/area|outline/);
  });
});

describe('review regressions: stitching and teardrops', () => {
  const boardName = 'review_regress';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
  });
  afterEach(() => {
    for (const name of [boardName, boardName + '_s', boardName + '_d']) {
      for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
        try {
          fs.rmSync(`${buildDir}/${name}.${ext}`);
        } catch {
          /* ignore */
        }
      }
    }
  });

  it('stitch vias honor a partial layer span, not just the collision check', () => {
    const pcb = new PCB(boardName + '_s', { layers: 4 });
    pcb.outline(0, 0, 20, 20);
    const c = new Connector();
    c.pcb.x = 10;
    c.pcb.y = 10;
    pcb.add(c);
    pcb.named('GND').net(c.pin(2));
    pcb.stitch('GND', { pitch: 2.0, layers: ['F.Cu', 'In1.Cu'] });
    pcb.create(c);

    const board = fs.readFileSync(`${buildDir}/${boardName}_s.kicad_pcb`, 'utf8');
    // emitted vias must span F.Cu→In1.Cu (blind), never F.Cu→B.Cu
    expect(board).toContain('(layers "F.Cu" "In1.Cu")');
    expect(board).not.toContain('(layers "F.Cu" "B.Cu")');
  });

  it('rejects a pitch smaller than the via diameter plus clearance', () => {
    const pcb = new PCB(boardName, { layers: 4 });
    pcb.outline(0, 0, 20, 20);
    // 0.6mm via + 0.2mm clearance needs pitch >= 0.8
    expect(() => pcb.stitch('GND', { pitch: 0.5, area: { x: 1, y: 1, width: 10, height: 10 } })).toThrow(/too small/);
  });

  it('teardrop wedges survive deferred staging', { timeout: 120_000 }, () => {
    const build = (defer: boolean) => {
      const pcb = new PCB(boardName + '_d', { layers: 4 });
      pcb.outline(0, 0, 40, 30);
      pcb.teardrops();
      const r1 = new Resistor();
      const r2 = new Resistor();
      r1.pcb.x = 10;
      r1.pcb.y = 10;
      r2.pcb.x = 28;
      r2.pcb.y = 12;
      pcb.add(r1, r2);
      const net = pcb.net(r1.pin(1), r2.pin(1));
      const result = pcb.route(net, {
        layers: ['In1.Cu'],
        gridResolution: 0.1,
        heuristicWeight: 2,
        deferStaging: defer,
      } as any);
      pcb.waitForPendingAutoroutes();
      pcb.create(r1, r2);
      const board = fs.readFileSync(`${buildDir}/${boardName}_d.kicad_pcb`, 'utf8');
      return { success: result.success, segments: (board.match(/\(segment/g) ?? []).length };
    };

    const immediate = build(false);
    const deferred = build(true);
    expect(immediate.success).toBe(true);
    expect(deferred.success).toBe(true);
    // wedges must appear in both modes — deferred staging used to lose them
    expect(deferred.segments).toBe(immediate.segments);
    expect(immediate.segments).toBeGreaterThan(2);
  });
});

describe('stitch avoids components (rd_skeleton regression)', () => {
  const boardName = 'stitch_body';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
  });
  afterEach(() => {
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName}.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });

  it('does not place vias on a component that is only net-registered', () => {
    // Exact rd_skeleton shape: the component is never pcb.add()ed — only
    // net()ed — so it must be discovered from the schematic.
    const pcb = new PCB(boardName);
    const r1 = new Resistor();
    r1.pcb = { x: 137.4, y: 90.9, rotation: 0 } as any;
    pcb.named('GND').net(r1.pin(1));
    pcb.outline(127.38, 85.9, 45, 30);
    pcb.zone({ net: 'GND', x: 127.38, y: 85.9, width: 45, height: 30, layers: ['F.Cu', 'B.Cu'] });

    pcb.stitch('GND', { pitch: 5, margin: 5 });
    pcb.create(r1);

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    const vias = [...board.matchAll(/\(via\s+\(at\s+([\d.]+)\s+([\d.]+)\)/g)].map((m) => ({
      x: parseFloat(m[1]),
      y: parseFloat(m[2]),
    }));

    // no stitch via within the 0603 body (+0.5mm slack) around r1
    const onBody = vias.filter((v) => Math.abs(v.x - 137.4) < 1.5 && Math.abs(v.y - 90.9) < 1.5);
    expect(onBody).toEqual([]);
  });
});

describe('component text fonts (face/bold/italic)', () => {
  const boardName = 'font_test';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
  });
  afterEach(() => {
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName}.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });

  it('applies font/bold/italic to reference and value layouts', () => {
    const pcb = new PCB(boardName);
    const r1 = new Resistor();
    r1.pcb = { x: 10, y: 10 } as any;
    r1.referenceLayout = { x: 0, y: -1.5, font: 'Arial', bold: true, height: 1.2, width: 1.2 };
    r1.valueLayout = { x: 0, y: 1.5, font: 'Consolas', italic: true };
    pcb.add(r1);
    pcb.create(r1);

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    const refIdx = board.indexOf('(property "Reference"');
    const refSeg = board.slice(refIdx, board.indexOf('(property', refIdx + 1));
    expect(refSeg).toContain('(face "Arial")');
    expect(refSeg).toMatch(/\bbold\b/);
    expect(refSeg).toContain('(size 1.2 1.2)');

    const valIdx = board.indexOf('(property "Value"');
    const nextProp = board.indexOf('(property', valIdx + 1);
    const valSeg = board.slice(valIdx, nextProp > 0 ? nextProp : valIdx + 500);
    expect(valSeg).toContain('(face "Consolas")');
    expect(valSeg).toMatch(/\bitalic\b/);
    // symbols, not quoted strings
    expect(board).not.toContain('"bold"');
    expect(board).not.toContain('"italic"');
  });

  it('pcb.text font emits a face', () => {
    const pcb = new PCB(boardName);
    pcb.text({ text: 'LABEL', x: 5, y: 5, layer: 'F.SilkS', font: 'Arial' });
    pcb.create();
    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(board).toContain('(face "Arial")');
  });
});

describe('stitch avoids text (rd_skeleton regression)', () => {
  const boardName = 'stitch_text';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
  });
  afterEach(() => {
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName}.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });

  it('does not place vias through pcb.text() or reference designators', () => {
    const pcb = new PCB(boardName);
    pcb.outline(127.38, 85.9, 45, 30);
    pcb.zone({ net: 'GND', x: 127.38, y: 85.9, width: 45, height: 30, layers: ['F.Cu', 'B.Cu'] });

    const r1 = new Resistor();
    r1.pcb = { x: 137.4, y: 90.9, rotation: 0 } as any;
    r1.referenceLayout = { x: 0, y: -2.5, font: 'OCR A Std', height: 1.2, width: 1.2 };
    pcb.named('GND').net(r1.pin(1));

    // long text across a row of stitch candidates
    pcb.text({ text: 'OCR A Std 0123', x: 150, y: 112, layer: 'F.SilkS', font: 'OCR A Std', width: 1.5, height: 1.5 });

    pcb.stitch('GND', { pitch: 5, margin: 5 });
    pcb.create(r1);

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    const vias = [...board.matchAll(/\(via\s+\(at\s+([\d.]+)\s+([\d.]+)\)/g)].map((m) => ({
      x: parseFloat(m[1]),
      y: parseFloat(m[2]),
    }));

    // KiCad anchors gr_text at its CENTER (default justify): 14 glyphs x 1.5
    // x 0.95 advance = 19.95mm wide centered at (150, 112) → box ~[140, 160]
    const onText = vias.filter((v) => v.x >= 139.5 && v.x <= 161 && v.y >= 109.6 && v.y <= 113.4);
    expect(onText).toEqual([]);

    // reference: center-anchored at board (137.4, 88.4), "R1" at 1.2mm
    const onRef = vias.filter((v) => v.x >= 135.8 && v.x <= 139 && v.y >= 87.2 && v.y <= 89.6);
    expect(onRef).toEqual([]);
  });
});

describe('stitch avoids mounting holes (rd_skeleton regression)', () => {
  const boardName = 'stitch_hole';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
  });
  afterEach(() => {
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName}.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });

  it('keeps vias out of the full footprint extent of netless mechanical parts', () => {
    // Mounting hole has NO net and is only pcb.add()ed — invisible to net
    // discovery. Its pad is drill-sized (2.7mm); the keep-clear zone is the
    // footprint's graphical extent (fp_circle r=2.7 → 5.4mm square).
    const pcb = new PCB(boardName);
    pcb.outline(127.38, 85.9, 45, 30);
    pcb.zone({ net: 'GND', x: 127.38, y: 85.9, width: 45, height: 30, layers: ['F.Cu', 'B.Cu'] });

    const r1 = new Resistor();
    r1.pcb = { x: 137.4, y: 90.9 } as any;
    pcb.named('GND').net(r1.pin(1));

    class MountingHole extends Component {
      constructor() {
        super('MountingHole:MountingHole_2.7mm_M2.5');
      }
    }
    const mh1 = new MountingHole();
    mh1.pcb = { x: 135.33, y: 93.85 } as any;
    const mh2 = new MountingHole();
    mh2.pcb = { x: 164.43, y: 107.95 } as any;
    pcb.add(mh1, mh2);

    pcb.stitch('GND', { pitch: 5, margin: 5 });
    pcb.create(r1, mh1, mh2);

    const board = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    const vias = [...board.matchAll(/\(via\s+\(at\s+([\d.]+)\s+([\d.]+)\)/g)].map((m) => ({
      x: parseFloat(m[1]),
      y: parseFloat(m[2]),
    }));

    // full extent: center ± 2.7 (fp_circle), blocked within +0.5 (ring+clearance)
    for (const [hx, hy] of [
      [135.33, 93.85],
      [164.43, 107.95],
    ]) {
      const inside = vias.filter((v) => Math.abs(v.x - hx) < 2.7 + 0.5 && Math.abs(v.y - hy) < 2.7 + 0.5);
      expect(inside).toEqual([]);
    }
  });
});
