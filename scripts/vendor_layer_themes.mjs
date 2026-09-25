// One-shot generator for the vendored layer themes: reads the upstream KiCad
// color-theme JSONs in src/gerber_viewer/themes/ and (re)emits the trimmed
// `<id>.ts` consts that themes.ts registers. Re-run after replacing any
// upstream JSON. Run from @typecad/pcb: node scripts/vendor_layer_themes.mjs
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const dir = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'src', 'gerber_viewer', 'themes');

/** id → { const, label, credit, license, licenseFile } */
const THEMES = {
  kicadmax: {
    const: 'KICADMAX',
    label: 'KiCadMaxColors',
    credit: 'Maxime Kahn — github.com/maximekahn/KiCadMaxColors',
    license: 'MIT',
    licenseFile: 'kicadmax-LICENSE-MIT',
  },
  witchhazel: {
    const: 'WITCHHAZEL',
    label: 'Witch Hazel',
    credit: 'Thea Flowers — github.com/theacodes/witchhazel',
    license: 'Apache-2.0',
    licenseFile: 'witchhazel-LICENSE-Apache-2.0',
  },
  'behave-dark': {
    const: 'BEHAVE_DARK',
    label: 'Behave Dark',
    credit: 'pointhi/kicad-color-schemes — behave theme (atom.io/themes/behave-theme)',
    license: 'CC0-1.0',
    licenseFile: 'kicad-color-schemes-LICENSE-CC0',
  },
  'blue-green-dark': {
    const: 'BLUE_GREEN_DARK',
    label: 'Blue-Green Dark',
    credit: 'pointhi — github.com/pointhi/kicad-color-schemes',
    license: 'CC0-1.0',
    licenseFile: 'kicad-color-schemes-LICENSE-CC0',
  },
  'eagle-dark': {
    const: 'EAGLE_DARK',
    label: 'Eagle Dark',
    credit: 'pointhi/kicad-color-schemes — designed by DX-MON, inspired by EagleCAD',
    license: 'CC0-1.0',
    licenseFile: 'kicad-color-schemes-LICENSE-CC0',
  },
  'kicad-2020': {
    const: 'KICAD_2020',
    label: 'KiCad 2020',
    credit: 'pointhi/kicad-color-schemes — the KiCad 6.0 default palette',
    license: 'CC0-1.0',
    licenseFile: 'kicad-color-schemes-LICENSE-CC0',
  },
  nord: {
    const: 'NORD',
    label: 'Nord',
    credit: 'pointhi/kicad-color-schemes — designed by @0xdec, nordtheme palette',
    license: 'CC0-1.0',
    licenseFile: 'kicad-color-schemes-LICENSE-CC0',
  },
};

/** Sort a parsed JSON value recursively (stable vendored output). */
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortDeep(value[k])]));
  }
  return value;
}

// ---- kicad-classic: convert the KiCad 5 pcbnew fragment to a v6 board ----
function convertClassic() {
  const raw = fs.readFileSync(path.join(dir, 'kicad-classic-pcbnew-legacy'), 'utf8');
  const colors = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_.]+)=rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(line.trim());
    if (m) colors.set(m[1], `rgb(${+m[2]}, ${+m[3]}, ${+m[4]})`);
  }
  const layer = (name) => colors.get(`Color4DPCBLayer_${name}`);
  // plain-item keys vary between KiCad 5 profiles (…Ex suffix or none)
  const plain = (name) => colors.get(`Color4D${name}Ex`) ?? colors.get(`Color4D${name}`);
  const copper = { f: layer('F.Cu'), b: layer('B.Cu') };
  for (let i = 1; i <= 30; i++) copper[`in${i}`] = layer(`In${i}.Cu`);
  const board = {
    anchor: plain('Anchor'),
    aux_items: plain('AuxItems'),
    b_adhes: layer('B.Adhes'),
    b_crtyd: layer('B.CrtYd'),
    b_fab: layer('B.Fab'),
    b_mask: layer('B.Mask'),
    b_paste: layer('B.Paste'),
    b_silks: layer('B.SilkS'),
    background: plain('PCBBackground'),
    cmts_user: layer('Cmts.User'),
    cursor: plain('PCBCursor'),
    dwgs_user: layer('Dwgs.User'),
    eco1_user: layer('Eco1.User'),
    eco2_user: layer('Eco2.User'),
    edge_cuts: layer('Edge.Cuts'),
    f_adhes: layer('F.Adhes'),
    f_crtyd: layer('F.CrtYd'),
    f_fab: layer('F.Fab'),
    f_mask: layer('F.Mask'),
    f_paste: layer('F.Paste'),
    f_silks: layer('F.SilkS'),
    footprint_text_back: plain('TxtBackEx'),
    footprint_text_front: plain('TxtFrontEx'),
    footprint_text_invisible: plain('TxtInvisEx'),
    grid: plain('Grid'),
    margin: layer('Margin'),
    no_connect: plain('NoNetPadMarker'),
    pad_plated_hole: plain('NonPlatedEx'),
    pad_through_hole: plain('PadThruHoleEx'),
    ratsnest: plain('RatsEx'),
    via_blind_buried: plain('ViaBBlindEx'),
    via_micro: plain('ViaMicroEx'),
    via_through: plain('ViaThruEx'),
    worksheet: plain('Worksheet'),
  };
  for (const [k, v] of Object.entries(board)) {
    if (!v) throw new Error(`kicad-classic conversion missed ${k}`);
  }
  for (const [k, v] of Object.entries(copper)) {
    if (!v) throw new Error(`kicad-classic conversion missed copper.${k}`);
  }
  return { meta: { name: 'kicad-classic', version: 0 }, board: sortDeep({ ...board, copper }) };
}

// ---- emit a theme's .ts from its JSON ----
function emit(id, meta, json, note) {
  const board = json.board;
  if (!board || !board.background || !board.copper?.f || !board.copper?.b) {
    throw new Error(`${id}: no usable board section (schematic-only themes are not vendored)`);
  }
  const header = `// Vendored from ${meta.credit} (${meta.license}). See ${meta.licenseFile} and README.md in this directory.
// Trimmed to the board section (copper + layer keys + background) for the viewer.${note ? '\n// ' + note : ''}
`;
  const body = JSON.stringify(
    { id, label: meta.label, credit: meta.credit, license: meta.license, background: board.background, board: sortDeep(board) },
    null,
    2,
  );
  const ts = `${header}export const ${meta.const} = ${body} as const;\n`;
  fs.writeFileSync(path.join(dir, `${id}.ts`), ts);
  console.log(`${id}.ts (${meta.const})`);
}

for (const [id, meta] of Object.entries(THEMES)) {
  emit(id, meta, JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')));
}
const classic = convertClassic();
emit(
  'kicad-classic',
  {
    const: 'KICAD_CLASSIC',
    label: 'KiCad Classic',
    credit: 'pointhi/kicad-color-schemes — the KiCad 5.x default palette',
    license: 'CC0-1.0',
    licenseFile: 'kicad-color-schemes-LICENSE-CC0',
  },
  classic,
  'Converted from the KiCad 5 pcbnew color fragment (kicad-classic-pcbnew-legacy) into the v6 board section.',
);
// the converted classic board section, kept beside the legacy fragment it came from
fs.writeFileSync(path.join(dir, 'kicad-classic.json'), `${JSON.stringify(classic, null, 2)}\n`);
