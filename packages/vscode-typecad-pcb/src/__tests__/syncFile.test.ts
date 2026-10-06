import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
import {
  SYNC_FILE_NAME,
  SYNC_TRACKS_NAME,
  isSyncFileText,
  planSyncEntryEdits,
  renderSyncFile,
  syncFunctionBodyRange,
  syncPlacementInsertAt,
  syncPushStatement,
  syncRouteInsertAt,
} from '../syncFile.js';

/** Apply zero/positive-width edits to text exactly like the applier does. */
function applyEdits(text: string, edits: Array<{ start: number; end: number; line: string }>): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of sorted) out = out.slice(0, e.start) + e.line + out.slice(e.end);
  return out;
}

describe('sync file grammar contract', () => {
  it('is byte-identical to the canonical copy in @typecad/pcb (re-copy it when they drift)', () => {
    const canonical = fs.readFileSync(
      path.resolve(here, '../../../../@typecad/pcb/src/kicad2typecad/sync_file.ts'),
      'utf8',
    );
    const local = fs.readFileSync(path.resolve(here, '../syncFile.ts'), 'utf8');
    expect(local).toBe(canonical);
  });

  it('renders a canonical scaffold that detects back as a sync file', () => {
    const text = renderSyncFile({});
    expect(isSyncFileText(text)).toBe(true);
    expect(text).toContain(`export const ${SYNC_TRACKS_NAME}: TrackBuilder[] = [];`);
    expect(text).toContain('export function syncBoard(typecad: PCB, parts: Record<string, Component>): void {');
    const body = syncFunctionBodyRange(text)!;
    expect(body).not.toBeNull();
    expect(text.slice(body.start, body.end)).toContain(`${SYNC_TRACKS_NAME}.length = 0;`);
  });

  it('rejects non-sync text', () => {
    expect(isSyncFileText('const x = 1;')).toBe(false);
    expect(syncFunctionBodyRange('// mentions syncBoard but defines nothing')).toBeNull();
  });

  it('anchors placements after the last placement line, routes after the last collect push', () => {
    const text = renderSyncFile({
      placements: ['  parts.j1.pcb = { x: 1, y: 2 };'],
      routes: ['  const route1 = new TrackBuilder(typecad, { net: \'VCC\' })\n    .from({ x: 1, y: 2 }, \'F.Cu\', 0.3)\n    .to({ x: 3, y: 4, layer: \'F.Cu\', width: 0.3 });', syncPushStatement('route1')],
    });
    const at = syncPlacementInsertAt(text)!;
    const withNew = `${text.slice(0, at)}  parts.j2.pcb = { x: 9, y: 9 };\n${text.slice(at)}`;
    expect(withNew.indexOf('parts.j2.pcb')).toBeGreaterThan(withNew.indexOf('parts.j1.pcb'));
    expect(withNew.indexOf('parts.j2.pcb')).toBeLessThan(withNew.indexOf('// --- auto routes'));
    const routeAt = syncRouteInsertAt(text)!;
    expect(text.slice(routeAt).startsWith('}')).toBe(true);
    // an empty scaffold anchors both at the first body line
    const bare = renderSyncFile({});
    expect(syncPlacementInsertAt(bare)).toBe(syncRouteInsertAt(bare));
  });
});

describe('sync entry integration', () => {
  const entry = [
    "import { PCB, Component, Resistor, TrackBuilder } from '@typecad/pcb';",
    '',
    'const typecad = new PCB(\'demo\', { layers: 2 });',
    'const r1 = new Resistor({ reference: \'R1\', footprint: \'R_0603\', value: \'10k\', pcb: { x: 5, y: 5 } });',
    'typecad.text({ text: "demo", x: 1, y: 1 });',
    '',
    'typecad.create(',
    '  r1, // main part',
    ');',
  ].join('\n');

  it('adds import, call before create(), and the spread — idempotently', () => {
    const first = planSyncEntryEdits(entry, ['r1'], true);
    expect(first.receiver).toBe('typecad');
    const once = applyEdits(entry, first.edits);
    expect(once).toContain("import { syncBoard, syncTracks } from './_sync.js';");
    expect(once).toContain('syncBoard(typecad, { r1 });');
    expect(once).toMatch(/typecad\.create\(\n  r1,\s*\.\.\.syncTracks\s*\/\/ main part\n\);/);

    const second = planSyncEntryEdits(once, ['r1'], true);
    expect(second.edits.length).toBe(0);
  });

  it('ignores prose mentions and unrelated receivers — the REAL typecad.create() is wired', () => {
    const noisy = [
      "import { PCB } from '@typecad/pcb';",
      '// older projects called typecad.create(...) inline — see the docs',
      'const queue = { create(n: number) { return n; } };',
      'queue.create(1);',
      'const typecad = new PCB();',
      'typecad.create(r1);',
    ].join('\n');
    const plan = planSyncEntryEdits(noisy, ['r1'], true);
    expect(plan.receiver).toBe('typecad');
    const out = applyEdits(noisy, plan.edits);
    // the call and spread land on the real create(), before it and inside it
    expect(out).toContain('syncBoard(typecad, { r1 });\ntypecad.create(r1, ...syncTracks);');
    // the comment and the unrelated call survive untouched
    expect(out).toContain('// older projects called typecad.create(...) inline — see the docs');
    expect(out).toContain('queue.create(1);');
    // re-planning is still idempotent
    expect(planSyncEntryEdits(out, ['r1'], true).edits.length).toBe(0);
  });

  it('spreads after a string argument containing // (string contents are shadowed)', () => {
    const entry = "const typecad = new PCB();\ntypecad.create(r1, 'https://typecad.dev/docs');\n";
    const out = applyEdits(entry, planSyncEntryEdits(entry, ['r1'], true).edits);
    expect(out).toContain("typecad.create(r1, 'https://typecad.dev/docs', ...syncTracks);");
  });

  it('grows the parts map and drops syncTracks when routes are gone', () => {
    const withTracks = applyEdits(entry, planSyncEntryEdits(entry, ['r1'], true).edits);
    const grown = planSyncEntryEdits(withTracks, ['r1', 'c2'], false);
    const out = applyEdits(withTracks, grown.edits);
    expect(out).toContain('syncBoard(typecad, { c2, r1 });');
    expect(out).toContain("import { syncBoard } from './_sync.js';");
    // the stale spread stays behind — create() tolerates an empty array
    expect(out).toContain('...syncTracks');
  });

  it('returns null receiver without a create() call and still plans the import', () => {
    const plan = planSyncEntryEdits("import { PCB } from '@typecad/pcb';\n", [], false);
    expect(plan.receiver).toBeNull();
    expect(applyEdits("import { PCB } from '@typecad/pcb';\n", plan.edits)).toContain("import { syncBoard } from './_sync.js'");
  });

  it('names the file after the grammar constant', () => {
    expect(SYNC_FILE_NAME).toBe('_sync.ts');
  });
});

// --- board artwork grammar: syncArt declaration + image statements ---------

import {
  SYNC_ART_NAME,
  hasSyncArtDeclaration,
  planSyncArtDeclarationEdits,
  syncImageInsertAt,
} from '../syncFile.js';

describe('sync artwork grammar', () => {
  it('adds the Image import and the syncArt declaration to a scaffold missing them', () => {
    const scaffold = renderSyncFile({});
    expect(hasSyncArtDeclaration(scaffold)).toBe(false);
    const edits = planSyncArtDeclarationEdits(scaffold);
    const out = applyEdits(scaffold, edits);
    expect(out).toContain(`import { Image, TrackBuilder } from '@typecad/pcb';`);
    expect(out).toContain(`export const ${SYNC_ART_NAME}: Image[] = [];`);
    expect(hasSyncArtDeclaration(out)).toBe(true);
    // idempotent: the second plan is empty
    expect(planSyncArtDeclarationEdits(out)).toHaveLength(0);
  });

  it('leaves a sidecar that already carries the grammar untouched', () => {
    const text = renderSyncFile({}) + `export const ${SYNC_ART_NAME}: Image[] = [];\n`;
    // simulate the import already rewritten
    const withImport = text.replace(
      `import { TrackBuilder } from '@typecad/pcb';`,
      `import { Image, TrackBuilder } from '@typecad/pcb';`,
    );
    expect(planSyncArtDeclarationEdits(withImport)).toHaveLength(0);
  });

  it('anchors image statements after the last syncArt.push, below zones', () => {
    let text = applyEdits(renderSyncFile({}), planSyncArtDeclarationEdits(renderSyncFile({})));
    // zones already present
    const zoneAt = syncImageInsertAt(text)!;
    text = `${text.slice(0, zoneAt)}  typecad.zone({ layers: ['F.Cu'], x: 0, y: 0, width: 5, height: 5 });\n${text.slice(zoneAt)}`;
    const first = syncImageInsertAt(text)!;
    text = `${text.slice(0, first)}  ${SYNC_ART_NAME}.push(new Image({ file: 'art/a.png', at: { x: 1, y: 2 }, size: [10, 10] }));\n${text.slice(first)}`;
    const second = syncImageInsertAt(text)!;
    text = `${text.slice(0, second)}  ${SYNC_ART_NAME}.push(new Image({ file: 'art/b.png', at: { x: 3, y: 4 }, size: [5, 5] }));\n${text.slice(second)}`;
    // both images sit after the zone line, in insert order
    expect(text.indexOf('art/a.png')).toBeGreaterThan(text.indexOf('typecad.zone('));
    expect(text.indexOf('art/b.png')).toBeGreaterThan(text.indexOf('art/a.png'));
  });

  it('wires the entry with ...syncArt only when artwork needs it, composing with ...syncTracks', () => {
    const entry = `import { PCB } from '@typecad/pcb';\nconst typecad = new PCB('demo');\ntypecad.create(r1);\n`;
    const artOnly = applyEdits(entry, planSyncEntryEdits(entry, [], false, undefined, true).edits);
    expect(artOnly).toContain(`import { syncBoard, syncArt } from './_sync.js';`);
    expect(artOnly).toContain('...syncArt');
    expect(artOnly).not.toContain('...syncTracks');

    // both needs: one canonical import naming all three, one spread pair
    const both = applyEdits(entry, planSyncEntryEdits(entry, [], true, undefined, true).edits);
    expect(both).toContain(`import { syncBoard, syncTracks, syncArt } from './_sync.js';`);
    expect(both).toContain('...syncTracks, ...syncArt');

    // idempotent: re-planning the applied text is a no-op
    expect(planSyncEntryEdits(both, [], true, undefined, true).edits).toHaveLength(0);

    // a tracks-only entry gains art as a second spread, not a duplicate
    const tracksOnly = applyEdits(entry, planSyncEntryEdits(entry, [], true).edits);
    expect(tracksOnly).toContain('...syncTracks');
    const grown = applyEdits(tracksOnly, planSyncEntryEdits(tracksOnly, [], true, undefined, true).edits);
    expect(grown).toContain('...syncTracks, ...syncArt');
    expect(grown.match(/\.\.\.syncTracks/g)).toHaveLength(1);
  });
});
