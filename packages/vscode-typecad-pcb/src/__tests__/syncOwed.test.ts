import { describe, it, expect } from 'vitest';
import { buildOwed } from '../syncState.js';

// A save made while a build runs used to be dropped: the auto-build skipped
// while the pipeline was busy and, once free, compared sources only against
// the board's mtime — which the in-flight build had just pushed past the
// save. buildOwed also compares against the last build's START.
describe('buildOwed', () => {
  it('no board yet: not the auto-build’s job', () => {
    expect(buildOwed(100, null, 0)).toBe(false);
  });
  it('sources newer than the board owe a build', () => {
    expect(buildOwed(200, 100, 0)).toBe(true);
  });
  it('board current and no build seen: nothing owed', () => {
    expect(buildOwed(100, 200, 0)).toBe(false);
  });
  it('a save landing mid-build (after start, before the board write) is owed', () => {
    // build started at 150, user saved at 170, board written at 200
    expect(buildOwed(170, 200, 150)).toBe(true);
  });
  it("an apply's own source writes (before its build started) owe nothing", () => {
    // apply wrote sources at 140, started its build at 150, board at 200
    expect(buildOwed(140, 200, 150)).toBe(false);
  });
});
