// Rules resolution: the project's optional typecad.rules.json is the PRIMARY
// source; the board's .kicad_pro fills the gaps. Net classes + patterns ride
// either source.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveBoardRules, rulesFromProject, userRulesFromFolder, USER_RULES_FILE } from '../boardRules.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-rules-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const writeBoard = (rules: Record<string, unknown> | null, net?: object): string => {
  const board = path.join(dir, 'demo.kicad_pcb');
  fs.writeFileSync(board, '(kicad_pcb)');
  if (rules !== null) {
    fs.writeFileSync(
      path.join(dir, 'demo.kicad_pro'),
      JSON.stringify(
        net
          ? { board: { design_settings: { rules } }, net_settings: net }
          : { board: { design_settings: { rules } } },
      ),
    );
  }
  return board;
};

const writeUser = (json: object): void => {
  fs.writeFileSync(path.join(dir, USER_RULES_FILE), JSON.stringify(json));
};

describe('userRulesFromFolder', () => {
  it('reads the project rules file when it exists', () => {
    writeUser({ minTrackWidthMm: 0.25, minClearanceMm: 0.15, minCopperEdgeClearanceMm: 0.4 });
    expect(userRulesFromFolder(dir)).toEqual({
      minTrackWidthMm: 0.25,
      minClearanceMm: 0.15,
      minCopperEdgeClearanceMm: 0.4,
    });
  });

  it('reads net classes and patterns, dropping non-positive values', () => {
    writeUser({
      netClasses: { PWR: { width: 0.8, viaSize: 1, viaDrill: 0.5 }, Bad: { width: 0 } },
      netClassPatterns: [{ pattern: '^(VCC|GND)$', class: 'PWR' }, { pattern: '', class: 'X' }],
    });
    const r = userRulesFromFolder(dir)!;
    expect(r.netClasses).toEqual({ PWR: { width: 0.8, viaSize: 1, viaDrill: 0.5 } });
    expect(r.netClassPatterns).toEqual([{ pattern: '^(VCC|GND)$', class: 'PWR' }]);
  });

  it('is null without the file', () => {
    expect(userRulesFromFolder(dir)).toBeNull();
  });
});

describe('rulesFromProject', () => {
  it('reads floors, edge clearance, and KiCad net classes', () => {
    const board = writeBoard(
      { min_track_width: 0.2, min_via_diameter: 0.35, min_clearance: 0.2, min_copper_edge_clearance: 0.3 },
      {
        classes: [{ name: 'PWR', track_width: 0.8, via_diameter: 1, via_drill: 0.5 }],
        netclass_patterns: [{ netclass: 'PWR', pattern: 'VCC' }],
      },
    );
    expect(rulesFromProject(board)).toEqual({
      minTrackWidthMm: 0.2,
      minViaDiameterMm: 0.35,
      minClearanceMm: 0.2,
      minCopperEdgeClearanceMm: 0.3,
      netClasses: { PWR: { width: 0.8, viaSize: 1, viaDrill: 0.5 } },
      netClassPatterns: [{ pattern: 'VCC', class: 'PWR' }],
    });
  });

  it('is empty with no project file', () => {
    expect(rulesFromProject(writeBoard(null as unknown as Record<string, unknown>))).toEqual({});
  });
});

describe('resolveBoardRules', () => {
  it('the user file wins field-by-field; the .kicad_pro fills the gaps', () => {
    const board = writeBoard({ min_track_width: 0.2, min_via_diameter: 0.35, min_clearance: 0.2 });
    writeUser({ minClearanceMm: 0.15 });
    expect(resolveBoardRules(dir, board)).toEqual({
      minTrackWidthMm: 0.2,
      minViaDiameterMm: 0.35,
      minClearanceMm: 0.15, // user override
    });
  });

  it('user classes and patterns take precedence, pro classes ride along', () => {
    const board = writeBoard(
      {},
      {
        classes: [{ name: 'Default', track_width: 0.25 }, { name: 'PWR', track_width: 0.6 }],
        netclass_patterns: [{ netclass: 'PWR', pattern: '^VCC$' }],
      },
    );
    writeUser({
      minTrackWidthMm: 0.15,
      netClasses: { PWR: { width: 0.8 } },
      netClassPatterns: [{ pattern: '^(VCC|GND)$', class: 'PWR' }],
    });
    const r = resolveBoardRules(dir, board)!;
    expect(r.netClasses).toEqual({ Default: { width: 0.25 }, PWR: { width: 0.8 } });
    expect(r.netClassPatterns).toEqual([
      { pattern: '^(VCC|GND)$', class: 'PWR' }, // user first
      { pattern: '^VCC$', class: 'PWR' },
    ]);
  });

  it('ships on classes alone when no floor exists anywhere', () => {
    const board = writeBoard({});
    writeUser({ netClasses: { Default: { width: 0.3 } } });
    const r = resolveBoardRules(dir, board)!;
    expect(r.minTrackWidthMm).toBeUndefined();
    expect(r.netClasses).toEqual({ Default: { width: 0.3 } });
  });

  it('is null when neither source yields anything', () => {
    expect(resolveBoardRules(dir, writeBoard({}))).toBeNull();
  });
});
