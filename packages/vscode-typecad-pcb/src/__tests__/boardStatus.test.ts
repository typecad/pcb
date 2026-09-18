import { describe, expect, it } from 'vitest';
import { statusContent } from '../boardStatus.js';
import { browseItems } from '../browse.js';
import {
  drcProblems,
  parseDrcReport,
  refSourceMap,
  unconnectedProblems,
} from '../problems.js';
import type { ComponentSummary, NetSourceSummary } from '../types.js';

describe('statusContent', () => {
  it('shows the board target with parts, unconnected, and DRC counts', () => {
    const s = statusContent({
      boardName: 'rd_skeleton',
      parts: 28,
      unconnected: 3,
      drcErrors: 2,
      drcWarnings: 5,
      stale: false,
    });
    expect(s.text).toBe('$(circuit-board) rd_skeleton · 28 parts · 3 unconnected · 2E 5W');
    expect(s.tooltip).toContain('rd_skeleton');
    expect(s.tooltip).toContain('DRC: 2 errors');
  });

  it('flags stale boards and handles the no-board case', () => {
    expect(
      statusContent({ boardName: 'b', parts: 1, unconnected: 0, drcErrors: null, drcWarnings: null, stale: true }).text,
    ).toBe('$(circuit-board) b · 1 part · stale');
    const none = statusContent({ boardName: null, parts: null, unconnected: null, drcErrors: null, drcWarnings: null, stale: false });
    expect(none.text).toContain('no board');
    expect(none.tooltip).toContain('Build Board');
  });

  it('omits zero counts', () => {
    const s = statusContent({ boardName: 'b', parts: 4, unconnected: 0, drcErrors: 0, drcWarnings: 0, stale: false });
    expect(s.text).toBe('$(circuit-board) b · 4 parts');
  });

  it('separates a warnings-only DRC count instead of gluing it to the parts', () => {
    const s = statusContent({ boardName: 'b', parts: 4, unconnected: 0, drcErrors: 0, drcWarnings: 2, stale: false });
    expect(s.text).toBe('$(circuit-board) b · 4 parts · 2W');
  });
});

describe('browseItems', () => {
  it('labels ref — value with the footprint, numeric sort, source detail', () => {
    const items = browseItems([
      summary('R10', '10k', 'R_0603', 'r10'),
      summary('R2', '1k', 'R_0603'),
      summary('U1', 'mcu', 'QFN-32', 'u1'),
    ]);
    expect(items.map((i) => i.ref)).toEqual(['R2', 'R10', 'U1']);
    expect(items[2]).toMatchObject({ label: 'U1 — mcu', description: 'QFN-32', detail: 'source: u1' });
  });
});

describe('problems', () => {
  const comps = [summary('R1', '1k', 'R_0603', 'r1', 'src/board.ts:12'), summary('U1', 'mcu', 'QFN', 'u1', 'src/board.ts:40')];
  const nets: NetSourceSummary[] = [
    { name: 'net2', source: 'src/board.ts:82', routeSource: 'src/board.ts:83' },
  ];
  const refs = refSourceMap(comps);

  it('refSourceMap only keeps components with a source', () => {
    expect(refs.get('R1')).toBe('src/board.ts:12');
    expect(refs.has('R2')).toBe(false);
  });

  it('aims unconnected pads at the declaring line; single-pin nets at their net line', () => {
    const entries = unconnectedProblems(
      { unconnectedPads: [{ reference: 'R1', pad: '2' }], singlePinNets: ['net2'] },
      refs,
      nets,
      'build/board.kicad_pcb',
    );
    expect(entries).toEqual([
      { location: 'src/board.ts:12', message: 'R1 pad 2 is unconnected', severity: 'warning', code: 'unconnected-pad' },
      { location: 'src/board.ts:82', message: 'net net2 has only one pin', severity: 'warning', code: 'single-pin-net' },
    ]);
  });

  it('parses KiCad DRC json and maps violations to refs, then nets, then the board', () => {
    const violations = parseDrcReport({
      violations: [
        {
          severity: 'error',
          type: 'clearance',
          description: 'Clearance violation',
          items: [{ description: 'pad R1.2' }, { description: 'pad U1.3' }],
        },
        { severity: 'warning', type: 'track_width', description: 'Track too thin on net net2', items: [] },
        { severity: 'exclusion', type: 'ignored', description: 'excluded by user', items: [] },
      ],
    });
    expect(violations).toHaveLength(3);
    const entries = drcProblems(violations, refs, nets, 'build/board.kicad_pcb');
    expect(entries[0]).toMatchObject({ location: 'src/board.ts:12', severity: 'error' });
    expect(entries[0]!.message).toContain('(R1)');
    // no ref matches; the description names net2 -> its route line
    expect(entries[1]).toMatchObject({ location: 'src/board.ts:83', severity: 'warning' });
    // exclusions never reach the Problems pane
    expect(entries).toHaveLength(2);
  });

  it('aims the net fallback at the longest matching name (VCC_3V3 beats VCC)', () => {
    const both: NetSourceSummary[] = [
      { name: 'VCC', source: 'src/board.ts:10' },
      { name: 'VCC_3V3', source: 'src/board.ts:20', routeSource: 'src/board.ts:21' },
    ];
    const entries = drcProblems(
      [{ severity: 'warning', type: 'clearance', description: 'Clearance violation on net VCC_3V3', items: [] }],
      refs,
      both,
      'build/board.kicad_pcb',
    );
    expect(entries[0]).toMatchObject({ location: 'src/board.ts:21' });
    expect(entries[0]!.message).toContain('(net VCC_3V3)');
  });
});

function summary(
  reference: string,
  value: string,
  footprint: string,
  variable?: string,
  source?: string,
): ComponentSummary {
  return {
    reference,
    value,
    footprint,
    variable,
    source,
    side: 'front',
    at: { x: 0, y: 0, rotation: 0 },
    dimensions: null,
    padCount: 2,
  };
}
