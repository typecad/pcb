import { readFileSync, writeFileSync } from 'node:fs';
import { computeAllSourceChanges } from './dist/kicad2typecad/apply_source.js';
import { KicadIRBuilder } from './dist/kicad2typecad/ir_builder.js';
import { SExprNode } from './dist/kicad2typecad/sexpr_tree.js';
const srcPath = 'C:/typecad/pcb/rd_skeleton/hw/src/mod-ec.ts';
const ir = new KicadIRBuilder().build(SExprNode.parse(readFileSync('C:/typecad/pcb/rd_skeleton/hw/build/mod-ec.kicad_pcb', 'utf8')));
const all = computeAllSourceChanges(ir, [srcPath, 'C:/typecad/pcb/rd_skeleton/hw/src/simple.ts', 'C:/typecad/pcb/rd_skeleton/hw/src/ATtiny3227_M.ts']);
const groups = [];
for (const v of Object.values(all)) { const arr = Array.isArray(v) ? v : v?.changes; if (Array.isArray(arr)) for (const c of arr) if (c?.replacements?.length) groups.push(c); }
const reps = groups.flatMap((c) => c.replacements).filter((r) => typeof r.start === 'number' && typeof r.end === 'number').sort((a, b) => b.start - a.start);
const inserts = groups.flatMap((c) => c.replacements).filter((r) => typeof r.start !== 'number');
if (inserts.length) { console.log('REFUSING: insert-only replacements present, needs the importer'); process.exit(1); }
if (!reps.length) { console.log('IN SYNC'); process.exit(0); }
let text = readFileSync(srcPath, 'utf8');
for (const r of reps) text = text.slice(0, r.start) + (r.newValue ?? '') + text.slice(r.end);
writeFileSync(srcPath, text);
console.log('applied', reps.length, 'replacement(s)');
