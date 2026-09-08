import { describe, it, expect } from 'vitest';
import { CORE_DEPENDENCIES, coreDepsFix } from '../core-deps.js';

const MISSING = ['@typecad/pcb', 'tsx'] as const;

describe('CORE_DEPENDENCIES (create ↔ doctor single source)', () => {
  it('carries a spec, not a bare name (bare resolves to whatever `latest` is)', () => {
    expect(CORE_DEPENDENCIES).toContain('@typecad/pcb@~1.0.0-alpha.4');
    // `~`, not `^` — cmd.exe (the npm spawn shell on Windows) eats carets.
    expect(CORE_DEPENDENCIES.every((d) => !d.includes('^'))).toBe(true);
  });
});

describe('coreDepsFix (doctor repair line, computed from package.json)', () => {
  it("missing deps get create's pinned line", () => {
    const fix = coreDepsFix(MISSING, null);
    expect(fix.args).toEqual(['@typecad/pcb@~1.0.0-alpha.4', 'tsx']);
    expect(fix.legacy).toEqual([]);
    expect(coreDepsFix(MISSING, 'not-an-object').args[0]).toBe('@typecad/pcb@~1.0.0-alpha.4');
  });

  it('reports legacy pre-rename dependencies so doctor can point at @typecad/pcb', () => {
    const fix = coreDepsFix(MISSING, {
      dependencies: { '@typecad/typecad': '^1.0.0-alpha.2', '@typecad/passives': '^0.2.3-alpha.0' },
    });
    expect(fix.legacy).toEqual(['@typecad/typecad', '@typecad/passives']);
  });

  it('devDependencies declarations count as legacy too', () => {
    const fix = coreDepsFix(MISSING, {
      devDependencies: { '@typecad/passives': '~0.2.2' },
    });
    expect(fix.legacy).toEqual(['@typecad/passives']);
  });
});
