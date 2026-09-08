import { describe, it, expect } from 'vitest';
import { cliLineMatches } from '../doctor.js';

describe('cliLineMatches (global CLI vs project dependency line)', () => {
  it('the alpha-line global matches an alpha-line project', () => {
    expect(cliLineMatches('1.0.0-alpha.2', '^1.0.0-alpha.2')).toBe(true);
    expect(cliLineMatches('1.0.0-alpha.3', '~1.0.0-alpha.2')).toBe(true);
    expect(cliLineMatches('1.0.0', '^1.0.0-alpha.2')).toBe(true); // future stable 1.x still same line
  });

  it('the 0.x latest global mismatches an alpha-line project (the hidden-commands case)', () => {
    // npm install -g @typecad/pcb (no tag) lands on `latest` = the 0.x
    // line, whose CLI registers no check/query/edit — the exact confusion
    // this check exists to catch.
    expect(cliLineMatches('0.3.4', '^1.0.0-alpha.2')).toBe(false);
    expect(cliLineMatches('0.3.4', '~1.0.0-alpha.2')).toBe(false);
  });

  it('an alpha global mismatches a stable-line project', () => {
    expect(cliLineMatches('1.0.0-alpha.2', '^0.3.4')).toBe(false);
  });

  it('unparseable inputs never report a mismatch (no false alarms)', () => {
    expect(cliLineMatches('workspace', '^1.0.0-alpha.2')).toBe(true);
    expect(cliLineMatches('1.0.0-alpha.2', 'latest')).toBe(true);
    expect(cliLineMatches('', '')).toBe(true);
  });
});
