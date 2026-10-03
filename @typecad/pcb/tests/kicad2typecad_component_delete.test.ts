/**
 * Component deletion: source components the board no longer carries are
 * removed by the import (declaration, sidecar overrides, create()
 * arguments, syncBoard map, net pin references) — with the safety rails:
 * empty boards refuse, WIP parts are left alone, ambiguous names are
 * manual, and a removal whose identifier would survive anywhere is
 * refused.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { computeComponentDeletions, componentDeletionChanges } from '../src/kicad2typecad/apply_source.js';
import { applyReplacements } from '../src/kicad2typecad/source_analyzer.js';
import { SYNC_FILE_NAME, renderSyncFile } from '../src/kicad2typecad/sync_file.js';
import type { MatchResult } from '../src/kicad2typecad/types.js';

function makeFootprint(reference: string): MatchResult['irFootprint'] {
  return {
    footprintName: 'Resistor_SMD:R_0603_1608Metric',
    reference,
    position: { x: 10, y: 20, rotation: 0 },
    side: 'front',
    uuid: `uuid-${reference}`,
    codeMetadata: null,
    referenceProperty: null,
    valueProperty: null,
  } as MatchResult['irFootprint'];
}

const matchFor = (file: string, variable: string): MatchResult => ({
  irFootprint: makeFootprint(variable.toUpperCase()),
  sourceLocation: { filePath: file, variableName: variable, isThis: false },
  matchConfidence: 'uuid',
});

describe('component deletion pass', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-comp-del-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const projectWithR1R2 = (): { entry: string; sync: string } => {
    const entry = path.join(dir, 'board.ts');
    const sync = path.join(dir, SYNC_FILE_NAME);
    fs.writeFileSync(
      entry,
      [
        "import { PCB, Component, Resistor } from '@typecad/pcb';",
        "import { syncBoard } from './_sync.js';",
        '',
        "const typecad = new PCB('t');",
        "const r1 = new Resistor({ reference: 'R1', value: '1k', pcb: { x: 1, y: 2 } });",
        "const r2 = new Resistor({ reference: 'R2', value: '10k', pcb: { x: 3, y: 4 } });",
        "typecad.named('MID').net(r1.pin(2), r2.pin(1));",
        'syncBoard(typecad, { r1, r2 });',
        'typecad.create(r1, r2);',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      sync,
      renderSyncFile({ placements: ['  parts.r1.pcb = { x: 5, y: 10 };', '  parts.r2.pcb = { x: 6, y: 11 };'] }),
    );
    return { entry, sync };
  };

  const applyTo = (files: string[], changes: ReturnType<typeof componentDeletionChanges>): void => {
    const byFile = new Map<string, ReturnType<typeof componentDeletionChanges>[number]['replacements']>();
    for (const c of changes) byFile.set(c.filePath, [...(byFile.get(c.filePath) ?? []), ...c.replacements]);
    for (const [f, reps] of byFile) applyReplacements(f, reps);
  };

  it('removes a board-deleted component everywhere it lives', () => {
    const { entry, sync } = projectWithR1R2();
    // the board carries R2 only — r1 is the orphan
    const { candidates, notes } = computeComponentDeletions([matchFor(entry, 'r2')], [entry, sync], 1);
    expect(notes).toEqual([]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.variable).toBe('r1');

    applyTo([entry, sync], componentDeletionChanges(candidates));
    const entryAfter = fs.readFileSync(entry, 'utf8');
    expect(entryAfter).not.toContain('r1');
    expect(entryAfter).toContain("const r2 = new Resistor({ reference: 'R2'");
    expect(entryAfter).toContain('typecad.create(r2);');
    expect(entryAfter).toContain('typecad.named(\'MID\').net(r2.pin(1));');
    expect(entryAfter).toContain('syncBoard(typecad, { r2 });');
    const syncAfter = fs.readFileSync(sync, 'utf8');
    expect(syncAfter).not.toContain('parts.r1.pcb');
    expect(syncAfter).toContain('parts.r2.pcb');

    // converged: recomputing against the post-deletion tree finds nothing
    const again = computeComponentDeletions([matchFor(entry, 'r2')], [entry, sync], 1);
    expect(again.candidates).toEqual([]);
    expect(again.notes).toEqual([]);
  });

  it('leaves work-in-progress parts alone (declared, never passed to create())', () => {
    const { entry, sync } = projectWithR1R2();
    // a WIP part: declared, not in any create()
    fs.appendFileSync(entry, "const wip = new Resistor({ reference: 'R9' });\n");
    const { candidates, notes } = computeComponentDeletions([matchFor(entry, 'r1'), matchFor(entry, 'r2')], [entry, sync], 2);
    expect(candidates).toEqual([]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('work in progress');
    expect(fs.readFileSync(entry, 'utf8')).toContain('const wip =');
  });

  it('refuses to empty the project from a board with no footprints', () => {
    const { entry, sync } = projectWithR1R2();
    const { candidates, notes } = computeComponentDeletions([], [entry, sync], 0);
    expect(candidates).toEqual([]);
    expect(notes.some((n) => n.includes('no footprints'))).toBe(true);
    expect(fs.readFileSync(entry, 'utf8')).toContain('const r1 =');
  });

  it('refuses ambiguous variable names (same name in several files)', () => {
    const { entry, sync } = projectWithR1R2();
    const other = path.join(dir, 'other.ts');
    fs.writeFileSync(other, "const r1 = new Resistor({ reference: 'R1' });\n");
    const { candidates, notes } = computeComponentDeletions([matchFor(entry, 'r2')], [entry, sync, other], 1);
    expect(candidates).toEqual([]);
    expect(notes.some((n) => n.includes('ambiguous'))).toBe(true);
  });

  it('refuses a removal whose identifier would survive (unknown reference)', () => {
    const { entry, sync } = projectWithR1R2();
    // a reference form the grammar does not know: r1 passed to a helper
    fs.appendFileSync(entry, 'logPins(r1);\n');
    const { candidates, notes } = computeComponentDeletions([matchFor(entry, 'r2')], [entry, sync], 1);
    expect(candidates).toEqual([]);
    expect(notes.some((n) => n.includes('r1') && n.includes('still referenced'))).toBe(true);
    expect(fs.readFileSync(entry, 'utf8')).toContain('const r1 =');
  });

  it('never mistakes prose for code (comments mentioning the identifier)', () => {
    const { entry, sync } = projectWithR1R2();
    fs.appendFileSync(entry, '// r1 was here once, see docs for r1 pin usage\n');
    const { candidates, notes } = computeComponentDeletions([matchFor(entry, 'r2')], [entry, sync], 1);
    expect(notes).toEqual([]);
    expect(candidates).toHaveLength(1);
    applyTo([entry, sync], componentDeletionChanges(candidates));
    const after = fs.readFileSync(entry, 'utf8');
    expect(after).toContain('// r1 was here once');
    expect(after).not.toMatch(/\br1\b(?! was here| pin usage)/);
  });
});
