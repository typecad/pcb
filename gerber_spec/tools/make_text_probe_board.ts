// Builds a minimal .kicad_pcb carrying one isolated gr_text per case
// (angles × italic × justify × mirror × two-line) so kicad-cli can plot the
// exact ground truth for stroke-text orientation. Layout: one text per row,
// 40 mm apart, all centered on x=100.
import { writeFileSync } from 'node:fs';

interface Case {
  text: string;
  angle: number;
  italic?: boolean;
  justify?: string;
  thickness?: number;
  size?: number;
}
const cases: Case[] = [
  { text: 'Jg', angle: 0 },
  { text: 'Jg', angle: 90 },
  { text: 'Jg', angle: 180 },
  { text: 'Jg', angle: 270 },
  { text: 'Jg', angle: 0, italic: true },
  { text: 'Jg', angle: 90, italic: true },
  { text: 'Jg', angle: 0, justify: '(justify left)' },
  { text: 'Jg', angle: 0, justify: '(justify right)' },
  { text: 'Jg', angle: 0, justify: '(justify top)' },
  { text: 'Jg', angle: 0, justify: '(justify bottom)' },
  { text: 'Jg', angle: 0, justify: '(justify mirror)' },
  { text: 'Ja\\ngb', angle: 0 },
  { text: 'Ja\\ngb', angle: 90 },
  // h-justify calibration: isolate extents/thickness/size dependence
  { text: 'Jg', angle: 0, thickness: 0.6, justify: '(justify left)' },
  { text: 'JgJgJg', angle: 0, justify: '(justify left)' },
  { text: 'Jg', angle: 0, size: 3, justify: '(justify left)' },
  { text: 'Jg', angle: 0, thickness: 0.6, justify: '(justify right)' },
  { text: 'JgJgJg', angle: 0, justify: '(justify right)' },
];

let items = '';
let y = 40;
for (let i = 0; i < cases.length; i++) {
  const c = cases[i]!;
  const sy = c.size ?? 1.5;
  const th = c.thickness ?? 0.3;
  const fx = c.italic ? '(italic yes)' : '';
  const j = c.justify ?? '';
  items += `  (gr_text "${c.text}" (at 100 ${y} ${c.angle}) (layer "F.SilkS") (uuid "00000000-0000-0000-0000-${String(i).padStart(12, '0')}") (effects (font (size ${sy} ${sy}) (thickness ${th}) ${fx}) ${j}))\n`;
  y += 12;
}

const board = `(
  kicad_pcb
  (version 20241229)
  (net 0 "")
  (generator "typecad")
  (generator_version "0.1.0")
  (general (thickness 1.6) (legacy_teardrops no))
  (paper "A4")
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (36 "B.SilkS" user "B.Silkscreen")
    (37 "F.SilkS" user "F.Silkscreen")
    (44 "Edge.Cuts" user)
  )
  (setup (stackup (layer "F.Cu" (type copper) (thickness 0.035))))
  ${items}
  (gr_line (start 90 30) (end 110 30) (stroke (width 0.05) (type default)) (layer "Edge.Cuts") (uuid "aaaaaaaa-0000-0000-0000-000000000001"))
  (gr_line (start 110 30) (end 110 ${y}) (stroke (width 0.05) (type default)) (layer "Edge.Cuts") (uuid "aaaaaaaa-0000-0000-0000-000000000002"))
  (gr_line (start 110 ${y}) (end 90 ${y}) (stroke (width 0.05) (type default)) (layer "Edge.Cuts") (uuid "aaaaaaaa-0000-0000-0000-000000000003"))
  (gr_line (start 90 ${y}) (end 90 30) (stroke (width 0.05) (type default)) (layer "Edge.Cuts") (uuid "aaaaaaaa-0000-0000-0000-000000000004"))
)
`;
writeFileSync('tools/text_probe.kicad_pcb', board);
console.log(`wrote tools/text_probe.kicad_pcb with ${cases.length} texts (x=100, y=40..${y - 12})`);
for (let i = 0; i < cases.length; i++) console.log(`  case ${i}: y=${40 + i * 12}`, JSON.stringify(cases[i]));
