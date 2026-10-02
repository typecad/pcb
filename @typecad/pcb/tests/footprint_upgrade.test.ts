import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  FOOTPRINT_FORMAT_VERSION,
  migrateFootprintSource,
  upgradeFootprintLibrary,
} from '../src/pcb/footprint_upgrade.js';

const LEGACY_MODULE = `(module "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu")
  (descr "Resistor SMD 0603")
  (tags "resistor")
  (tedit 5F68FEEE)
  (attr smd)
  (fp_text reference "REF**" (at 0 -1.43) (layer "F.SilkS")
    (effects (font (size 1 1) (thickness 0.15)))
  )
  (fp_text value "R" (at 0 1.43) (layer "F.Fab")
    (effects (font (size 1 1) (thickness 0.15)))
  )
  (fp_line (start -0.8 -0.4) (end 0.8 -0.4) (stroke (width 0.1) (type solid)) (layer "F.Fab"))
  (fp_circle (center 0 0) (end 0.5 0) (width 0.1) (layer "F.Fab"))
  (fp_text user "mark" (at 1 1) (layer "F.Fab"))
  (attr exclude_from_pos_files)
  (pad "1" smd roundrect (at -0.775 0) (size 0.9 0.95) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25))
  (pad "2" smd roundrect (at 0.775 0) (size 0.9 0.95) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25)
    (uuid "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"))
  (model "\${KICAD6_3DMODEL_DIR}/R_0603_1608Metric.wrl"
    (offset (xyz 0 0 0))
  )
)`;

const KICAD7 = `(footprint "Capacitor_SMD:C_0603_1608Metric" (version 20221018) (generator pcbnew)
  (layer "F.Cu")
  (attr smd)
  (fp_text reference "REF**" (at 0 -1.43) (layer "F.SilkS") hide
    (effects (font (size 1 1) (thickness 0.15)))
  )
  (fp_text value "C" (at 0 1.43 90) (layer "F.Fab"))
  (pad "1" smd roundrect (at -0.775 0) (size 0.9 0.95) (layers "B.Cu" "*.Mask" "F.Paste" "F.Cu" "B.Paste"))
)`;

const CURRENT = `(footprint "L1" (version ${FOOTPRINT_FORMAT_VERSION}) (generator "${GENERATOR_NAME}") (generator_version "${generatorVersion()}")
  (layer "F.Cu")
  (property "Reference" "REF**" (at 0 -1.43 0) (layer "F.SilkS") (uuid "11111111-2222-3333-4444-555555555555"))
)`;

/** whitespace-insensitive view, so assertions don't depend on layout style */
const flat = (s: string): string => s.replace(/\s+/g, '');
import { GENERATOR_NAME, generatorVersion } from '../src/utils/generator_identity.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fpupgrade-'));
}

describe('migrateFootprintSource', () => {
  it('migrates a KiCad 5 module to the current format', () => {
    const out = flat(migrateFootprintSource(LEGACY_MODULE, 'R1'));
    expect(out).toContain('(footprint"R1"');
    expect(out).toContain(`(version${FOOTPRINT_FORMAT_VERSION})`);
    expect(out).toContain(`(generator"${GENERATOR_NAME}")`);
    expect(out).toContain(`(generator_version"${generatorVersion()}")`);
    // fp_text → property, angle appended
    expect(out).toContain('(property"Reference""REF**"(at0-1.430)');
    expect(out).toContain('(property"Value""R"(at0-1.430)'.replace('0-1.430)', '01.430)'));
    // synthesized hidden properties
    expect(out.match(/\(property"Datasheet"/g)).toHaveLength(1);
    expect(out.match(/\(property"Description"/g)).toHaveLength(1);
    expect(out.match(/\(hideyes\)/g)).toHaveLength(2);
    // user text stays fp_text, gains angle
    expect(out).toContain('(fp_textuser"mark"(at110)');
    // attrs merged into one node
    expect(out).toContain('(attrsmdexclude_from_pos_files)');
    expect(out.match(/\(attr/g)).toHaveLength(1);
    // width → stroke on the circle; rect/circle gain fill
    expect(out).toContain('(stroke(width0.1)(typesolid))');
    expect(out).toContain('(fillno)');
    // no bare (width …) survives outside a stroke
    expect(out.match(/\(width/g)).toHaveLength(out.match(/stroke\(width/g).length);
    // pad layers canonicalized
    expect(out).toContain('(layers"F.Cu""F.Mask""F.Paste")');
    // uuids: kept when valid, generated otherwise (≥ reference, value, 2
    // synthesized, user text, line, circle, 2 pads)
    expect(out).toContain('(uuid"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")');
    expect((out.match(/\(uuid"/g) ?? []).length).toBeGreaterThanOrEqual(8);
    // stamps + model last
    expect(out).toContain('(duplicate_pad_numbers_are_jumpersno)');
    expect(out).toContain('(embedded_fontsno)');
    expect(out.lastIndexOf('(model')).toBeGreaterThan(out.lastIndexOf('(embedded_fonts'));
    expect(out).toContain('(offset(xyz000))');
  });

  it('migrates KiCad 7 texts (hide, angles) and wildcard pad layers', () => {
    const out = flat(migrateFootprintSource(KICAD7, 'C1'));
    // bare hide → (hide yes)
    expect(out).toContain('(hideyes)');
    // existing 3-arg at untouched
    expect(out).toContain('(at01.4390)');
    // value without effects gets the default font
    expect(out).toMatch(/\(property"Value""C"[\s\S]*?\(font\(size1\.271\.27\)\)/);
    // F+B compression to wildcards, wildcard order Cu, Paste, Mask
    expect(out).toContain('(layers"*.Cu""*.Paste""*.Mask")');
    // name ← file stem
    expect(out).toContain('(footprint"C1"');
  });

  it('passes current-format properties through with uuid preserved', () => {
    const out = flat(migrateFootprintSource(CURRENT, 'L1'));
    expect(out).toContain('(uuid"11111111-2222-3333-4444-555555555555")');
    // Value/Datasheet/Description synthesized after the kept Reference
    const refIdx = out.indexOf('(property"Reference"');
    const valIdx = out.indexOf('(property"Value"');
    expect(refIdx).toBeGreaterThan(-1);
    expect(valIdx).toBeGreaterThan(refIdx);
  });
});

describe('upgradeFootprintLibrary', () => {
  it('upgrades in place, skips current files, isolates errors', () => {
    const dir = tmpDir();
    const lib = path.join(dir, 'lib.pretty');
    fs.mkdirSync(lib);
    fs.writeFileSync(path.join(lib, 'R1.kicad_mod'), LEGACY_MODULE);
    fs.writeFileSync(path.join(lib, 'L1.kicad_mod'), CURRENT);
    fs.writeFileSync(path.join(lib, 'broken.kicad_mod'), '(not a footprint)');

    const result = upgradeFootprintLibrary(lib);
    expect(result.upgraded).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.files.find((f) => f.file === 'broken.kicad_mod')?.status).toBe('error');
    // the good files were still processed despite the broken one
    expect(flat(fs.readFileSync(path.join(lib, 'R1.kicad_mod'), 'utf8'))).toContain('(footprint"R1"');
    // the current file is byte-identical (untouched)
    expect(fs.readFileSync(path.join(lib, 'L1.kicad_mod'), 'utf8')).toBe(CURRENT);

    // second run: nothing left to do
    expect(upgradeFootprintLibrary(lib).upgraded).toBe(0);
    // force re-saves everything parseable
    expect(upgradeFootprintLibrary(lib, { force: true }).upgraded).toBe(2);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes to outDir instead of in place, refusing an existing dir', () => {
    const dir = tmpDir();
    const lib = path.join(dir, 'lib.pretty');
    fs.mkdirSync(lib);
    fs.writeFileSync(path.join(lib, 'R1.kicad_mod'), LEGACY_MODULE);

    const out = path.join(dir, 'out.pretty');
    expect(upgradeFootprintLibrary(lib, { outDir: out }).upgraded).toBe(1);
    expect(flat(fs.readFileSync(path.join(out, 'R1.kicad_mod'), 'utf8'))).toContain('(footprint"R1"');
    // input untouched
    expect(fs.readFileSync(path.join(lib, 'R1.kicad_mod'), 'utf8')).toBe(LEGACY_MODULE);

    expect(() => upgradeFootprintLibrary(lib, { outDir: out })).toThrow(/must not conflict/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('upgrades a single .kicad_mod file in place', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'X.kicad_mod');
    fs.writeFileSync(file, LEGACY_MODULE);
    expect(upgradeFootprintLibrary(file).upgraded).toBe(1);
    expect(flat(fs.readFileSync(file, 'utf8'))).toContain('(footprint"X"');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('canonicalizes the observed pad-layer matrix', () => {
    const cases: Array<[string[], string]> = [
      [['F.Cu', 'F.Paste', 'F.Mask'], '"F.Cu" "F.Mask" "F.Paste"'],
      [['B.Cu', 'B.Paste', 'B.Mask'], '"B.Cu" "B.Mask" "B.Paste"'],
      [['F.Cu', 'B.Cu'], '"*.Cu"'],
      [['F.Cu', 'F.Mask', 'B.Cu', 'B.Mask'], '"*.Cu" "*.Mask"'],
      [['*.Cu', '*.Mask'], '"*.Cu" "*.Mask"'],
      [['*.Cu'], '"*.Cu"'],
      [['F.Cu', 'F.Paste', 'F.Mask', 'B.Cu', 'B.Paste', 'B.Mask'], '"*.Cu" "*.Paste" "*.Mask"'],
      [['F.Cu'], '"F.Cu"'],
      [['B.Cu'], '"B.Cu"'],
      [['*.Cu', '*.Paste', '*.Mask'], '"*.Cu" "*.Paste" "*.Mask"'],
    ];
    for (const [input, expected] of cases) {
      const pad = `(pad "1" smd rect (at 0 0) (size 1 1) (layers ${input.map((l) => `"${l}"`).join(' ')}))`;
      const src = `(footprint "x" (layer "F.Cu")\n(fp_text reference "R" (at 0 0) (layer "F.SilkS"))\n${pad}\n)`;
      const out = flat(migrateFootprintSource(src, 'x'));
      expect(out, `layers ${input.join(' ')}`).toContain(`(layers${flat(expected)})`);
    }
  });
});
