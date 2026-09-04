import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import {
  JLCPCB_STANDARD_RULES,
  resolveRules,
  buildProjectRules,
  mergeRulesIntoProject,
  writeRulesToProject,
  resolveNetClassOptions,
} from '../src/pcb/pcb_rules.js';
import { PCB } from '../src/pcb/pcb.js';
import type { IPcbRules } from '../src/pcb/pcb_rules.js';

const buildDir = './build';

/**
 * Read and JSON-parse the project file written for `boardName`.
 */
function readProject(boardName: string): Record<string, unknown> {
  const raw = fs.readFileSync(`${buildDir}/${boardName}.kicad_pro`, 'utf8');
  return JSON.parse(raw);
}

describe('JLCPCB_STANDARD_RULES', () => {
  it('locks the no-surcharge standard values as a contract', () => {
    expect(JLCPCB_STANDARD_RULES).toEqual({
      min_clearance: 0.2,
      min_track_width: 0.2,
      min_via_diameter: 0.6,
      min_through_hole_diameter: 0.3,
      min_via_annular_width: 0.15,
      min_copper_edge_clearance: 0.2,
      min_hole_to_hole: 0.25,
    });
  });
});

describe('resolveRules', () => {
  it('returns the JLCPCB standard when given nothing', () => {
    expect(resolveRules()).toEqual(JLCPCB_STANDARD_RULES);
    expect(resolveRules({})).toEqual(JLCPCB_STANDARD_RULES);
  });

  it('merges a partial override over the JLC standard', () => {
    const resolved = resolveRules({ min_clearance: 0.15 });
    expect(resolved.min_clearance).toBe(0.15);
    // untouched fields keep defaults
    expect(resolved.min_track_width).toBe(0.2);
    expect(resolved.min_via_diameter).toBe(0.6);
    expect(resolved.min_through_hole_diameter).toBe(0.3);
  });

  it('rejects zero values', () => {
    expect(() => resolveRules({ min_clearance: 0 })).toThrow(RangeError);
  });

  it('rejects negative values', () => {
    expect(() => resolveRules({ min_track_width: -0.1 })).toThrow(RangeError);
  });

  it('rejects non-finite values', () => {
    expect(() => resolveRules({ min_via_diameter: NaN })).toThrow(RangeError);
    expect(() => resolveRules({ min_via_diameter: Infinity })).toThrow(RangeError);
  });
});

describe('buildProjectRules', () => {
  it('maps every rule field to the KiCad project key', () => {
    const rules = resolveRules();
    const projectRules = buildProjectRules(rules);
    expect(projectRules.min_clearance).toBe(0.2);
    expect(projectRules.min_track_width).toBe(0.2);
    expect(projectRules.min_via_diameter).toBe(0.6);
    expect(projectRules.min_through_hole_diameter).toBe(0.3);
    expect(projectRules.min_via_annular_width).toBe(0.15);
    expect(projectRules.min_copper_edge_clearance).toBe(0.2);
    expect(projectRules.min_hole_to_hole).toBe(0.25);
  });

  it('preserves unknown keys from an existing rules object', () => {
    const rules = resolveRules();
    const existing = { max_error: 0.005, min_text_height: 0.8 };
    const projectRules = buildProjectRules(rules, existing);
    expect(projectRules.max_error).toBe(0.005);
    expect(projectRules.min_text_height).toBe(0.8);
  });

  it('overwrites the managed keys even when present in existing', () => {
    const rules = resolveRules({ min_clearance: 0.25 });
    const existing = { min_clearance: 0.0, min_track_width: 0.1 };
    const projectRules = buildProjectRules(rules, existing);
    expect(projectRules.min_clearance).toBe(0.25);
    expect(projectRules.min_track_width).toBe(0.2);
  });
});

describe('mergeRulesIntoProject', () => {
  const rules: Required<IPcbRules> = resolveRules();

  it('creates a valid project shell from an empty file', () => {
    const out = mergeRulesIntoProject('', rules);
    const doc = JSON.parse(out);
    expect(doc.board.design_settings.rules.min_clearance).toBe(0.2);
    expect(doc.board.design_settings.rules.min_via_diameter).toBe(0.6);
  });

  it('writes rules under board.design_settings.rules', () => {
    const out = mergeRulesIntoProject('', rules);
    const doc = JSON.parse(out);
    expect(doc.board.design_settings.rules.min_through_hole_diameter).toBe(0.3);
    expect(doc.board.design_settings.rules.min_copper_edge_clearance).toBe(0.2);
    expect(doc.board.design_settings.rules.min_hole_to_hole).toBe(0.25);
  });

  it('preserves existing project structure and merges into it', () => {
    const existing = JSON.stringify({
      board: {
        design_settings: {
          rules: { min_clearance: 0.0, max_error: 0.005, min_text_height: 0.8 },
        },
      },
      meta: { filename: 'x.kicad_pro', version: 3 },
    });
    const out = mergeRulesIntoProject(existing, rules);
    const doc = JSON.parse(out);
    // authored value wins
    expect(doc.board.design_settings.rules.min_clearance).toBe(0.2);
    // preserved keys survive
    expect(doc.board.design_settings.rules.max_error).toBe(0.005);
    expect(doc.board.design_settings.rules.min_text_height).toBe(0.8);
    // sibling structure untouched
    expect(doc.meta.filename).toBe('x.kicad_pro');
  });

  it('updates the Default net class to stay consistent with rules', () => {
    const existing = JSON.stringify({
      net_settings: {
        classes: [
          {
            name: 'Default',
            clearance: 0.5,
            track_width: 0.5,
            via_diameter: 0.9,
            via_drill: 0.5,
          },
        ],
      },
    });
    const out = mergeRulesIntoProject(existing, resolveRules({ min_clearance: 0.18 }));
    const doc = JSON.parse(out);
    const cls = doc.net_settings.classes[0];
    expect(cls.clearance).toBe(0.18);
    expect(cls.track_width).toBe(0.2);
    expect(cls.via_diameter).toBe(0.6);
    expect(cls.via_drill).toBe(0.3);
  });

  it('seeds a Default net class consistent with rules when none exists', () => {
    const out = mergeRulesIntoProject('', rules);
    const doc = JSON.parse(out);
    const cls = doc.net_settings.classes.find((c: { name: string }) => c.name === 'Default');
    expect(cls).toBeDefined();
    expect(cls.clearance).toBe(0.2);
    expect(cls.track_width).toBe(0.2);
    expect(cls.via_diameter).toBe(0.6);
    expect(cls.via_drill).toBe(0.3);
  });

  it('produces parseable JSON for any input', () => {
    expect(() => JSON.parse(mergeRulesIntoProject('', rules))).not.toThrow();
    expect(() => JSON.parse(mergeRulesIntoProject('not json', rules))).not.toThrow();
  });
});

describe('writeRulesToProject', () => {
  const boardName = 'rules_write_test';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_pro`);
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_pro`);
    } catch {
      /* ignore */
    }
  });

  it('creates the project file when it does not exist', () => {
    writeRulesToProject(boardName, resolveRules());
    const doc = readProject(boardName);
    expect(doc.board.design_settings.rules.min_clearance).toBe(0.2);
  });

  it('overwrites an empty scaffolded project file', () => {
    fs.writeFileSync(`${buildDir}/${boardName}.kicad_pro`, '');
    writeRulesToProject(boardName, resolveRules({ min_track_width: 0.18 }));
    const doc = readProject(boardName);
    expect(doc.board.design_settings.rules.min_track_width).toBe(0.18);
  });
});

describe('PCB rules integration', () => {
  const boardName = 'rules_pcb_test';

  beforeEach(() => {
    try {
      fs.mkdirSync(buildDir);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_pcb`);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_pro`);
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_pcb`);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(`${buildDir}/${boardName}.kicad_pro`);
    } catch {
      /* ignore */
    }
  });

  it('PCB.rules returns JLCPCB standard defaults when no rules given', () => {
    const pcb = new PCB(boardName);
    expect(pcb.rules).toEqual(JLCPCB_STANDARD_RULES);
  });

  it('PCB.rules merges constructor overrides over defaults', () => {
    const pcb = new PCB(boardName, { rules: { min_clearance: 0.15 } });
    expect(pcb.rules.min_clearance).toBe(0.15);
    expect(pcb.rules.min_track_width).toBe(0.2);
    expect(pcb.rules.min_via_diameter).toBe(0.6);
  });

  it('create() writes JLCPCB standard rules to the .kicad_pro file', () => {
    const pcb = new PCB(boardName);
    pcb.create();
    const doc = readProject(boardName);
    const r = doc.board.design_settings.rules;
    expect(r.min_clearance).toBe(0.2);
    expect(r.min_via_diameter).toBe(0.6);
    expect(r.min_through_hole_diameter).toBe(0.3);
    expect(r.min_via_annular_width).toBe(0.15);
    expect(r.min_copper_edge_clearance).toBe(0.2);
  });

  it('create() writes overridden rules to the .kicad_pro file', () => {
    const pcb = new PCB(boardName, { rules: { min_clearance: 0.15 } });
    pcb.create();
    const doc = readProject(boardName);
    expect(doc.board.design_settings.rules.min_clearance).toBe(0.15);
    // fallback field stays at default
    expect(doc.board.design_settings.rules.min_track_width).toBe(0.2);
  });

  it('create() updates the Default net class consistently', () => {
    const pcb = new PCB(boardName);
    pcb.create();
    const doc = readProject(boardName);
    const cls = doc.net_settings.classes.find((c: { name: string }) => c.name === 'Default');
    expect(cls).toBeDefined();
    expect(cls.clearance).toBe(0.2);
    expect(cls.track_width).toBe(0.2);
    expect(cls.via_diameter).toBe(0.6);
    expect(cls.via_drill).toBe(0.3);
  });
});

describe('resolveNetClassOptions', () => {
  const rules = resolveRules();

  it('fills unspecified dimensions from the board rules floor', () => {
    const resolved = resolveNetClassOptions({ track_width: 0.5 }, rules);
    expect(resolved.track_width).toBe(0.5);
    expect(resolved.clearance).toBe(rules.min_clearance);
    expect(resolved.via_diameter).toBe(rules.min_via_diameter);
    expect(resolved.via_drill).toBe(rules.min_through_hole_diameter);
  });

  it('resolves all four dimensions when fully specified', () => {
    const resolved = resolveNetClassOptions(
      { track_width: 0.5, clearance: 0.3, via_diameter: 0.8, via_drill: 0.4 },
      rules,
    );
    expect(resolved).toEqual({
      track_width: 0.5,
      clearance: 0.3,
      via_diameter: 0.8,
      via_drill: 0.4,
      layers: [],
    });
  });

  it('passes preferred routing layers through', () => {
    const resolved = resolveNetClassOptions({ layers: ['In1.Cu'] }, rules);
    expect(resolved.layers).toEqual(['In1.Cu']);
  });
});

describe('mergeRulesIntoProject with net classes', () => {
  const rules = resolveRules();
  const powerClass = resolveNetClassOptions(
    { track_width: 0.5, clearance: 0.3, via_diameter: 0.8, via_drill: 0.4 },
    rules,
  );

  it('writes user-defined classes into net_settings.classes', () => {
    const classes = new Map([['power', powerClass]]);
    const out = mergeRulesIntoProject('', rules, classes);
    const doc = JSON.parse(out);
    const cls = doc.net_settings.classes.find((c: { name: string }) => c.name === 'power');
    expect(cls).toBeDefined();
    expect(cls.track_width).toBe(0.5);
    expect(cls.clearance).toBe(0.3);
    expect(cls.via_diameter).toBe(0.8);
    expect(cls.via_drill).toBe(0.4);
    expect(cls.priority).toBeLessThan(2147483647);
  });

  it('never writes diff-pair dimensions for user classes', () => {
    // typeCAD has no differential pair routing; hard-coded values here would
    // make KiCad's DRC enforce geometry the user never chose.
    const classes = new Map([['power', powerClass]]);
    const out = mergeRulesIntoProject('', rules, classes);
    const doc = JSON.parse(out);
    const cls = doc.net_settings.classes.find((c: { name: string }) => c.name === 'power');
    expect(cls.diff_pair_gap).toBeUndefined();
    expect(cls.diff_pair_via_gap).toBeUndefined();
    expect(cls.diff_pair_width).toBeUndefined();
  });

  it('always keeps the Default class alongside user classes', () => {
    const classes = new Map([['power', powerClass]]);
    const out = mergeRulesIntoProject('', rules, classes);
    const doc = JSON.parse(out);
    const names = doc.net_settings.classes.map((c: { name: string }) => c.name);
    expect(names).toContain('Default');
    expect(names).toContain('power');
  });

  it('writes netclass_patterns for assignments', () => {
    const classes = new Map([['power', powerClass]]);
    const assignments = [
      { netName: 'gnd', className: 'power' },
      { netName: 'vcc', className: 'power' },
    ];
    const out = mergeRulesIntoProject('', rules, classes, assignments);
    const doc = JSON.parse(out);
    const patterns = doc.net_settings.netclass_patterns;
    expect(patterns).toHaveLength(2);
    expect(patterns).toContainEqual({ netclass: 'power', pattern: 'gnd' });
    expect(patterns).toContainEqual({ netclass: 'power', pattern: 'vcc' });
  });

  it('replaces managed classes of the same name on re-define', () => {
    const classes = new Map([['power', resolveNetClassOptions({ track_width: 0.7 }, rules)]]);
    // first write with 0.5, then re-define to 0.7
    let out = mergeRulesIntoProject('', rules, new Map([['power', powerClass]]));
    out = mergeRulesIntoProject(out, rules, classes);
    const doc = JSON.parse(out);
    const powerClasses = doc.net_settings.classes.filter((c: { name: string }) => c.name === 'power');
    expect(powerClasses).toHaveLength(1);
    expect(powerClasses[0].track_width).toBe(0.7);
  });

  it('preserves existing non-managed classes and patterns', () => {
    const existing = JSON.stringify({
      net_settings: {
        classes: [
          { name: 'Default', clearance: 0.2 },
          { name: 'custom', track_width: 0.3 },
        ],
        netclass_patterns: [{ netclass: 'custom', pattern: '/UART/*' }],
      },
    });
    const out = mergeRulesIntoProject(existing, rules, new Map([['power', powerClass]]), [
      { netName: 'gnd', className: 'power' },
    ]);
    const doc = JSON.parse(out);
    const names = doc.net_settings.classes.map((c: { name: string }) => c.name);
    expect(names).toContain('custom'); // preserved
    expect(names).toContain('power'); // added
    // existing non-managed pattern preserved, managed one added
    const patterns = doc.net_settings.netclass_patterns;
    expect(patterns).toContainEqual({ netclass: 'custom', pattern: '/UART/*' });
    expect(patterns).toContainEqual({ netclass: 'power', pattern: 'gnd' });
  });

  it('omits netclass_patterns when no assignments given', () => {
    const out = mergeRulesIntoProject('', rules, new Map([['power', powerClass]]));
    const doc = JSON.parse(out);
    expect(doc.net_settings.netclass_patterns).toBeUndefined();
  });
});
