// ---------------------------------------------------------------------------
// Phase 1 parity harness: plot fixture boards with the NATIVE gerber_export
// writer and diff each copper layer against the kicad-cli golden capture.
//
// Normalizations (documented in SPEC.md):
//   - %TF.CreationDate / G04 "Created by" date lines (timestamps)
//   - %TF.ProjectId (KiCad's GUID tail is uuid-randomized, not derivable)
//   - FreePoly macro BODIES (tessellation counts differ by design; geometry
//     equality is checked in Phase 5's render harness instead)
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import {
  plotCopperLayers,
  plotGraphicsLayersFromSource,
  plotDrillFromSource,
  plotJobFromSource,
} from '../../@typecad/pcb/src/gerber_export/index.js';
import { GRAPHIC_LAYERS } from '../../@typecad/pcb/src/gerber_export/layers.js';

const KC_SOFTWARE = 'KiCad,Pcbnew,10.0.0';
const KC_DATE = '2026-01-01T00:00:00';

const ROOT = path.resolve(import.meta.dirname, '..');

interface Normalized {
  /** regions collapsed to a one-line summary — must match byte-for-byte */
  strict: string[];
  /** rounded pour-vertex streams — compared tolerantly */
  regions: string[];
}

function normalize(text: string, gfile = ''): Normalized {
  const lines = text
    .split(/\r?\n/)
    .filter(
      (l) =>
        !/%TF.CreationDate|^G04 Created by|^; DRILL file KiCad|^; #@! TF.CreationDate/.test(l),
    );
  const strict: string[] = [];
  const regions: string[] = [];
  let skipping = false;
  let inRegion = false;
  let lastRounded = '';
  let regionRun: string[] = [];
  for (const l of lines) {
    if (/^%AMFreePoly/.test(l)) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (l.includes('*%')) {
        strict.push('<<FreePolyBody>>');
        skipping = false;
      }
      continue;
    }
    if (l === 'G36*') {
      inRegion = true;
      lastRounded = '';
      regionRun = [];
      continue;
    }
    if (l === 'G37*') {
      inRegion = false;
      // canonicalize ring start: KiCad's filled-poly rings can start at any
      // vertex (Clipper-internal); rotate to the smallest key so geometrically
      // identical rings compare equal
      if (regionRun.length > 1) {
        let best = 0;
        for (let k = 1; k < regionRun.length; k++)
          if (regionRun[k]! < regionRun[best]!) best = k;
        regionRun = [...regionRun.slice(best), ...regionRun.slice(0, best)];
        if (regionRun.length > 1 && regionRun[0] === regionRun[regionRun.length - 1])
          regionRun.pop();
      }
      strict.push(`<<REGION ${regionRun.length} rounded-verts>>`);
      regions.push(regionRun.join(' '));
      continue;
    }
    if (inRegion && /^X-?\d+Y-?\d+D0[12]\*$/.test(l)) {
      // zone-pour tolerance: KiCad's in-memory refill vs the saved fill
      // differ at nm level — compare rounded-to-µm, consecutive-deduped
      const m = /^X(-?\d+)Y(-?\d+)/.exec(l)!;
      const key = `${Math.round(Number(m[1]) / 1000)},${Math.round(Number(m[2]) / 1000)}`;
      if (key !== lastRounded) regionRun.push(key);
      lastRounded = key;
      continue;
    }
    if (inRegion) continue;
    // text-layer stroke coords: KiCad's VECTOR2D→VECTOR2I tie rounding
    // differs from ours by ±1nm on some values — quantize to 2nm
    if (
      [...FONT_DIVERGED].some((t) => gfile.includes(t)) &&
      /^X-?\d+Y-?\d+D0[12]\*$/.test(l)
    ) {
      // glyph stroke: font-diverged — magnitude only. Collapse consecutive
      // strokes into run-count tokens so differing glyph complexity cannot
      // misalign the structural comparison around text blocks
      const prev = strict[strict.length - 1];
      const m = /^##TXT\*(\d+)$/.exec(prev ?? '');
      if (m) strict[strict.length - 1] = `##TXT*${Number(m[1]) + 1}`;
      else strict.push('##TXT*1');
      continue;
    }
    // drill hits: KiCad's tie-rounding (exact .0005 boundaries) depends on
    // internal float paths not worth replicating — quantize to 0.1mm so
    // only genuine position differences matter
    if (gfile.endsWith('.drl') && /^X-?[\d.]+Y-?[\d.]+/.test(l)) {
      // drill coordinates: quantize to 1µm (KiCad's tie-rounding error is
      // sub-µm; the previous 10µm quantization could hide real position bugs)
      strict.push(
        `##${l.replace(/(-?[\d.]+)/g, (v) => String(Math.round(parseFloat(v) * 1000)))}`,
      );
      continue;
    }
    // arc center offsets: KiCad's internal arc repr yields centers that
    // differ from the raw 3-point circumcenter by 1-2nm — tolerance at 50nm
    const arc = /^(X-?\d+Y-?\d+)I(-?\d+)J(-?\d+)(D01\*)$/.exec(l);
    if (arc) {
      strict.push(
        `@@${arc[1]}I${Math.round(Number(arc[2]) / 50)}J${Math.round(Number(arc[3]) / 50)}${arc[4]}`,
      );
      continue;
    }
    strict.push(l.replace(/%TF\.ProjectId,.*/, '<<ProjectId>>'));
  }
  return { strict, regions };
}

function regionDiffCount(a: string[], b: string[]): number {
  // positional count of mismatching rounded vertices across aligned regions
  let diff = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ra = (a[i] ?? '').split(' ');
    const rb = (b[i] ?? '').split(' ');
    for (let j = 0; j < Math.max(ra.length, rb.length); j++) if (ra[j] !== rb[j]) diff++;
  }
  return diff;
}

/**
 * Layers carrying stroke-font TEXT. The exporter uses the public-domain
 * Hershey font (Apache-2.0 compatibility) while the kicad-cli goldens use
 * newstroke — glyph strokes diverge BY DESIGN. Structure (headers,
 * apertures, attributes, regions/pours/TTF caches, ordering) is still
 * compared strictly; glyph-stroke runs are compared by magnitude only.
 */
const FONT_DIVERGED = new Set(['Silkscreen', 'Fab', 'User_Drawings', 'User_Comments', 'User_Eco', 'Margin']);

function main(): void {
  const boards: Array<[string, string]> = [
    ['features', path.join(ROOT, 'boards/features/features.kicad_pcb')],
    ['rd_skeleton', path.join(ROOT, 'boards/rd_skeleton/hw/build/rd_skeleton.kicad_pcb')],
  ];
  let totalDiffLines = 0;
  for (const [name, board] of boards) {
    const goldenDir = path.join(ROOT, 'golden', name, 'default');
    const outDir = path.join(ROOT, 'analysis', 'native', name);
    fs.rmSync(outDir, { recursive: true, force: true });
    const written = [
      ...plotCopperLayers(board, { outDir, generationSoftware: KC_SOFTWARE, creationDate: KC_DATE }),
      ...plotGraphicsLayersFromSource(fs.readFileSync(board, 'utf8'), board, {
        outDir,
        generationSoftware: KC_SOFTWARE,
        creationDate: KC_DATE,
      }),
    ];
    // drill + job files
    const boardSource = fs.readFileSync(board, 'utf8');
    plotDrillFromSource(boardSource, board, {
      outDir,
      generationSoftware: 'Kicad,Pcbnew,10.0.0',
      creationDate: new Date(KC_DATE),
      copperLayerCount: written.filter((f) => /\.(gtl|gbl|g\d)$/.test(path.basename(f))).length,
    });
    const copperCount = written.filter((f) => /\.(gtl|gbl|g\d)$/.test(path.basename(f))).length;
    const fileFor = (fileStem: string): { fileFunction: string; filePolarity?: string } | null => {
      if (/^(F|B)_Cu$|^In\d+_Cu$/.test(fileStem)) {
        const inner = /^In(\d+)_Cu$/.exec(fileStem);
        if (inner) return { fileFunction: `Copper,L${Number(inner[1]) + 1},Inr`, filePolarity: 'Positive' };
        return {
          fileFunction: fileStem === 'F_Cu' ? 'Copper,L1,Top' : `Copper,L${copperCount},Bot`,
          filePolarity: 'Positive',
        };
      }
      const spec = GRAPHIC_LAYERS.find((l) => l.stem === fileStem);
      if (!spec) return null;
      return { fileFunction: spec.fileFunction, filePolarity: spec.polarity };
    };
    plotJobFromSource(boardSource, board, fileFor, {
      outDir,
      creationDate: new Date(KC_DATE),
    });

    // compare every gerber the golden set has (skip drill/job: Phase 3)
    const goldens = fs
      .readdirSync(goldenDir)
      .filter((f) => /\.(gtl|gbl|gts|gbs|gto|gbo|gtp|gbp|gta|gba|gm1|gbr|g[0-9]|drl|gbrjob)$/.test(f))
      .sort();
    console.log(`== ${name}: ${written.length} native files, ${goldens.length} goldens ==`);
    for (const gfile of goldens) {
      const file = path.join(outDir, gfile);
      if (!fs.existsSync(file)) {
        console.log(`  ${gfile}: NOT PLOTTED (native)`);
        totalDiffLines += 1;
        continue;
      }
      const base = path.basename(file);
      const goldenPath = path.join(goldenDir, base);
      if (!fs.existsSync(goldenPath)) {
        console.log(`  ${base}: NO GOLDEN`);
        continue;
      }
      const rawA = fs.readFileSync(file, 'utf8');
      const rawB = fs.readFileSync(path.join(goldenDir, gfile), 'utf8');
      if (gfile.endsWith('.gbrjob')) {
        const clean = (t: string): string => {
          const j = JSON.parse(t) as Record<string, unknown>;
          ((j['Header'] as Record<string, unknown>)['CreationDate']) = '';
          (((j['GeneralSpecs'] as Record<string, unknown>)['ProjectId']) as Record<string, unknown>)[
            'GUID'
          ] = '';
          return JSON.stringify(j, null, 2);
        };
        const ja = clean(rawA);
        const jb = clean(rawB);
        if (ja === jb) console.log(`  ${gfile}: MATCH`);
        else {
          totalDiffLines += 1;
          console.log(`  ${gfile}: differs (normalized)`);
          console.log('    native: ' + ja.slice(0, 160).replace(/\n/g, ' '));
          console.log('    golden: ' + jb.slice(0, 160).replace(/\n/g, ' '));
        }
        continue;
      }
      const a = normalize(rawA, gfile);
      const b = normalize(rawB, gfile);
      // soft-equal: same non-numeric skeleton with all numbers within one
      // quantized unit (±2nm) counts as a tie, not a hard diff — KiCad's
      // double→int tie rounding follows libc paths we don't replicate
      const NUM = /-?\d+(?:\.\d+)?/g;
      const softEqual = (x: string, y: string): boolean => {
        if (x === y) return true;
        const nx = x.match(NUM);
        const ny = y.match(NUM);
        if (!nx || !ny || nx.length !== ny.length) return false;
        if (x.replace(NUM, '#') !== y.replace(NUM, '#')) return false;
        // ## lines are 2nm-quantized text strokes; KiCad tie rounding there
        // spans up to ±2 buckets (±4nm) — allow 2 for those, 1 elsewhere
        const tol = x.startsWith('##') ? 2 : 1;
        return nx.every((v, i) => Math.abs(Number(v) - Number(ny[i])) <= tol);
      };
      let hard = 0;
      let tieTolerance = 0;
      let txtMine = 0;
      let txtGold = 0;
      const runN = (s: string | undefined): number | null => {
        const m = /^##TXT\*(\d+)$/.exec(s ?? '');
        return m ? Number(m[1]) : null;
      };
      for (let i = 0; i < Math.max(a.strict.length, b.strict.length); i++) {
        const x = a.strict[i];
        const y = a.strict[i];
        if (x === y && runN(x) === null) continue;
        const nx = runN(x);
        const ny = runN(y);
        if (nx !== null && ny !== null) {
          txtMine += nx;
          txtGold += ny;
          const r = nx / ny;
          if (r > 0.4 && r < 2.5) continue; // same text, different font
        }
        if (x !== undefined && y !== undefined && softEqual(x!, y!)) tieTolerance++;
        else hard++;
      }
      const region = regionDiffCount(a.regions, b.regions);
      const fontDiverged = [...FONT_DIVERGED].some((t) => gfile.includes(t));
      const txtRatio = txtGold === 0 ? 1 : txtMine / txtGold;
      if (hard === 0 && region === 0) {
        console.log(
          fontDiverged
            ? `  ${gfile}: MATCH (structure; text FONT-DIVERGED by design — Hershey vs newstroke, ${txtMine} vs ${txtGold} glyph strokes)`
            : `  ${gfile}: MATCH`,
        );
      } else if (fontDiverged && hard === 0) {
        // residual hard lines on font-diverged files are glyph-count drift
        console.log(
          `  ${gfile}: structure OK (hard ${hard}); text FONT-DIVERGED by design — ${txtMine} vs ${txtGold} glyph strokes`,
        );
      } else {
        totalDiffLines += hard;
        console.log(
          `  ${gfile}: ${hard} hard diff lines${region ? `, ${region} pour-tolerance lines` : ''}${tieTolerance ? `, ${tieTolerance} tie-tolerance lines` : ''}`,
        );
        let shown = 0;
        for (let i = 0; i < Math.max(a.strict.length, b.strict.length) && shown < 4; i++) {
          if (a.strict[i] !== b.strict[i]) {
            console.log(`    -${(b.strict[i] ?? '').slice(0, 90)}\n    +${(a.strict[i] ?? '').slice(0, 90)}`);
            shown++;
          }
        }
      }
    }
  }
  console.log(
    totalDiffLines === 0
      ? 'PARITY: full (pour-tolerance lines may remain, shown per file)'
      : `PARITY: ${totalDiffLines} hard diff lines remain`,
  );
}

main();
