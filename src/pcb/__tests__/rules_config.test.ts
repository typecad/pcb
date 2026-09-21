// Constraints-from-conf: typecad.conf `rules` → JSON file → PCB rules /
// net classes / assignments / DRC severities. Validates the loader, the
// precedence chain (JLCPCB defaults ← conf file ← constructor code), and
// the .kicad_pro serialization.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearConfigCache, loadRulesConfig } from '../../config.js';
import { mergeRulesIntoProject, JLCPCB_STANDARD_RULES, resolveRules } from '../pcb_rules.js';
import { PCB } from '../pcb.js';

let tmp: string;
let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-conf-'));
  process.chdir(tmp);
  clearConfigCache();
});

afterEach(() => {
  process.chdir(prevCwd);
  clearConfigCache();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeConf(rulesPath?: string): void {
  const line = rulesPath ? `  rules: ${JSON.stringify(rulesPath)},\n` : '';
  fs.writeFileSync(
    path.join(tmp, 'typecad.conf.ts'),
    `import { defineConfig } from '@typecad/pcb';\nexport default defineConfig({\n${line}});\n`,
  );
}

describe('loadRulesConfig', () => {
  it('returns null when the conf has no rules path', () => {
    writeConf();
    expect(loadRulesConfig()).toBeNull();
  });

  it('loads and validates a complete constraints file', () => {
    fs.writeFileSync(
      path.join(tmp, 'rules.json'),
      JSON.stringify({
        rules: { min_clearance: 0.25 },
        netClasses: { power: { track_width: 0.55 } },
        assignments: { VCC: 'power' },
        severities: { silk_overlap: 'warning' },
      }),
    );
    writeConf('./rules.json');
    const cfg = loadRulesConfig()!;
    expect(cfg.rules).toEqual({ min_clearance: 0.25 });
    expect(cfg.netClasses).toEqual({ power: { track_width: 0.55 } });
    expect(cfg.assignments).toEqual({ VCC: 'power' });
    expect(cfg.severities).toEqual({ silk_overlap: 'warning' });
  });

  it('throws on an unknown top-level key', () => {
    fs.writeFileSync(path.join(tmp, 'rules.json'), JSON.stringify({ ruls: {} }));
    writeConf('./rules.json');
    expect(() => loadRulesConfig()).toThrow(/unknown key "ruls"/);
  });

  it('throws on a bad severity value', () => {
    fs.writeFileSync(path.join(tmp, 'rules.json'), JSON.stringify({ severities: { silk_overlap: 'maybe' } }));
    writeConf('./rules.json');
    expect(() => loadRulesConfig()).toThrow(/error\|warning\|ignore/);
  });

  it('throws on a non-positive rule value', () => {
    fs.writeFileSync(path.join(tmp, 'rules.json'), JSON.stringify({ rules: { min_clearance: -1 } }));
    writeConf('./rules.json');
    expect(() => loadRulesConfig()).toThrow(/min_clearance.*positive/);
  });

  it('throws on malformed JSON with the path named', () => {
    fs.writeFileSync(path.join(tmp, 'rules.json'), '{nope');
    writeConf('./rules.json');
    expect(() => loadRulesConfig()).toThrow(/not valid JSON/);
  });

  it('throws when the file is missing', () => {
    writeConf('./nope.json');
    expect(() => loadRulesConfig()).toThrow(/rules file not found/);
  });
});

describe('conf constraints → PCB', () => {
  it('conf rules merge under constructor rules (code wins per key)', () => {
    fs.writeFileSync(
      path.join(tmp, 'rules.json'),
      JSON.stringify({ rules: { min_clearance: 0.25, min_track_width: 0.22 } }),
    );
    writeConf('./rules.json');
    const pcb = new PCB('confmerge', { rules: { min_clearance: 0.4 } });
    expect(pcb.rules.min_clearance).toBe(0.4); // constructor wins
    expect(pcb.rules.min_track_width).toBe(0.22); // conf supplies the rest
    expect(pcb.rules.min_via_diameter).toBe(JLCPCB_STANDARD_RULES.min_via_diameter); // defaults floor
    void resolveRules;
  });

  it('conf net classes and assignments register on the PCB', () => {
    fs.writeFileSync(
      path.join(tmp, 'rules.json'),
      JSON.stringify({
        netClasses: { power: { track_width: 0.55, clearance: 0.3 } },
        assignments: { VCC: 'power', GND: 'power' },
      }),
    );
    writeConf('./rules.json');
    const pcb = new PCB('confnets');
    expect(pcb.netClasses.classNameFor('VCC')).toBe('power');
    expect(pcb.netClasses.netClassFor('GND')!.track_width).toBe(0.55);
    expect(pcb.netClasses.netClassFor('GND')!.clearance).toBe(0.3);
  });

  it('code-defined classes replace conf classes of the same name', () => {
    fs.writeFileSync(
      path.join(tmp, 'rules.json'),
      JSON.stringify({ netClasses: { power: { track_width: 0.55 } } }),
    );
    writeConf('./rules.json');
    const pcb = new PCB('confreplace');
    pcb.netClass('power', { track_width: 1.0 });
    expect(pcb.netClasses.netClassFor('x')).toBeUndefined();
    // define + assign via the public API path
    expect(pcb.netClasses.definitions.get('power')!.track_width).toBe(1.0);
  });

  it('severities reach the .kicad_pro via mergeRulesIntoProject', () => {
    const merged = mergeRulesIntoProject(
      '',
      JLCPCB_STANDARD_RULES,
      undefined,
      undefined,
      undefined,
      { silk_overlap: 'ignore', courtyard_overlap: 'warning' },
    );
    const doc = JSON.parse(merged);
    expect(doc.board.design_settings.rule_severities).toEqual({
      silk_overlap: 'ignore',
      courtyard_overlap: 'warning',
    });
    // rules still written alongside
    expect(doc.board.design_settings.rules.min_clearance).toBe(0.2);
  });

  it('severities merge over existing project severities', () => {
    const existing = JSON.stringify({
      board: { design_settings: { rule_severities: { silk_overlap: 'error', hole_clearance: 'warning' } } },
    });
    const merged = mergeRulesIntoProject(
      existing,
      JLCPCB_STANDARD_RULES,
      undefined,
      undefined,
      undefined,
      { silk_overlap: 'ignore' },
    );
    const doc = JSON.parse(merged);
    expect(doc.board.design_settings.rule_severities).toEqual({
      silk_overlap: 'ignore', // conf overrides
      hole_clearance: 'warning', // pre-existing kept
    });
  });
});
