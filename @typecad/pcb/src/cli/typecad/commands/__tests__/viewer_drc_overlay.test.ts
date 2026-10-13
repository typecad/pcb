// ---------------------------------------------------------------------------
// `typecad-pcb viewer`'s DRC overlay discovery: a rebuilt board never
// carries a stale DRC report. The auto-discovery used to embed whatever
// <board>_drc.json existed, so every page regenerated after a rebuild
// painted the PREVIOUS revision's violation markers (and printed "drc" in
// the overlays line) — reading as "the rebuild ran DRC". The extension's
// own page generation already withheld stale reports; this is the same
// rule for the CLI path.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { drcOverlayPath } from '../viewer.js';

describe('drcOverlayPath (a rebuilt board never carries a stale DRC report)', () => {
  it('auto-embeds only a report newer than the board; explicit --drc always wins', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drcov-'));
    const pcb = path.join(dir, 'b.kicad_pcb');
    const report = path.join(dir, 'b_drc.json');
    fs.writeFileSync(pcb, 'x');
    // no report at all — nothing to embed
    expect(drcOverlayPath(pcb, dir, 'b')).toBeUndefined();
    // a report OLDER than the board describes the previous revision — withheld
    fs.writeFileSync(report, '{}');
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(report, past, past);
    expect(drcOverlayPath(pcb, dir, 'b')).toBeUndefined();
    // a report NEWER than the board is this revision's — embedded
    fs.utimesSync(pcb, new Date(Date.now() - 120_000), new Date(Date.now() - 120_000));
    expect(drcOverlayPath(pcb, dir, 'b')).toBe(report);
    // an explicit --drc names the report by hand and always wins
    const explicit = path.join(dir, 'explicit_drc.json');
    fs.writeFileSync(explicit, '{}');
    expect(drcOverlayPath(pcb, dir, 'b', explicit)).toBe(explicit);
  });
});
