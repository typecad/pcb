import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GerberWriter } from '../gerber_writer.js';
import { plotCopperLayersFromSource } from '../copper.js';
import { plotGraphicsLayersFromSource } from '../layers.js';

const KC_INFO = {
  polarity: 'Positive' as const,
  projectName: 't',
  projectGuid: 'g',
  projectRevision: 'rev?',
  generationSoftware: 'KiCad,Pcbnew,10.0.0',
  creationDate: '2026-01-01T00:00:00',
};

describe('GerberWriter primitives', () => {
  it('formats 4.6 coordinates with no leading zeros', () => {
    const w = new GerberWriter();
    w.flash(w.aperture({ kind: 'C', dia: 1 }, 'Conductor'), { x: 16.825, y: -15 });
    const text = w.render({ ...KC_INFO, fileFunction: 'Copper,L1,Top' });
    expect(text).toContain('X16825000Y-15000000D03*');
  });

  it('formats aperture parameters with six decimals', () => {
    const w = new GerberWriter();
    w.aperture({ kind: 'RotRect', w: 2, h: 1, rot: 67 }, 'SMDPad,CuDef');
    const text = w.render({ ...KC_INFO, fileFunction: 'Copper,L1,Top' });
    expect(text).toContain('%ADD10RotRect,2.000000X1.000000X67.000000*%');
  });

  it('emits TA → ADD → TD triplets with the aperture list', () => {
    const w = new GerberWriter();
    w.aperture({ kind: 'C', dia: 0.6 }, 'ViaPad');
    const text = w.render({ ...KC_INFO, fileFunction: 'Copper,L1,Top' });
    expect(text).toContain('%TA.AperFunction,ViaPad*%\n%ADD10C,0.600000*%\n%TD*%');
  });

  it('emits G75 before every arc', () => {
    const w = new GerberWriter();
    w.moveTo({ x: 0, y: 0 });
    w.arcTo({ x: 4, y: 0 }, { x: 2, y: 0 }, true);
    w.arcTo({ x: 0, y: 0 }, { x: -2, y: 0 }, false);
    const text = w.render({ ...KC_INFO, fileFunction: 'Copper,L1,Top' });
    expect(text.match(/G75\*/g)).toHaveLength(2);
    expect(text).toContain('G02*\nX4000000Y0I2000000J0D01*\nG01*');
    expect(text).toContain('G03*');
  });
});

// rotation formulas verified against kicad-cli 10.0.0 golden output for a
// 1×3 oval and a 1.5×0.8 roundrect inside a footprint rotated 37°
describe('pad rotation conventions (golden-anchored)', () => {
  const TINY_BOARD = `
(kicad_pcb (version 20241229)
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (net 1 "SIG1")
  (footprint "T:A" (layer "F.Cu")
    (property "Reference" "XP1" (at 0 0 0) (layer "F.SilkS"))
    (at 62 63 37)
    (pad "1" smd oval (at 0 0 37) (size 1 3) (layers "F.Cu") (net 1 "SIG1"))
    (pad "2" smd roundrect (at 5 0 37) (size 1.5 0.8) (layers "F.Cu") (roundrect_rratio 0.25) (net 1 "SIG1"))
    (pad "3" smd custom (at 0 4 37) (size 0.5 0.5) (layers "F.Cu") (net 1 "SIG1")
      (primitives (gr_poly (pts (xy 0 0.5) (xy 1 0.5) (xy 0.5 1.5)) (width 0))))
  )
)`;

  function plotF(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gerber-export-'));
    plotCopperLayersFromSource(TINY_BOARD, path.join(dir, 'b.kicad_pcb'), { outDir: dir });
    return fs.readFileSync(path.join(dir, 'b-F_Cu.gtl'), 'utf8');
  }

  it('derives HorizOval end caps exactly as KiCad does', () => {
    const text = plotF();
    expect(text).toContain('%ADD10HorizOval,1.000000X-0.601815X0.798636X0.601815X-0.798636X0*%');
  });

  it('pre-rotates roundrect corner params to match KiCad', () => {
    const text = plotF();
    expect(text).toContain(
      'RoundRect,0.200000X-0.318887X-0.490725X0.559613X0.171271X0.318887X0.490725X-0.559613X-0.171271X0*%',
    );
  });

  it('applies footprint rotation to pad position with the position matrix', () => {
    const text = plotF();
    // pad 3 at local (0,4) under a 37° footprint flashes at the golden coords
    expect(text).toContain('X64407260Y-66194542D03*');
  });

  it('flashes custom-pad primitives but not the anchor', () => {
    const text = plotF();
    const flashes = text.match(/D03\*/g) ?? [];
    expect(flashes).toHaveLength(3); // oval + roundrect + one primitive
    expect(text).toContain('%TO.P,XP1,3*%');
  });
});

describe('net reference forms', () => {
  it('resolves legacy coded and kicad-cli name-only nets', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gerber-export-'));
    const source = `
(kicad_pcb (version 20241229)
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (net 1 "SIG1")
  (net "GND")
  (footprint "T:B" (layer "F.Cu") (property "Reference" "XP2" (at 0 0 0) (layer "F.SilkS")) (at 5 5)
    (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1 "SIG1"))
    (pad "2" smd rect (at 2 0) (size 1 1) (layers "F.Cu") (net "GND"))
    (pad "3" smd rect (at 4 0) (size 1 1) (layers "F.Cu")))
  (segment (start 1 1) (end 2 1) (width 0.3) (layer "F.Cu") (net "GND"))
)`;
    plotCopperLayersFromSource(source, path.join(dir, 'b.kicad_pcb'), { outDir: dir });
    const text = fs.readFileSync(path.join(dir, 'b-F_Cu.gtl'), 'utf8');
    expect(text).toContain('%TO.N,SIG1*%');
    expect(text).toContain('%TO.N,GND*%');
    expect(text).toContain('%TO.N,N/C*%'); // pad without any net reference
  });
});

describe('graphics layers (Phase 2)', () => {
  const BOARD = `
(kicad_pcb (version 20241229)
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (net 1 "SIG1")
  (gr_line (start 0 0) (end 5 0) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_circle (center 10 10) (end 13 10) (stroke (width 0.1) (type solid)) (fill none) (layer "F.Fab"))
  (footprint "T:R" (layer "F.Cu")
    (property "Reference" "R9" (at 0 0 0) (layer "F.SilkS"))
    (at 20 20 90)
    (fp_rect (start -1 -2) (end 1 2) (stroke (width 0.05) (type solid)) (layer "F.CrtYd"))
    (fp_circle (center 0 0) (end 1 0) (stroke (width 0.1) (type solid)) (fill yes) (layer "F.Adhes"))
    (pad "1" smd rect (at 0 0 90) (size 1 2) (layers "F.Cu" "F.Mask" "F.Paste") (net 1 "SIG1"))
  )
)`;

  function plot(): Map<string, string> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gerber-gfx-'));
    plotGraphicsLayersFromSource(BOARD, path.join(dir, 'b.kicad_pcb'), { outDir: dir });
    const out = new Map<string, string>();
    for (const f of fs.readdirSync(dir))
      if (f.endsWith('.gbr') || f.endsWith('.gm1') || f.endsWith('.gts') || f.endsWith('.gtp') || f.endsWith('.gta'))
        out.set(f, fs.readFileSync(path.join(dir, f), 'utf8'));
    return out;
  }

  it('emits Profile aperture attribute on Edge.Cuts only', () => {
    const out = plot();
    expect(out.get('b-Edge_Cuts.gm1')).toContain('%TA.AperFunction,Profile*%');
    expect(out.get('b-F_Courtyard.gbr')).not.toContain('Profile');
  });

  it('canonicalizes rect corners to min-first regardless of authoring', () => {
    const text = plot().get('b-F_Courtyard.gbr')!;
    // fp at (20,20) rotated 90° maps local (-1,-2)->(22,21): min corner
    expect(text).toContain('X18000000Y-19000000D02*');
  });

  it('renders unfilled circles at item radius, filled as fat-pen half-radius', () => {
    const fab = plot().get('b-F_Fab.gbr')!;
    expect(fab).toContain('I3000000J0D01*'); // r=3 semicircle, pen = width
    const adh = plot().get('b-F_Adhesive.gta')!;
    expect(adh).toContain('%ADD10C,1.050000*%'); // r=1, w=0.1 -> pen 1.05
    expect(adh).toContain('I525000J0D01*'); // path radius 0.525
  });

  it('derives mask openings from pads with TO.C groups', () => {
    const mask = plot().get('b-F_Mask.gts')!;
    expect(mask).toContain('%TF.FileFunction,Soldermask,Top*%');
    expect(mask).toContain('%TF.FilePolarity,Negative*%');
    expect(mask).toContain('D10*\n%TO.C,R9*%\nX20000000Y-20000000D03*');
  });

  it('uses the quirky user-layer FileFunctions', () => {
    const out = plot();
    expect(out.get('b-User_Drawings.gbr')).toContain('%TF.FileFunction,OtherDrawing,Comment*%');
    expect(out.get('b-User_Eco1.gbr')).toContain('%TF.FileFunction,Other,ECO1*%');
  });
});

import { getStrokeGlyph } from '../stroke_font.js';
import { renderStrokeText } from '../text.js';
import { plotDrillFromSource } from '../drill.js';
import { plotJobFromSource } from '../job.js';

describe('drill writer (Phase 3)', () => {
  const BOARD = `
(kicad_pcb (version 20241229)
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (net 1 "SIG1")
  (net 3 "GND")
  (via (at 31.0375 24.0375) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1))
  (via (at 70 82) (size 0.6) (drill 0.2) (layers "F.Cu" "B.Cu") (net 3))
  (footprint "T:X" (layer "F.Cu") (property "Reference" "X1" (at 0 0 0) (layer "F.SilkS")) (at 10 10 0)
    (pad "1" thru_hole oval (at 2 0 90) (size 1.2 2.4) (drill oval 0.6 1.8) (layers "*.Cu") (net 1 "SIG1"))
    (pad "" np_thru_hole circle (at -2 0) (size 1.6 1.6) (drill 1.6) (layers "*.Cu" "*.Mask"))
  )
)`;

  it('formats coordinates with KiCad tie-rounding and orders sections in two passes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gerber-drill-'));
    const out = plotDrillFromSource(BOARD, path.join(dir, 'b.kicad_pcb'), {
      outDir: dir,
      copperLayerCount: 2,
      creationDate: new Date('2026-01-01T00:00:00Z'),
    });
    const text = fs.readFileSync(out, 'utf8');
    // via tie (31.0375) truncates via the digit-wise nm parse
    expect(text).toContain('X31.037Y-24.037');
    // oval drill → routed slot on the rotated major axis
    expect(text).toMatch(/X1\d\.\d+Y-1[02]\.\d+G85X/);
    // NPTH tool present with its class attribute
    expect(text).toContain('NonPlated,NPTH,ComponentDrill');
    expect(text).toContain('T4C1.600'); // tools number sequentially, NPTH last
    // file function carries the copper span
    expect(text).toContain('TF.FileFunction,MixedPlating,1,2');
  });
});

describe('job writer (Phase 3)', () => {
  const BOARD = `
(kicad_pcb (version 20241229)
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (4 "In1.Cu" signal) (2 "B.Cu" signal))
  (segment (start 1 1) (end 5 1) (width 0.3) (layer "F.Cu") (net 1))
  (gr_line (start 10 10) (end 40 10) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 40 10) (end 40 40) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 40 40) (end 10 40) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 10 40) (end 10 10) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (setup (stackup (layer "F.SilkS" (type "Top Silk Screen") (color "White") (material "Liquid Photo")) (layer "F.Cu" (type "copper") (thickness 0.035)) (layer "dielectric 1" (type "prepreg") (thickness 0.22) (material "FR4")) (layer "In1.Cu" (type "copper") (thickness 0.035)) (layer "dielectric 2" (type "core") (thickness 1) (material "FR4")) (layer "B.Cu" (type "copper") (thickness 0.035)) (copper_finish "None")))
)`;

  const fileFor = (stem: string): { fileFunction: string; filePolarity?: string } | null =>
    stem === 'F_Cu'
      ? { fileFunction: 'Copper,L1,Top', filePolarity: 'Positive' }
      : stem === 'In1_Cu'
        ? { fileFunction: 'Copper,L2,Inr', filePolarity: 'Positive' }
        : stem === 'B_Cu'
          ? { fileFunction: 'Copper,L3,Bot', filePolarity: 'Positive' }
          : null;

  it('derives size, design rules, stackup and file attributes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gerber-job-'));
    const out = plotJobFromSource(BOARD, path.join(dir, 'b.kicad_pcb'), fileFor, {
      outDir: dir,
      creationDate: new Date('2026-01-01T00:00:00Z'),
    });
    const job = JSON.parse(fs.readFileSync(out, 'utf8'));
    // bbox 10..40 expanded by half the 0.1 stroke on each side
    expect(job.GeneralSpecs.Size).toEqual({ X: 30.1, Y: 30.1 });
    expect(job.GeneralSpecs.LayerNumber).toBe(3);
    expect(job.GeneralSpecs.Finish).toBe('None');
    // min track width 0.3 on outer; inner rules present for a 3-layer board
    const inner = job.DesignRules.find((r: { Layers: string }) => r.Layers === 'Inner');
    expect(job.DesignRules[0].MinLineWidth).toBe(0.3);
    expect(inner).toBeDefined();
    // dielectric thicknesses keep their decimal point after JSON round-trip
    expect(job.MaterialStackup).toContainEqual({ Type: 'Copper', Thickness: 0.035, Name: 'In1.Cu' });
    expect(job.MaterialStackup[0]).toEqual({ Type: 'Legend', Color: 'White', Material: 'Liquid Photo', Name: 'Top Silk Screen' });
  });

  it('synthesizes the default stackup for boards without one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gerber-job2-'));
    const bare = `
(kicad_pcb (version 20241229)
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (gr_line (start 10 10) (end 40 10) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 40 10) (end 40 40) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 40 40) (end 10 40) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 10 40) (end 10 10) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
)`;
    const out = plotJobFromSource(bare, path.join(dir, 'b.kicad_pcb'), fileFor, { outDir: dir });
    const job = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(job.MaterialStackup).toHaveLength(9);
    expect(job.MaterialStackup[4].Thickness).toBe(1.51);
  });
});

// stroke-font decode + text rendering conventions verified against KiCad 10
// goldens (gerber_spec probes): (size H W) file order, y-up glyph frame with
// FONT_OFFSET -8 baseline at ~-0.95, cap-middle justify offsets, nm-trunc
describe('stroke text (Phase 4)', () => {
  it('decodes the public-domain Hershey glyph space', () => {
    const h = getStrokeGlyph(0x48)!;
    const ys = h.contours.flat().filter((_, i) => i % 2 === 1);
    // 'H': 3 strokes spanning the full cap box [-0.95, +0.05]
    expect(Math.min(...ys)).toBeCloseTo(-0.95, 2);
    expect(Math.max(...ys)).toBeCloseTo(0.05, 2);
    expect(h.contours).toHaveLength(3);
    expect(getStrokeGlyph(0x20)!.contours).toHaveLength(0);
    // non-ASCII falls back to '?' rather than vanishing
    expect(getStrokeGlyph(0xe9)!.contours.length).toBeGreaterThan(0);
  });

  it('renders STROKE with the Hershey font (regression snapshot)', () => {
    const w = new GerberWriter();
    renderStrokeText(w, {
      text: 'STROKE', at: { x: 52, y: 48 }, angle: 0,
      size: { x: 1.5, y: 0.8 }, thickness: 0.3,
      hJustify: 'center', vJustify: 'center',
      pen: 0.2, // ClampTextPenSize: min(0.3, W/4)
    });
    const text = w.render({ fileFunction: 'Legend,Top', polarity: 'Positive', projectName: 't', projectGuid: 'g', projectRevision: 'r', generationSoftware: 'x,x,x', creationDate: '2026-01-01' });
    // first stroke of 'S' + total segment count pinned to the Hershey data
    expect(text).toContain('X50933360Y-48472750D02*');
    const segs = text.match(/D02\*/g) ?? [];
    expect(segs).toHaveLength(59);
  });

  it('applies the condensed-width vertical correction', () => {
    // probe-verified anchoring: sy=1.5, w=0.8 -> cursor 0.6121 above the
    // anchor; 'H' cap top at cursor + 0.05*1.5 = 100.6871
    const w = new GerberWriter();
    renderStrokeText(w, {
      text: 'H', at: { x: 20, y: 100 }, angle: 0,
      size: { x: 1.5, y: 0.8 }, thickness: 0.3,
      hJustify: 'center', vJustify: 'center',
    });
    const text = w.render({ fileFunction: 'Legend,Top', polarity: 'Positive', projectName: 't', projectGuid: 'g', projectRevision: 'r', generationSoftware: 'x,x,x', creationDate: '2026-01-01' });
    expect(text).toContain('Y-100687100');
  });

  it('skips hidden properties (symbol-valued hide tokens)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gerber-tx-'));
    const board = `
(kicad_pcb (version 20241229)
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (footprint "T:H" (layer "F.Cu") (property "Reference" "R1" (at 0 0 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
    (property "KiLib_Generator" "SMD_2terminal_chip_molded" (at 0 0 0) (layer "F.SilkS") (hide yes))
    (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu" "F.Mask" "F.Paste")))
)`;
    plotGraphicsLayersFromSource(board, path.join(dir, 'b.kicad_pcb'), { outDir: dir });
    const silk = fs.readFileSync(path.join(dir, 'b-F_Silkscreen.gto'), 'utf8');
    // R1's text renders; the hidden KiLib_Generator property must not
    const strokes = silk.match(/D0[12]/g) ?? [];
    expect(strokes.length).toBeGreaterThan(10);
    const d02 = (silk.match(/D02\*/g) ?? []).length;
    const d01 = (silk.match(/D01\*/g) ?? []).length;
    expect(d01).toBeGreaterThanOrEqual(d02);
  });

  it('indexes gr_text vs property text correctly and substitutes placeholders', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gerber-tx2-'));
    const board = `
(kicad_pcb (version 20241229)
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (gr_text "GR" (at 10 10 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
  (footprint "T:S" (layer "F.Cu") (property "Reference" "S1" (at 0 0 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
    (fp_text user "\${REFERENCE}" (at 0 0 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
    (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu" "F.Mask" "F.Paste")))
)`;
    plotGraphicsLayersFromSource(board, path.join(dir, 'b.kicad_pcb'), { outDir: dir });
    const silk = fs.readFileSync(path.join(dir, 'b-F_Silkscreen.gto'), 'utf8');
    // "GR" renders (raw[1] for gr_text), and "S1" renders TWICE (property +
    // substituted fp_text) — not the literal ${REFERENCE}
    const d02 = (silk.match(/D02\*/g) ?? []).length;
    expect(d02).toBeGreaterThan(20);
    expect(silk.includes('REFERENCE')).toBe(false);
  });

  it('renders TTF render_caches as regions only', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gerber-ttf-'));
    const board = `
(kicad_pcb (version 20241229)
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (gr_text "AB" (at 10 10 0) (layer "F.SilkS")
    (effects (font (face "Arial") (size 2 2) (thickness 0.3)))
    (render_cache "AB" 0
      (polygon (pts (xy 10.1 10.1) (xy 10.9 10.1) (xy 10.9 10.9) (xy 10.1 10.9)))))
)`;
    plotGraphicsLayersFromSource(board, path.join(dir, 'b.kicad_pcb'), { outDir: dir });
    const silk = fs.readFileSync(path.join(dir, 'b-F_Silkscreen.gto'), 'utf8');
    expect(silk).toContain('G36*');
    expect(silk.match(/D03\*/g) ?? []).toHaveLength(0);
  });
});
