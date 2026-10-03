// The component-deletion grammar: the extension's copy is byte-identical to
// the canonical one in @typecad/pcb, and the planner's surgery (declaration,
// overrides, create() arguments, syncBoard map, net pins) removes a
// component without leaving a dangling identifier or broken formatting.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyDeleteEdits,
  componentInCreateArgs,
  declaresComponent,
  identifierInCode,
  isCreateReceiver,
  planComponentRemoval,
} from '../componentDelete.js';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('component delete grammar contract', () => {
  it('is byte-identical to the canonical copy in @typecad/pcb (re-copy it when they drift)', () => {
    const canonical = fs.readFileSync(
      path.resolve(here, '../../../../@typecad/pcb/src/kicad2typecad/component_delete.ts'),
      'utf8',
    );
    const local = fs.readFileSync(path.resolve(here, '../componentDelete.ts'), 'utf8');
    expect(local).toBe(canonical);
  });

  it('removes a component from every statement shape it lives in', () => {
    const src = [
      "import { PCB, Resistor } from '@typecad/pcb';",
      "import { syncBoard } from './_sync.js';",
      '',
      "const typecad = new PCB('t');",
      '// r1 is the sense leg — keep its docs nearby',
      "const r1: Resistor = new Resistor({ reference: 'R1', value: '1k' });",
      'r1.pcb = { x: 1, y: 2, rotation: 90 };',
      "const r2 = new Resistor({ reference: 'R2' });",
      "typecad.named('MID').net(r1.pin(2), r2.pin(1));",
      'syncBoard(typecad, { r1, r2 });',
      'typecad.create(r1, r2);',
    ].join('\n');
    const out = applyDeleteEdits(src, planComponentRemoval(src, 'r1'));
    expect(out).toBe(
      [
        "import { PCB, Resistor } from '@typecad/pcb';",
        "import { syncBoard } from './_sync.js';",
        '',
        "const typecad = new PCB('t');",
        '// r1 is the sense leg — keep its docs nearby',
        "const r2 = new Resistor({ reference: 'R2' });",
        "typecad.named('MID').net(r2.pin(1));",
        'syncBoard(typecad, { r2 });',
        'typecad.create(r2);',
      ].join('\n'),
    );
    // the prose mention survives; no code occurrence does
    expect(identifierInCode(out, 'r1')).toBe(false);
    expect(out).toContain('// r1 is the sense leg');
  });

  it('drops middle and last create() arguments cleanly', () => {
    const mid = applyDeleteEdits('a.create(r1, r2, r3);', planComponentRemoval('a.create(r1, r2, r3);', 'r2'));
    expect(mid).toBe('a.create(r1, r3);');
    const last = applyDeleteEdits('a.create(r1, r2);', planComponentRemoval('a.create(r1, r2);', 'r2'));
    expect(last).toBe('a.create(r1);');
    const only = applyDeleteEdits('a.create(r1);', planComponentRemoval('a.create(r1);', 'r1'));
    expect(only).toBe('a.create();');
  });

  it('removes sidecar parts statements and keeps the multi-line create style intact', () => {
    const src = [
      'export function syncBoard(typecad: PCB, parts: Record<string, Component>): void {',
      '  syncTracks.length = 0;',
      '  parts.r1.pcb = { x: 5, y: 10 };',
      '  parts.r1.referenceLayout = { x: 0, y: 1, rotation: 0 };',
      '  parts.r2.pcb = { x: 6, y: 11 };',
      '}',
      'typecad.create(',
      '  r1, // main part',
      '  r2,',
      ');',
    ].join('\n');
    const out = applyDeleteEdits(src, planComponentRemoval(src, 'r1'));
    expect(out).not.toContain('parts.r1');
    expect(out).toContain('parts.r2.pcb = { x: 6, y: 11 };');
    expect(out).toContain('typecad.create(');
    expect(out).toContain('r2,');
    expect(out).toContain('// main part');
  });

  it('classifies receivers, placements, and declarations', () => {
    const src = "const typecad = new PCB('t');\nconst r1 = new Resistor({ reference: 'R1' });\ntypecad.create(r1);\n";
    expect(isCreateReceiver(src, 'typecad')).toBe(true);
    expect(isCreateReceiver(src, 'r1')).toBe(false);
    expect(componentInCreateArgs(src, 'r1')).toBe(true);
    expect(componentInCreateArgs(src, 'typecad')).toBe(false);
    expect(declaresComponent(src, 'r1')).toBe(true);
    expect(declaresComponent('const r1x = 1;', 'r1')).toBe(false);
  });
});
