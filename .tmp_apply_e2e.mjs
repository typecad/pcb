import { KicadIRBuilder } from 'file:///C:/typecad/pcb/@typecad/pcb/dist/kicad2typecad/ir_builder.js';
import { SExprNode } from 'file:///C:/typecad/pcb/@typecad/pcb/dist/kicad2typecad/sexpr_tree.js';
import { computeZoneChanges, computeOutlineChanges, computeRoutingChanges, applySourceChanges } from 'file:///C:/typecad/pcb/@typecad/pcb/dist/kicad2typecad/apply_source.js';
import { collectTypeScriptFiles } from 'file:///C:/typecad/pcb/@typecad/pcb/dist/kicad2typecad/source_analyzer.js';
import fs from 'node:fs';

const ROOT = 'C:/typecad/pcb/.tmp-applytest2';
const BOARD = `${ROOT}/build/mod-ec.kicad_pcb`;

const parseIR = () => new KicadIRBuilder().build(SExprNode.parse(fs.readFileSync(BOARD, 'utf-8')));
const files = () => collectTypeScriptFiles(`${ROOT}/src`);

function computeAll() {
  const ir = parseIR();
  const zone = computeZoneChanges(ir, files());
  const outline = computeOutlineChanges(ir, files());
  const routing = computeRoutingChanges(ir, files());
  return { ir, zone, outline, routing };
}

const mode = process.argv[2] ?? 'baseline';

if (mode === 'baseline') {
  const { zone, outline, routing } = computeAll();
  console.log('== baseline (untouched board vs source) ==');
  console.log('zones:', zone.changes.map(c => c.label));
  console.log('outline:', outline.changes.map(c => c.label));
  console.log('routing:', routing.changes.map(c => c.label));
  console.log('notes:', [...zone.notes, ...outline.notes, ...routing.notes]);
} else if (mode === 'mutate') {
  let text = fs.readFileSync(BOARD, 'utf-8');
  // 1. move a standalone via (the GND stitching via at 139 82.4) by +1.5,+0.75
  const NL = String.fromCharCode(13) + String.fromCharCode(10);
  const TAB = String.fromCharCode(9);
  const viaBefore = `(via${NL}${TAB}${TAB}(at 139 82.4)`;
  if (!text.includes(viaBefore)) throw new Error('via anchor not found');
  text = text.replace(viaBefore, `(via${NL}${TAB}${TAB}(at 140.5 83.15)`);
  // 2. move the F.Cu zone south edge: polygon corner (xy 155 93) -> (xy 155 91)
  const zoneCorner = `(xy 155 93)`;
  const count = text.split(zoneCorner).length - 1;
  console.log('zone corner occurrences:', count);
  text = text.replace(zoneCorner, `(xy 155 91)`);
  // 3. reroute one segment vertex
  const segBefore = `(segment${NL}${TAB}${TAB}(start 149.45 87.075)${NL}${TAB}${TAB}(end 149.775 87.4)`;
  if (!text.includes(segBefore)) throw new Error('segment anchor not found');
  text = text.replace(segBefore, `(segment${NL}${TAB}${TAB}(start 149.45 87.075)${NL}${TAB}${TAB}(end 149.9 87.525)`);
  fs.writeFileSync(BOARD, text);
  console.log('board mutated: via moved, zone corner moved, one segment vertex changed');
  // outline: change one Edge.Cuts line
  let t2 = fs.readFileSync(BOARD, 'utf-8');
  const outlineAnchor = t2.match(/\(gr_line[\s\S]*?\(start 130 78\)[\s\S]*?\(end 155 78\)[\s\S]*?\)/);
  console.log('outline anchor found:', !!outlineAnchor);
  if (outlineAnchor) {
    t2 = t2.replace('(end 155 78)', '(end 157 78)');
    fs.writeFileSync(BOARD, t2);
    console.log('outline widened to 27mm');
  }
} else if (mode === 'detect') {
  const { zone, outline, routing } = computeAll();
  console.log('== after mutation ==');
  console.log('zones:', zone.changes.map(c => `${c.label} [${c.changedProps}]`));
  console.log('outline:', outline.changes.map(c => `${c.label} [${c.changedProps}]`));
  console.log('routing:', routing.changes.map(c => `${c.label} [${c.changedProps}]`));
} else if (mode === 'apply') {
  const { zone, outline, routing } = computeAll();
  const selected = [...outline.changes, ...zone.changes, ...routing.changes];
  const res = applySourceChanges(selected);
  console.log('applied:', JSON.stringify(res));
  // idempotency: recompute
  const again = computeAll();
  console.log('recompute -> zones:', again.zone.changes.length, 'outline:', again.outline.changes.length, 'routing:', again.routing.changes.length);
  for (const r of again.routing.notes) console.log('note:', r);
} else if (mode === 'showsrc') {
  const src = fs.readFileSync(`${ROOT}/src/mod-ec.ts`, 'utf-8');
  const via = src.split('\n').findIndex(l => l.includes('typecad.via({ at: { x: 140.5'));
  console.log('moved via line:', via >= 0 ? src.split('\n')[via] : 'NOT FOUND');
  const zone = src.split('\n').filter(l => l.includes('typecad.zone(')).slice(0, 1);
  console.log('first zone call:', zone[0]);
  const outline = src.split('\n').find(l => l.includes('typecad.outline('));
  console.log('outline call:', outline);
  const seg = src.split('\n').find(l => l.includes('149.9, y: 87.525'));
  console.log('mutated segment in source:', seg);
  const outline2 = src.split('\n').find(l => l.includes('typecad.outline(130, 78, 27'));
  console.log('outline widened in source:', outline2);
}
